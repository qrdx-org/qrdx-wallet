import type { WalletState, StoredWallet } from './types'

/**
 * Abstract storage interface that can be implemented for different platforms
 */
export interface IStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

/**
 * Browser extension storage implementation
 */
export class ExtensionStorage implements IStorage {
  async get<T>(key: string): Promise<T | null> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(key)
      return result[key] ?? null
    }
    // Fallback to localStorage for development
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ [key]: value })
    } else {
      // Fallback to localStorage for development
      localStorage.setItem(key, JSON.stringify(value))
    }
  }

  async remove(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove(key)
    } else {
      localStorage.removeItem(key)
    }
  }

  async clear(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.clear()
    } else {
      localStorage.clear()
    }
  }
}

/**
 * Mobile storage implementation (using Expo SecureStore)
 */
export class MobileStorage implements IStorage {
  private secureStore: any

  constructor(secureStore: any) {
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
    // Note: SecureStore doesn't have a clear all method
    // You'd need to track keys separately if needed
    console.warn('MobileStorage.clear() not fully implemented')
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
