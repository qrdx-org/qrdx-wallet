/**
 * Core barrel export — everything platform-agnostic lives here.
 * Both the extension/web UI and the mobile app import from @core/*.
 */
export {
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

export {
  WalletManager,
  WalletError,
  DEFAULT_SETTINGS,
  MAX_ACCOUNTS,
  type SessionStore,
  type WalletManagerOptions,
  type UnlockResult,
  type PasskeyEnrollment,
  type WalletEvent,
} from './wallet-manager'
export {
  type IStorage,
  ChromeStorage,
  WebStorage,
  MemoryStorage,
  ExtensionStorage,
  MobileStorage,
  WalletStorage,
  createDefaultStorage,
  chromeSessionStore,
} from './storage'
export { encryptKeystore, decryptKeystore, KeystoreError, type KeystoreV3 } from './keystore'
export { newMnemonic, normalizeMnemonic, normalizePrivateKey, type KeyringType } from './keyring'

// ── QRDX protocol ───────────────────────────────────────────────────────────
export { toAccountId, toAccountIdBytes, sameAccount, addressForm, isProtocolHolder, type AddressForm } from './account-id'
export { signPqTransaction, pqIntrinsicGas, pqTxSigningHash, PQ_TX_TYPE, type PqTxFields, type SignedPqTx } from './pq-tx'
export {
  ExchangeOp,
  buildExchangeTx,
  signExchangeTx,
  exchangeSigningBytes,
  exchangeTxHash,
  type UnsignedExchangeTx,
  type SignedExchangeTx,
} from './exchange-tx'
export { typedDataDigest, parseTypedData, type TypedData } from './eip712'
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
  QRDX_CHAINS,
  getChain,
  getChainById,
  supportsWeb3,
  supportsPQ,
  getFeeModel,
  isQrdxChain,
  getNativeToken,
  toAddChainParam,
  type ChainConfig,
  type ChainToken,
  type TransportCapability,
  type FeeModel,
  type AddEthereumChainParameter,
} from './chains'

// ── Live chain identity (runtime chain-id reconciliation) ───────────────────
export {
  probeChainIdentity,
  resolveSigningChainId,
  getCachedChainIdentity,
  clearChainIdentityCache,
  trustChainId,
  untrustChainId,
  getTrustedChainIds,
  setTrustedChainIds,
  ChainIdentityError,
  type ChainIdentity,
} from './chain-identity'

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
  WalletAccount,
  AccountSource,
  KeyringSummary,
  PasskeySummary,
  WalletState,
  WalletSettings,
  MessageType,
  Message,
  MessageResponse,
} from './types'
