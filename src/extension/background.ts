/**
 * QRDX Wallet — extension background (MV3 service worker / MV2 background page).
 *
 * The single holder of keys in the extension:
 *
 *   popup / approval windows ──(QRDX_WALLET_CALL, trusted senders only)──▶ WalletManager
 *   web pages ──(content-script port, origin from the browser)──▶ ProviderRouter ──▶ WalletManager
 *
 * The unlocked session lives in chrome.storage.session, so it survives the
 * worker being stopped and restarted until auto-lock or browser close.
 */

import { WalletManager } from '../core/wallet-manager'
import { ChromeStorage, chromeSessionStore } from '../core/storage'
import { SitePermissions } from '../core/permissions'
import { WatchedTokens } from '../core/watched-tokens'
import { ActivityLog } from '../core/activity'
import { getEvmProvider } from '../core/ethereum'
import { resolveSigningChainId } from '../core/chain-identity'
import {
  BACKEND_METHODS,
  WALLET_CALL,
  WALLET_EVENT,
  isTrustedSender,
  serializeError,
  type WalletCallMessage,
} from '../shared/backend'
import { platformDefaultSettings } from '../shared/platform'
import {
  ProviderRouter,
  ProviderRpcError,
  type ApprovalRequest,
  type ApprovalResult,
} from './provider/router'
import {
  APPROVAL_GET,
  APPROVAL_RESOLVE,
  type ApprovalGetMessage,
  type ApprovalResolveMessage,
} from './provider/approval-protocol'

const storage = new ChromeStorage()
const manager = new WalletManager(storage, {
  sessionStore: chromeSessionStore() ?? undefined,
  defaultSettings: platformDefaultSettings('extension'),
})
const permissions = new SitePermissions(storage)
const watchedTokens = new WatchedTokens(storage)
const activity = new ActivityLog(storage)

// ─── Approvals (one window at a time) ───────────────────────────────────────

interface Pending {
  request: ApprovalRequest
  resolve: (r: ApprovalResult) => void
  windowId?: number
}

const pending = new Map<string, Pending>()
let approvalQueue: Promise<unknown> = Promise.resolve()
const MAX_PENDING_PER_ORIGIN = 3

function requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
  const fromOrigin = [...pending.values()].filter((p) => p.request.origin === request.origin).length
  if (fromOrigin >= MAX_PENDING_PER_ORIGIN) return Promise.resolve({ approved: false })

  const run = () =>
    new Promise<ApprovalResult>((resolve) => {
      const id = crypto.randomUUID()
      const entry: Pending = { request, resolve }
      pending.set(id, entry)
      chrome.windows.create(
        {
          url: chrome.runtime.getURL(`popup/index.html#approval=${id}`),
          type: 'popup',
          width: 390,
          height: 680,
          focused: true,
        },
        (win) => {
          entry.windowId = win?.id
          if (!win) finish(id, { approved: false })
        }
      )
    })
  const result = approvalQueue.then(run, run)
  approvalQueue = result.catch(() => undefined)
  return result
}

function finish(id: string, result: ApprovalResult) {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  p.resolve(result)
  if (p.windowId !== undefined) chrome.windows.remove(p.windowId).catch(() => undefined)
}

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [id, p] of pending) if (p.windowId === windowId) finish(id, { approved: false })
})

// ─── Router ─────────────────────────────────────────────────────────────────

const router = new ProviderRouter({
  manager,
  permissions,
  watchedTokens,
  requestApproval,
  rpc: (chain, method, params) => getEvmProvider(chain.id).rpc(method, params),
  signingChainId: (chain) => resolveSigningChainId(chain),
  onSubmitted: (record) => activity.add(record),
})

// ─── Popup / approval-window calls ──────────────────────────────────────────

const allowed = new Set<string>(BACKEND_METHODS)

chrome.runtime.onMessage.addListener((msg: { type?: string }, sender, sendResponse) => {
  if (msg?.type !== WALLET_CALL && msg?.type !== APPROVAL_GET && msg?.type !== APPROVAL_RESOLVE)
    return false
  if (!isTrustedSender(sender)) {
    sendResponse({
      ok: false,
      error: { name: 'Forbidden', message: 'Not allowed from this context' },
    })
    return false
  }

  if (msg.type === APPROVAL_GET) {
    const p = pending.get((msg as ApprovalGetMessage).id)
    sendResponse(
      p
        ? { ok: true, value: p.request }
        : { ok: false, error: { name: 'NotFound', message: 'This request is no longer pending' } }
    )
    return false
  }
  if (msg.type === APPROVAL_RESOLVE) {
    const m = msg as ApprovalResolveMessage
    finish(m.id, m.result)
    sendResponse({ ok: true, value: null })
    return false
  }

  const { method, args } = msg as WalletCallMessage
  if (!allowed.has(method)) {
    sendResponse({
      ok: false,
      error: { name: 'Forbidden', message: `Unknown wallet method ${method}` },
    })
    return false
  }
  const fn = (manager as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]
  Promise.resolve()
    .then(() => fn.apply(manager, Array.isArray(args) ? args : []))
    .then(
      (value) => sendResponse({ ok: true, value }),
      (err) => sendResponse({ ok: false, error: serializeError(err) })
    )
  return true // async response
})

// ─── dApp ports ─────────────────────────────────────────────────────────────

interface Conn {
  port: chrome.runtime.Port
  origin: string
  lastAccounts: string
  lastChain: string
}
const conns = new Set<Conn>()

function originOf(port: chrome.runtime.Port): string | null {
  const s = port.sender as chrome.runtime.MessageSender & { origin?: string }
  if (!s || s.id !== chrome.runtime.id) return null
  try {
    const o = s.origin ?? (s.url ? new URL(s.url).origin : null)
    return o && /^https?:\/\//.test(o) ? o : null
  } catch {
    return null
  }
}

async function pushState(conn: Conn) {
  try {
    const [accounts, chain] = await Promise.all([
      router.exposedAccounts(conn.origin),
      router.activeChain(),
    ])
    const chainHex = '0x' + chain.chainId.toString(16)
    const acc = JSON.stringify(accounts)
    if (acc !== conn.lastAccounts) {
      conn.lastAccounts = acc
      conn.port.postMessage({ event: 'accountsChanged', data: accounts })
    }
    if (chainHex !== conn.lastChain) {
      conn.lastChain = chainHex
      conn.port.postMessage({ event: 'chainChanged', data: chainHex })
    }
  } catch {
    /* port closed */
  }
}

const broadcast = () => conns.forEach((c) => void pushState(c))

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'qrdx-provider') return
  const origin = originOf(port)
  if (!origin) return port.disconnect()
  const conn: Conn = { port, origin, lastAccounts: '', lastChain: '' }
  conns.add(conn)
  port.onDisconnect.addListener(() => conns.delete(conn))
  void pushState(conn)

  port.onMessage.addListener(async (msg: { id?: number; method?: string; params?: unknown }) => {
    if (typeof msg?.id !== 'number') return
    try {
      const result = await router.handle(origin, { method: String(msg.method), params: msg.params })
      port.postMessage({ id: msg.id, result })
    } catch (err) {
      const e =
        err instanceof ProviderRpcError
          ? err
          : new ProviderRpcError(-32603, err instanceof Error ? err.message : 'Internal error')
      port.postMessage({ id: msg.id, error: { code: e.code, message: e.message, data: e.data } })
    }
    void pushState(conn)
  })
})

// ─── State fan-out ──────────────────────────────────────────────────────────

manager.subscribe((event) => {
  chrome.runtime.sendMessage({ type: WALLET_EVENT, event }).catch(() => undefined) // no popup open
  broadcast()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('qrdx_'))) broadcast()
})

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/index.html') }).catch(() => undefined)
  }
})
