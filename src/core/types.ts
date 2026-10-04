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

// ─── Wallet (vault v2) public view ──────────────────────────────────────────
//
// Everything below is safe to hold in UI state: no secret ever appears in these
// shapes. Secrets live only inside the encrypted vault (see ./vault.ts and
// ./wallet-manager.ts).

import type { DerivedAccountPublic, KeyringType } from './keyring'

/** How an account came to exist — drives backup warnings and labels. */
export type AccountSource =
  | 'created'          // derived from a phrase this wallet generated
  | 'imported-phrase'  // derived from a phrase the user typed in
  | 'imported-key'     // raw secp256k1 private key
  | 'imported-keystore'

/**
 * One account: a classic (secp256k1, `0x`) credential and a post-quantum
 * (ML-DSA-65, `0xPQ`) credential. On QRDX these are two separate ledger
 * accounts; `pqAccountId` is the second one's 20-byte ledger key.
 */
export interface WalletAccount extends DerivedAccountPublic {
  id: string
  name: string
  keyringId: string
  keyringType: KeyringType
  /** HD index within its keyring (hd keyrings only). */
  hdIndex?: number
  source: AccountSource
  createdAt: number
  hidden?: boolean
  /** @deprecated use ethAddress */
  address: string
  /** @deprecated use ethPublicKey */
  publicKey: string
}

/** @deprecated Accounts are {@link WalletAccount}; kept so older imports compile. */
export type StoredWallet = WalletAccount

export interface KeyringSummary {
  id: string
  type: KeyringType
  label: string
  accountCount: number
  createdAt: number
  /** For phrases this wallet generated: whether the user verified their backup. */
  backedUp: boolean
}

export interface PasskeySummary {
  credentialId: string
  label: string
  rpId: string
  createdAt: number
}

export interface WalletState {
  /** Vault format version. */
  version: number
  initialized: boolean
  locked: boolean
  currentWalletId?: string
  wallets: WalletAccount[]
  keyrings: KeyringSummary[]
  passkeys: PasskeySummary[]
  settings: WalletSettings
}

export interface WalletSettings {
  theme: 'light' | 'dark' | 'auto'
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF'
  language: string
  autoLock: boolean
  /** Inactivity before auto-lock, in milliseconds. */
  autoLockTimeout: number
  /**
   * Lock as soon as the app is hidden (backgrounded) for longer than this many
   * milliseconds. 0 = immediately on hide; undefined = only the inactivity
   * timer applies. Defaults on for the iPhone PWA.
   */
  lockOnHideAfter?: number
  developerMode?: boolean
  /**
   * Registry slug of the selected chain (see `core/chains.ts`), e.g.
   * `qrdx-mainnet` or `qrdx-local`. Persisted so the wallet reopens on the
   * network the user was last using instead of silently reverting to mainnet.
   */
  activeChainId?: string
  /** Show testnets in the network selector. Off by default. */
  showTestnets?: boolean
  /**
   * Chain slug → chain ID the user explicitly accepted despite it differing
   * from the registry. Restored into `core/chain-identity.ts` at startup.
   * Only ever written through an explicit user confirmation.
   */
  trustedChainIds?: Record<string, number>
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
