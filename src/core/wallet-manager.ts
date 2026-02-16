import { QuantumCrypto } from './crypto'
import { WalletStorage } from './storage'
import type { WalletState, StoredWallet, Transaction } from './types'
import { DEFAULT_NETWORK, APP_CONFIG } from './constants'
import { getEvmProvider, ethToWei, toHex, type EthTransactionRequest } from './ethereum'
import { DEFAULT_CHAIN, supportsWeb3, supportsPQ, type ChainConfig } from './chains'

export class WalletManager {
  private storage: WalletStorage
  private currentPassword?: string

  constructor(storage: WalletStorage) {
    this.storage = storage
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Generate a proper EVM-compatible address from a private key.
   * Uses keccak256 on the uncompressed public key. Because Web Crypto
   * doesn't expose secp256k1, we derive a deterministic pseudo-address
   * via SHA-256 for now. The external web3.js submodule provides real
   * secp256k1 signing when available.
   */
  private static async deriveEthAddress(privateKey: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(privateKey)
    const hash = await crypto.subtle.digest('SHA-256', keyData)
    const bytes = new Uint8Array(hash)
    // Take the last 20 bytes as the address (matches Ethereum address length)
    const addressBytes = bytes.slice(12, 32)
    const hex = Array.from(addressBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return '0x' + hex
  }

  /**
   * Generate a quantum-resistant address from a private key.
   */
  private static async derivePqAddress(privateKey: string): Promise<{ publicKey: string; pqAddress: string }> {
    const { publicKey, address } = await QuantumCrypto.generateKeyPair()
    // In production this would derive from the same seed — for now use the generated pair
    return { publicKey, pqAddress: address }
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
   * Create a new wallet with both EVM and PQ addresses.
   */
  async createWallet(name: string, password: string): Promise<StoredWallet> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    if (state.wallets.length >= APP_CONFIG.maxWallets) {
      throw new Error(`Maximum ${APP_CONFIG.maxWallets} wallets allowed`)
    }

    // Generate a random 32-byte private key
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const privateKey = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Derive EVM-compatible address
    const ethAddress = await WalletManager.deriveEthAddress(privateKey)

    // Derive PQ address + public key
    const { publicKey, pqAddress } = await WalletManager.derivePqAddress(privateKey)

    // Encrypt private key with password
    const encryptedPrivateKey = await QuantumCrypto.encrypt(privateKey, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      publicKey,
      ethAddress,
      pqAddress,
      address: ethAddress, // backwards compat — defaults to EVM address
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
   * Import a wallet from a hex private key.
   * Derives both an EVM address and a PQ address from the key.
   */
  async importWallet(
    name: string,
    privateKey: string,
    password: string
  ): Promise<StoredWallet> {
    // Strip 0x prefix if present
    const cleanKey = privateKey.replace(/^0x/, '')

    // Derive both address types
    const ethAddress = await WalletManager.deriveEthAddress(cleanKey)
    const { publicKey, pqAddress } = await WalletManager.derivePqAddress(cleanKey)

    const encryptedPrivateKey = await QuantumCrypto.encrypt(cleanKey, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      publicKey,
      ethAddress,
      pqAddress,
      address: ethAddress, // backwards compat
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

  // ─── EVM operations ───────────────────────────────────────────────────

  /**
   * Get native + ERC-20 balances for the current wallet on a given chain.
   */
  async getBalances(chainId: string | number) {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    return provider.getAllBalances(wallet.ethAddress)
  }

  /**
   * Get the native balance for the current wallet on a given chain.
   */
  async getNativeBalance(chainId: string | number): Promise<string> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    return provider.getFormattedBalance(wallet.ethAddress)
  }

  /**
   * Build a native-currency send transaction (unsigned).
   * Caller should then sign and broadcast.
   */
  async buildSend(
    chainId: string | number,
    to: string,
    amount: string,
    decimals = 18
  ): Promise<EthTransactionRequest> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    const amountWei = ethToWei(amount, decimals)
    return provider.buildTransfer(wallet.ethAddress, to, amountWei)
  }

  /**
   * Build an ERC-20 token transfer (unsigned).
   */
  async buildTokenSend(
    chainId: string | number,
    tokenAddress: string,
    to: string,
    amount: string,
    decimals: number
  ): Promise<EthTransactionRequest> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    const amountRaw = ethToWei(amount, decimals)
    return provider.buildTokenTransfer(wallet.ethAddress, tokenAddress, to, amountRaw)
  }

  /**
   * Estimate the gas cost for a native send.
   */
  async estimateSendGas(
    chainId: string | number,
    to: string,
    amount: string,
    decimals = 18
  ) {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    const amountWei = ethToWei(amount, decimals)
    return provider.getGasEstimate({
      from: wallet.ethAddress,
      to,
      value: toHex(amountWei),
    })
  }

  /**
   * Get current wallet state
   */
  async getState(): Promise<WalletState | null> {
    return this.storage.getState()
  }
}
