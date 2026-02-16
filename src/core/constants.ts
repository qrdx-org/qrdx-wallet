/**
 * Backwards-compatible re-exports.
 * All chain/network data now lives in chains.ts — this file maps the
 * old API surface so existing code doesn't break.
 */
import type { Network } from './types'
import {
  CHAINS,
  DEFAULT_CHAIN,
  CHAIN_LIST,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
} from './chains'

// Re-export the full chain registry under the names other code expects
export {
  CHAINS,
  CHAIN_LIST,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
} from './chains'

/** Legacy NETWORKS map — keys 'mainnet' / 'testnet' pointing to QRDX chains */
export const NETWORKS: Record<string, Network> = {
  mainnet: {
    chainId: CHAINS['qrdx-mainnet'].chainId,
    name: CHAINS['qrdx-mainnet'].name,
    rpcUrl: CHAINS['qrdx-mainnet'].rpcUrl,
    explorerUrl: CHAINS['qrdx-mainnet'].explorerUrl,
    nativeCurrency: CHAINS['qrdx-mainnet'].nativeCurrency,
  },
  testnet: {
    chainId: CHAINS['qrdx-testnet'].chainId,
    name: CHAINS['qrdx-testnet'].name,
    rpcUrl: CHAINS['qrdx-testnet'].rpcUrl,
    explorerUrl: CHAINS['qrdx-testnet'].explorerUrl,
    nativeCurrency: CHAINS['qrdx-testnet'].nativeCurrency,
  },
}

export const DEFAULT_NETWORK = NETWORKS.mainnet

export const APP_CONFIG = {
  name: 'QRDX Wallet',
  version: '1.0.0',
  defaultLockTimeout: 15 * 60 * 1000, // 15 minutes
  maxWallets: 10,
}
