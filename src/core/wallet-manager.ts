import {
  generateEthKeyPair,
  ethKeyPairFromPrivateKey,
  generatePqKeyPair,
  pqKeyPairFromSeed,
  pqKeyPairFromMnemonic,
  pqKeyPairFromStored,
  signEthMessage,
  signHash,
  pqSign,
  encrypt,
  decrypt,
  hexToBytes,
  bytesToHex,
  generateMnemonic,
  isValidMnemonic,
  mnemonicToEthKeyPair,
  exportKeystoreJSON,
  importKeystoreJSON,
  type EthKeyPair,
  type PqKeyPair,
  type KeystoreJSON,
} from './crypto'
import { WalletStorage } from './storage'
import type { WalletState, StoredWallet, Transaction } from './types'
import { DEFAULT_NETWORK, APP_CONFIG } from './constants'
import { getEvmProvider, ethToWei, toHex, type EthTransactionRequest, type EthTransactionReceipt } from './ethereum'
import { DEFAULT_CHAIN, getChain, supportsWeb3, supportsPQ, type ChainConfig } from './chains'
import {
  sendNativeTransfer,
  fetchNativeBalance,
  type NativeSendResult,
} from './native-tx'
import { signTransaction, type SignedTransaction } from './transaction'
import { recordPendingTransaction, updatePendingTransaction } from './history'

export class WalletManager {
  private storage: WalletStorage
  private currentPassword?: string

  constructor(storage: WalletStorage) {
    this.storage = storage
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Get the decrypted private key for the current wallet.
   * Requires that the wallet is unlocked (currentPassword is set).
   */
  private async getDecryptedKey(wallet: StoredWallet): Promise<string> {
    if (!this.currentPassword) {
      throw new Error('Wallet is locked')
    }
    return decrypt(wallet.encryptedPrivateKey, this.currentPassword)
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
   *
   * 1. Generates a random secp256k1 private key → ETH address
   * 2. Generates a random 64-byte PQ seed → PQ fallback key pair
   * 3. Encrypts a combined key blob (ethPriv|pqSeed) with AES-256-GCM
   * 4. Stores everything including the PQ public key
   */
  async createWallet(name: string, password: string): Promise<StoredWallet> {
    // Generate a mnemonic → derive key from it
    const mnemonic = generateMnemonic(128) // 12 words
    return this.createWalletFromMnemonic(name, mnemonic, password)
  }

  /**
   * Create a wallet from an existing BIP-39 mnemonic.
   * Used both internally by createWallet() and externally for import-by-mnemonic.
   */
  async createWalletFromMnemonic(
    name: string,
    mnemonic: string,
    password: string,
    hdIndex = 0
  ): Promise<StoredWallet & { mnemonic: string }> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    if (state.wallets.length >= APP_CONFIG.maxWallets) {
      throw new Error(`Maximum ${APP_CONFIG.maxWallets} wallets allowed`)
    }

    if (!isValidMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase')
    }

    // 1. Derive ETH key pair from mnemonic via BIP-32 HD path
    const eth: EthKeyPair = mnemonicToEthKeyPair(mnemonic, hdIndex)

    // 2. Derive the PQ key pair from the same mnemonic.
    //
    // This used to call generatePqKeyPair(), which produces a *random* key.
    // The recovery phrase therefore did not back up the PQ account at all:
    // restoring from it yielded a different PQ address, and anything held at
    // the original one was unrecoverable. ML-DSA-65 key generation is
    // deterministic in its seed, so the phrase can and must reproduce it.
    const pq: PqKeyPair = await pqKeyPairFromMnemonic(mnemonic, hdIndex)

    // 3. Combine private keys: ethPriv(64 hex) + ':' + pqSeed(128 hex)
    const combinedKey = `${eth.privateKey}:${pq.privateKey}`
    const encryptedPrivateKey = await encrypt(combinedKey, password)

    // 4. Encrypt the mnemonic separately (so it can be shown to the user later)
    const encryptedMnemonic = await encrypt(mnemonic, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      encryptedMnemonic,
      hdIndex,
      // ETH
      ethPublicKey: eth.publicKey,
      ethAddress: eth.address,
      // PQ
      pqPublicKey: pq.publicKey,
      pqAddress: pq.address,
      pqFingerprint: pq.fingerprint,
      // Backwards compat
      publicKey: eth.publicKey,
      address: eth.address,
      createdAt: Date.now()
    }

    await this.storage.addWallet(wallet)

    // Set as current wallet if it's the first one
    if (state.wallets.length === 0) {
      await this.storage.setCurrentWallet(wallet.id)
    }

    this.currentPassword = password
    return { ...wallet, mnemonic }
  }

  /**
   * Import a wallet from a hex private key.
   * Derives both an EVM address (real secp256k1) and a PQ address (from a
   * deterministic seed derived from the private key).
   */
  async importWallet(
    name: string,
    privateKey: string,
    password: string
  ): Promise<StoredWallet> {
    const state = await this.storage.getState()
    if (!state) {
      throw new Error('Wallet not initialized')
    }

    if (state.wallets.length >= APP_CONFIG.maxWallets) {
      throw new Error(`Maximum ${APP_CONFIG.maxWallets} wallets allowed`)
    }

    // Strip 0x prefix if present
    const cleanKey = privateKey.replace(/^0x/, '')

    // Derive real ETH key pair from the provided private key
    const eth = ethKeyPairFromPrivateKey(cleanKey)

    // A raw private key carries no mnemonic, so there is no independent source
    // of PQ entropy to recover from. The PQ key is therefore derived from the
    // imported key itself, which keeps the import reproducible — the same key
    // always yields the same PQ address.
    //
    // The security limit is worth stating plainly: a PQ key derived from a
    // secp256k1 key inherits that key's security. An adversary who can break
    // secp256k1 can recompute this PQ key, so accounts imported this way do
    // not get the quantum resistance that a mnemonic-derived account does.
    // pqKeyPairFromSeed applies domain separation so the seed is at least not
    // reusable as any other key material.
    const pq = await pqKeyPairFromSeed(hexToBytes(cleanKey))

    // Store combined key: ethPriv + ':' + pqSeed
    const combinedKey = `${eth.privateKey}:${pq.privateKey}`
    const encryptedPrivateKey = await encrypt(combinedKey, password)

    const wallet: StoredWallet = {
      id: `wallet_${Date.now()}`,
      name,
      encryptedPrivateKey,
      ethPublicKey: eth.publicKey,
      ethAddress: eth.address,
      pqPublicKey: pq.publicKey,
      pqAddress: pq.address,
      pqFingerprint: pq.fingerprint,
      publicKey: eth.publicKey,
      address: eth.address,
      createdAt: Date.now()
    }

    await this.storage.addWallet(wallet)

    // Select it when it is the first account, matching the mnemonic path.
    // Without this an import into a fresh wallet left currentWalletId unset,
    // so the dashboard had no account to show and every signing call failed
    // with "No active wallet".
    if (state.wallets.length === 0) {
      await this.storage.setCurrentWallet(wallet.id)
    }

    this.currentPassword = password
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
        await decrypt(state.wallets[0].encryptedPrivateKey, password)
        this.currentPassword = password
        state.locked = false
        await this.storage.setState(state)

        // Unlocking is the only point where the password is available to
        // re-encrypt key material, so repair any stale PQ records here.
        await this.upgradePqKeyMaterial(password)
        return true
      } catch {
        return false
      }
    }

    return false
  }

  /**
   * Bring stored post-quantum key material up to date.
   *
   * Earlier builds stored PQ material from a placeholder implementation: the
   * "public key" was a repeated SHA-256 digest and, for mnemonic wallets, the
   * seed was generated randomly rather than derived from the phrase. Neither
   * corresponds to a real ML-DSA-65 key pair, so such a record would display a
   * PQ address that its own key cannot sign for.
   *
   * This re-derives the key pair the way the account is defined now — from the
   * recovery phrase where there is one, otherwise from the imported private key
   * — and rewrites the stored public key, address, fingerprint and seed when
   * they disagree. Wallets already on the current scheme are left untouched.
   *
   * Discarding the old material is safe because it was never usable: no
   * signature could ever have been produced for those addresses.
   */
  private async upgradePqKeyMaterial(password: string): Promise<void> {
    const state = await this.storage.getState()
    if (!state) return

    let changed = false

    for (const wallet of state.wallets) {
      try {
        const combined = await decrypt(wallet.encryptedPrivateKey, password)
        const [ethPrivateKey, storedSeed] = combined.split(':')
        if (!ethPrivateKey) continue

        const pq = wallet.encryptedMnemonic
          ? await pqKeyPairFromMnemonic(
              await decrypt(wallet.encryptedMnemonic, password),
              wallet.hdIndex ?? 0,
            )
          : await pqKeyPairFromSeed(hexToBytes(ethPrivateKey))

        if (wallet.pqPublicKey === pq.publicKey && storedSeed === pq.privateKey) {
          continue
        }

        wallet.pqPublicKey = pq.publicKey
        wallet.pqAddress = pq.address
        wallet.pqFingerprint = pq.fingerprint
        wallet.encryptedPrivateKey = await encrypt(
          `${ethPrivateKey}:${pq.privateKey}`,
          password,
        )
        changed = true
      } catch (err) {
        // One unreadable record must not block unlocking the others.
        console.warn(`Could not upgrade PQ material for wallet ${wallet.id}:`, err)
      }
    }

    if (changed) {
      await this.storage.setState(state)
    }
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
   * Sign a message with the ETH private key (EIP-191 personal_sign).
   */
  async signMessage(message: string): Promise<string> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await this.getDecryptedKey(wallet)
    const ethPrivKey = combined.split(':')[0]

    const { signature } = signEthMessage(message, ethPrivKey)
    return signature
  }

  /**
   * Sign a raw hash (e.g. transaction hash).
   */
  async signRawHash(hash: string): Promise<{ signature: string; v: number; r: string; s: string }> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await this.getDecryptedKey(wallet)
    const ethPrivKey = combined.split(':')[0]

    return signHash(hash, ethPrivKey)
  }

  /**
   * Sign a transaction (legacy compatibility).
   * Returns the ECDSA signature as hex.
   */
  async signTransaction(tx: Transaction, password: string): Promise<string> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await decrypt(wallet.encryptedPrivateKey, password)
    const ethPrivKey = combined.split(':')[0]

    // Serialize the tx fields and sign as a message
    const message = JSON.stringify({
      from: tx.from,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice
    })

    const { signature } = signEthMessage(message, ethPrivKey)
    return signature
  }

  /**
   * Send native QRDX from this account's post-quantum address.
   *
   * A separate path from `signAndSendTransaction`, which builds an EVM
   * transaction: PQ holdings live on the native UTXO layer and are spent with
   * an ML-DSA-65 signature over a UTXO transaction. The two cannot be merged —
   * the EVM recipient field is 20 bytes and a PQ address is 32.
   *
   * @param feeQrdx explicit fee in QRDX. The native layer requires inputs to
   *                equal outputs plus fee exactly, so there is no estimation
   *                step to defer this to.
   */
  async sendNativePqTransaction(
    chainId: string,
    to: string,
    amountQrdx: string,
    feeQrdx = '0',
  ): Promise<NativeSendResult> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')
    if (!wallet.pqAddress) throw new Error('This account has no post-quantum address')

    const chain = getChain(chainId)
    if (!chain) throw new Error(`Unknown chain: ${chainId}`)

    const combined = await this.getDecryptedKey(wallet)
    const pqSeed = combined.split(':')[1]
    if (!pqSeed) throw new Error('No PQ key found for this account')

    return sendNativeTransfer({
      chain,
      from: wallet.pqAddress,
      to,
      amountQrdx,
      feeQrdx,
      pqSeedHex: pqSeed,
    })
  }

  /**
   * Spendable native balance at this account's PQ address, in microQRDX.
   */
  async getPqNativeBalance(chainId: string): Promise<bigint> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet?.pqAddress) return 0n

    const chain = getChain(chainId)
    if (!chain) throw new Error(`Unknown chain: ${chainId}`)

    return fetchNativeBalance(chain, wallet.pqAddress)
  }

  /**
   * Sign a message with the PQ private key.
   */
  async signMessagePQ(message: string): Promise<string> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await this.getDecryptedKey(wallet)
    const pqPrivKey = combined.split(':')[1]
    if (!pqPrivKey) throw new Error('No PQ key found')

    const msgBytes = new TextEncoder().encode(message)
    return pqSign(msgBytes, pqPrivKey)
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

  // ─── Transaction signing & broadcasting ────────────────────────────────

  /**
   * Sign a transaction request using the current wallet's private key.
   * Automatically detects EIP-1559 vs legacy format.
   *
   * Returns the signed transaction ready for broadcast.
   */
  async signTx(tx: EthTransactionRequest): Promise<SignedTransaction> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await this.getDecryptedKey(wallet)
    const ethPrivKey = combined.split(':')[0]

    return signTransaction(tx, ethPrivKey)
  }

  /**
   * Build, sign, and broadcast a native-currency transfer.
   *
   * This is the complete end-to-end send flow:
   *   1. Build the unsigned transaction (with gas estimation)
   *   2. Sign it with the wallet's secp256k1 key
   *   3. Broadcast via eth_sendRawTransaction
   *   4. Record as pending and optionally wait for confirmation
   *
   * Returns the transaction hash and signed tx data.
   */
  async signAndSendTransaction(
    chainId: string | number,
    to: string,
    amount: string,
    decimals = 18,
    waitForReceipt = false
  ): Promise<{
    hash: string
    signed: SignedTransaction
    receipt?: EthTransactionReceipt
  }> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    const chain = provider.chainConfig

    // 1. Build unsigned tx
    const amountWei = ethToWei(amount, decimals)
    const unsignedTx = await provider.buildTransfer(wallet.ethAddress, to, amountWei)

    // 2. Sign
    const combined = await this.getDecryptedKey(wallet)
    const ethPrivKey = combined.split(':')[0]
    const signed = signTransaction(unsignedTx, ethPrivKey)

    // 3. Broadcast
    const hash = await provider.sendRawTransaction(signed.rawTransaction)

    // 4. Record as pending
    recordPendingTransaction(
      chain.id,
      hash,
      wallet.ethAddress,
      to,
      unsignedTx.value ?? '0x0',
      chain.nativeCurrency.symbol,
      chain.nativeCurrency.decimals
    )

    // 5. Optionally wait for confirmation
    let receipt: EthTransactionReceipt | undefined
    if (waitForReceipt) {
      receipt = await provider.waitForTransaction(hash)
      updatePendingTransaction(hash, receipt)
    }

    return { hash, signed, receipt }
  }

  /**
   * Build, sign, and broadcast an ERC-20 token transfer.
   */
  async signAndSendTokenTransaction(
    chainId: string | number,
    tokenAddress: string,
    to: string,
    amount: string,
    decimals: number,
    waitForReceipt = false
  ): Promise<{
    hash: string
    signed: SignedTransaction
    receipt?: EthTransactionReceipt
  }> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const provider = getEvmProvider(chainId)
    const chain = provider.chainConfig

    // 1. Build unsigned ERC-20 transfer tx
    const amountRaw = ethToWei(amount, decimals)
    const unsignedTx = await provider.buildTokenTransfer(
      wallet.ethAddress,
      tokenAddress,
      to,
      amountRaw
    )

    // 2. Sign
    const combined = await this.getDecryptedKey(wallet)
    const ethPrivKey = combined.split(':')[0]
    const signed = signTransaction(unsignedTx, ethPrivKey)

    // 3. Broadcast
    const hash = await provider.sendRawTransaction(signed.rawTransaction)

    // 4. Record as pending
    recordPendingTransaction(
      chain.id,
      hash,
      wallet.ethAddress,
      to,
      '0x0', // ETH value is 0 for ERC-20 transfers
      chain.nativeCurrency.symbol,
      chain.nativeCurrency.decimals
    )

    // 5. Optionally wait for confirmation
    let receipt: EthTransactionReceipt | undefined
    if (waitForReceipt) {
      receipt = await provider.waitForTransaction(hash)
      updatePendingTransaction(hash, receipt)
    }

    return { hash, signed, receipt }
  }

  /**
   * Get current wallet state
   */
  async getState(): Promise<WalletState | null> {
    const state = await this.storage.getState()
    if (!state) return null

    // An unlocked session exists only in memory: `currentPassword` is what
    // actually decrypts keys, and it does not survive a page reload, a service
    // worker restart, or the app being reopened.
    //
    // The persisted `locked` flag therefore cannot be trusted on its own — it
    // is written as `false` while unlocked and stays that way on disk. Reading
    // it back verbatim made the wallet present itself as unlocked after a
    // restart: balances rendered and the send form accepted input, and only the
    // final signing step failed with "Wallet is locked".
    //
    // Derive the flag from whether key material is actually held, so the UI
    // asks for the password instead of offering actions it cannot complete.
    return { ...state, locked: state.locked || !this.currentPassword }
  }

  // ─── Account management ─────────────────────────────────────────────────

  /**
   * Switch to a different wallet by ID.
   */
  async switchWallet(walletId: string): Promise<void> {
    await this.storage.setCurrentWallet(walletId)
  }

  /**
   * Remove a wallet by ID.  Requires password verification first.
   */
  async removeWallet(walletId: string, password: string): Promise<void> {
    const state = await this.storage.getState()
    if (!state) throw new Error('Wallet not initialized')

    const target = state.wallets.find(w => w.id === walletId)
    if (!target) throw new Error('Wallet not found')

    // Verify password by attempting to decrypt
    await decrypt(target.encryptedPrivateKey, password)

    await this.storage.removeWallet(walletId)
  }

  /**
   * Decrypt and return the combined private key material.
   * Returns both the ETH private key and the PQ seed.
   */
  async exportPrivateKey(password: string): Promise<{ ethPrivateKey: string; pqSeed: string }> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await decrypt(wallet.encryptedPrivateKey, password)
    const [ethPrivateKey, pqSeed] = combined.split(':')
    return { ethPrivateKey, pqSeed: pqSeed ?? '' }
  }

  /**
   * Decrypt and return the BIP-39 mnemonic for the current wallet.
   * Only available if the wallet was created with a mnemonic.
   */
  async exportMnemonic(password: string): Promise<string | null> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')
    if (!wallet.encryptedMnemonic) return null

    return decrypt(wallet.encryptedMnemonic, password)
  }

  /**
   * Export the current wallet as a JSON keystore file (Ethereum V3 compatible).
   */
  async exportAsKeystoreJSON(password: string): Promise<KeystoreJSON> {
    const wallet = await this.storage.getCurrentWallet()
    if (!wallet) throw new Error('No active wallet')

    const combined = await decrypt(wallet.encryptedPrivateKey, password)
    const ethPrivKey = combined.split(':')[0]

    return exportKeystoreJSON(ethPrivKey, password, {
      ethPublicKey: wallet.ethPublicKey,
      ethAddress: wallet.ethAddress,
      pqPublicKey: wallet.pqPublicKey,
      pqAddress: wallet.pqAddress,
      pqFingerprint: wallet.pqFingerprint,
      walletName: wallet.name,
    })
  }

  /**
   * Import a wallet from a JSON keystore file.
   */
  async importFromKeystoreJSON(
    keystore: KeystoreJSON,
    keystorePassword: string,
    walletPassword: string,
    name?: string
  ): Promise<StoredWallet> {
    // Decrypt the keystore to get the private key
    const privateKeyHex = await importKeystoreJSON(keystore, keystorePassword)

    // Use the QRDX extensions if available for name
    const walletName = name ?? keystore['x-qrdx']?.walletName ?? 'Imported Wallet'

    return this.importWallet(walletName, privateKeyHex, walletPassword)
  }

  /**
   * Change the wallet password.
   * Re-encrypts every wallet's private key with the new password.
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const state = await this.storage.getState()
    if (!state) throw new Error('Wallet not initialized')

    // Re-encrypt every wallet
    for (const wallet of state.wallets) {
      const plaintext = await decrypt(wallet.encryptedPrivateKey, oldPassword)
      wallet.encryptedPrivateKey = await encrypt(plaintext, newPassword)
    }

    await this.storage.setState(state)
    this.currentPassword = newPassword
  }

  /**
   * Erase all wallet data and reset to factory state.
   */
  async resetWallet(): Promise<void> {
    this.currentPassword = undefined
    await this.storage.clear()
  }

  /**
   * Persist settings changes (currency, language, auto-lock, etc.)
   */
  async updateSettings(settings: Partial<import('./types').WalletSettings>): Promise<void> {
    const state = await this.storage.getState()
    if (!state) throw new Error('Wallet not initialized')

    state.settings = { ...state.settings, ...settings }
    await this.storage.setState(state)
  }
}
