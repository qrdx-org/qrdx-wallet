/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Unified Chain & Network Registry
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Single source of truth for every chain the wallet supports.
 *  Each chain declares:
 *    • Standard EVM/RPC connectivity (chainId, rpc, explorer, etc.)
 *    • Whether it supports Post-Quantum (PQ) transactions
 *    • Whether it supports standard Web3/EIP-1193 sends
 *    • Native currency + decimals
 *    • Known ERC-20 / bridged tokens
 *
 *  Import this file everywhere instead of hard-coding networks.
 */

// ─── Transport capabilities ────────────────────────────────────────────────

/** How a chain can submit transactions */
export type TransportCapability = 'web3' | 'pq' | 'web3+pq'

/** EIP-3085-style add-chain parameters for MetaMask / wallet_addEthereumChain */
export interface AddEthereumChainParameter {
  chainId: string          // hex
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls?: string[]
  iconUrls?: string[]
}

// ─── Token definition ───────────────────────────────────────────────────────

export interface ChainToken {
  /** ERC-20 contract address (checksummed) — empty string for native */
  address: string
  symbol: string
  name: string
  decimals: number
  /** CoinGecko id for price feeds */
  coingeckoId?: string
  /** URL or local path */
  logoURI?: string
  /** Is this a wrapped / bridged PQ-equivalent? e.g. qETH on QRDX chain */
  pqBridged?: boolean
}

// ─── Chain definition ───────────────────────────────────────────────────────

export interface ChainConfig {
  /** Unique slug used as key everywhere: 'ethereum', 'qrdx-mainnet', etc. */
  id: string
  /** Human-readable name */
  name: string
  /** Short display name for tight UIs */
  shortName: string
  /** EIP-155 chain ID (decimal) */
  chainId: number
  /** Primary JSON-RPC endpoint */
  rpcUrl: string
  /** Fallback RPC endpoints (tried in order when primary is down) */
  rpcFallbacks?: string[]
  /** Block explorer base URL */
  explorerUrl: string
  /** Native currency */
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  /** What transaction signing / submission paths are supported */
  transport: TransportCapability
  /** Is this an EVM-compatible chain? (all current chains are, but future ones may not be) */
  isEvm: boolean
  /** Testnet flag — testnets hidden by default */
  isTestnet: boolean
  /** Average block time in seconds (used for UI estimates) */
  blockTimeSec: number
  /** Icon gradient for UI badges */
  color: string
  /** Well-known tokens on this chain (native + major ERC-20s) */
  tokens: ChainToken[]
  /** Can be paired with a QRDX PQ testnet/mainnet for shielding */
  pqBridgeTarget?: string
}

// ─── Token lists (shared across chains) ─────────────────────────────────────

const ETH_NATIVE: ChainToken = {
  address: '',
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  coingeckoId: 'ethereum',
}

const USDC_ETHEREUM: ChainToken = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  coingeckoId: 'usd-coin',
}

const USDT_ETHEREUM: ChainToken = {
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  coingeckoId: 'tether',
}

const DAI_ETHEREUM: ChainToken = {
  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  symbol: 'DAI',
  name: 'Dai Stablecoin',
  decimals: 18,
  coingeckoId: 'dai',
}

const WETH_ETHEREUM: ChainToken = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  name: 'Wrapped Ether',
  decimals: 18,
  coingeckoId: 'weth',
}

const LINK_ETHEREUM: ChainToken = {
  address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  symbol: 'LINK',
  name: 'Chainlink',
  decimals: 18,
  coingeckoId: 'chainlink',
}

const UNI_ETHEREUM: ChainToken = {
  address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  symbol: 'UNI',
  name: 'Uniswap',
  decimals: 18,
  coingeckoId: 'uniswap',
}

const WBTC_ETHEREUM: ChainToken = {
  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  symbol: 'WBTC',
  name: 'Wrapped BTC',
  decimals: 8,
  coingeckoId: 'wrapped-bitcoin',
}

const AAVE_ETHEREUM: ChainToken = {
  address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  symbol: 'AAVE',
  name: 'Aave',
  decimals: 18,
  coingeckoId: 'aave',
}

// ─── QRDX native token ─────────────────────────────────────────────────────

const QRDX_NATIVE: ChainToken = {
  address: '',
  symbol: 'QRDX',
  name: 'QRDX Ledger',
  decimals: 18,
  coingeckoId: 'qrdx',
}

// ─── Bridged PQ tokens on QRDX chain ───────────────────────────────────────

const qETH: ChainToken = {
  address: '0x0000000000000000000000000000000000000101',
  symbol: 'qETH',
  name: 'Quantum-Shielded Ether',
  decimals: 18,
  pqBridged: true,
}

const qBTC: ChainToken = {
  address: '0x0000000000000000000000000000000000000102',
  symbol: 'qBTC',
  name: 'Quantum-Shielded Bitcoin',
  decimals: 8,
  pqBridged: true,
}

const qUSDC: ChainToken = {
  address: '0x0000000000000000000000000000000000000103',
  symbol: 'qUSDC',
  name: 'Quantum-Shielded USDC',
  decimals: 6,
  pqBridged: true,
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CHAIN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const CHAINS: Record<string, ChainConfig> = {
  // ── QRDX ──────────────────────────────────────────────────────────────────

  'qrdx-mainnet': {
    id: 'qrdx-mainnet',
    name: 'QRDX Mainnet',
    shortName: 'QRDX',
    chainId: 7225,
    rpcUrl: 'https://rpc.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    nativeCurrency: { name: 'QRDX', symbol: 'QRDX', decimals: 18 },
    transport: 'web3+pq',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-purple-500 to-violet-600',
    tokens: [QRDX_NATIVE, qETH, qBTC, qUSDC],
    pqBridgeTarget: undefined,
  },

  'qrdx-testnet': {
    id: 'qrdx-testnet',
    name: 'QRDX Testnet',
    shortName: 'QRDX Test',
    chainId: 7226,
    rpcUrl: 'https://testnet-rpc.qrdx.org',
    explorerUrl: 'https://testnet.explorer.qrdx.org',
    nativeCurrency: { name: 'QRDX', symbol: 'QRDX', decimals: 18 },
    transport: 'web3+pq',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-purple-400 to-violet-500',
    tokens: [QRDX_NATIVE, qETH, qUSDC],
  },

  // ── Ethereum ──────────────────────────────────────────────────────────────

  'ethereum': {
    id: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    rpcFallbacks: [
      'https://rpc.ankr.com/eth',
      'https://ethereum-rpc.publicnode.com',
      'https://1rpc.io/eth',
    ],
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 12,
    color: 'from-blue-500 to-blue-600',
    tokens: [
      ETH_NATIVE,
      USDC_ETHEREUM,
      USDT_ETHEREUM,
      DAI_ETHEREUM,
      WETH_ETHEREUM,
      WBTC_ETHEREUM,
      LINK_ETHEREUM,
      UNI_ETHEREUM,
      AAVE_ETHEREUM,
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'ethereum-sepolia': {
    id: 'ethereum-sepolia',
    name: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://rpc.sepolia.org',
    rpcFallbacks: [
      'https://rpc.ankr.com/eth_sepolia',
      'https://ethereum-sepolia-rpc.publicnode.com',
    ],
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 12,
    color: 'from-blue-400 to-blue-500',
    tokens: [ETH_NATIVE],
    pqBridgeTarget: 'qrdx-testnet',
  },

  // ── Polygon ───────────────────────────────────────────────────────────────

  'polygon': {
    id: 'polygon',
    name: 'Polygon',
    shortName: 'POL',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    rpcFallbacks: [
      'https://rpc.ankr.com/polygon',
      'https://polygon-bor-rpc.publicnode.com',
    ],
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-purple-500 to-indigo-600',
    tokens: [
      { address: '', symbol: 'POL', name: 'POL', decimals: 18, coingeckoId: 'matic-network' },
      { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
      { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'polygon-amoy': {
    id: 'polygon-amoy',
    name: 'Polygon Amoy',
    shortName: 'Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-purple-400 to-indigo-500',
    tokens: [{ address: '', symbol: 'POL', name: 'POL', decimals: 18 }],
  },

  // ── Arbitrum ──────────────────────────────────────────────────────────────

  'arbitrum': {
    id: 'arbitrum',
    name: 'Arbitrum One',
    shortName: 'ARB',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    rpcFallbacks: [
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum-one-rpc.publicnode.com',
    ],
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 0.25,
    color: 'from-blue-500 to-sky-600',
    tokens: [
      ETH_NATIVE,
      { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
      { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', name: 'Arbitrum', decimals: 18, coingeckoId: 'arbitrum' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'arbitrum-sepolia': {
    id: 'arbitrum-sepolia',
    name: 'Arbitrum Sepolia',
    shortName: 'ARB Sep',
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 0.25,
    color: 'from-blue-400 to-sky-500',
    tokens: [ETH_NATIVE],
  },

  // ── Optimism ──────────────────────────────────────────────────────────────

  'optimism': {
    id: 'optimism',
    name: 'Optimism',
    shortName: 'OP',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    rpcFallbacks: [
      'https://rpc.ankr.com/optimism',
      'https://optimism-rpc.publicnode.com',
    ],
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-red-500 to-rose-600',
    tokens: [
      ETH_NATIVE,
      { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
      { address: '0x4200000000000000000000000000000000000042', symbol: 'OP', name: 'Optimism', decimals: 18, coingeckoId: 'optimism' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'optimism-sepolia': {
    id: 'optimism-sepolia',
    name: 'OP Sepolia',
    shortName: 'OP Sep',
    chainId: 11155420,
    rpcUrl: 'https://sepolia.optimism.io',
    explorerUrl: 'https://sepolia-optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-red-400 to-rose-500',
    tokens: [ETH_NATIVE],
  },

  // ── Base ──────────────────────────────────────────────────────────────────

  'base': {
    id: 'base',
    name: 'Base',
    shortName: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    rpcFallbacks: [
      'https://rpc.ankr.com/base',
      'https://base-rpc.publicnode.com',
    ],
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-blue-600 to-blue-700',
    tokens: [
      ETH_NATIVE,
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'base-sepolia': {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    shortName: 'Base Sep',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-blue-500 to-blue-600',
    tokens: [ETH_NATIVE],
  },

  // ── Avalanche ─────────────────────────────────────────────────────────────

  'avalanche': {
    id: 'avalanche',
    name: 'Avalanche C-Chain',
    shortName: 'AVAX',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    rpcFallbacks: [
      'https://rpc.ankr.com/avalanche',
      'https://avalanche-c-chain-rpc.publicnode.com',
    ],
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-red-500 to-red-600',
    tokens: [
      { address: '', symbol: 'AVAX', name: 'Avalanche', decimals: 18, coingeckoId: 'avalanche-2' },
      { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'avalanche-fuji': {
    id: 'avalanche-fuji',
    name: 'Avalanche Fuji',
    shortName: 'Fuji',
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-red-400 to-red-500',
    tokens: [{ address: '', symbol: 'AVAX', name: 'Avalanche', decimals: 18 }],
  },

  // ── BNB Smart Chain ───────────────────────────────────────────────────────

  'bsc': {
    id: 'bsc',
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    rpcFallbacks: [
      'https://bsc-dataseed1.defibit.io',
      'https://rpc.ankr.com/bsc',
      'https://bsc-rpc.publicnode.com',
    ],
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 3,
    color: 'from-yellow-400 to-yellow-500',
    tokens: [
      { address: '', symbol: 'BNB', name: 'BNB', decimals: 18, coingeckoId: 'binancecoin' },
      { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, coingeckoId: 'usd-coin' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },

  'bsc-testnet': {
    id: 'bsc-testnet',
    name: 'BNB Testnet',
    shortName: 'BSC Test',
    chainId: 97,
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 3,
    color: 'from-yellow-300 to-yellow-400',
    tokens: [{ address: '', symbol: 'BNB', name: 'BNB', decimals: 18 }],
  },

  // ── Fantom ────────────────────────────────────────────────────────────────

  'fantom': {
    id: 'fantom',
    name: 'Fantom Opera',
    shortName: 'FTM',
    chainId: 250,
    rpcUrl: 'https://rpc.ftm.tools',
    rpcFallbacks: [
      'https://rpc.ankr.com/fantom',
      'https://fantom-rpc.publicnode.com',
    ],
    explorerUrl: 'https://ftmscan.com',
    nativeCurrency: { name: 'Fantom', symbol: 'FTM', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 1,
    color: 'from-blue-500 to-cyan-500',
    tokens: [
      { address: '', symbol: 'FTM', name: 'Fantom', decimals: 18, coingeckoId: 'fantom' },
    ],
  },

  // ── zkSync Era ────────────────────────────────────────────────────────────

  'zksync': {
    id: 'zksync',
    name: 'zkSync Era',
    shortName: 'zkSync',
    chainId: 324,
    rpcUrl: 'https://mainnet.era.zksync.io',
    rpcFallbacks: [
      'https://rpc.ankr.com/zksync_era',
    ],
    explorerUrl: 'https://explorer.zksync.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 1,
    color: 'from-indigo-500 to-purple-600',
    tokens: [
      ETH_NATIVE,
      { address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Derived helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Ordered list of all chains */
export const CHAIN_LIST: ChainConfig[] = Object.values(CHAINS)

/** Only mainnets */
export const MAINNET_CHAINS: ChainConfig[] = CHAIN_LIST.filter(c => !c.isTestnet)

/** Only testnets */
export const TESTNET_CHAINS: ChainConfig[] = CHAIN_LIST.filter(c => c.isTestnet)

/** Chains that support post-quantum transactions */
export const PQ_CHAINS: ChainConfig[] = CHAIN_LIST.filter(
  c => c.transport === 'pq' || c.transport === 'web3+pq'
)

/** Chains that support standard web3 (EIP-1193) transactions */
export const WEB3_CHAINS: ChainConfig[] = CHAIN_LIST.filter(
  c => c.transport === 'web3' || c.transport === 'web3+pq'
)

/** Chains that can bridge/shield to QRDX */
export const BRIDGEABLE_CHAINS: ChainConfig[] = CHAIN_LIST.filter(
  c => c.pqBridgeTarget != null
)

/** Look up a chain by its EIP-155 chainId */
export function getChainById(chainId: number): ChainConfig | undefined {
  return CHAIN_LIST.find(c => c.chainId === chainId)
}

/** Look up a chain by its slug id */
export function getChain(id: string): ChainConfig | undefined {
  return CHAINS[id]
}

/** Whether a chain supports standard web3 sends */
export function supportsWeb3(chain: ChainConfig): boolean {
  return chain.transport === 'web3' || chain.transport === 'web3+pq'
}

/** Whether a chain supports post-quantum sends */
export function supportsPQ(chain: ChainConfig): boolean {
  return chain.transport === 'pq' || chain.transport === 'web3+pq'
}

/** Get the native token for a chain */
export function getNativeToken(chain: ChainConfig): ChainToken {
  return chain.tokens[0] // native is always first
}

/**
 * Build an EIP-3085 parameter object for wallet_addEthereumChain
 */
export function toAddChainParam(chain: ChainConfig): AddEthereumChainParameter {
  return {
    chainId: '0x' + chain.chainId.toString(16),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [chain.rpcUrl, ...(chain.rpcFallbacks ?? [])],
    blockExplorerUrls: [chain.explorerUrl],
  }
}

// ─── Default chains ─────────────────────────────────────────────────────────

/** The default chain when no preference is stored */
export const DEFAULT_CHAIN = CHAINS['qrdx-mainnet']

/** The default EVM-only chain (for standard Ethereum operations) */
export const DEFAULT_EVM_CHAIN = CHAINS['ethereum']
