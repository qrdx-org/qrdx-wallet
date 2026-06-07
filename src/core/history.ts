/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Transaction History Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Fetches transaction history using:
 *    1. Etherscan-compatible block explorer APIs (primary)
 *    2. Raw JSON-RPC as fallback for chains without an API key
 *
 *  Also stores sent transactions locally for immediate display before
 *  they appear on chain.
 */

import { type ChainConfig, CHAINS, isQrdxChain } from './chains'
import { type EthTransactionReceipt, weiToEth, fromHex } from './ethereum'
import { fetchQrdxTransactionHistory, smallestToQrdx, type QrdxTxSummary } from './qrdx-api'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TransactionHistoryItem {
  hash: string
  from: string
  to: string
  value: string       // formatted (e.g. "0.5 ETH")
  valueRaw: string    // raw wei hex
  timestamp: number   // unix seconds
  blockNumber: number
  status: 'confirmed' | 'failed' | 'pending'
  type: 'send' | 'receive' | 'contract' | 'swap'
  gasUsed?: string
  gasPrice?: string
  /** For ERC-20 transfers */
  tokenSymbol?: string
  tokenDecimals?: number
  tokenAmount?: string
  /** Block explorer URL */
  explorerUrl?: string
  /** Chain this tx belongs to */
  chainId: string
}

// ─── Block explorer API URLs (Etherscan-compatible) ─────────────────────────

const EXPLORER_APIS: Record<string, string> = {
  'ethereum': 'https://api.etherscan.io/api',
  'ethereum-sepolia': 'https://api-sepolia.etherscan.io/api',
  'polygon': 'https://api.polygonscan.com/api',
  'polygon-amoy': 'https://api-amoy.polygonscan.com/api',
  'arbitrum': 'https://api.arbiscan.io/api',
  'arbitrum-sepolia': 'https://api-sepolia.arbiscan.io/api',
  'optimism': 'https://api-optimistic.etherscan.io/api',
  'base': 'https://api.basescan.org/api',
  'base-sepolia': 'https://api-sepolia.basescan.org/api',
  'bsc': 'https://api.bscscan.com/api',
  'bsc-testnet': 'https://api-testnet.bscscan.com/api',
  'avalanche': 'https://api.snowtrace.io/api',
  'fantom': 'https://api.ftmscan.com/api',
  'zksync': 'https://block-explorer-api.mainnet.zksync.io/api',
}

// ─── Local pending transactions store ───────────────────────────────────────

const pendingTxs = new Map<string, TransactionHistoryItem>()

/**
 * Record a locally sent transaction so it appears immediately in the UI.
 */
export function recordPendingTransaction(
  chainId: string,
  hash: string,
  from: string,
  to: string,
  valueWei: string,
  nativeCurrencySymbol: string,
  nativeDecimals = 18
): void {
  const formattedValue = weiToEth(fromHex(valueWei || '0x0'), nativeDecimals)
  const chain = CHAINS[chainId]

  pendingTxs.set(hash, {
    hash,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    value: `${formattedValue} ${nativeCurrencySymbol}`,
    valueRaw: valueWei,
    timestamp: Math.floor(Date.now() / 1000),
    blockNumber: 0,
    status: 'pending',
    type: 'send',
    chainId,
    explorerUrl: chain ? `${chain.explorerUrl}/tx/${hash}` : undefined,
  })
}

/**
 * Mark a pending transaction as confirmed or failed.
 */
export function updatePendingTransaction(
  hash: string,
  receipt: EthTransactionReceipt
): void {
  const tx = pendingTxs.get(hash)
  if (tx) {
    tx.status = receipt.status === '0x1' ? 'confirmed' : 'failed'
    tx.blockNumber = Number(BigInt(receipt.blockNumber))
    tx.gasUsed = receipt.gasUsed
    tx.gasPrice = receipt.effectiveGasPrice
  }
}

/**
 * Get all pending transactions for an address on a chain.
 */
export function getPendingTransactions(
  address: string,
  chainId: string
): TransactionHistoryItem[] {
  const addr = address.toLowerCase()
  return Array.from(pendingTxs.values()).filter(
    tx => tx.chainId === chainId && tx.status === 'pending' &&
      (tx.from === addr || tx.to === addr)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Fetch Transaction History
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the transaction history for an address on a given chain.
 * Uses the Etherscan-compatible API if available, otherwise returns
 * only locally tracked pending transactions.
 *
 * @param address Wallet address
 * @param chainId Chain slug (e.g. 'ethereum', 'polygon')
 * @param page Page number (1-indexed)
 * @param pageSize Number of transactions per page
 */
export async function fetchTransactionHistory(
  address: string,
  chainId: string,
  page = 1,
  pageSize = 20
): Promise<TransactionHistoryItem[]> {
  const chain = CHAINS[chainId]
  if (!chain) return []

  const addr = address.toLowerCase()
  const apiUrl = EXPLORER_APIS[chainId]
  const results: TransactionHistoryItem[] = []

  // Always include pending transactions at the top
  if (page === 1) {
    results.push(...getPendingTransactions(address, chainId))
  }

  if (!apiUrl) {
    // No explorer API available — return only pending
    return results
  }

  try {
    // Fetch normal (ETH) transactions
    const url = `${apiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${pageSize}&sort=desc`
    const res = await fetch(url)

    if (!res.ok) {
      console.warn(`Explorer API fetch failed for ${chainId}: HTTP ${res.status}`)
      return results
    }

    const data = await res.json()

    if (data.status === '1' && Array.isArray(data.result)) {
      for (const tx of data.result) {
        const from = (tx.from || '').toLowerCase()
        const to = (tx.to || '').toLowerCase()
        const valueWei = BigInt(tx.value || '0')
        const formattedValue = weiToEth(valueWei, chain.nativeCurrency.decimals)

        // Skip if we already have this as a pending tx
        if (pendingTxs.has(tx.hash)) {
          // Update the pending tx with confirmed data
          const pending = pendingTxs.get(tx.hash)!
          pending.status = tx.txreceipt_status === '1' ? 'confirmed' : 'failed'
          pending.blockNumber = parseInt(tx.blockNumber)
          pending.timestamp = parseInt(tx.timeStamp)
          continue
        }

        let type: TransactionHistoryItem['type'] = 'contract'
        if (from === addr && to !== addr) type = 'send'
        else if (to === addr && from !== addr) type = 'receive'

        // If data is non-empty and not a simple transfer, mark as contract interaction
        if (tx.input && tx.input !== '0x' && tx.input.length > 10) {
          // Check for known function selectors
          const selector = tx.input.slice(0, 10)
          if (selector === '0xa9059cbb') type = 'send' // ERC-20 transfer
          else if (from === addr) type = 'contract'
        }

        results.push({
          hash: tx.hash,
          from,
          to,
          value: `${formattedValue} ${chain.nativeCurrency.symbol}`,
          valueRaw: '0x' + valueWei.toString(16),
          timestamp: parseInt(tx.timeStamp),
          blockNumber: parseInt(tx.blockNumber),
          status: tx.txreceipt_status === '1' ? 'confirmed'
            : tx.txreceipt_status === '0' ? 'failed'
            : 'pending',
          type,
          gasUsed: tx.gasUsed,
          gasPrice: tx.gasPrice,
          chainId,
          explorerUrl: `${chain.explorerUrl}/tx/${tx.hash}`,
        })
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch tx history for ${chainId}:`, err)
  }

  return results
}

/**
 * Fetch ERC-20 token transfer history for an address.
 */
export async function fetchTokenTransferHistory(
  address: string,
  chainId: string,
  page = 1,
  pageSize = 20
): Promise<TransactionHistoryItem[]> {
  const chain = CHAINS[chainId]
  if (!chain) return []

  const apiUrl = EXPLORER_APIS[chainId]
  if (!apiUrl) return []

  const addr = address.toLowerCase()

  try {
    const url = `${apiUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${pageSize}&sort=desc`
    const res = await fetch(url)

    if (!res.ok) return []

    const data = await res.json()
    if (data.status !== '1' || !Array.isArray(data.result)) return []

    return data.result.map((tx: any) => {
      const from = (tx.from || '').toLowerCase()
      const to = (tx.to || '').toLowerCase()
      const decimals = parseInt(tx.tokenDecimal) || 18
      const rawValue = BigInt(tx.value || '0')
      const formattedValue = weiToEth(rawValue, decimals)

      return {
        hash: tx.hash,
        from,
        to,
        value: `${formattedValue} ${tx.tokenSymbol}`,
        valueRaw: '0x' + rawValue.toString(16),
        timestamp: parseInt(tx.timeStamp),
        blockNumber: parseInt(tx.blockNumber),
        status: 'confirmed' as const,
        type: (from === addr ? 'send' : 'receive') as 'send' | 'receive',
        tokenSymbol: tx.tokenSymbol,
        tokenDecimals: decimals,
        tokenAmount: formattedValue,
        chainId,
        explorerUrl: `${chain.explorerUrl}/tx/${tx.hash}`,
      }
    })
  } catch (err) {
    console.warn(`Failed to fetch token tx history for ${chainId}:`, err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QRDX-native transaction history
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a QRDX REST API transaction summary into the common
 * TransactionHistoryItem format used across the wallet UI.
 */
function qrdxTxToHistoryItem(
  tx: QrdxTxSummary,
  address: string,
  chain: ChainConfig
): TransactionHistoryItem {
  const addr = address.toLowerCase()

  // Determine if this address sent or received
  const inputAddresses = tx.inputs.map(i => (i.address ?? '').toLowerCase())
  const outputAddresses = tx.outputs.map(o => o.address.toLowerCase())

  const isSender = inputAddresses.some(a => a === addr)
  const isReceiver = outputAddresses.some(a => a === addr)
  const type: TransactionHistoryItem['type'] = isSender ? 'send' : isReceiver ? 'receive' : 'contract'

  // Best-effort "to" address for display
  const toAddress = isSender
    ? (tx.outputs.find(o => o.address.toLowerCase() !== addr)?.address ?? tx.outputs[0]?.address ?? '')
    : address

  // Sum outputs to the receiving address
  const valueSmallest = isSender
    ? tx.outputs.filter(o => o.address.toLowerCase() !== addr).reduce((s, o) => s + o.amount, 0)
    : tx.outputs.filter(o => o.address.toLowerCase() === addr).reduce((s, o) => s + o.amount, 0)

  const formattedValue = smallestToQrdx(valueSmallest)

  return {
    hash: tx.hash,
    from: isSender ? addr : (tx.inputs[0]?.address ?? '').toLowerCase(),
    to: toAddress.toLowerCase(),
    value: `${formattedValue} QRDX`,
    valueRaw: String(valueSmallest),
    timestamp: tx.timestamp ?? 0,
    blockNumber: tx.block_height ?? 0,
    status: tx.status === 'confirmed' ? 'confirmed'
      : tx.status === 'failed' ? 'failed'
      : 'pending',
    type,
    chainId: chain.id,
    explorerUrl: `${chain.explorerUrl}/tx/${tx.hash}`,
  }
}

/**
 * Fetch QRDX-native transaction history for an address.
 * Uses the node REST API at port 3007 (not Etherscan).
 * Merges locally-tracked pending transactions with confirmed on-chain data.
 */
async function fetchQrdxHistory(
  address: string,
  chain: ChainConfig,
  page = 1,
  pageSize = 20
): Promise<TransactionHistoryItem[]> {
  if (!chain.nodeUrl) return []

  const results: TransactionHistoryItem[] = []

  // Include locally-tracked pending transactions first
  if (page === 1) {
    results.push(...getPendingTransactions(address, chain.id))
  }

  const rawTxs = await fetchQrdxTransactionHistory(chain.nodeUrl, address, page, pageSize)

  for (const tx of rawTxs) {
    // Skip if we already have it as a locally-tracked pending tx
    if (pendingTxs.has(tx.hash)) {
      const pending = pendingTxs.get(tx.hash)!
      if (tx.status && tx.status !== 'pending') {
        pending.status = tx.status
        pending.blockNumber = tx.block_height ?? 0
        pending.timestamp = tx.timestamp ?? pending.timestamp
      }
      continue
    }

    results.push(qrdxTxToHistoryItem(tx, address, chain))
  }

  results.sort((a, b) => b.timestamp - a.timestamp)
  return results
}

/**
 * Fetch combined (native + token) transaction history.
 * Routes QRDX chains to the native REST API; all other chains use Etherscan.
 */
export async function fetchAllTransactionHistory(
  address: string,
  chainId: string,
  page = 1,
  pageSize = 20
): Promise<TransactionHistoryItem[]> {
  const chain = CHAINS[chainId]
  if (!chain) return []

  // QRDX chains use the native REST API for history
  if (isQrdxChain(chain)) {
    return fetchQrdxHistory(address, chain, page, pageSize)
  }

  const [nativeTxs, tokenTxs] = await Promise.all([
    fetchTransactionHistory(address, chainId, page, pageSize),
    fetchTokenTransferHistory(address, chainId, page, pageSize),
  ])

  // Merge and sort by timestamp descending
  const all = [...nativeTxs, ...tokenTxs]

  // Deduplicate by hash (native and token transfers can share the same hash)
  const seen = new Set<string>()
  const deduped = all.filter(tx => {
    // For token transfers, use hash + tokenSymbol as key
    const key = tx.tokenSymbol ? `${tx.hash}:${tx.tokenSymbol}` : tx.hash
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  deduped.sort((a, b) => b.timestamp - a.timestamp)
  return deduped
}
