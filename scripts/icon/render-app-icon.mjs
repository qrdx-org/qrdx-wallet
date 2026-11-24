// Renders scripts/icon/app-icon.svg in Chromium at 1024 px, then (ImageMagick) the opaque app
// icons: public/icons/apple-touch-icon.png (180), icon-192.png and icon-512.png.
//   node scripts/icon/render-app-icon.mjs
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const svg = readFileSync(new URL('./app-icon.svg', import.meta.url), 'utf8')
const master = join(tmpdir(), 'qrdx-app-icon-1024.png')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(`<!doctype html><style>html,body{margin:0;background:#080808}svg{display:block}</style>${svg}`)
await page.screenshot({ path: master, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
await browser.close()
for (const [size, name] of [[180, 'apple-touch-icon'], [192, 'icon-192'], [512, 'icon-512']])
  execFileSync('convert', [master, '-filter', 'Lanczos', '-resize', `${size}x${size}`, '-define', 'png:color-type=2', `public/icons/${name}.png`])
console.log('app icons written from', master)
