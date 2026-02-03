import type { Network } from './types'

export const NETWORKS: Record<string, Network> = {
  mainnet: {
    chainId: 1,
    name: 'QRDX Mainnet',
    rpcUrl: 'https://rpc.qrdx.org',
    explorerUrl: 'https://explorer.qrdx.org',
    nativeCurrency: {
      name: 'QRDX',
      symbol: 'QRDX',
      decimals: 18
    }
  },
  testnet: {
    chainId: 2,
    name: 'QRDX Testnet',
    rpcUrl: 'https://testnet-rpc.qrdx.org',
    explorerUrl: 'https://testnet-explorer.qrdx.org',
    nativeCurrency: {
      name: 'QRDX',
      symbol: 'QRDX',
      decimals: 18
    }
  }
}

export const DEFAULT_NETWORK = NETWORKS.mainnet

export const APP_CONFIG = {
  name: 'QRDX Wallet',
  version: '1.0.0',
  defaultLockTimeout: 15 * 60 * 1000, // 15 minutes
  maxWallets: 10,
}
