import { QuantumCrypto } from './crypto'
import { WalletStorage } from './storage'
import type { WalletState, StoredWallet, Transaction } from './types'
import { DEFAULT_NETWORK, APP_CONFIG } from './constants'

export class WalletManager {
  private storage: WalletStorage
  private currentPassword?: string

  constructor(storage: WalletStorage) {
    this.storage = storage
  }

  /**
   * Initialize a new wallet
   */
  async initialize(password: string): Promise<void> {
    const state = await this.storage.getState()
    if (state?.initialized) {
      throw new Error('Wallet already initialized')
    }

    const initialState: WalletState = {
      version: APP_CONFIG.version,
      initialized: true,
      locked: false,
      wallets: [],
      currentNetwork: DEFAULT_NETWORK,
      settings: {
        theme: 'auto',
        currency: 'USD',
        language: 'en',
        autoLock: true,
        autoLockTimeout: APP_CONFIG.defaultLockTimeout
      }
    }

    await this.storage.setState(initialState)
    this.currentPassword = password
  }

  /**
   * Create a new wallet
   */
  async createWallet(name: string, password: string): Promise<StoredWallet> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    if (state.wallets.length >= APP_CONFIG.maxWallets) {
      throw new Error(`Maximum ${APP_CONFIG.maxWallets} wallets allowed`)
    }

    // Generate new key pair
    const { publicKey, privateKey, address } = await QuantumCrypto.generateKeyPair()

    // Encrypt private key with password
    const encryptedPrivateKey = await QuantumCrypto.encrypt(privateKey, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      publicKey,
      address,
      createdAt: Date.now()
    }

    await this.storage.addWallet(wallet)

    // Set as current wallet if it's the first one
    if (state.wallets.length === 0) {
      await this.storage.setCurrentWallet(wallet.id)
    }

    return wallet
  }

  /**
   * Import a wallet from private key
   */
  async importWallet(
    name: string,
    privateKey: string,
    password: string
  ): Promise<StoredWallet> {
    // TODO: Derive public key and address from private key
    // This is a placeholder implementation
    const publicKey = 'qr_pub_' + privateKey.substring(0, 40)
    const address = 'qr_' + privateKey.substring(0, 40)

    const encryptedPrivateKey = await QuantumCrypto.encrypt(privateKey, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      publicKey,
      address,
      createdAt: Date.now()
    }

    await this.storage.addWallet(wallet)
    return wallet
  }

  /**
   * Unlock the wallet with password
   */
  async unlock(password: string): Promise<boolean> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    // Verify password by trying to decrypt a wallet
    if (state.wallets.length > 0) {
      try {
        await QuantumCrypto.decrypt(state.wallets[0].encryptedPrivateKey, password)
        this.currentPassword = password
        state.locked = false
        await this.storage.setState(state)
        return true
      } catch (error) {
        return false
      }
    }

    return false
  }

  /**
   * Lock the wallet
   */
  async lock(): Promise<void> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    this.currentPassword = undefined
    state.locked = true
    await this.storage.setState(state)
  }

  /**
   * Sign a transaction
   */
  async signTransaction(tx: Transaction, password: string): Promise<string> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) {
      throw new Error('No active wallet')
    }

    // Decrypt private key
    const privateKey = await QuantumCrypto.decrypt(wallet.encryptedPrivateKey, password)

    // Sign transaction
    const message = JSON.stringify({
      from: tx.from,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice
    })

    const signature = await QuantumCrypto.sign(message, privateKey)
    return signature
  }

  /**
   * Get current wallet state
   */
  async getState(): Promise<WalletState | null> {
    return this.storage.getState()
  }
}
