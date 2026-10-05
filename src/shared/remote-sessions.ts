/**
 * QRDX Connect, wallet side (qrdx-trade docs/CONNECT.md): sites connected by
 * scanning a QR code, served by the same ProviderRouter as the extension's
 * injected provider, so permissions, approvals and signing are identical.
 *
 * Web and PWA only: the wallet runs in the page, and requests are handled while
 * the app is open. A request that arrives while it is closed waits in the relay
 * and is handled when the app comes back.
 */

import { ActivityLog } from '../core/activity'
import { resolveSigningChainId } from '../core/chain-identity'
import { RelayClient, type Status } from '../core/connect/client'
import { b64url, fromB64url, topicOf } from '../core/connect/crypto'
import { parsePairing } from '../core/connect/pairing'
import { getEvmProvider } from '../core/ethereum'
import { SitePermissions } from '../core/permissions'
import type { IStorage } from '../core/storage'
import type { WalletManager } from '../core/wallet-manager'
import { WatchedTokens } from '../core/watched-tokens'
import {
  ProviderRouter,
  ProviderRpcError,
  type ApprovalRequest,
  type ApprovalResult,
} from '../extension/provider/router'

const STORE_KEY = 'qrdx_remote_sessions'
/** Request ids already answered, per session: a relay replay must not sign twice. */
const ANSWERED_KEEP = 500

interface StoredSession {
  k: string
  relay: string
  topic: string
  name: string
  /** The site's origin, as the relay attested it at pairing. */
  origin: string
  createdAt: number
  answered: string[]
}

export interface SessionView {
  topic: string
  name: string
  origin: string
  createdAt: number
  status: Status
  /** The site's page is open. */
  peerOnline: boolean
}

interface Live {
  s: StoredSession
  key: Uint8Array
  client: RelayClient
  status: Status
  peerOnline: boolean
  lastAccounts: string
  lastChain: string
}

export interface RemoteSessionsDeps {
  manager: WalletManager
  storage: IStorage
  /** Show an approval to the user and wait for the answer. */
  requestApproval: (req: ApprovalRequest) => Promise<ApprovalResult>
  /** Fetch, injectable for tests. */
  fetch?: typeof fetch
}

export class PairingError extends Error {}

export class RemoteSessions {
  readonly router: ProviderRouter
  private live = new Map<string, Live>()
  private listeners = new Set<() => void>()
  private unsubscribe: (() => void) | null = null

  constructor(private readonly d: RemoteSessionsDeps) {
    const activity = new ActivityLog(d.storage)
    this.router = new ProviderRouter({
      manager: d.manager,
      permissions: new SitePermissions(d.storage),
      watchedTokens: new WatchedTokens(d.storage),
      requestApproval: d.requestApproval,
      rpc: (chain, method, params) => getEvmProvider(chain.id).rpc(method, params),
      signingChainId: (chain) => resolveSigningChainId(chain),
      onSubmitted: (record) => activity.add(record),
    })
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /** Reconnect every saved session and follow wallet changes. */
  async start(): Promise<void> {
    for (const s of await this.stored()) await this.open(s)
    this.unsubscribe = this.d.manager.subscribe(() => this.broadcast())
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
    for (const l of this.live.values()) l.client.close()
    this.live.clear()
  }

  /** Reconnect now (the app came back to the foreground). */
  wake() {
    for (const l of this.live.values()) l.client.wake()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private changed() {
    this.listeners.forEach((l) => l())
  }

  list(): SessionView[] {
    return [...this.live.values()].map((l) => ({
      topic: l.s.topic,
      name: l.s.name,
      origin: l.s.origin,
      createdAt: l.s.createdAt,
      status: l.status,
      peerOnline: l.peerOnline,
    }))
  }

  // ── pairing ────────────────────────────────────────────────────────────────

  /**
   * Join the session a QR code or link describes. Refuses unless the relay
   * attests that the site that opened the session is the one the code names:
   * the code itself can claim anything.
   */
  async pair(input: string): Promise<SessionView> {
    let p
    try {
      p = parsePairing(input)
    } catch (e) {
      throw new PairingError((e as Error).message)
    }
    const topic = await topicOf(p.key)
    const claimed = new URL(p.url).origin
    const f = this.d.fetch ?? fetch
    let meta: { dappOrigin: string | null }
    try {
      const res = await f(`${p.relay}/v1/${topic}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      meta = await res.json()
    } catch {
      throw new PairingError('Could not reach the connection relay. Check your connection and scan again.')
    }
    if (!meta.dappOrigin) {
      throw new PairingError('This code has expired or was never opened by a site. Ask the site for a new one.')
    }
    if (meta.dappOrigin !== claimed) {
      throw new PairingError(
        `This code says it is from ${claimed}, but it was opened by ${meta.dappOrigin}. Do not connect.`
      )
    }
    const existing = this.live.get(topic)
    if (existing) return this.list().find((v) => v.topic === topic)!
    const s: StoredSession = {
      k: b64url(p.key),
      relay: p.relay,
      topic,
      name: p.name,
      origin: meta.dappOrigin,
      createdAt: Date.now(),
      answered: [],
    }
    await this.save([...(await this.stored()).filter((x) => x.topic !== topic), s])
    await this.open(s)
    return this.list().find((v) => v.topic === topic)!
  }

  /** End a session: tell the site, delete it at the relay, and revoke the site's access. */
  async disconnect(topic: string): Promise<void> {
    const l = this.live.get(topic)
    if (l) {
      await l.client.send({ t: 'bye' }).catch(() => undefined)
      await l.client.destroy()
      this.live.delete(topic)
      await this.router.handle(l.s.origin, { method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => undefined)
    }
    await this.save((await this.stored()).filter((x) => x.topic !== topic))
    this.changed()
  }

  // ── sessions ───────────────────────────────────────────────────────────────

  private async open(s: StoredSession) {
    const key = fromB64url(s.k)
    const l: Live = {
      s,
      key,
      status: 'connecting',
      peerOnline: false,
      lastAccounts: '',
      lastChain: '',
      client: new RelayClient({
        relay: s.relay,
        key,
        side: 'wallet',
        onMessage: (m) => this.handle(l, m as Incoming),
        onStatus: (status) => {
          l.status = status
          if (status === 'online') void this.pushState(l, true)
          this.changed()
        },
        onPeer: (online) => {
          l.peerOnline = online
          this.changed()
        },
      }),
    }
    this.live.set(s.topic, l)
    await l.client.start()
    await l.client.send({ t: 'hello', wallet: { name: 'QRDX Wallet' } }).catch(() => undefined)
    this.changed()
  }

  private async handle(l: Live, m: Incoming) {
    if (m.t === 'bye') {
      l.client.close()
      this.live.delete(l.s.topic)
      await this.save((await this.stored()).filter((x) => x.topic !== l.s.topic))
      this.changed()
      return
    }
    if (m.t !== 'req' || typeof m.id !== 'string' || typeof m.method !== 'string') return
    if (l.s.answered.includes(m.id)) return
    l.s.answered = [...l.s.answered, m.id].slice(-ANSWERED_KEEP)
    await this.persist(l.s)
    let reply: Record<string, unknown>
    try {
      const result = await this.router.handle(l.s.origin, { method: m.method, params: m.params })
      reply = { t: 'res', id: m.id, result: result === undefined ? null : result }
    } catch (err) {
      const e =
        err instanceof ProviderRpcError
          ? err
          : new ProviderRpcError(-32603, err instanceof Error ? err.message : 'Internal error')
      reply = { t: 'res', id: m.id, error: { code: e.code, message: e.message, data: e.data } }
    }
    await l.client.send(reply).catch(() => undefined)
    await this.pushState(l)
  }

  /** accountsChanged / chainChanged, as the extension pushes them to its pages. */
  private async pushState(l: Live, force = false) {
    try {
      const [accounts, chain] = await Promise.all([this.router.exposedAccounts(l.s.origin), this.router.activeChain()])
      const chainHex = '0x' + chain.chainId.toString(16)
      const acc = JSON.stringify(accounts)
      if (force || acc !== l.lastAccounts) {
        l.lastAccounts = acc
        await l.client.send({ t: 'event', event: 'accountsChanged', data: accounts })
      }
      if (force || chainHex !== l.lastChain) {
        l.lastChain = chainHex
        await l.client.send({ t: 'event', event: 'chainChanged', data: chainHex })
      }
    } catch {
      /* relay unreachable: the next change or reconnect pushes again */
    }
  }

  private broadcast() {
    for (const l of this.live.values()) void this.pushState(l)
  }

  // ── storage ────────────────────────────────────────────────────────────────

  private async stored(): Promise<StoredSession[]> {
    return ((await this.d.storage.get(STORE_KEY)) as StoredSession[] | null) ?? []
  }

  private async save(list: StoredSession[]) {
    await this.d.storage.set(STORE_KEY, list)
  }

  private async persist(s: StoredSession) {
    await this.save((await this.stored()).map((x) => (x.topic === s.topic ? s : x)))
  }
}

interface Incoming {
  t: string
  id?: string
  method?: string
  params?: unknown
}
