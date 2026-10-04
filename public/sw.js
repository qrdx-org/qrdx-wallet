/**
 * QRDX Wallet — service worker (web + installed PWA; never the extension).
 *
 * Strategy, chosen for a wallet:
 *   • Same-origin navigations: network-first, falling back to the cached app
 *     shell so the installed app opens offline (and can still unlock and show
 *     addresses; anything that needs the chain waits for connectivity).
 *   • Hashed build assets (/_next/static/…): cache-first — the URL changes when
 *     the content does.
 *   • Everything cross-origin (RPC nodes, price APIs, explorers): not touched.
 *     Responses carrying balances or prices must never be served stale from a
 *     cache, and RPC is POST anyway.
 *
 * Updates: a new worker waits until the page asks it to take over
 * (`SKIP_WAITING`), so a wallet mid-signing is never swapped underneath the
 * user. src/pwa/PWAProvider.tsx shows the "Update available" prompt.
 */

const VERSION = 'qrdx-wallet-v2'
const SHELL = [
  '/wallet',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname.startsWith('/wallet')) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put('/wallet', copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/wallet')))
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
  }
})
