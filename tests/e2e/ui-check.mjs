/**
 * End-to-end UI check against a running dev server and a live local QRDX node.
 *
 * Creates a wallet through the real onboarding flow, switches to the local
 * testnet, and asserts the network selector reports a *verified* connection —
 * i.e. that the chain-identity probe matched, not merely that a request was
 * sent.
 *
 * Usage:
 *   npx next dev -p 3100 &
 *   cd ref/qrdx-chain && bash scripts/testnet.sh start --nodes 1 --validators 1
 *   node tests/e2e/ui-check.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.WALLET_URL ?? 'http://127.0.0.1:3100'
const OUT =
  process.env.SHOT_DIR ??
  '/tmp/claude-1000/-workspaces-qrdx-wallet/1cab852c-fcc5-4126-a0bd-d3ca80f27790/scratchpad'
const PASSWORD = 'CorrectHorseBattery9!'

const failures = []
function check(label, ok, detail = '') {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 420, height: 900 } })

const consoleErrors = []
page.on('console', m => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))

const shot = async name => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

// ── 1. Landing ─────────────────────────────────────────────────────────────
console.log('\n1. Landing')
await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await shot('01-landing')
check('wallet page loads', /Create New Wallet/i.test(await page.locator('body').innerText()))

// ── 2. Onboarding ──────────────────────────────────────────────────────────
console.log('\n2. Create wallet')
await page.getByRole('button', { name: /Create New Wallet/i }).first().click()
await page.waitForTimeout(700)

await page.locator('input[placeholder="e.g. Main Wallet"]').fill('E2E Wallet')
const pw = page.locator('input[type="password"]:visible')
await pw.nth(0).fill(PASSWORD)
await pw.nth(1).fill(PASSWORD)
await page.waitForTimeout(300)
await shot('02-password')

const continueBtn = page.getByRole('button', { name: /^Continue/i })
check('Continue enabled once name + passwords set', await continueBtn.first().isEnabled())
await continueBtn.first().click()
await page.waitForTimeout(900)

// Recovery phrase — reveal, then read the 12 words in order.
const revealBtn = page.getByRole('button', { name: /reveal|show/i })
if ((await revealBtn.count()) > 0) {
  await revealBtn.first().click()
  await page.waitForTimeout(500)
}
await shot('03-mnemonic')

// The phrase renders as numbered cells ("1", "prefer", "2", "market", …).
// Pair each index with the token that follows it so the order is exact rather
// than inferred from a flat word scan.
const phrase = await page.evaluate(() => {
  const tokens = document.body.innerText
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
  const words = []
  for (let i = 0; i < tokens.length - 1; i++) {
    const n = Number(tokens[i])
    if (Number.isInteger(n) && n >= 1 && n <= 12 && /^[a-z]{3,10}$/.test(tokens[i + 1])) {
      words[n - 1] = tokens[i + 1]
    }
  }
  return words.filter(Boolean).join(' ')
})
console.log(`   captured ${phrase.split(' ').filter(Boolean).length} recovery words`)

const nextBtn = page.getByRole('button', {
  name: /written it down|I've saved|^Continue|^Next/i,
})
if ((await nextBtn.count()) > 0) {
  await nextBtn.first().click()
  await page.waitForTimeout(900)
}
await shot('04-confirm')

// Confirmation asks for specific word positions. Read each prompt's index and
// supply the word the app itself generated, pulled from React state via the
// rendered phrase grid on the previous screen.
const mnemonic = await page.evaluate(() => window.__qrdxTestMnemonic ?? null)
const confirmInputs = page.locator('input[placeholder^="Enter word #"]')
const nInputs = await confirmInputs.count()
console.log(`   confirmation asks for ${nInputs} words`)

if (nInputs > 0) {
  const words = (mnemonic ?? phrase).split(/\s+/).filter(Boolean)
  for (let i = 0; i < nInputs; i++) {
    const ph = await confirmInputs.nth(i).getAttribute('placeholder')
    const idx = Number(ph.replace(/\D+/g, '')) - 1
    await confirmInputs.nth(i).fill(words[idx] ?? '')
  }
  await page.waitForTimeout(400)
  await shot('05-confirm-filled')

  const createBtn = page.getByRole('button', { name: /Create Wallet|Confirm|Verify/i })
  if ((await createBtn.count()) > 0 && (await createBtn.first().isEnabled())) {
    await createBtn.first().click()
    await page.waitForTimeout(2500)
  }
}

// Success screen → dashboard
for (const label of [/Open Wallet/i, /Done/i, /Finish/i, /Continue/i, /Get Started/i]) {
  const b = page.getByRole('button', { name: label })
  if ((await b.count()) > 0 && (await b.first().isEnabled().catch(() => false))) {
    await b.first().click()
    await page.waitForTimeout(1500)
    break
  }
}
await shot('06-dashboard')

const dashText = await page.locator('body').innerText()
const onDashboard = /Total Balance/i.test(dashText)
check('reached dashboard', onDashboard)
if (!onDashboard) {
  console.log('   body:', dashText.slice(0, 500).replace(/\n/g, ' | '))
  await browser.close()
  process.exit(1)
}

// ── 3. Network selector ────────────────────────────────────────────────────
console.log('\n3. Network selector')
const selectorBtn = page.locator('button[aria-haspopup="listbox"]').first()
check('network selector present', (await selectorBtn.count()) > 0)

await selectorBtn.click()
await page.waitForTimeout(600)
await shot('07-network-menu')

let menuText = await page.locator('body').innerText()
check('QRDX group listed', /QRDX Mainnet/i.test(menuText))
check('testnets hidden by default', !/QRDX Local Testnet/i.test(menuText))

// Enable test networks from within the selector.
await page.locator('input[type="checkbox"]').first().check()
await page.waitForTimeout(800)
menuText = await page.locator('body').innerText()
check('local testnet appears once testnets enabled', /QRDX Local Testnet/i.test(menuText))
await shot('07b-testnets-enabled')

// ── 4. Switch to the local testnet ─────────────────────────────────────────
console.log('\n4. Switch to local testnet')
const localOption = page.getByRole('option', { name: /QRDX Local Testnet/i })
check('local testnet selectable', (await localOption.count()) > 0)
await localOption.first().click()
await page.waitForTimeout(4000)
await shot('08-local-connected')

check('header switched to local', /QRDX Local/i.test(await page.locator('body').innerText()))

const dotClass =
  (await page
    .locator('button[aria-haspopup="listbox"] span.rounded-full')
    .first()
    .getAttribute('class')
    .catch(() => null)) ?? ''

const connected = dotClass.includes('bg-green-500')
const mismatch = dotClass.includes('bg-amber-500')
const unreachable = dotClass.includes('bg-red-500')

check('chain identity verified (green)', connected, dotClass || 'no dot found')
if (mismatch) console.log('   -> selector reports a CHAIN ID MISMATCH')
if (unreachable) console.log('   -> selector reports the node UNREACHABLE')

// ── 5. Real funds round-trip ───────────────────────────────────────────────
// Fund the freshly created account on the local chain, then confirm the
// dashboard renders the balance. This exercises the whole read path —
// eth_getBalance, the micro-QRDX→wei scaling, and the formatting — with a
// non-zero figure rather than the zero a new wallet trivially shows.
console.log('\n5. Fund the new account and re-read the balance')

const address = await page.evaluate(() => {
  try {
    const raw = localStorage.getItem('qrdx_wallet_state')
    if (!raw) return null
    const state = JSON.parse(raw)
    const w = state.wallets?.find(x => x.id === state.currentWalletId) ?? state.wallets?.[0]
    return w?.ethAddress ?? null
  } catch {
    return null
  }
})
check('wallet address readable', !!address, address ?? 'none')

if (address) {
  const { execFileSync } = await import('node:child_process')
  const amountQrdx = 5
  try {
    const out = execFileSync(
      'ref/qrdx-chain/.venv/bin/python',
      ['tests/e2e/fund_account.py', address, String(amountQrdx)],
      { encoding: 'utf8', timeout: 120000 },
    )
    console.log('   ' + out.trim().split('\n').join('\n   '))
  } catch (e) {
    console.log('   funding failed:', (e.stdout || e.message || '').toString().slice(0, 400))
  }

  // Re-enter the dashboard so balances refetch. A reload drops the in-memory
  // key material, so the wallet correctly asks for the password again.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  if (/unlock/i.test(await page.locator('body').innerText())) {
    await page.locator('input[type="password"]:visible').first().fill(PASSWORD)
    await page.getByRole('button', { name: /unlock/i }).first().click()
  }
  await page.waitForTimeout(4500)
  await shot('09-funded')

  const funded = await page.locator('body').innerText()
  const shows5 = /\b5\.0000\b/.test(funded)
  check('dashboard shows the funded balance', shows5,
    funded.match(/Total Balance[\s\S]{0,40}/)?.[0]?.replace(/\n/g, ' ') ?? '')
}

// ── 6. Console health ──────────────────────────────────────────────────────
console.log('\n5. Console errors:', consoleErrors.length)
consoleErrors.slice(0, 8).forEach(e => console.log('   -', e.slice(0, 160)))

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `FAILURES: ${failures.join(', ')}`}`)
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
