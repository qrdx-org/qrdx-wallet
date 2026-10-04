/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Storage adapters
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  The wallet manager only needs a small async key/value interface. Each target
 *  gets its own backend:
 *
 *    ChromeStorage   — extension: chrome.storage.local (isolated per extension)
 *    WebStorage      — web and iPhone PWA: window.localStorage (per origin)
 *    MemoryStorage   — tests and previews
 *
 *  The vault is encrypted before it reaches any of these; storage only has to
 *  be durable, not secret. Durability is the real concern on the web: Safari
 *  can evict script-writable storage for sites the user has not visited in
 *  seven days *unless the site is installed to the home screen*. See
 *  src/pwa/storage-persistence.ts and docs/PLATFORMS.md.
 *
 *  `chromeSessionStore()` keeps an unlocked session across MV3 service-worker
 *  restarts in chrome.storage.session — memory-only, cleared when the browser
 *  closes, and not readable by content scripts.
 */

import type { SessionStore } from './wallet-manager'

export interface IStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

/** Keys the wallet owns, so `clear()` never touches another app's data on a shared origin. */
const WALLET_KEY_PREFIX = 'qrdx_'

type ChromeArea = chrome.storage.StorageArea

function chromeLocal(): ChromeArea | null {
  try {
    return typeof chrome !== 'undefined' && chrome?.storage?.local ? chrome.storage.local : null
  } catch {
    return null
  }
}

export class ChromeStorage implements IStorage {
  constructor(private readonly area: ChromeArea = chromeLocal()!) {
    if (!area) throw new Error('chrome.storage is not available in this context')
  }
  async get<T>(key: string): Promise<T | null> {
    const r = await this.area.get(key)
    return (r[key] as T) ?? null
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.area.set({ [key]: value })
  }
  async remove(key: string): Promise<void> {
    await this.area.remove(key)
  }
  async clear(): Promise<void> {
    const all = await this.area.get(null)
    const keys = Object.keys(all).filter((k) => k.startsWith(WALLET_KEY_PREFIX))
    if (keys.length) await this.area.remove(keys)
  }
}

export class WebStorage implements IStorage {
  private get ls(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null // e.g. Safari private mode with storage disabled
    }
  }
  async get<T>(key: string): Promise<T | null> {
    const item = this.ls?.getItem(key)
    return item ? (JSON.parse(item) as T) : null
  }
  async set<T>(key: string, value: T): Promise<void> {
    const ls = this.ls
    if (!ls) throw new Error('Local storage is unavailable — private browsing may be blocking it')
    try {
      ls.setItem(key, JSON.stringify(value))
    } catch (err) {
      throw new Error(
        `Could not save wallet data: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  async remove(key: string): Promise<void> {
    this.ls?.removeItem(key)
  }
  async clear(): Promise<void> {
    const ls = this.ls
    if (!ls) return
    const keys: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k?.startsWith(WALLET_KEY_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => ls.removeItem(k))
  }
}

export class MemoryStorage implements IStorage {
  private data = new Map<string, string>()
  async get<T>(key: string): Promise<T | null> {
    const v = this.data.get(key)
    return v === undefined ? null : (JSON.parse(v) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
  async clear(): Promise<void> {
    this.data.clear()
  }
}

/**
 * Picks chrome.storage inside the extension, localStorage elsewhere.
 * Kept under its historical name; prefer {@link createDefaultStorage}.
 */
export class ExtensionStorage implements IStorage {
  private inner: IStorage | null = null
  private get backend(): IStorage {
    if (!this.inner) this.inner = createDefaultStorage()
    return this.inner
  }
  get<T>(key: string) {
    return this.backend.get<T>(key)
  }
  set<T>(key: string, value: T) {
    return this.backend.set(key, value)
  }
  remove(key: string) {
    return this.backend.remove(key)
  }
  clear() {
    return this.backend.clear()
  }
}

export function createDefaultStorage(): IStorage {
  const local = chromeLocal()
  return local ? new ChromeStorage(local) : new WebStorage()
}

/**
 * Session persistence for the extension's service worker.
 * Returns null outside an extension (web/PWA sessions end on reload by design).
 */
export function chromeSessionStore(key = 'qrdx_session'): SessionStore | null {
  const area = typeof chrome !== 'undefined' ? chrome?.storage?.session : undefined
  if (!area) return null
  return {
    async get() {
      const r = await area.get(key)
      return (r[key] as { dek: string; expiresAt: number } | undefined) ?? null
    },
    async set(value) {
      await area.set({ [key]: value })
    },
    async clear() {
      await area.remove(key)
    },
  }
}

/**
 * React Native SecureStore backend (legacy Expo app — not a shipping target).
 * Tracks the keys it writes so `clear()` actually erases them; SecureStore has
 * no bulk delete, which previously made "Reset wallet" a silent no-op.
 */
export class MobileStorage implements IStorage {
  private static readonly INDEX_KEY = 'qrdx__keys'
  constructor(
    private readonly secureStore: {
      getItemAsync: (key: string) => Promise<string | null>
      setItemAsync: (key: string, value: string) => Promise<void>
      deleteItemAsync: (key: string) => Promise<void>
    }
  ) {}
  private async index(): Promise<string[]> {
    const raw = await this.secureStore.getItemAsync(MobileStorage.INDEX_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  }
  async get<T>(key: string): Promise<T | null> {
    const value = await this.secureStore.getItemAsync(key)
    return value ? (JSON.parse(value) as T) : null
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.secureStore.setItemAsync(key, JSON.stringify(value))
    const keys = await this.index()
    if (!keys.includes(key))
      await this.secureStore.setItemAsync(MobileStorage.INDEX_KEY, JSON.stringify([...keys, key]))
  }
  async remove(key: string): Promise<void> {
    await this.secureStore.deleteItemAsync(key)
    const keys = await this.index()
    await this.secureStore.setItemAsync(
      MobileStorage.INDEX_KEY,
      JSON.stringify(keys.filter((k) => k !== key))
    )
  }
  async clear(): Promise<void> {
    for (const k of await this.index()) await this.secureStore.deleteItemAsync(k)
    await this.secureStore.deleteItemAsync(MobileStorage.INDEX_KEY)
  }
}

/** @deprecated Pass an {@link IStorage} to `WalletManager` directly. */
export class WalletStorage {
  constructor(readonly storage: IStorage) {}
}
