/**
 * QRDX Wallet — Background service worker.
 *
 * Runs as a MV3 service worker (Chrome) or background script (Firefox).
 * Handles extension lifecycle events, message passing between popup and
 * content scripts, and persistent wallet state management.
 *
 * This file is compiled by the build script alongside the other
 * extension entry points in src/extension/.
 */

import type { MessageType, MessageResponse } from '../core/types'

// ─── Lifecycle ──────────────────────────────────────────────────────────────

console.log('[QRDX] Background service worker loaded')

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[QRDX] Extension installed:', details.reason)

  chrome.storage.local.set({
    initialized: true,
    version: '1.0.0',
    installDate: new Date().toISOString(),
  })
})

// ─── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    request: { type: MessageType | 'PING' | 'PROVIDER_REQUEST'; payload?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    console.log('[QRDX] Message received:', request.type)

    switch (request.type) {
      // Health-check
      case 'PING':
        sendResponse({ success: true, data: 'pong' })
        break

      // Wallet state (async — return true to keep channel open)
      case 'GET_WALLET_STATE':
        chrome.storage.local.get(['qrdx_wallet_state'], (result) => {
          sendResponse({ success: true, data: result.qrdx_wallet_state ?? null })
        })
        return true

      // Forward provider RPC requests from content script
      case 'PROVIDER_REQUEST':
        // TODO: Route through WalletManager for signing, balance queries, etc.
        sendResponse({ success: false, error: 'Provider RPC not yet implemented' })
        break

      default:
        sendResponse({ success: false, error: `Unknown message type: ${request.type}` })
    }

    // Keep the message channel open for any async work above
    return true
  },
)
