/**
 * Load the built Chrome extension and check what a web page sees.
 *
 *   bun scripts/build-extension.js && node tests/e2e/extension-provider.mjs
 *
 * Asserts: window.qrdx and window.ethereum are injected before page scripts
 * run, EIP-6963 discovery announces QRDX Wallet, requests round-trip through
 * content script → background → router, and an unconnected page learns no
 * accounts and cannot sign.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve(process.cwd(), 'dist/chrome')
const html = `<!doctype html><meta charset=utf-8><title>dapp</title><script>
  window.__early = { qrdx: !!window.qrdx, ethereum: !!window.ethereum }
  window.__announced = []
  window.addEventListener('eip6963:announceProvider', e => window.__announced.push(e.detail.info))
  window.dispatchEvent(new Event('eip6963:requestProvider'))
</script>`
const server = createServer((_, res) =>
  res.writeHead(200, { 'content-type': 'text/html' }).end(html)
).listen(0)
const URL_ = `http://localhost:${server.address().port}/`

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'qrdx-ext-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
let [sw] = ctx.serviceWorkers()
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15_000 })
check('background service worker starts', !!sw, sw?.url())

const page = await ctx.newPage()
await page.goto(URL_)
await page.waitForTimeout(500)

const early = await page.evaluate(() => window.__early)
check(
  'provider exists before page scripts run',
  early.qrdx && early.ethereum,
  JSON.stringify(early)
)
check(
  'window.ethereum is QRDX',
  await page.evaluate(() => window.ethereum?.isQRDX === true && window.ethereum === window.qrdx)
)

const announced = await page.evaluate(() => window.__announced)
check(
  'EIP-6963 announces QRDX Wallet',
  announced.some(
    (i) =>
      i.rdns === 'org.qrdx.wallet' && i.name === 'QRDX Wallet' && i.icon.startsWith('data:image/')
  ),
  JSON.stringify(announced.map((i) => i.rdns))
)

const chainId = await page.evaluate(() => window.ethereum.request({ method: 'eth_chainId' }))
check('eth_chainId round-trips through the background', /^0x[0-9a-f]+$/.test(chainId), chainId)

const accounts = await page.evaluate(() => window.ethereum.request({ method: 'eth_accounts' }))
check('unconnected page sees no accounts', Array.isArray(accounts) && accounts.length === 0)

const signErr = await page.evaluate(() =>
  window.ethereum
    .request({
      method: 'personal_sign',
      params: ['0x68', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'],
    })
    .then(
      () => null,
      (e) => e.code
    )
)
check('unconnected page cannot request signatures (4100)', signErr === 4100, String(signErr))

const unknown = await page.evaluate(() =>
  window.ethereum.request({ method: 'debug_traceTransaction' }).then(
    () => null,
    (e) => e.code
  )
)
check('unknown methods are 4200', unknown === 4200, String(unknown))

const tamper = await page.evaluate(() => {
  try {
    window.qrdx = { fake: true }
  } catch {}
  return window.qrdx.isQRDX === true
})
check('window.qrdx cannot be replaced by the page', tamper)

// ── Full flow: create in the popup, connect + sign from the page ─────────────
console.log('Popup onboarding → dApp connect → sign')
const extId = new URL(sw.url()).host
const popup = await ctx.newPage()
await popup.goto(`chrome-extension://${extId}/popup/index.html`)
const PASSWORD = 'CorrectHorseBattery9!'
const MNEMONIC = 'test test test test test test test test test test test junk'
await popup.getByRole('button', { name: /already have a wallet/ }).click()
await popup.getByRole('button', { name: /Recovery phrase/ }).click()
await popup.locator('textarea').fill(MNEMONIC)
await popup.getByRole('button', { name: /^Continue/ }).click()
await popup.getByLabel('Password', { exact: true }).fill(PASSWORD)
await popup.getByLabel('Confirm password').fill(PASSWORD)
await popup.getByRole('button', { name: /Import wallet/ }).click()
await popup.getByText('Secure this device').waitFor({ timeout: 30_000 })
check('wallet created in the background from the popup', true)
const vaultInBg = await sw.evaluate(() =>
  chrome.storage.local.get('qrdx_wallet_state').then((r) => r.qrdx_wallet_state?.version)
)
check('vault lives in chrome.storage.local', vaultInBg === 2)
await popup.close()

const approvalPage = ctx.waitForEvent('page', { timeout: 15_000 })
const accountsP = page.evaluate(() => window.ethereum.request({ method: 'eth_requestAccounts' }))
const approval = await approvalPage
await approval.getByRole('button', { name: /Connect/ }).click()
const connected = await accountsP
check(
  'eth_requestAccounts returns the approved account',
  connected[0]?.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  JSON.stringify(connected)
)

const accountsEvent = await page.evaluate(() => window.ethereum.selectedAddress)
check(
  'provider state updated (accountsChanged)',
  accountsEvent?.toLowerCase() === connected[0]?.toLowerCase()
)

const signApproval = ctx.waitForEvent('page', { timeout: 15_000 })
const sigP = page.evaluate(
  (addr) => window.ethereum.request({ method: 'personal_sign', params: ['0x68656c6c6f', addr] }),
  connected[0]
)
const signWin = await signApproval
await signWin.getByText('hello').waitFor()
check('signature window shows the decoded message', true)
await signWin.getByRole('button', { name: /^Sign$/ }).click()
const sig = await sigP
check('personal_sign returns a 65-byte signature', /^0x[0-9a-f]{130}$/.test(sig), sig?.slice(0, 20))

const rejectApproval = ctx.waitForEvent('page', { timeout: 15_000 })
const rejP = page.evaluate(
  (addr) =>
    window.ethereum.request({ method: 'personal_sign', params: ['0x6e6f', addr] }).then(
      () => null,
      (e) => e.code
    ),
  connected[0]
)
const rejWin = await rejectApproval
await rejWin.getByRole('button', { name: /Reject/ }).click()
check('rejecting returns 4001', (await rejP) === 4001)

await ctx.close()
server.close()
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
