/**
 * QRDX Wallet — in-page provider (runs in the web page's MAIN world).
 *
 * Exposes:
 *   • window.qrdx          — always; the QRDX provider (EIP-1193 + qrdx_* methods)
 *   • window.ethereum      — only if no other wallet already claimed it
 *   • EIP-6963             — announced on load and on every `eip6963:requestProvider`,
 *                            so multi-wallet dApps can find QRDX even when another
 *                            wallet owns window.ethereum
 *
 * This script holds no secrets and makes no decisions: every request is
 * forwarded through the content script to the background, which checks the
 * page's real origin. A page can tamper with this object freely — it gains
 * nothing it could not already do with window.postMessage.
 */

export {}

type Listener = (...args: unknown[]) => void

interface RequestArguments {
  method: string
  params?: unknown[] | Record<string, unknown>
}

class ProviderRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
  }
}

const SOURCE_IN = 'qrdx-inpage'
const SOURCE_OUT = 'qrdx-content'

class QrdxProvider {
  readonly isQRDX = true
  /** Some dApps only offer "Injected" when this is set; QRDX does not impersonate other wallets. */
  readonly isMetaMask = false
  private listeners = new Map<string, Set<Listener>>()
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private nextId = 1
  private _chainId: string | null = null
  private _accounts: string[] = []
  private _connected = false

  constructor() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== SOURCE_OUT) return
      const msg = event.data as {
        id?: number
        result?: unknown
        error?: { code: number; message: string; data?: unknown }
        event?: string
        data?: unknown
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.error)
          p.reject(new ProviderRpcError(msg.error.code, msg.error.message, msg.error.data))
        else p.resolve(msg.result)
      } else if (msg.event) {
        this.onEvent(msg.event, msg.data)
      }
    })
    // Learn the initial chain so `connect` can fire with it.
    this.request({ method: 'eth_chainId' })
      .then((id) => this.onEvent('chainChanged', id))
      .catch(() => undefined)
  }

  get chainId(): string | null {
    return this._chainId
  }
  get selectedAddress(): string | null {
    return this._accounts[0] ?? null
  }
  get networkVersion(): string | null {
    return this._chainId ? String(parseInt(this._chainId, 16)) : null
  }
  isConnected(): boolean {
    return this._connected
  }

  request(args: RequestArguments): Promise<unknown> {
    if (!args || typeof args.method !== 'string')
      return Promise.reject(new ProviderRpcError(-32600, 'Invalid request'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      window.postMessage(
        { source: SOURCE_IN, id, method: args.method, params: args.params },
        window.location.origin
      )
    })
  }

  // ── Events (EIP-1193) ───────────────────────────────────────────────────
  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return this
  }
  addListener(event: string, listener: Listener): this {
    return this.on(event, listener)
  }
  once(event: string, listener: Listener): this {
    const wrapped: Listener = (...a) => {
      this.removeListener(event, wrapped)
      listener(...a)
    }
    return this.on(event, wrapped)
  }
  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }
  off(event: string, listener: Listener): this {
    return this.removeListener(event, listener)
  }
  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event)
    else this.listeners.clear()
    return this
  }
  private emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((l) => {
      try {
        l(...args)
      } catch (e) {
        console.error(e)
      }
    })
  }

  private onEvent(event: string, data: unknown) {
    if (event === 'chainChanged' && typeof data === 'string' && data !== this._chainId) {
      const first = this._chainId === null
      this._chainId = data
      if (first) {
        this._connected = true
        this.emit('connect', { chainId: data })
      } else {
        this.emit('chainChanged', data)
        this.emit('networkChanged', String(parseInt(data, 16)))
      }
    } else if (event === 'accountsChanged' && Array.isArray(data)) {
      const same =
        data.length === this._accounts.length && data.every((a, i) => a === this._accounts[i])
      this._accounts = data as string[]
      if (!same) this.emit('accountsChanged', data)
    } else if (event === 'disconnect') {
      this._connected = false
      this.emit('disconnect', new ProviderRpcError(4900, 'Disconnected'))
    }
  }

  // ── Legacy compatibility (deprecated, still used by older dApps) ────────
  enable(): Promise<unknown> {
    return this.request({ method: 'eth_requestAccounts' })
  }
  send(
    methodOrPayload: string | { method: string; params?: unknown[]; id?: number },
    paramsOrCallback?: unknown
  ): unknown {
    if (typeof methodOrPayload === 'string')
      return this.request({ method: methodOrPayload, params: paramsOrCallback as unknown[] })
    if (typeof paramsOrCallback === 'function')
      return this.sendAsync(methodOrPayload, paramsOrCallback as never)
    throw new Error('Synchronous send is not supported; use request()')
  }
  sendAsync(
    payload: { method: string; params?: unknown[]; id?: number },
    cb: (err: Error | null, res?: unknown) => void
  ): void {
    this.request(payload).then(
      (result) => cb(null, { id: payload.id, jsonrpc: '2.0', result }),
      (err) => cb(err)
    )
  }
}

declare global {
  interface Window {
    qrdx?: QrdxProvider
    ethereum?: unknown
  }
}

// Logo as a data URI (EIP-6963 requires one); kept small.
const ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><path d="M48 20l22 9v17c0 15-9.5 25-22 30-12.5-5-22-15-22-30V29z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></svg>'
  )

if (!window.qrdx) {
  const provider = new QrdxProvider()
  // The binding is locked so another script cannot swap in a look-alike under
  // window.qrdx; the object itself stays mutable because it tracks chain/accounts.
  Object.defineProperty(window, 'qrdx', { value: provider, writable: false, configurable: false })
  if (!window.ethereum) {
    window.ethereum = provider
    window.dispatchEvent(new Event('ethereum#initialized'))
  }

  const info = Object.freeze({
    uuid: crypto.randomUUID(),
    name: 'QRDX Wallet',
    icon: ICON,
    rdns: 'org.qrdx.wallet',
  })
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) })
    )
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
  window.dispatchEvent(new Event('qrdx#initialized'))
}
