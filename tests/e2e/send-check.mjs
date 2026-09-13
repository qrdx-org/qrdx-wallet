/**
 * End-to-end check of the Send flow against the live local QRDX chain.
 *
 * Verifies both halves of the guard: that bad recipients are refused before a
 * transaction can be built, and that a good one actually broadcasts and moves
 * the balance on chain.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const BASE = process.env.WALLET_URL ?? 'http://127.0.0.1:3100'
const OUT = process.env.SHOT_DIR ??
  '/tmp/claude-1000/-workspaces-qrdx-wallet/1cab852c-fcc5-4126-a0bd-d3ca80f27790/scratchpad'
const PASSWORD = 'CorrectHorseBattery9!'
const RECIPIENT = '0x000000000000000000000000000000000000dEaD'

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const rpc = async (method, params = []) => {
  const r = await fetch('http://127.0.0.1:3007/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await r.json()).result
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })

// ── Onboard ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /Create New Wallet/i }).first().click()
await page.waitForTimeout(700)
await page.locator('input[placeholder="e.g. Main Wallet"]').fill('Send Test')
const pw = page.locator('input[type="password"]:visible')
await pw.nth(0).fill(PASSWORD); await pw.nth(1).fill(PASSWORD)
await page.getByRole('button', { name: /^Continue/i }).first().click()
await page.waitForTimeout(900)

// The phrase is blurred until explicitly revealed, and the continue button
// stays disabled until then.
await page.getByRole('button', { name: /Tap to reveal recovery phrase/i }).first().click()
await page.waitForTimeout(600)

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

// ── Switch to local chain and fund ─────────────────────────────────────────
await page.locator('button[aria-haspopup="listbox"]').first().click()
await page.waitForTimeout(500)
await page.locator('input[type="checkbox"]').first().check()
await page.waitForTimeout(600)
await page.getByRole('option', { name: /QRDX Local Testnet/i }).first().click()
await page.waitForTimeout(3000)

const address = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('qrdx_wallet_state'))
  return (s.wallets.find(w => w.id === s.currentWalletId) ?? s.wallets[0]).ethAddress
})
console.log('\n1. Setup')
check('wallet on local chain', /QRDX Local/i.test(await page.locator('body').innerText()))
execFileSync('ref/qrdx-chain/.venv/bin/python',
  ['tests/e2e/fund_account.py', address, '20'], { encoding: 'utf8' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// A reload drops the in-memory key material, so the wallet must ask for the
// password again rather than presenting itself as unlocked.
const lockedAfterReload = /unlock/i.test(await page.locator('body').innerText())
check('wallet requires password after reload', lockedAfterReload)
if (lockedAfterReload) {
  await page.locator('input[type="password"]:visible').first().fill(PASSWORD)
  await page.getByRole('button', { name: /unlock/i }).first().click()
  await page.waitForTimeout(4000)
}
check('funded balance visible', /20\.0000/.test(await page.locator('body').innerText()))

// ── Open Send ──────────────────────────────────────────────────────────────
console.log('\n2. Recipient validation')
await page.getByText('Send', { exact: true }).first().click()
await page.waitForTimeout(900)
const qrdxRow = page.getByText('QRDX Ledger').first()
if (await qrdxRow.count()) { await qrdxRow.click(); await page.waitForTimeout(800) }
await shot('s1-send-form')

const recipientInput = page.locator('input[placeholder*="recipient"]').first()
const sendBtn = page.getByRole('button', { name: /Send QRDX/i }).last()

check('send disabled with empty form', await sendBtn.isDisabled())

// Set a valid amount up front. Without it the button is disabled regardless of
// the recipient, and every recipient assertion below would pass vacuously.
const amountInput = page.locator('input[inputmode="decimal"]').first()
await amountInput.fill('2.5')
await page.waitForTimeout(400)

// Garbage that the old length-only check would have accepted.
await recipientInput.fill('0x' + 'z'.repeat(40))
await page.waitForTimeout(500)
check('rejects non-hex address', await sendBtn.isDisabled(),
  (await page.locator('body').innerText()).match(/hexadecimal[^\n]*/)?.[0] ?? '')

// Bad EIP-55 checksum. Must be MIXED case: an all-upper or all-lower body
// carries no checksum information and is legitimately accepted.
await recipientInput.fill('0x7e5F4552091A69125d5DfCb7b8C2659029395Bdf')
await page.waitForTimeout(500)
const checksumMsg = (await page.locator('body').innerText()).match(/checksum[^\n]*/)?.[0] ?? ''
check('rejects bad checksum', await sendBtn.isDisabled(), checksumMsg)

// Post-quantum recipient cannot be encoded in an EVM `to` field.
await recipientInput.fill('0xPQ8d30632d776eC1b311f674aE80ECd06d04df27f4bb0f6BEE32693cAFb5AC59D6')
await page.waitForTimeout(500)
const pqMsg = (await page.locator('body').innerText()).match(/Post-quantum[^\n]*/)?.[0] ?? ''
check('rejects post-quantum recipient', await sendBtn.isDisabled(), pqMsg)

// Own address.
await recipientInput.fill(address)
await page.waitForTimeout(500)
check('rejects own address', await sendBtn.isDisabled())

// Valid recipient.
await recipientInput.fill(RECIPIENT)
await page.waitForTimeout(600)
check('accepts valid address', /Valid address/i.test(await page.locator('body').innerText()))
await shot('s2-valid-recipient')

console.log('\n3. Amount validation')
await amountInput.fill('999999')
await page.waitForTimeout(700)
check('rejects amount over balance', await sendBtn.isDisabled(),
  (await page.locator('body').innerText()).match(/Exceeds[^\n]*/)?.[0] ?? '')

await amountInput.fill('0')
await page.waitForTimeout(500)
check('rejects zero amount', await sendBtn.isDisabled())

await amountInput.fill('2.5')
await page.waitForTimeout(2500)
await shot('s3-ready-to-send')
check('enables send when valid', await sendBtn.isEnabled())

// ── Broadcast ──────────────────────────────────────────────────────────────
console.log('\n4. Broadcast')
const before = BigInt(await rpc('eth_getBalance', [RECIPIENT, 'latest']))
await sendBtn.click()
await page.waitForTimeout(6000)
await shot('s4-sent')

const after = BigInt(await rpc('eth_getBalance', [RECIPIENT, 'latest']))
const delta = after - before
console.log(`   recipient delta: ${Number(delta) / 1e18} QRDX`)
check('recipient credited exactly 2.5 QRDX', delta === 2500000000000000000n, `${delta} wei`)
check('UI reports success', /sent|success/i.test(await page.locator('body').innerText()))

console.log(`\n${failures.length ? 'FAILURES: ' + failures.join(', ') : 'ALL CHECKS PASSED'}`)
await browser.close()
process.exit(failures.length ? 1 : 0)
