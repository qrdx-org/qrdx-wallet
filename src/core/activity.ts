/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Activity log (what this wallet sent, and what came in)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  QRDX nodes index every transaction by the accounts it touched
 *  (`/get_address_history`, qrdx-node qrdx/tx_index.py): transfers in and out,
 *  EVM calls, token transfers and every exchange operation, from any device.
 *  That index is the history. The wallet also keeps its own durable record of
 *  every transaction it submits — classic, post-quantum (0x51), exchange
 *  operations, and dApp transactions approved in the extension — so what was
 *  just sent shows (as pending) before a block includes it, and so history
 *  still works against a node without the index (incoming token transfers are
 *  then read from `Transfer` logs).
 */

import type { IStorage } from './storage'
import { getChain, type ChainConfig } from './chains'
import { getEvmProvider, weiToEth } from './ethereum'
import type { TransactionHistoryItem } from './history'
import { formatUnitsExact } from './balances'

export interface ActivityRecord {
  hash: string
  chain: string
  kind: 'send' | 'contract' | 'swap' | 'stake' | 'exchange'
  /** Which ledger mechanism to poll for the outcome. */
  track: 'evm' | 'exchange'
  credential: 'classic' | 'pq'
  from: string
  to: string
  /** Formatted amount, e.g. "1.5 QRDX". */
  value: string
  status: 'pending' | 'confirmed' | 'failed'
  createdAt: number
  blockNumber?: number
  error?: string
  label?: string
  origin?: string
}

const KEY = 'qrdx_activity'
const MAX = 500
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export class ActivityLog {
  constructor(private readonly storage: IStorage) {}

  private async all(): Promise<ActivityRecord[]> {
    return (await this.storage.get<ActivityRecord[]>(KEY)) ?? []
  }

  async add(
    record: Omit<ActivityRecord, 'status' | 'createdAt'> &
      Partial<Pick<ActivityRecord, 'status' | 'createdAt'>>
  ): Promise<void> {
    const list = (await this.all()).filter((r) => r.hash !== record.hash)
    list.unshift({ status: 'pending', createdAt: Date.now(), ...record })
    await this.storage.set(KEY, list.slice(0, MAX))
  }

  async list(chain: string, addresses: string[]): Promise<ActivityRecord[]> {
    const mine = new Set(addresses.map((a) => a.toLowerCase()))
    return (await this.all()).filter(
      (r) => r.chain === chain && (mine.has(r.from.toLowerCase()) || mine.has(r.to.toLowerCase()))
    )
  }

  /** Resolve pending records from their receipts. Returns true if anything changed. */
  async refreshPending(chain: ChainConfig): Promise<boolean> {
    const list = await this.all()
    const pending = list.filter((r) => r.chain === chain.id && r.status === 'pending')
    if (!pending.length) return false
    const provider = getEvmProvider(chain.id)
    let changed = false
    const settle = (r: ActivityRecord, patch: Partial<ActivityRecord>) => {
      Object.assign(r, patch)
      changed = true
    }
    await Promise.all(
      pending.map(async (r) => {
        try {
          if (r.track === 'exchange') {
            const rc = await provider.rpc<{
              success: boolean
              error: string
              block_height: number
            } | null>('exchange_getTransactionReceipt', [r.hash])
            if (rc) {
              settle(r, {
                status: rc.success ? 'confirmed' : 'failed',
                error: rc.error || undefined,
                blockNumber: rc.block_height,
              })
            }
          } else {
            const rc = await provider.getTransactionReceipt(r.hash)
            if (rc) {
              settle(r, {
                status: rc.status === '0x1' ? 'confirmed' : 'failed',
                blockNumber: Number(BigInt(rc.blockNumber)),
              })
            }
          }
        } catch {
          /* try again next refresh */
        }
        // Give up waiting after a day; the node has evidently dropped it.
        if (r.status === 'pending' && Date.now() - r.createdAt > 86_400_000) {
          settle(r, { status: 'failed', error: 'Never included' })
        }
      })
    )
    if (changed) await this.storage.set(KEY, list)
    return changed
  }
}

function toItem(r: ActivityRecord, mine: Set<string>): TransactionHistoryItem {
  const chain = getChain(r.chain)
  return {
    hash: r.hash,
    from: r.from,
    to: r.to,
    value: r.value,
    valueRaw: '0x0',
    timestamp: Math.floor(r.createdAt / 1000),
    blockNumber: r.blockNumber ?? 0,
    status: r.status,
    type:
      r.kind === 'swap' || r.kind === 'exchange' || r.kind === 'stake'
        ? 'swap'
        : r.kind === 'contract'
          ? 'contract'
          : mine.has(r.from.toLowerCase())
            ? 'send'
            : 'receive',
    explorerUrl: chain && r.track === 'evm' ? `${chain.explorerUrl}/tx/${r.hash}` : undefined,
    chainId: r.chain,
  }
}

/**
 * QRDX history: the local activity log plus incoming token transfers from
 * `Transfer` logs over a recent block window.
 */
export async function fetchQrdxHistory(
  log: ActivityLog,
  chain: ChainConfig,
  accounts: { ethAddress: string; pqAddress: string; pqAccountId: string }[],
  tokens: { address: string; symbol: string; decimals: number }[],
  lookbackBlocks = 5_000
): Promise<TransactionHistoryItem[]> {
  await log.refreshPending(chain).catch(() => false)
  const addrs = accounts.flatMap((a) => [a.ethAddress, a.pqAddress, a.pqAccountId])
  const mine = new Set(addrs.map((a) => a.toLowerCase()))
  const items = (await log.list(chain.id, addrs)).map((r) => toItem(r, mine))
  const known = new Set(items.map((i) => i.hash.toLowerCase()))

  if (tokens.length) {
    try {
      const provider = getEvmProvider(chain.id)
      const head = await provider.getBlockNumber()
      const fromBlock = head > BigInt(lookbackBlocks) ? head - BigInt(lookbackBlocks) : 0n
      const toTopics = accounts
        .flatMap((a) => [a.ethAddress, a.pqAccountId])
        .map((a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0'))
      const logs = await provider.rpc<
        {
          address: string
          topics: string[]
          data: string
          transactionHash: string
          blockNumber: string
        }[]
      >('eth_getLogs', [
        {
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: 'latest',
          address: tokens.map((t) => t.address),
          topics: [TRANSFER_TOPIC, null, toTopics],
        },
      ])
      for (const l of logs) {
        if (known.has(l.transactionHash.toLowerCase())) continue
        const token = tokens.find((t) => t.address.toLowerCase() === l.address.toLowerCase())
        if (!token) continue
        items.push({
          hash: l.transactionHash,
          from: '0x' + l.topics[1].slice(26),
          to: '0x' + l.topics[2].slice(26),
          value: `${weiToEth(BigInt(l.data), token.decimals)} ${token.symbol}`,
          valueRaw: l.data,
          timestamp: 0,
          blockNumber: Number(BigInt(l.blockNumber)),
          status: 'confirmed',
          type: 'receive',
          tokenSymbol: token.symbol,
          tokenDecimals: token.decimals,
          explorerUrl: `${chain.explorerUrl}/tx/${l.transactionHash}`,
          chainId: chain.id,
        })
      }
    } catch {
      /* logs are best-effort */
    }
  }

  // Pending first, then newest block first.
  const rank = (i: TransactionHistoryItem) =>
    i.status === 'pending' ? Number.MAX_SAFE_INTEGER : i.blockNumber
  return items.sort((a, b) => rank(b) - rank(a) || b.timestamp - a.timestamp)
}

// ─── The node's transaction index ───────────────────────────────────────────

/** One row of `/get_address_history` (qrdx-node qrdx/tx_index.py). */
export interface IndexedTx {
  block_height: number
  tx_hash: string
  timestamp: number | null
  kind: 'genesis' | 'transfer' | 'coinbase' | 'exchange' | 'evm'
  op: string | null
  sender: string | null
  target: string | null
  asset: string | null
  amount: string | null
  status: 'success' | 'failed' | null
  fee: string | null
  error: string | null
  detail: {
    gas_used?: number | null
    gas_price?: string | null
    token_transfers?: { token: string; from: string; to: string; value?: string; token_id?: string }[]
    params?: Record<string, unknown>
    amount_out?: string
  } | null
  roles?: string[]
}

const OP_LABELS: Record<string, string> = {
  SWAP: 'Swap',
  PLACE_ORDER: 'Place order',
  CANCEL_ORDER: 'Cancel order',
  ADD_LIQUIDITY: 'Add liquidity',
  REMOVE_LIQUIDITY: 'Remove liquidity',
  CREATE_POOL: 'Create pool',
  TOKEN_DEPLOY: 'Create token',
  TOKEN_MINT: 'Mint',
  TOKEN_BURN: 'Burn',
  TOKEN_APPROVE: 'Approve',
  STAKE_DELEGATE: 'Delegate stake',
  STAKE_UNDELEGATE: 'Undelegate',
  STAKE_DEPOSIT: 'Stake',
  STAKE_EXIT: 'Unstake',
  PERP_DEPOSIT: 'Perps deposit',
  PERP_WITHDRAW: 'Perps withdrawal',
  PERP_ORDER: 'Perps order',
  PERP_CANCEL: 'Cancel perps order',
  NFT_MINT: 'Mint NFT',
  GOV_VOTE: 'Vote',
  GOV_VETO: 'Veto',
  BRIDGE_WITHDRAW: 'Bridge withdrawal',
  CREATE: 'Deploy contract',
  CALL: 'Contract call',
  COINBASE: 'Block reward',
}

/** The account's history from the node's index, newest first; null when the node has no index. */
export async function fetchIndexedHistory(
  chain: ChainConfig,
  addresses: string[],
  tokens: { address: string; symbol: string; decimals: number }[],
  limit = 100
): Promise<TransactionHistoryItem[] | null> {
  if (!chain.nodeApiUrl) return null
  const pages = await Promise.all(
    [...new Set(addresses.filter(Boolean))].map(async (address) => {
      const res = await fetch(`${chain.nodeApiUrl}/get_address_history?address=${encodeURIComponent(address)}&limit=${limit}`)
      if (!res.ok) throw new Error(`history ${res.status}`)
      const body = (await res.json()) as { ok?: boolean; result?: { transactions?: IndexedTx[] } }
      if (!body.ok || !body.result?.transactions) throw new Error('no index')
      return body.result.transactions
    })
  ).catch(() => null)
  if (!pages) return null
  const seen = new Map<string, IndexedTx>()
  for (const row of pages.flat()) {
    const prev = seen.get(row.tx_hash)
    // The same transaction under both addresses: keep every role it had.
    seen.set(row.tx_hash, prev ? { ...prev, roles: [...new Set([...(prev.roles ?? []), ...(row.roles ?? [])])] } : row)
  }
  const bySymbol = new Map(tokens.map((t) => [t.address.toLowerCase(), t]))
  return [...seen.values()].map((row) => indexedToItem(chain, row, bySymbol)).sort((a, b) => b.blockNumber - a.blockNumber)
}

export function indexedToItem(
  chain: ChainConfig,
  row: IndexedTx,
  tokens: Map<string, { symbol: string; decimals: number }>
): TransactionHistoryItem {
  const roles = new Set(row.roles ?? [])
  const native = chain.nativeCurrency.symbol
  const op = row.op ?? row.kind.toUpperCase()
  const outgoing = roles.has('sender')
  const transfer = row.detail?.token_transfers?.[0]
  const assetKey = (transfer?.token ?? row.asset ?? '').toLowerCase()
  const token = tokens.get(assetKey)
  const symbol = !row.asset || row.asset.toUpperCase() === 'QRDX' ? native : (token?.symbol ?? shortAsset(row.asset))
  let amount = row.amount
  if (!amount && transfer?.value && token) amount = formatUnitsExact(BigInt(transfer.value), token.decimals)
  const isTransfer = ['TRANSFER', 'TOKEN_TRANSFER', 'NFT_TRANSFER', 'TOKEN_TRANSFER_FROM'].includes(op)
  const type: TransactionHistoryItem['type'] =
    op === 'SWAP' ? 'swap' : isTransfer || row.kind === 'transfer' || row.kind === 'coinbase' ? (outgoing ? 'send' : 'receive') : outgoing ? 'contract' : 'receive'
  const isToken = symbol !== native
  const value = op === 'NFT_TRANSFER' ? `#${amount ?? '?'} ${symbol}` : amount ? `${amount} ${symbol}` : `0 ${native}`
  const hash = row.kind === 'evm' && !row.tx_hash.startsWith('0x') ? `0x${row.tx_hash}` : row.tx_hash
  return {
    hash,
    from: row.sender ?? '',
    to: row.target ?? '',
    value,
    valueRaw: '0x0',
    timestamp: row.timestamp ?? 0,
    blockNumber: row.block_height,
    status: row.status === 'failed' ? 'failed' : 'confirmed',
    type,
    gasUsed: row.detail?.gas_used != null ? String(row.detail.gas_used) : undefined,
    gasPrice: row.detail?.gas_price ?? undefined,
    tokenSymbol: isToken ? symbol : undefined,
    tokenAmount: isToken && amount ? amount : undefined,
    explorerUrl: `${chain.explorerUrl}/tx/${hash}`,
    chainId: chain.id,
    label: isTransfer ? undefined : (OP_LABELS[op] ?? op.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())),
    fee: row.fee ?? undefined,
  }
}

function shortAsset(asset: string): string {
  return /^0x[0-9a-f]{40}$/i.test(asset) ? `${asset.slice(0, 6)}…` : asset
}

/**
 * QRDX history: the node's index when it serves one, with what this wallet sent but no block
 * has included yet on top; the local log and Transfer logs otherwise.
 */
export async function fetchQrdxActivity(
  log: ActivityLog,
  chain: ChainConfig,
  accounts: { ethAddress: string; pqAddress: string; pqAccountId: string }[],
  tokens: { address: string; symbol: string; decimals: number }[]
): Promise<TransactionHistoryItem[]> {
  const indexed = await fetchIndexedHistory(chain, accounts.flatMap((a) => [a.ethAddress, a.pqAddress]), tokens)
  if (!indexed) return fetchQrdxHistory(log, chain, accounts, tokens)
  await log.refreshPending(chain).catch(() => false)
  const addrs = accounts.flatMap((a) => [a.ethAddress, a.pqAddress, a.pqAccountId])
  const mine = new Set(addrs.map((a) => a.toLowerCase()))
  const norm = (h: string) => h.toLowerCase().replace(/^0x/, '')
  const known = new Set(indexed.map((i) => norm(i.hash)))
  // Local records the index does not have yet: just sent, or not indexed so far.
  const local = (await log.list(chain.id, addrs)).filter((r) => !known.has(norm(r.hash))).map((r) => toItem(r, mine))
  const pending = local.filter((i) => i.status === 'pending')
  return [...pending, ...local.filter((i) => i.status !== 'pending' && i.blockNumber > (indexed[0]?.blockNumber ?? 0)), ...indexed]
}
