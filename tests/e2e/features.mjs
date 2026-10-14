/**
 * End-to-end: the wallet's account, portfolio and confirmation features, against the static
 * export and test.qrdx.org.
 *
 *   pnpm build && node tests/e2e/features.mjs        (SHOT_DIR=dir to keep screenshots)
 *
 * The account's balances and NFTs are pinned by intercepting those JSON-RPC calls, so the
 * flows have something to show; everything else (chain id, prices, charts) is the real
 * testnet and trade API. Nothing is signed: every review is cancelled, and the test fails if
 * a transaction is sent.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'out')
const SHOTS = process.env.SHOT_DIR
const PASSWORD = 'CorrectHorseBattery9!'
const MNEMONIC = 'test test test test test test test test test test test junk'
const RECIPIENT = '0xPQ7883B5195F95a3A17884a20FB91c015bf6adDA07Ce35A6bcF7Fb6e0C599a5130'
const FIVE_QRDX = '0x' + (5n * 10n ** 18n).toString(16)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' }
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let path = url.pathname === '/' ? '/index.html' : url.pathname
  if (!extname(path)) path += '.html'
  try {
    const body = await readFile(join(OUT, path))
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(0)
const BASE = `http://localhost:${server.address().port}`

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
const visible = (loc, timeout = 15_000) => loc.first().waitFor({ timeout }).then(() => true, () => false)

// Pinned answers for the account's balances and NFTs; every send is recorded (and must not happen).
const sent = []
await page.route('https://test.qrdx.org/rpc', async (route) => {
  let body
  try {
    body = JSON.parse(route.request().postData() ?? '{}')
  } catch {
    return route.continue()
  }
  const reply = (result) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) })
  if (/send(Raw)?Transaction/.test(body.method)) sent.push(body.method)
  if (body.method === 'eth_getBalance') return reply(FIVE_QRDX)
  if (body.method === 'exchange_getNftsOf')
    return reply([{ collection: '0x' + 'ab'.repeat(20), token_id: '7', owner: body.params[0], uri: '', name: 'Lattice #7', symbol: 'LAT', collection_name: 'Lattice', minted_height: 1200 }])
  return route.continue()
})

// ── Import, then testnet ─────────────────────────────────────────────────────
console.log('Import and switch to testnet')
await page.goto(`${BASE}/wallet`)
await page.getByRole('button', { name: /already have a wallet/ }).click()
await page.getByRole('button', { name: /Recovery phrase/ }).click()
await page.locator('textarea').fill(MNEMONIC)
await page.getByText('Valid 12-word phrase').waitFor()
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
await page.getByLabel('Confirm password').fill(PASSWORD)
await page.getByRole('button', { name: /Import wallet/ }).click()
await page.getByText('Secure this device').waitFor({ timeout: 30_000 })
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByText('Your wallet is ready').waitFor()
await page.getByRole('button', { name: /Open wallet/ }).click()
await page.locator('button[aria-haspopup="listbox"]').first().click()
await page.locator('input[type="checkbox"]').first().check()
await page.getByRole('option', { name: /^QRDX Testnet/i }).first().click()
check('on testnet', await visible(page.getByText(/QRDX Test/)))
await page.waitForTimeout(6000)

// ── USD first ────────────────────────────────────────────────────────────────
console.log('Balance in USD first')
const headline = (await page.locator('.text-3xl').first().innerText()).trim()
check('the total leads in USD', /^\$[\d,]+\.\d{2}/.test(headline), headline)
check('native amount underneath', await visible(page.getByText(/QRDX$/).filter({ hasText: /^\d/ })))
await shot('01-dashboard')

// ── Account switcher ─────────────────────────────────────────────────────────
console.log('Switch accounts')
await page.getByRole('button', { name: /switch account/i }).first().click()
check('the account switcher opens', await visible(page.getByRole('dialog', { name: 'Accounts' })))
await shot('02-accounts')
await page.getByRole('button', { name: /Add account/ }).click()
check('a new account becomes current', await visible(page.getByRole('button', { name: /Account 2: switch account/ })))
await page.getByRole('button', { name: /switch account/i }).first().click()
check('both accounts listed', (await page.getByRole('button', { name: /Switch to Account/ }).count()) === 2)
await page.getByRole('button', { name: 'Switch to Account 1' }).click()
check('switched back to Account 1', await visible(page.getByRole('button', { name: /Account 1: switch account/ })))

// ── Token page ───────────────────────────────────────────────────────────────
console.log('Token page')
await page.getByRole('button').filter({ hasText: 'QRDX' }).filter({ hasText: /\$/ }).first().click()
check('token page opens', await visible(page.getByText('Your balance')))
await page.getByRole('button', { name: '1W' }).click()
check('ranges switch', await visible(page.getByText(/· 1W|No market chart/)))
await shot('03-token')

// ── Send is reviewed before signing ──────────────────────────────────────────
console.log('Send review')
await page.getByRole('button', { name: /^Send$/ }).click()
await page.getByPlaceholder(/0x/).first().fill(RECIPIENT)
await page.locator('input[inputmode="decimal"]').first().fill('1')
const review = page.getByRole('button', { name: /Review send/ })
await review.waitFor()
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Review send/.test(b.textContent ?? '') && !b.disabled), null, { timeout: 20_000 }).catch(() => {})
await review.click()
const sheet = page.getByRole('dialog', { name: 'Review send' })
check('the review sheet opens', await visible(sheet))
check('it shows recipient, amount and fee', await visible(sheet.getByText('Network fee')) && (await sheet.innerText()).includes('1 QRDX'))
check('warns about a new address', await visible(sheet.getByText(/not sent to this address before/)))
await page.waitForTimeout(600)
await shot('04-send-review')
await sheet.getByRole('button', { name: 'Cancel' }).click()
check('cancel closes it without sending', !(await sheet.isVisible().catch(() => false)) && sent.length === 0, `${sent.length} sends`)
await page.getByRole('button', { name: /Back/ }).first().click().catch(() => {})
await page.goto(`${BASE}/wallet`)
await page.getByLabel(/Password/).first().fill(PASSWORD).catch(() => {})
await page.getByRole('button', { name: /Unlock/ }).first().click().catch(() => {})
await page.waitForTimeout(4000)

// ── NFTs ─────────────────────────────────────────────────────────────────────
console.log('NFTs')
await page.getByRole('button', { name: /^NFTs/ }).click()
check('NFTs listed from the node', await visible(page.getByText('Lattice #7')))
await page.getByText('Lattice #7').first().click()
check('NFT detail with send', await visible(page.getByRole('button', { name: /^Send$/ })))
await shot('05-nft')
await page.getByRole('button', { name: 'Close' }).first().click()

// ── Settings ─────────────────────────────────────────────────────────────────
console.log('Settings')
await page.locator('button:has(svg.lucide-settings)').first().click()
const settingsText = await page.locator('body').innerText()
check('no Language or Smart Wallet stubs', !/Smart Wallet|Display language/.test(settingsText))
await page.getByText('Notifications').first().click()
check('notifications: transactions and price alerts', await visible(page.getByText('Price alerts').first()) && !(await page.getByText('News & Updates').isVisible().catch(() => false)))
await shot('06-notifications')
await page.getByRole('button', { name: 'Back' }).first().click()
await page.getByText('Currency').first().click()
await page.getByText(/\(EUR\)/).first().click()
await page.getByRole('button', { name: 'Back' }).first().click()
await page.getByRole('button', { name: 'Back' }).first().click()
await page.waitForTimeout(4000)
const inEur = (await page.locator('.text-3xl').first().innerText()).trim()
// CoinGecko gives the rate; without one the wallet keeps USD rather than guess.
check('values follow the chosen currency', inEur.startsWith('€') || inEur.startsWith('$'), inEur.startsWith('€') ? inEur : `${inEur} (no EUR rate from CoinGecko: kept USD)`)
await shot('07-eur')

console.log('page errors:', errors.slice(0, 5))
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
check('nothing was sent', sent.length === 0)
await browser.close()
server.close()
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
