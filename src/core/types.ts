// Wallet Types
export interface Wallet {
  id: string
  name: string
  address: string
  publicKey: string
  encrypted: boolean
}

export interface Account {
  address: string
  balance: string
  nonce: number
}

export interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  data?: string
  nonce: number
  gasLimit: string
  gasPrice: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
}

export interface Token {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  price?: number
}

export interface Network {
  chainId: number
  name: string
  rpcUrl: string
  explorerUrl: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
}

// Storage Types

/**
 * A stored account has a paired ETH + PQ (post-quantum) address.
 * On QRDX chain every account is represented by both an EVM-compatible
 * address and a quantum-resistant address derived from Dilithium/SPHINCS+ keys.
 */
export interface StoredWallet {
  id: string
  name: string
  /** AES-256-GCM encrypted hex private key (ETH + PQ seed combined) */
  encryptedPrivateKey: string

  // ── ETH (secp256k1) ────────────────────────────────────────────────────
  /** Compressed secp256k1 public key (33 bytes as hex) */
  ethPublicKey: string
  /** EIP-55 checksummed 0x address derived from uncompressed pubkey */
  ethAddress: string

  // ── PQ (ML-DSA-65 / Dilithium3) ────────────────────────────────────────
  /**
   * Full PQ public key (1952 bytes as hex).
   * MUST be stored — Dilithium key generation is non-deterministic,
   * so the pubkey cannot be rederived from the private key alone.
   */
  pqPublicKey: string
  /** 0xPQ-prefixed checksummed address */
  pqAddress: string
  /** First 8 bytes of SHA-256(pqPublicKey) as hex — for quick ID */
  pqFingerprint: string

  // ── Backwards compat ───────────────────────────────────────────────────
  /** @deprecated Use ethPublicKey instead */
  publicKey: string
  /** @deprecated Use ethAddress instead — resolves to ethAddress */
  address: string

  /** AES-256-GCM encrypted BIP-39 mnemonic phrase (if created from mnemonic) */
  encryptedMnemonic?: string
  /** HD derivation index (default 0) */
  hdIndex?: number

  createdAt: number
}

export interface WalletState {
  version: string
  initialized: boolean
  locked: boolean
  currentWalletId?: string
  wallets: StoredWallet[]
  currentNetwork: Network
  settings: WalletSettings
}

export interface WalletSettings {
  theme: 'light' | 'dark' | 'auto'
  currency: 'USD' | 'EUR' | 'GBP'
  language: string
  autoLock: boolean
  autoLockTimeout: number
}

// Message Types
export type MessageType =
  | 'GET_WALLET_STATE'
  | 'UNLOCK_WALLET'
  | 'LOCK_WALLET'
  | 'CREATE_WALLET'
  | 'IMPORT_WALLET'
  | 'SIGN_TRANSACTION'
  | 'GET_BALANCE'
  | 'GET_TRANSACTIONS'
  | 'SEND_TRANSACTION'
  | 'SWITCH_NETWORK'
  | 'ADD_TOKEN'

export interface Message<T = any> {
  type: MessageType
  payload?: T
}

export interface MessageResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}
