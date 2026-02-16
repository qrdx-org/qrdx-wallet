/**
 * Core barrel export — everything platform-agnostic lives here.
 * Both the extension/web UI and the mobile app import from @core/*.
 */
export {
  // Legacy class (deprecated)
  QuantumCrypto,
  // ETH / secp256k1
  generateEthKeyPair,
  ethKeyPairFromPrivateKey,
  publicKeyToEthAddress,
  toChecksumAddress,
  ecdsaSign,
  signEthMessage,
  signHash,
  recoverAddress,
  // PQ / Dilithium3
  generatePqKeyPair,
  pqKeyPairFromSeed,
  pqKeyPairFromStored,
  toPqChecksumAddress,
  pqSign,
  pqSignWithPrefix,
  pqVerify,
  isPqAvailable,
  // Encryption
  encrypt,
  decrypt,
  // Utilities
  bytesToHex,
  hexToBytes,
  // Constants
  ETH_KEY_SIZES,
  PQ_KEY_SIZES,
  // Types
  type EthKeyPair,
  type PqKeyPair,
} from './crypto'

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

// ── Transaction signing ─────────────────────────────────────────────────────
export {
  signTransaction,
  signLegacyTransaction,
  signEip1559Transaction,
  type SignedTransaction,
} from './transaction'

// ── RLP encoding ────────────────────────────────────────────────────────────
export { rlpEncode, rlpDecode, bigIntToBytes } from './rlp'

// ── Price oracle ────────────────────────────────────────────────────────────
export {
  fetchPrices,
  fetchPricesBySymbol,
  getTokenPrice,
  fetchPriceHistory,
  computePortfolioValue,
  formatUsd,
  clearPriceCache,
  symbolToCoingeckoId,
  type TokenPrice,
  type PriceHistoryPoint,
} from './prices'

// ── Transaction history ─────────────────────────────────────────────────────
export {
  fetchTransactionHistory,
  fetchTokenTransferHistory,
  fetchAllTransactionHistory,
  recordPendingTransaction,
  updatePendingTransaction,
  getPendingTransactions,
  type TransactionHistoryItem,
} from './history'

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
