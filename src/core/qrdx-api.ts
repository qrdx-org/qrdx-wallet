/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — QRDX Node REST API Client
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Talks to the QRDX full-node REST API (default port 3007).
 *  This is separate from the web3 JSON-RPC at /rpc — it provides
 *  QRDX-native data: UTXO balance, QRC-20/721/1155 tokens, tx history, etc.
 *
 *  QRDX uses SMALLEST = 1,000,000 as its base unit (6 decimal places).
 *  All amounts returned from the API are in SMALLEST units (integers).
 *  Divide by 1_000_000 to get human-readable QRDX.
 *
 *  Address types supported by QRDX:
 *    • 0x...   (40 hex chars) — secp256k1 EVM-style
 *    • 0xPQ... (64 hex chars) — post-quantum Dilithium3
 *    • Q/R...  (base58)       — legacy P256 (read-only)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** QRDX internal unit multiplier (6 decimal places) */
export const QRDX_SMALLEST = 1_000_000

/** Convert from SMALLEST integer to human-readable QRDX string */
export function smallestToQrdx(smallest: number | string): string {
  const n = typeof smallest === 'string' ? parseFloat(smallest) : smallest
  const whole = Math.floor(n / QRDX_SMALLEST)
  const frac = n % QRDX_SMALLEST
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '') || '0'
  return `${whole}.${fracStr}`
}

/** Convert human-readable QRDX to SMALLEST integer */
export function qrdxToSmallest(qrdx: string): number {
  const [whole = '0', frac = ''] = qrdx.split('.')
  const fracPadded = frac.padEnd(6, '0').slice(0, 6)
  return parseInt(whole) * QRDX_SMALLEST + parseInt(fracPadded || '0')
}

// ─── API Response Types ──────────────────────────────────────────────────────

/** Response from /get_status */
export interface QrdxNodeStatus {
  height: number
  last_block_hash: string
  node_id: string
  peers?: number
  version?: string
}

/** A single UTXO entry */
export interface QrdxUtxo {
  tx_hash: string
  output_index: number
  amount: number          // in SMALLEST units
  address: string
  spent: boolean
}

/** Transaction summary as returned in address info */
export interface QrdxTxSummary {
  hash: string
  timestamp?: number
  block_height?: number
  block_hash?: string
  inputs: Array<{
    tx_hash: string
    output_index: number
    address?: string
    amount?: number
  }>
  outputs: Array<{
    address: string
    amount: number        // in SMALLEST units
  }>
  status?: 'confirmed' | 'pending' | 'failed'
  fee?: number
}

/** Response from /get_address_info */
export interface QrdxAddressInfo {
  address: string
  balance: number         // in SMALLEST units
  utxos?: QrdxUtxo[]
  transactions?: QrdxTxSummary[]
  transaction_count?: number
  pending_count?: number
}

/** A QRC-20 token balance entry */
export interface QrdxQrc20Balance {
  token_address: string
  symbol: string
  name: string
  decimals: number
  balance: string         // as string to preserve precision
}

/** A QRC-721 NFT entry */
export interface QrdxQrc721Token {
  token_address: string
  name: string
  symbol: string
  token_id: string
  owner: string
  uri?: string
}

/** A QRC-1155 token entry */
export interface QrdxQrc1155Token {
  token_address: string
  name: string
  symbol?: string
  token_id: string
  balance: string
}

/** Response from /get_address_tokens */
export interface QrdxAddressTokens {
  address: string
  qrc20?: QrdxQrc20Balance[]
  qrc721?: QrdxQrc721Token[]
  qrc1155?: QrdxQrc1155Token[]
}

/** Response from /get_transaction */
export interface QrdxTransaction {
  hash: string
  version: number
  inputs: Array<{
    tx_hash: string
    output_index: number
    address?: string
    amount?: number
  }>
  outputs: Array<{
    address: string
    amount: number
  }>
  timestamp?: number
  block_height?: number
  block_hash?: string
  status?: 'confirmed' | 'pending' | 'failed'
  fee?: number
  size?: number
}

/** Push/submit transaction response */
export interface QrdxPushTxResponse {
  success: boolean
  hash?: string
  message?: string
  error?: string
}

/** Token info from /get_token_info */
export interface QrdxTokenInfo {
  address: string
  name: string
  symbol: string
  decimals?: number
  total_supply?: string
  token_type: 'QRC-20' | 'QRC-721' | 'QRC-1155'
  owner?: string
}

// ─── API Client ──────────────────────────────────────────────────────────────

/**
 * Low-level client for the QRDX node REST API.
 * All methods accept a `nodeUrl` (e.g. 'http://node.qrdx.org:3007')
 * so the same functions work for both mainnet and testnet nodes.
 */
export class QrdxApiClient {
  private nodeUrl: string

  constructor(nodeUrl: string) {
    this.nodeUrl = nodeUrl.replace(/\/$/, '')
  }

  private async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const url = new URL(this.nodeUrl + path)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v))
      }
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`QRDX API ${path} failed: HTTP ${res.status}`)
    }

    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.nodeUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`QRDX API ${path} failed: HTTP ${res.status}`)
    }

    return res.json() as Promise<T>
  }

  /** Get node status (height, last block hash, node ID) */
  async getStatus(): Promise<QrdxNodeStatus> {
    return this.get<QrdxNodeStatus>('/get_status')
  }

  /**
   * Get address balance, UTXOs, and recent transaction summaries.
   * Balance is in SMALLEST units (divide by 1_000_000 for QRDX).
   */
  async getAddressInfo(
    address: string,
    options?: {
      transactionsLimit?: number
      page?: number
      showPending?: boolean
    }
  ): Promise<QrdxAddressInfo> {
    return this.get<QrdxAddressInfo>('/get_address_info', {
      address,
      transactions_count_limit: options?.transactionsLimit ?? 20,
      page: options?.page ?? 1,
      show_pending: options?.showPending ?? true,
    })
  }

  /**
   * Get QRC-20, QRC-721, and QRC-1155 token balances for an address.
   * Optionally filter by token_type.
   */
  async getAddressTokens(
    address: string,
    tokenType?: 'QRC-20' | 'QRC-721' | 'QRC-1155'
  ): Promise<QrdxAddressTokens> {
    const params: Record<string, string> = { address }
    if (tokenType) params.token_type = tokenType
    return this.get<QrdxAddressTokens>('/get_address_tokens', params)
  }

  /** Get a single transaction by hash */
  async getTransaction(txHash: string): Promise<QrdxTransaction> {
    return this.get<QrdxTransaction>('/get_transaction', { tx_hash: txHash })
  }

  /** Get transactions in the mempool */
  async getPendingTransactions(): Promise<QrdxTransaction[]> {
    return this.get<QrdxTransaction[]>('/get_pending_transactions')
  }

  /**
   * Submit a signed transaction hex to the network.
   * For web3-style transactions, use the JSON-RPC /rpc endpoint instead.
   * This is for native QRDX UTXO transactions.
   */
  async pushTransaction(txHex: string): Promise<QrdxPushTxResponse> {
    return this.post<QrdxPushTxResponse>('/push_tx', { tx_hex: txHex })
  }

  /** Alternative transaction submission endpoint */
  async submitTransaction(txHex: string): Promise<QrdxPushTxResponse> {
    return this.post<QrdxPushTxResponse>('/submit_tx', { tx_hex: txHex })
  }

  /** Get token metadata */
  async getTokenInfo(tokenAddress: string): Promise<QrdxTokenInfo> {
    return this.get<QrdxTokenInfo>('/get_token_info', { token_address: tokenAddress })
  }

  /** Get a block by height or hash */
  async getBlock(block: number | string, fullTransactions = false): Promise<unknown> {
    return this.get('/get_block', { block: String(block), full_transactions: fullTransactions })
  }

  /** Get a range of blocks */
  async getBlocks(offset = 0, limit = 10): Promise<unknown> {
    return this.get('/get_blocks', { offset, limit })
  }
}

// ─── Node client cache ───────────────────────────────────────────────────────

const clientCache = new Map<string, QrdxApiClient>()

/** Get (or create) a cached QrdxApiClient for the given node URL */
export function getQrdxApiClient(nodeUrl: string): QrdxApiClient {
  let client = clientCache.get(nodeUrl)
  if (!client) {
    client = new QrdxApiClient(nodeUrl)
    clientCache.set(nodeUrl, client)
  }
  return client
}

// ─── Balance helpers ─────────────────────────────────────────────────────────

/**
 * Fetch the QRDX native balance for an address (both secp256k1 and PQ).
 * Returns the balance formatted as a decimal string (e.g. "1.234500").
 * Returns "0.000000" if the address has no balance or the node is unreachable.
 */
export async function fetchQrdxNativeBalance(
  nodeUrl: string,
  address: string
): Promise<{ raw: number; formatted: string }> {
  try {
    const client = getQrdxApiClient(nodeUrl)
    const info = await client.getAddressInfo(address, { transactionsLimit: 0 })
    const raw = info.balance ?? 0
    return { raw, formatted: smallestToQrdx(raw) }
  } catch {
    return { raw: 0, formatted: '0.000000' }
  }
}

/**
 * Fetch QRC-20 token balances for an address.
 */
export async function fetchQrdxTokenBalances(
  nodeUrl: string,
  address: string
): Promise<QrdxQrc20Balance[]> {
  try {
    const client = getQrdxApiClient(nodeUrl)
    const tokens = await client.getAddressTokens(address, 'QRC-20')
    return tokens.qrc20 ?? []
  } catch {
    return []
  }
}

/**
 * Fetch transaction history for an address from the QRDX node.
 * Returns transactions sorted newest-first.
 */
export async function fetchQrdxTransactionHistory(
  nodeUrl: string,
  address: string,
  page = 1,
  limit = 20
): Promise<QrdxTxSummary[]> {
  try {
    const client = getQrdxApiClient(nodeUrl)
    const info = await client.getAddressInfo(address, {
      transactionsLimit: limit,
      page,
      showPending: true,
    })
    return info.transactions ?? []
  } catch {
    return []
  }
}
