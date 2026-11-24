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
export type TransportCapability = 'web3' | 'pq' | 'web3+pq' | 'native'

/** Which kind of chain: EVM (the default), or Bitcoin or Solana with their own accounts and transactions. */
export type ChainFamily = 'evm' | 'bitcoin' | 'solana'

/**
 * Which signed-transaction envelope a chain's `eth_sendRawTransaction` accepts.
 *
 *   • `eip1559` — typed transactions (`0x02 || RLP([...])`), the modern default.
 *   • `legacy`  — untyped EIP-155 transactions, `RLP([nonce, gasPrice, gas, to,
 *                 value, data, v, r, s])`.
 *
 * This is NOT cosmetic. The QRDX node decodes raw transactions with a bare
 * `rlp.decode()` that expects exactly nine legacy fields, so a type-2 payload
 * fails to decode. QRDX also advertises `eth_feeHistory` with a populated
 * `baseFeePerGas` array, which makes naive 1559-sniffing pick the wrong
 * envelope. Chains therefore declare their envelope explicitly rather than
 * having it inferred.
 */
export type FeeModel = 'legacy' | 'eip1559'

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
  /**
   * QRDX-only: base URL of the node's native REST API (the FastAPI surface
   * exposing `/get_address_info`, `/get_transaction`, and friends). This is a
   * different service from the JSON-RPC endpoint and exposes UTXO-layer data
   * the `eth_*` namespace does not.
   */
  nodeApiUrl?: string
  /**
   * Which raw-transaction envelope this chain accepts. Defaults to `eip1559`
   * when omitted; read it through {@link getFeeModel} rather than directly.
   */
  feeModel?: FeeModel
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
  /** Is this an EVM-compatible chain? False for Bitcoin and Solana. */
  isEvm: boolean
  /** Omitted for EVM chains. */
  family?: ChainFamily
  /**
   * Listed but not launched: shown, not selectable. QRDX mainnet until it launches
   * (rpc.qrdx.org serves the testnet, chain 7620, meanwhile).
   */
  notLive?: boolean
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
  name: 'QRDX',
  decimals: 18,
  // No public price feed lists QRDX yet; the UI shows "price unavailable"
  // rather than a made-up figure.
}

// QRDX native tokens are not listed here. Their addresses are derived at
// deploy time (blake2b(sender:nonce:symbol), qrdx-node docs/NATIVE_TOKENS.md),
// so the wallet discovers them from the node (`exchange_getTokens`) instead of
// hard-coding addresses. Shielded assets (qETH, qBTC, qUSDC) will appear the
// same way once the bridge mints them.

// ═══════════════════════════════════════════════════════════════════════════════
//  CHAIN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const CHAINS: Record<string, ChainConfig> = {
  // ── QRDX ──────────────────────────────────────────────────────────────────

  'qrdx-mainnet': {
    id: 'qrdx-mainnet',
    name: 'QRDX Mainnet',
    shortName: 'QRDX',
    chainId: 1337,
    rpcUrl: 'https://rpc.qrdx.org',
    nodeApiUrl: 'https://node.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    nativeCurrency: { name: 'QRDX', symbol: 'QRDX', decimals: 18 },
    transport: 'web3+pq',
    feeModel: 'legacy',
    isEvm: true,
    isTestnet: false,
    // One block a slot: the chain spec's SLOT_DURATION_MS (standard 250).
    blockTimeSec: 0.25,
    color: 'from-primary to-primary/70',
    notLive: true,
    tokens: [QRDX_NATIVE],
    pqBridgeTarget: undefined,
  },

  'qrdx-testnet': {
    id: 'qrdx-testnet',
    name: 'QRDX Testnet',
    shortName: 'QRDX Test',
    // The testnet chain spec's id (test.qrdx.org/chain_spec), since the reset of 2026-10-12.
    chainId: 7620,
    rpcUrl: 'https://test.qrdx.org/rpc',
    nodeApiUrl: 'https://test.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    nativeCurrency: { name: 'QRDX', symbol: 'QRDX', decimals: 18 },
    transport: 'web3+pq',
    feeModel: 'legacy',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 0.25,
    color: 'from-primary/50 to-primary/25',
    tokens: [QRDX_NATIVE],
  },

  /**
   * A node started by `scripts/testnet.sh` in the qrdx-chain repo, which pins
   * `QRDX_CHAIN_ID=9999` and puts node N's REST API on port `3007 + N`.
   *
   * JSON-RPC is served at `/rpc` on that same port. The script also sets
   * `QRDX_RPC_PORT=8545`, but the node never binds a standalone RPC listener —
   * nothing accepts connections there — so pointing at 8545 yields a wallet
   * that silently cannot reach the chain.
   */
  'qrdx-local': {
    id: 'qrdx-local',
    name: 'QRDX Local Testnet',
    shortName: 'QRDX Local',
    chainId: 9999,
    rpcUrl: 'http://127.0.0.1:3007/rpc',
    nodeApiUrl: 'http://127.0.0.1:3007',
    explorerUrl: 'http://127.0.0.1:3000',
    nativeCurrency: { name: 'QRDX', symbol: 'QRDX', decimals: 18 },
    transport: 'web3+pq',
    feeModel: 'legacy',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 0.25,
    color: 'from-primary/50 to-primary/25',
    tokens: [QRDX_NATIVE],
  },

  // ── Ethereum ──────────────────────────────────────────────────────────────

  'ethereum': {
    id: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    chainId: 1,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    rpcFallbacks: [
      'https://1rpc.io/eth',
    ],
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 12,
    color: 'from-primary to-primary/70',
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
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    rpcFallbacks: [
      'https://1rpc.io/sepolia',
    ],
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 12,
    color: 'from-primary/50 to-primary/25',
    tokens: [ETH_NATIVE],
    pqBridgeTarget: 'qrdx-testnet',
  },

  // ── Polygon ───────────────────────────────────────────────────────────────

  'polygon': {
    id: 'polygon',
    name: 'Polygon',
    shortName: 'POL',
    chainId: 137,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    rpcFallbacks: [
      'https://1rpc.io/matic',
      'https://polygon.drpc.org',
    ],
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
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
    rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 2,
    color: 'from-primary/50 to-primary/25',
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
      'https://arbitrum-one-rpc.publicnode.com',
      'https://1rpc.io/arb',
    ],
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 0.25,
    color: 'from-primary to-primary/70',
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
    color: 'from-primary/50 to-primary/25',
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
      'https://optimism-rpc.publicnode.com',
      'https://1rpc.io/op',
    ],
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
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
    color: 'from-primary/50 to-primary/25',
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
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
    ],
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
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
    color: 'from-primary to-primary/70',
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
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://1rpc.io/avax/c',
    ],
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
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
    color: 'from-primary/50 to-primary/25',
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
      'https://bsc-rpc.publicnode.com',
      'https://1rpc.io/bnb',
    ],
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 3,
    color: 'from-primary/50 to-primary/25',
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
    color: 'from-primary/50 to-primary/25',
    tokens: [{ address: '', symbol: 'BNB', name: 'BNB', decimals: 18 }],
  },

  // ── Sonic (Fantom's successor: FTM became S) ──────────────────────────────

  'sonic': {
    id: 'sonic',
    name: 'Sonic',
    shortName: 'Sonic',
    chainId: 146,
    rpcUrl: 'https://rpc.soniclabs.com',
    rpcFallbacks: [
      'https://sonic-rpc.publicnode.com',
      'https://1rpc.io/sonic',
    ],
    explorerUrl: 'https://sonicscan.org',
    nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      { address: '', symbol: 'S', name: 'Sonic', decimals: 18, coingeckoId: 'sonic-3' },
      { address: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
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
      'https://1rpc.io/zksync2-era',
    ],
    explorerUrl: 'https://explorer.zksync.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 1,
    color: 'from-primary to-primary/70',
    tokens: [
      ETH_NATIVE,
      { address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
    pqBridgeTarget: 'qrdx-mainnet',
  },
  // ── More EVM networks ─────────────────────────────────────────────────────

  'linea': {
    id: 'linea',
    name: 'Linea',
    shortName: 'Linea',
    chainId: 59144,
    rpcUrl: 'https://rpc.linea.build',
    rpcFallbacks: [
      'https://linea-rpc.publicnode.com',
      'https://1rpc.io/linea',
    ],
    explorerUrl: 'https://lineascan.build',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      ETH_NATIVE,
      { address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
  },

  'scroll': {
    id: 'scroll',
    name: 'Scroll',
    shortName: 'Scroll',
    chainId: 534352,
    rpcUrl: 'https://rpc.scroll.io',
    rpcFallbacks: [
      'https://scroll-rpc.publicnode.com',
      'https://1rpc.io/scroll',
    ],
    explorerUrl: 'https://scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      ETH_NATIVE,
      { address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
  },

  'unichain': {
    id: 'unichain',
    name: 'Unichain',
    shortName: 'Unichain',
    chainId: 130,
    rpcUrl: 'https://mainnet.unichain.org',
    rpcFallbacks: [
      'https://unichain-rpc.publicnode.com',
    ],
    explorerUrl: 'https://uniscan.xyz',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      ETH_NATIVE,
      { address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
  },

  'mantle': {
    id: 'mantle',
    name: 'Mantle',
    shortName: 'Mantle',
    chainId: 5000,
    rpcUrl: 'https://rpc.mantle.xyz',
    rpcFallbacks: [
      'https://mantle-rpc.publicnode.com',
      'https://1rpc.io/mantle',
    ],
    explorerUrl: 'https://mantlescan.xyz',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      { address: '', symbol: 'MNT', name: 'Mantle', decimals: 18, coingeckoId: 'mantle' },
      { address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
  },

  'gnosis': {
    id: 'gnosis',
    name: 'Gnosis',
    shortName: 'Gnosis',
    chainId: 100,
    rpcUrl: 'https://rpc.gnosischain.com',
    rpcFallbacks: [
      'https://gnosis-rpc.publicnode.com',
      'https://1rpc.io/gnosis',
    ],
    explorerUrl: 'https://gnosisscan.io',
    nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      { address: '', symbol: 'XDAI', name: 'xDAI', decimals: 18, coingeckoId: 'xdai' },
    ],
  },

  'celo': {
    id: 'celo',
    name: 'Celo',
    shortName: 'Celo',
    chainId: 42220,
    rpcUrl: 'https://forno.celo.org',
    rpcFallbacks: [
      'https://celo-rpc.publicnode.com',
      'https://1rpc.io/celo',
    ],
    explorerUrl: 'https://celoscan.io',
    nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: false,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [
      { address: '', symbol: 'CELO', name: 'Celo', decimals: 18, coingeckoId: 'celo' },
      { address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    ],
  },

  // ── Bitcoin and Solana (not EVM: src/core/bitcoin.ts, src/core/solana.ts) ──

  'bitcoin': {
    id: 'bitcoin',
    name: 'Bitcoin',
    shortName: 'BTC',
    family: 'bitcoin',
    chainId: 0,
    rpcUrl: 'https://mempool.space/api',
    explorerUrl: 'https://mempool.space',
    nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
    transport: 'native',
    isEvm: false,
    isTestnet: false,
    blockTimeSec: 600,
    color: 'from-primary to-primary/70',
    tokens: [{ address: '', symbol: 'BTC', name: 'Bitcoin', decimals: 8, coingeckoId: 'bitcoin' }],
  },

  'bitcoin-testnet': {
    id: 'bitcoin-testnet',
    name: 'Bitcoin Testnet4',
    shortName: 'tBTC',
    family: 'bitcoin',
    chainId: 0,
    rpcUrl: 'https://mempool.space/testnet4/api',
    explorerUrl: 'https://mempool.space/testnet4',
    nativeCurrency: { name: 'Testnet Bitcoin', symbol: 'BTC', decimals: 8 },
    transport: 'native',
    isEvm: false,
    isTestnet: true,
    blockTimeSec: 600,
    color: 'from-primary to-primary/70',
    tokens: [{ address: '', symbol: 'BTC', name: 'Testnet Bitcoin', decimals: 8 }],
  },

  'solana': {
    id: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    family: 'solana',
    chainId: 0,
    rpcUrl: 'https://solana-rpc.publicnode.com',
    explorerUrl: 'https://explorer.solana.com',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    transport: 'native',
    isEvm: false,
    isTestnet: false,
    blockTimeSec: 0.4,
    color: 'from-primary to-primary/70',
    tokens: [
      { address: '', symbol: 'SOL', name: 'Solana', decimals: 9, coingeckoId: 'solana' },
      { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
      { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6, coingeckoId: 'tether' },
      { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6, coingeckoId: 'jupiter-exchange-solana' },
      { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5, coingeckoId: 'bonk' },
      { address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', name: 'Pyth Network', decimals: 6, coingeckoId: 'pyth-network' },
      { address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JITOSOL', name: 'Jito Staked SOL', decimals: 9, coingeckoId: 'jito-staked-sol' },
      { address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'MSOL', name: 'Marinade Staked SOL', decimals: 9, coingeckoId: 'msol' },
      { address: 'So11111111111111111111111111111111111111112', symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9, coingeckoId: 'wrapped-solana' },
    ],
  },

  'solana-devnet': {
    id: 'solana-devnet',
    name: 'Solana Devnet',
    shortName: 'SOL Dev',
    family: 'solana',
    chainId: 0,
    rpcUrl: 'https://api.devnet.solana.com',
    explorerUrl: 'https://explorer.solana.com',
    nativeCurrency: { name: 'Devnet SOL', symbol: 'SOL', decimals: 9 },
    transport: 'native',
    isEvm: false,
    isTestnet: true,
    blockTimeSec: 0.4,
    color: 'from-primary to-primary/70',
    tokens: [{ address: '', symbol: 'SOL', name: 'Devnet SOL', decimals: 9 }],
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

// ─── Networks the user added ────────────────────────────────────────────────

/** An EVM network the user added (Settings → Networks, or a site's wallet_addEthereumChain). */
export interface CustomChain {
  chainId: number
  name: string
  rpcUrl: string
  symbol: string
  decimals?: number
  explorerUrl?: string
  isTestnet?: boolean
}

const customChains = new Map<string, ChainConfig>()

export const customChainKey = (chainId: number) => `custom-${chainId}`

export function customChainConfig(c: CustomChain): ChainConfig {
  const decimals = c.decimals ?? 18
  return {
    id: customChainKey(c.chainId),
    name: c.name,
    shortName: c.name.length > 12 ? c.symbol : c.name,
    chainId: c.chainId,
    rpcUrl: c.rpcUrl,
    explorerUrl: (c.explorerUrl ?? '').replace(/\/+$/, ''),
    nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals },
    transport: 'web3',
    isEvm: true,
    isTestnet: !!c.isTestnet,
    blockTimeSec: 2,
    color: 'from-primary to-primary/70',
    tokens: [{ address: '', symbol: c.symbol, name: c.symbol, decimals }],
  }
}

/** Load the user's networks (from WalletSettings.customChains). A built-in chain id always wins. */
export function setCustomChains(list: CustomChain[] = []): void {
  customChains.clear()
  for (const c of list) {
    if (CHAIN_LIST.some(b => b.isEvm && b.chainId === c.chainId)) continue
    const cfg = customChainConfig(c)
    customChains.set(cfg.id, cfg)
  }
}

// ─── Ignoring test networks (Developer options, for product mocks) ──────────

/** Each test network's mainnet, which it stands in for while test networks are ignored. */
export const MAINNET_OF: Record<string, string> = {
  'qrdx-testnet': 'qrdx-mainnet',
  'ethereum-sepolia': 'ethereum',
  'polygon-amoy': 'polygon',
  'arbitrum-sepolia': 'arbitrum',
  'optimism-sepolia': 'optimism',
  'base-sepolia': 'base',
  'avalanche-fuji': 'avalanche',
  'bsc-testnet': 'bsc',
  'bitcoin-testnet': 'bitcoin',
  'solana-devnet': 'solana',
}
const STAND_IN = new Map(Object.entries(MAINNET_OF).map(([test, main]) => [main, test]))

let ignoreTestnets = false
/** How each stand-in looked before: restored when test networks count again. */
const ownLook = new Map<string, Pick<ChainConfig, 'name' | 'shortName' | 'color' | 'nativeCurrency' | 'tokens'>>()

/**
 * Ignore test networks, or stop: each test network with a mainnet takes that mainnet's name,
 * coin name and place in the network list, nothing is marked as a test network, and every
 * token on one counts as listed (see isListedToken). Only the look changes: a test network
 * keeps its id, node, addresses and rules (`isTestnet` included), so nothing is read, derived
 * or signed differently. The objects change in place, so every screen holding one follows.
 */
export function setIgnoreTestnets(on: boolean): void {
  if (on === ignoreTestnets) return
  ignoreTestnets = on
  for (const [testId, mainId] of Object.entries(MAINNET_OF)) {
    const test = CHAINS[testId]
    const main = CHAINS[mainId]
    if (on) {
      ownLook.set(testId, { name: test.name, shortName: test.shortName, color: test.color, nativeCurrency: test.nativeCurrency, tokens: test.tokens })
      const coin = getNativeToken(main).name
      test.name = main.name
      test.shortName = main.shortName
      test.color = main.color
      test.nativeCurrency = { ...test.nativeCurrency, name: main.nativeCurrency.name }
      test.tokens = test.tokens.map((t) => (t.address ? t : { ...t, name: coin }))
    } else {
      Object.assign(test, ownLook.get(testId))
    }
  }
}

export function ignoringTestnets(): boolean {
  return ignoreTestnets
}

/** Whether the wallet marks a network as a test network: never while test networks are ignored. */
export function looksLikeTestnet(chain: Pick<ChainConfig, 'isTestnet'>): boolean {
  return chain.isTestnet && !ignoreTestnets
}

/** A test network shown as real (test networks ignored): what gives it away, its chain id, is left out. */
export function isMaskedTestnet(chain: Pick<ChainConfig, 'isTestnet'>): boolean {
  return chain.isTestnet && ignoreTestnets
}

/** A network's own name, for diagnostics: a stand-in's, not the mainnet name it shows. */
export function trueChainName(chain: Pick<ChainConfig, 'id' | 'name'>): string {
  return ownLook.get(chain.id)?.name ?? chain.name
}

/**
 * Whether a network is offered: mainnets always, test networks when shown, and while test
 * networks are ignored, the ones standing in for a mainnet.
 */
export function isNetworkShown(chain: Pick<ChainConfig, 'id' | 'isTestnet'>, showTestnets: boolean): boolean {
  return !chain.isTestnet || showTestnets || (ignoreTestnets && chain.id in MAINNET_OF)
}

/** The test network standing in for this mainnet while test networks are ignored, if any. */
export function standInFor(chainId: string): string | undefined {
  return ignoreTestnets ? STAND_IN.get(chainId) : undefined
}

/** Every network: built in, then the user's. A stand-in takes its mainnet's place. */
export function allChains(): ChainConfig[] {
  const builtIn = ignoreTestnets
    ? CHAIN_LIST.flatMap((c) => (c.id in MAINNET_OF ? [] : STAND_IN.has(c.id) ? [CHAINS[STAND_IN.get(c.id)!]] : [c]))
    : CHAIN_LIST
  return [...builtIn, ...customChains.values()]
}

export function isCustomChain(chain: Pick<ChainConfig, 'id'>): boolean {
  return chain.id.startsWith('custom-')
}

/**
 * Check a network before adding it: a well-formed RPC address that answers with the chain id
 * the network claims. https only, except a node on this machine.
 */
export async function verifyCustomChain(c: CustomChain): Promise<void> {
  let url: URL
  try {
    url = new URL(c.rpcUrl)
  } catch {
    throw new Error('The RPC address is not a URL')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('The RPC address must start with https://')
  if (!c.name.trim() || c.name.length > 40) throw new Error('Give the network a name of up to 40 characters')
  if (!/^[A-Za-z0-9.$-]{1,11}$/.test(c.symbol)) throw new Error('The currency symbol is 1 to 11 letters or digits')
  if (!Number.isSafeInteger(c.chainId) || c.chainId <= 0) throw new Error('The chain id must be a positive whole number')
  if (c.explorerUrl && !/^https:\/\//.test(c.explorerUrl)) throw new Error('The explorer address must start with https://')
  let live: number
  try {
    const res = await fetch(c.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(10_000),
    })
    live = Number(BigInt((await res.json()).result))
  } catch {
    throw new Error('That RPC address did not answer as an EVM node')
  }
  if (live !== c.chainId) throw new Error(`That RPC serves chain ${live}, not ${c.chainId}`)
}

/** Look up a chain by its EIP-155 chainId */
export function getChainById(chainId: number): ChainConfig | undefined {
  return allChains().find(c => c.isEvm && c.chainId === chainId)
}

export function chainFamily(chain: Pick<ChainConfig, 'family'>): ChainFamily {
  return chain.family ?? 'evm'
}

/** Look up a chain by its slug id */
export function getChain(id: string): ChainConfig | undefined {
  return CHAINS[id] ?? customChains.get(id)
}

/** Whether a chain supports standard web3 sends */
export function supportsWeb3(chain: ChainConfig): boolean {
  return chain.transport === 'web3' || chain.transport === 'web3+pq'
}

/** Whether a chain supports post-quantum sends */
export function supportsPQ(chain: ChainConfig): boolean {
  return chain.transport === 'pq' || chain.transport === 'web3+pq'
}

/**
 * The raw-transaction envelope this chain accepts, defaulting to EIP-1559.
 *
 * Always sign through this rather than sniffing `eth_feeHistory` — see the
 * {@link FeeModel} docs for why inference gets QRDX wrong.
 */
export function getFeeModel(chain: ChainConfig): FeeModel {
  return chain.feeModel ?? 'eip1559'
}

/** Whether this is one of the QRDX chains (mainnet, testnet, or local). */
export function isQrdxChain(chain: ChainConfig): boolean {
  return chain.id.startsWith('qrdx-')
}

/** Every QRDX chain, in registry order. */
export const QRDX_CHAINS: ChainConfig[] = CHAIN_LIST.filter(isQrdxChain)

/**
 * A token the registry lists for this chain by address (or the chain's own coin). Only these
 * get a coin's logo, chart and price by symbol: anyone can name a token "USDC". While test
 * networks are ignored (product mocks), every token on one counts.
 */
export function isListedToken(chain: Pick<ChainConfig, 'tokens'> & { isTestnet?: boolean }, address: string): boolean {
  if (!address || (ignoreTestnets && chain.isTestnet)) return true
  const a = address.toLowerCase()
  return chain.tokens.some(t => t.address.toLowerCase() === a)
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

/** The default chain when no preference is stored: the testnet, until mainnet launches. */
export const DEFAULT_CHAIN = CHAINS['qrdx-testnet']

/** The default EVM-only chain (for standard Ethereum operations) */
export const DEFAULT_EVM_CHAIN = CHAINS['ethereum']
