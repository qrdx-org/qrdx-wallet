/**
 * QRDX Wallet — content script (isolated world).
 *
 * A relay, nothing more: page ⇄ (window.postMessage) ⇄ here ⇄ (runtime port) ⇄ background.
 * It never sees keys and never decides anything. The background identifies
 * the site from this port's sender, which the browser sets — so a page cannot
 * claim to be another origin by editing its messages.
 *
 * On Chrome the in-page provider is declared as a MAIN-world content script in
 * the manifest. Firefox (MV2) has no MAIN world, so this script injects it
 * with a <script> tag pointing at the extension's own inpage.js.
 */

export {}

declare const __INJECT_INPAGE__: boolean

const SOURCE_IN = 'qrdx-inpage'
const SOURCE_OUT = 'qrdx-content'

if (__INJECT_INPAGE__) {
  try {
    const s = document.createElement('script')
    s.src = chrome.runtime.getURL('inpage/inpage.js')
    s.async = false
    ;(document.head || document.documentElement).appendChild(s)
    s.onload = () => s.remove()
  } catch (e) {
    console.warn('[QRDX] provider injection failed', e)
  }
}

let port: chrome.runtime.Port | null = null

function connect(): chrome.runtime.Port {
  if (port) return port
  port = chrome.runtime.connect({ name: 'qrdx-provider' })
  port.onMessage.addListener((msg) =>
    window.postMessage({ source: SOURCE_OUT, ...msg }, window.location.origin)
  )
  port.onDisconnect.addListener(() => {
    port = null // service worker restarted; reconnect on the next request
  })
  return port
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data as { source?: string; id?: number; method?: string; params?: unknown }
  if (data?.source !== SOURCE_IN || typeof data.id !== 'number' || typeof data.method !== 'string')
    return
  try {
    connect().postMessage({ id: data.id, method: data.method, params: data.params })
  } catch {
    port = null
    window.postMessage(
      {
        source: SOURCE_OUT,
        id: data.id,
        error: { code: 4900, message: 'QRDX Wallet is unavailable — reload the page' },
      },
      window.location.origin
    )
  }
})

// Open the port eagerly so chain/account events reach pages that never call request().
connect()
