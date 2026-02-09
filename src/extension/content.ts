/**
 * QRDX Wallet — Content script.
 *
 * Injected into every page the user visits (configured via manifest
 * content_scripts). Its job is to expose the `window.qrdx` provider
 * object so dApps can interact with the wallet.
 *
 * This file is compiled by the build script alongside the other
 * extension entry points in src/extension/.
 */

// Ensure TypeScript treats this as an external module so `declare global` works.
export {}

console.log('[QRDX] Content script loaded')

// ─── Provider object ────────────────────────────────────────────────────────

interface QRDXProvider {
  isQRDX: true
  version: string
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const qrdxProvider: QRDXProvider = {
  isQRDX: true,
  version: '1.0.0',

  request: async (args) => {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        reject(new Error('QRDX extension not available'))
        return
      }

      chrome.runtime.sendMessage(
        { type: 'PROVIDER_REQUEST', payload: args },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve(response.data)
          } else {
            reject(new Error(response?.error ?? 'Unknown error'))
          }
        },
      )
    })
  },
}

// ─── Inject into page ───────────────────────────────────────────────────────

declare global {
  interface Window {
    qrdx?: QRDXProvider
  }
}

if (typeof window !== 'undefined') {
  window.qrdx = qrdxProvider
  window.dispatchEvent(new Event('qrdx#initialized'))
}
