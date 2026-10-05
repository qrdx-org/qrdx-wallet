/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Wallet backend: where the keys live on each target
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  web / PWA   — the WalletManager runs in the page itself. A reload ends the
 *                session (by design: there is nowhere safe to keep it).
 *
 *  extension   — the WalletManager runs in the background service worker,
 *                which is also what answers dApp requests. The popup gets a
 *                proxy with the same async API; every call is a message to the
 *                background. The session survives the popup closing and the
 *                worker restarting (chrome.storage.session).
 *
 *  The background only accepts wallet calls from the extension's own pages —
 *  never from content scripts, which run inside arbitrary websites. See
 *  `isTrustedSender` and src/extension/background.ts.
 */

import { WalletManager, type WalletEvent } from '../core/wallet-manager'
import { createDefaultStorage, type IStorage } from '../core/storage'
import { detectPlatform, isExtensionContext, platformDefaultSettings } from './platform'

/** Methods the UI may call. Each becomes a background message in the extension. */
export const BACKEND_METHODS = [
  'getState',
  'isUnlocked',
  'unlockRetryAt',
  'createVaultFromMnemonic',
  'createVaultFromPrivateKey',
  'createVaultFromKeystore',
  'unlock',
  'unlockWithPasskey',
  'passkeyChallenges',
  'enrollPasskey',
  'removePasskey',
  'verifyPassword',
  'lock',
  'touch',
  'addHdAccount',
  'previewHdAccounts',
  'addHdAccountsAt',
  'importMnemonic',
  'importPrivateKey',
  'importKeystore',
  'selectAccount',
  'renameAccount',
  'setAccountHidden',
  'removeAccount',
  'markBackedUp',
  'exportMnemonic',
  'exportPrivateKey',
  'exportKeystore',
  'changePassword',
  'updateSettings',
  'reset',
  'signPersonalMessage',
  'signTypedData',
  'signPqMessage',
  'signEvmTransaction',
  'signPqTransaction',
  'signExchangeTransaction',
] as const

export type BackendMethod = (typeof BACKEND_METHODS)[number]

type AsyncMethods<T, K extends keyof T> = {
  [P in K]: T[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never
}

export type WalletBackend = AsyncMethods<WalletManager, BackendMethod> & {
  subscribe(listener: (e: WalletEvent) => void): () => void
  readonly kind: 'local' | 'extension'
  /** The in-page WalletManager (web / PWA only). */
  readonly manager?: WalletManager
}

export const WALLET_CALL = 'QRDX_WALLET_CALL'
export const WALLET_EVENT = 'QRDX_WALLET_EVENT'

export interface WalletCallMessage {
  type: typeof WALLET_CALL
  method: BackendMethod
  args: unknown[]
}

export type WalletCallResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: { name: string; message: string; code?: string } }

export function serializeError(err: unknown): { name: string; message: string; code?: string } {
  const e = err as { name?: string; message?: string; code?: string }
  return { name: e?.name ?? 'Error', message: e?.message ?? String(err), code: e?.code }
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    name = 'BackendError'
  ) {
    super(message)
    this.name = name
  }
}

// ─── Local (web / PWA) ──────────────────────────────────────────────────────

export function createLocalBackend(storage: IStorage = createDefaultStorage()): WalletBackend {
  const manager = new WalletManager(storage, {
    defaultSettings: platformDefaultSettings(detectPlatform().target),
  })
  // `manager` lets in-page features that need the wallet itself (QRDX Connect's dApp
  // router) use the same instance; web and PWA already run it in the page.
  const backend = {
    kind: 'local' as const,
    subscribe: manager.subscribe.bind(manager),
    manager,
  } as Record<string, unknown>
  for (const m of BACKEND_METHODS) {
    const fn = (manager as unknown as Record<string, (...a: unknown[]) => unknown>)[m]
    backend[m] = async (...args: unknown[]) => fn.apply(manager, args)
  }
  return backend as unknown as WalletBackend
}

// ─── Extension popup → background ───────────────────────────────────────────

export function createExtensionBackend(): WalletBackend {
  const call = (method: BackendMethod, args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const msg: WalletCallMessage = { type: WALLET_CALL, method, args }
      chrome.runtime.sendMessage(msg, (res: WalletCallResponse | undefined) => {
        const lastError = chrome.runtime.lastError
        if (lastError)
          return reject(
            new BackendError(lastError.message ?? 'The wallet background is not responding')
          )
        if (!res) return reject(new BackendError('No response from the wallet background'))
        if (res.ok) resolve(res.value)
        else reject(new BackendError(res.error.message, res.error.code, res.error.name))
      })
    })

  const backend: Record<string, unknown> = {
    kind: 'extension',
    subscribe(listener: (e: WalletEvent) => void) {
      const onMessage = (msg: { type?: string; event?: WalletEvent }) => {
        if (msg?.type === WALLET_EVENT && msg.event) listener(msg.event)
      }
      chrome.runtime.onMessage.addListener(onMessage)
      return () => chrome.runtime.onMessage.removeListener(onMessage)
    },
  }
  for (const m of BACKEND_METHODS) backend[m] = (...args: unknown[]) => call(m, args)
  return backend as unknown as WalletBackend
}

/** Pick the backend for the environment this code is running in. */
export function createBackend(): WalletBackend {
  if (isExtensionContext() && typeof chrome !== 'undefined' && chrome.runtime?.id)
    return createExtensionBackend()
  return createLocalBackend()
}

/**
 * Background-side guard: wallet calls are honoured only from the extension's
 * own pages (popup, approval windows, a full-tab wallet). Content scripts
 * share the extension id but report the *website's* URL, so requiring an
 * extension-origin sender URL keeps every website out — including one that
 * has compromised its own page.
 */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false
  const base = chrome.runtime.getURL('')
  const url = (sender as chrome.runtime.MessageSender & { origin?: string }).origin
    ? `${(sender as { origin?: string }).origin}/`
    : sender.url
  return (
    typeof url === 'string' &&
    url.startsWith(base) &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(base)
  )
}
