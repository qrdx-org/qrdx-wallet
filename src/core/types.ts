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
  encryptedPrivateKey: string
  publicKey: string
  /** Primary QRDX / EVM-compatible address (0x…) */
  ethAddress: string
  /** Post-Quantum address (qr_…) */
  pqAddress: string
  /** @deprecated kept for backwards compat — resolves to ethAddress */
  address: string
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
