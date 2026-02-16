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

// ── Unified chain registry ──────────────────────────────────────────────────
export {
  CHAINS,
  CHAIN_LIST,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
  PQ_CHAINS,
  WEB3_CHAINS,
  BRIDGEABLE_CHAINS,
  DEFAULT_CHAIN,
  DEFAULT_EVM_CHAIN,
  getChain,
  getChainById,
  supportsWeb3,
  supportsPQ,
  getNativeToken,
  toAddChainParam,
  type ChainConfig,
  type ChainToken,
  type TransportCapability,
  type AddEthereumChainParameter,
} from './chains'

// ── EVM / Ethereum provider ─────────────────────────────────────────────────
export {
  EvmProvider,
  getEvmProvider,
  clearProviderCache,
  toHex,
  fromHex,
  weiToEth,
  ethToWei,
  type EthTransactionRequest,
  type EthTransactionReceipt,
  type GasEstimate,
  type TokenBalance,
} from './ethereum'

// ── Types ───────────────────────────────────────────────────────────────────
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
