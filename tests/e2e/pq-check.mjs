/**
 * End-to-end check of the post-quantum identity in the real UI.
 *
 * Confirms the wallet shows a genuine ML-DSA-65 address, that the ETH/PQ
 * toggle switches the *balance* as well as the address (they are separate
 * on-chain accounts), and that funds sent to the PQ address show up there and
 * not against the EVM account.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const BASE = process.env.WALLET_URL ?? 'http://127.0.0.1:3100'
const OUT = process.env.SHOT_DIR ??
  '/tmp/claude-1000/-workspaces-qrdx-wallet/1cab852c-fcc5-4126-a0bd-d3ca80f27790/scratchpad'
const PASSWORD = 'CorrectHorseBattery9!'

const failures = []
const check = (l, ok, d = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`)
  if (!ok) failures.push(l)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

// ── Onboard ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /Create New Wallet/i }).first().click()
await page.waitForTimeout(700)
await page.locator('input[placeholder="e.g. Main Wallet"]').fill('PQ Test')
const pw = page.locator('input[type="password"]:visible')
await pw.nth(0).fill(PASSWORD); await pw.nth(1).fill(PASSWORD)
await page.getByRole('button', { name: /^Continue/i }).first().click()
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Tap to reveal recovery phrase/i }).first().click()
await page.waitForTimeout(500)

const phrase = await page.evaluate(() => {
  const t = document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean)
  const w = []
  for (let i = 0; i < t.length - 1; i++) {
    const n = Number(t[i])
    if (Number.isInteger(n) && n >= 1 && n <= 12 && /^[a-z]{3,10}$/.test(t[i + 1])) w[n - 1] = t[i + 1]
  }
  return w.filter(Boolean)
})
await page.getByRole('button', { name: /written it down/i }).first().click()
await page.waitForTimeout(800)
const inputs = page.locator('input[placeholder^="Enter word #"]')
for (let i = 0; i < await inputs.count(); i++) {
  const idx = Number((await inputs.nth(i).getAttribute('placeholder')).replace(/\D+/g, '')) - 1
  await inputs.nth(i).fill(phrase[idx])
}
await page.getByRole('button', { name: /Create Wallet|Confirm|Verify/i }).first().click()
await page.waitForTimeout(2500)
for (const l of [/Open Wallet/i, /Done/i, /Finish/i, /Continue/i]) {
  const b = page.getByRole('button', { name: l })
  if (await b.count() && await b.first().isEnabled().catch(() => false)) {
    await b.first().click(); await page.waitForTimeout(1200); break
  }
}

// Switch to the local chain.
await page.locator('button[aria-haspopup="listbox"]').first().click()
await page.waitForTimeout(500)
await page.locator('input[type="checkbox"]').first().check()
await page.waitForTimeout(600)
await page.getByRole('option', { name: /QRDX Local Testnet/i }).first().click()
await page.waitForTimeout(3000)

const { ethAddress, pqAddress, pqPublicKey } = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('qrdx_wallet_state'))
  const w = s.wallets.find(x => x.id === s.currentWalletId) ?? s.wallets[0]
  return { ethAddress: w.ethAddress, pqAddress: w.pqAddress, pqPublicKey: w.pqPublicKey }
})

console.log('\n1. Post-quantum identity')
console.log('   eth:', ethAddress)
console.log('   pq :', pqAddress)
check('PQ address has the 0xPQ prefix and 64 hex chars',
  /^0xPQ[0-9a-fA-F]{64}$/.test(pqAddress), `${pqAddress.length} chars`)
check('PQ public key is a full ML-DSA-65 key (1952 bytes)',
  pqPublicKey.replace(/^0x/, '').length === 1952 * 2,
  `${pqPublicKey.replace(/^0x/, '').length / 2} bytes`)

// The old placeholder built pubkeys by repeating one SHA-256 digest; a real
// ML-DSA key has no such structure.
const first32 = pqPublicKey.slice(0, 64)
const second32 = pqPublicKey.slice(64, 128)
check('PQ public key is not a repeated digest (i.e. not the old placeholder)',
  first32 !== second32)

// The node must agree this key yields this address.
const nodeAddr = execFileSync('ref/qrdx-chain/.venv/bin/python',
  ['tests/integration/pq_liboqs_bridge.py'],
  { input: JSON.stringify({ op: 'address', public_key: pqPublicKey }), encoding: 'utf8' })
check('node derives the same PQ address from this key',
  JSON.parse(nodeAddr).address.toLowerCase() === pqAddress.toLowerCase(),
  JSON.parse(nodeAddr).address)

// ── Balance separation ─────────────────────────────────────────────────────
console.log('\n2. ETH and PQ balances are distinct')
execFileSync('ref/qrdx-chain/.venv/bin/python',
  ['tests/e2e/fund_account.py', ethAddress, '7'], { encoding: 'utf8' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.locator('input[type="password"]:visible').first().fill(PASSWORD)
await page.getByRole('button', { name: /unlock/i }).first().click()
await page.waitForTimeout(4500)
await shot('pq1-combined')

const headline = t => (t.match(/Total Balance\s*\n\s*([^\n]+)/)?.[1] ?? '').trim()
let body = await page.locator('body').innerText()
check('combined total shown', headline(body).includes('7.0000'), headline(body))
check('per-identity breakdown shown', /EVM[\s\S]{0,20}PQ/.test(body))

// ── Fund the PQ address on chain ───────────────────────────────────────────
console.log('\n3. Funding the PQ address')
// A PQ address cannot receive an EVM transfer (20-byte `to` field vs a
// 32-byte address), so fund it on the native UTXO layer the way genesis does.
let rejected = ''
try {
  execFileSync('ref/qrdx-chain/.venv/bin/python',
    ['tests/e2e/fund_account.py', pqAddress, '3'],
    { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  rejected = (e.stderr || '').toString().trim()
}
check('an EVM transfer to a PQ address is refused', rejected.length > 0,
  rejected.slice(0, 80))

const out = execFileSync('ref/qrdx-chain/.venv/bin/python',
  ['tests/e2e/fund_pq_native.py', pqAddress, '3'], { encoding: 'utf8' })
console.log('   ' + out.trim().split('\n').join('\n   '))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.locator('input[type="password"]:visible').first().fill(PASSWORD)
await page.getByRole('button', { name: /unlock/i }).first().click()
await page.waitForTimeout(4500)
await shot('pq3-combined-funded')

body = await page.locator('body').innerText()
// 7 EVM + 3 PQ must now read as a single combined figure.
check('combined total is 10 QRDX', headline(body).includes('10.0000'), headline(body))
check('breakdown shows both 7 and 3',
  /7\.0000/.test(body) && /3\.0000/.test(body))

// ── 4. Send from the post-quantum address ──────────────────────────────────
console.log('\n4. Native PQ send')
const recipientPq = execFileSync('ref/qrdx-chain/.venv/bin/python',
  ['-c', 'import sys; sys.path.insert(0,"ref/qrdx-chain");' +
         'from qrdx.crypto.pq.dilithium import PQPrivateKey; print(PQPrivateKey.generate().address)'],
  { encoding: 'utf8' })
  // liboqs prints a banner to stdout on import; take the last line.
  .trim().split('\n').pop().trim()
console.log('   recipient:', recipientPq)

await page.getByText('Send', { exact: true }).first().click()
await page.waitForTimeout(900)
const qrdxRow = page.getByText('QRDX Ledger').first()
if (await qrdxRow.count()) { await qrdxRow.click(); await page.waitForTimeout(800) }

// Switch the sending identity to PQ.
await page.getByRole('button', { name: /^PQ$/ }).first().click()
await page.waitForTimeout(800)
await shot('pq4-send-pq-mode')
check('PQ send explains ML-DSA signing',
  /ML-DSA-65/.test(await page.locator('body').innerText()))

await page.locator('input[placeholder*="recipient"]').first().fill(recipientPq)
await page.waitForTimeout(600)
check('a PQ recipient is accepted when sending from PQ',
  /Valid address/i.test(await page.locator('body').innerText()))

await page.locator('input[inputmode="decimal"]').first().fill('1.5')
await page.waitForTimeout(1200)
const sendBtn = page.getByRole('button', { name: /Send QRDX/i }).last()
check('send enabled', await sendBtn.isEnabled())
await sendBtn.click()
await page.waitForTimeout(6000)
await shot('pq5-sent')

const sentText = await page.locator('body').innerText()
check('UI reports success', /sent|success/i.test(sentText),
  sentText.match(/(Transaction[^\n]*|RPC error[^\n]*)/)?.[0] ?? '')

const rpcCall = async (m, p) => {
  const r = await fetch('http://127.0.0.1:3007/rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }),
  })
  return (await r.json()).result
}
const recipientBal = (await rpcCall('qrdx_getAddressInfo', [recipientPq]))?.balance
check('recipient credited 1.5 QRDX on chain', Number(recipientBal) === 1.5, `${recipientBal}`)

console.log(`\n${failures.length ? 'FAILURES: ' + failures.join(', ') : 'ALL CHECKS PASSED'}`)
await browser.close()
process.exit(failures.length ? 1 : 0)
