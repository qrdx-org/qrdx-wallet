/**
 * End-to-end wallet flows against the static export (no node required).
 *
 *   pnpm build && node tests/e2e/onboarding.mjs
 *
 * Covers: create (phrase reveal + verification), lock on reload, unlock,
 * unlock throttling, and import from a known phrase (asserting the derived
 * address). Network calls to RPC/price APIs fail offline; that is expected and
 * not counted as an error.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'out')
const SHOTS = process.env.SHOT_DIR
const PASSWORD = 'CorrectHorseBattery9!'
const MNEMONIC = 'test test test test test test test test test test test junk'
const ADDR0 = '0xf39F'

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !/Failed to fetch|ERR_|net::|CORS|NetworkError|status of 4|Failed to load resource/.test(
        m.text()
      )
    )
      errors.push(m.text())
  })
  return { ctx, page, errors }
}

const shot = async (page, name) =>
  SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })

// ── Create ────────────────────────────────────────────────────────────────
console.log('Create a wallet')
{
  const { ctx, page, errors } = await newPage()
  await page.goto(`${BASE}/wallet`)
  await page.getByRole('button', { name: /Create a new wallet/ }).click()
  // First visit: the service worker installs and claims this page mid-flow. That
  // must not reload the page and throw the user back to the welcome screen.
  await page.getByText('Create a password').waitFor()
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(
      () =>
        navigator.serviceWorker.controller ||
        new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r))
    )
  )
  await page.waitForTimeout(1000)
  check(
    'service-worker takeover does not reset onboarding',
    await page.getByText('Create a password').isVisible()
  )
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await shot(page, '01-password')
  await page.getByRole('button', { name: /Continue/ }).click()

  await page.getByRole('button', { name: /Tap to reveal/ }).click()
  const words = await page.locator('ol li span.font-mono').allTextContents()
  check(
    '12-word phrase shown',
    words.length === 12 && words.every((w) => /^[a-z]+$/.test(w)),
    words.join(' ')
  )
  await shot(page, '02-phrase')
  await page.getByRole('button', { name: /written it down/ }).click()

  for (const legend of await page.locator('fieldset legend').allTextContents()) {
    const n = Number(legend.replace(/\D/g, ''))
    await page
      .locator('fieldset', { hasText: legend })
      .getByRole('button', { name: words[n - 1], exact: true })
      .click()
  }
  await shot(page, '03-verify')
  await page.getByRole('button', { name: /Create wallet/ }).click()
  await page.getByText('Secure this device').waitFor({ timeout: 30_000 })
  check('reaches the secure step', true)
  await shot(page, '04-secure')
  await page.getByRole('button', { name: /^Continue/ }).click()
  await page.getByText('Your wallet is ready').waitFor()
  await page.getByRole('button', { name: /Open wallet/ }).click()
  await page.waitForTimeout(1500)
  check(
    'dashboard opens',
    !(await page.getByText('Welcome back').isVisible()) &&
      !(await page.getByText('Your wallet is ready').isVisible())
  )
  await shot(page, '05-dashboard')

  const stored = await page.evaluate(() => localStorage.getItem('qrdx_wallet_state'))
  check(
    'vault v2 written, phrase not in plaintext',
    stored.includes('"version":2') && !words.every((w) => stored.includes(w))
  )

  // ── Reload locks; unlock works ───────────────────────────────────────────
  console.log('Lock on reload / unlock')
  await page.reload()
  await page.getByText('Welcome back').waitFor()
  check('reload locks the wallet', true)
  await page.getByLabel('Password', { exact: true }).fill('wrong password 1')
  await page.getByRole('button', { name: /^Unlock$/ }).click()
  await page.getByText('Incorrect password').waitFor()
  check('wrong password rejected', true)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /^Unlock$/ }).click()
  await page.getByText('Welcome back').waitFor({ state: 'detached', timeout: 30_000 })
  check('correct password unlocks', true)

  // ── Throttling ───────────────────────────────────────────────────────────
  console.log('Unlock throttling')
  await page.reload()
  await page.getByText('Welcome back').waitFor()
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Password', { exact: true }).fill(`nope nope ${i}`)
    await page.getByRole('button', { name: /^Unlock$/ }).click()
    await page.waitForTimeout(1200)
  }
  check('backoff after repeated failures', await page.getByText(/Try again in \d+s/).isVisible())
  await shot(page, '06-throttled')

  check('no page errors during create/unlock', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── Import ────────────────────────────────────────────────────────────────
console.log('Import from recovery phrase')
{
  const { ctx, page, errors } = await newPage()
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
  const stored = await page.evaluate(() => localStorage.getItem('qrdx_wallet_state'))
  check(
    'imported account is the standard first address',
    stored.toLowerCase().includes(ADDR0.toLowerCase())
  )
  check('no page errors during import', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
server.close()
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
