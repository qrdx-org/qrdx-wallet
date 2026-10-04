/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Activity log (what this wallet sent, and what came in)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  QRDX nodes do not index history per address (the explorer scans blocks to
 *  work around it), and there is no Etherscan for QRDX. So on QRDX chains the
 *  wallet keeps its own durable record of every transaction it submits —
 *  classic, post-quantum (0x51), exchange operations, and dApp transactions
 *  approved in the extension — and tracks each to a final status from its
 *  receipt. Incoming token transfers are read from `Transfer` logs.
 *
 *  Not covered: incoming *native* QRDX from others, which needs a node-side
 *  index (qrdx-wallet docs/PRODUCTION_CHECKLIST.md §10, ask #5).
 */

import type { IStorage } from './storage'
import { getChain, type ChainConfig } from './chains'
import { getEvmProvider, weiToEth } from './ethereum'
import type { TransactionHistoryItem } from './history'

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
