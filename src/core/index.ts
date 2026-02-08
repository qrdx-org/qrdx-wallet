/**
 * Core barrel export — everything platform-agnostic lives here.
 * Both the extension/web UI and the mobile app import from @core/*.
 */
export { QuantumCrypto } from './crypto'
export { WalletManager } from './wallet-manager'
export {
  type IStorage,
  ExtensionStorage,
  MobileStorage,
  WalletStorage,
} from './storage'
export { NETWORKS, DEFAULT_NETWORK, APP_CONFIG } from './constants'
export type {
  Wallet,
  Account,
  Transaction,
  Token,
  Network,
  StoredWallet,
  WalletState,
  WalletSettings,
  MessageType,
  Message,
  MessageResponse,
} from './types'
