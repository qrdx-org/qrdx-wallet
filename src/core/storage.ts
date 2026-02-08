import type { WalletState, StoredWallet } from './types'

/**
 * Abstract storage interface that can be implemented for different platforms.
 * All platform-specific storage backends implement this interface so that
 * WalletStorage, WalletManager, and WalletContext stay platform-agnostic.
 */
export interface IStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

/**
 * Browser extension storage implementation.
 * Uses a lazy dynamic import for webextension-polyfill so that importing this
 * module in React Native / non-extension environments never throws.
 */
export class ExtensionStorage implements IStorage {
  private browser: any = null
  private initialized = false

  private async init() {
    if (this.initialized) return
    this.initialized = true
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage) {
        this.browser = chrome
      } else {
        const mod = await import('webextension-polyfill')
        if (mod.default?.storage) {
          this.browser = mod.default
        }
      }
    } catch {
      // Not in an extension context — will fall through to localStorage
    }
  }

  private isExtensionContext(): boolean {
    return this.browser?.storage !== undefined
  }

  async get<T>(key: string): Promise<T | null> {
    await this.init()
    if (this.isExtensionContext()) {
      const result = await this.browser.storage.local.get(key)
      return (result[key] as T) ?? null
    }
    if (typeof localStorage === 'undefined') return null
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.init()
    if (this.isExtensionContext()) {
      await this.browser.storage.local.set({ [key]: value })
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }

  async remove(key: string): Promise<void> {
    await this.init()
    if (this.isExtensionContext()) {
      await this.browser.storage.local.remove(key)
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  }

  async clear(): Promise<void> {
    await this.init()
    if (this.isExtensionContext()) {
      await this.browser.storage.local.clear()
    } else if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  }
}

/**
 * Mobile storage implementation (using Expo SecureStore).
 * SecureStore is injected at construction time to avoid top-level
 * imports that would fail outside React Native.
 */
export class MobileStorage implements IStorage {
  private secureStore: {
    getItemAsync: (key: string) => Promise<string | null>
    setItemAsync: (key: string, value: string) => Promise<void>
    deleteItemAsync: (key: string) => Promise<void>
  }

  constructor(secureStore: MobileStorage['secureStore']) {
    this.secureStore = secureStore
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.secureStore.getItemAsync(key)
    return value ? JSON.parse(value) : null
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.secureStore.setItemAsync(key, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    await this.secureStore.deleteItemAsync(key)
  }

  async clear(): Promise<void> {
    console.warn('MobileStorage.clear() — SecureStore has no bulk clear')
  }
}

/**
 * Wallet storage manager
 */
export class WalletStorage {
  private storage: IStorage
  private static readonly WALLET_STATE_KEY = 'qrdx_wallet_state'

  constructor(storage: IStorage) {
    this.storage = storage
  }

  async getState(): Promise<WalletState | null> {
    return this.storage.get<WalletState>(WalletStorage.WALLET_STATE_KEY)
  }

  async setState(state: WalletState): Promise<void> {
    await this.storage.set(WalletStorage.WALLET_STATE_KEY, state)
  }

  async addWallet(wallet: StoredWallet): Promise<void> {
    const state = await this.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    state.wallets.push(wallet)
    await this.setState(state)
  }

  async removeWallet(walletId: string): Promise<void> {
    const state = await this.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    state.wallets = state.wallets.filter(w => w.id !== walletId)
    if (state.currentWalletId === walletId) {
      state.currentWalletId = state.wallets[0]?.id
    }
    await this.setState(state)
  }

  async getCurrentWallet(): Promise<StoredWallet | null> {
    const state = await this.getState()
    if (!state || !state.currentWalletId) {
      return null
    }

    return state.wallets.find(w => w.id === state.currentWalletId) || null
  }

  async setCurrentWallet(walletId: string): Promise<void> {
    const state = await this.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    if (!state.wallets.find(w => w.id === walletId)) {
      throw new Error('Wallet not found')
    }

    state.currentWalletId = walletId
    await this.setState(state)
  }

  async clear(): Promise<void> {
    await this.storage.clear()
  }
}
