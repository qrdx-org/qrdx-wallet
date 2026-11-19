/**
 * The portfolio's value over time: what the account held at each moment, at that moment's price.
 *
 * Holdings are rebuilt backwards from today's balances by undoing each later transaction
 * (sends, receipts, fees, swaps' token movements), so the line moves with the account's own
 * activity as well as with prices. Prices are CoinGecko's history for each listed coin.
 *
 * Same scope as the total (src/core/portfolio.ts): priced mainnet holdings. Where a network's
 * transactions cannot be read (no keyless explorer, or it failed), its holdings are drawn as
 * constant and the network is reported, so a flat stretch is never mistaken for inactivity.
 */

import { chainFamily, type ChainConfig } from './chains'
import { fetchBalanceEvents, type BalanceEvent } from './history'
import { btcHistory } from './bitcoin'
import { solHistory } from './solana'
import { addressOn, btcNetworkOf, solNetworkOf, type ChainAddresses } from './other-chains'
import { fetchPriceHistories, type PriceHistoryPoint } from './prices'
import type { Holding, Portfolio } from './portfolio'
import type { WalletAccount } from './types'

export type ValueRange = '1D' | '1W' | '1M' | '1Y'

export const RANGE_DAYS: Record<ValueRange, number> = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 }

/** Points drawn across a range. */
const STEPS = 120

export interface ValueHistory {
  /** USD value, oldest first, ending now. */
  points: PriceHistoryPoint[]
  /** Networks whose transactions could not be read: their holdings are drawn as constant. */
  partial: ChainConfig[]
  /** Networks whose older transactions were not all read: values before the oldest read are approximate. */
  truncated: ChainConfig[]
  /** Transactions replayed inside the range. */
  replayed: number
  /** Coins with no price history: drawn at today's price. */
  unpricedHistory: string[]
}

interface ChainEvents {
  events: BalanceEvent[]
  complete: boolean
}

const EVENTS_TTL_MS = 2 * 60_000
const eventsCache = new Map<string, { at: number; value: Promise<ChainEvents | null> }>()

/** eventsOn, kept two minutes: switching the chart's range does not read every network again. */
function cachedEventsOn(chain: ChainConfig, account: WalletAccount, addresses: ChainAddresses | null): Promise<ChainEvents | null> {
  const key = `${chain.id}:${account.ethAddress}:${addressOn(chain, addresses) ?? ''}`
  const hit = eventsCache.get(key)
  if (hit && Date.now() - hit.at < EVENTS_TTL_MS) return hit.value
  const value = eventsOn(chain, account, addresses).catch(() => null)
  eventsCache.set(key, { at: Date.now(), value })
  // A failure is not kept: the next look asks again.
  value.then((v) => v === null && eventsCache.delete(key))
  return value
}

/** The account's balance changes on one network, newest first; null when they cannot be read. */
async function eventsOn(chain: ChainConfig, account: WalletAccount, addresses: ChainAddresses | null): Promise<ChainEvents | null> {
  const family = chainFamily(chain)
  if (family === 'evm') return fetchBalanceEvents(chain.id, account.ethAddress)
  const address = addressOn(chain, addresses)
  if (!address) return null
  if (family === 'bitcoin') {
    // Esplora answers the newest 50 (25 confirmed after the mempool's).
    const txs = await btcHistory(btcNetworkOf(chain), address)
    // Unconfirmed: already in today's balance, so undone from now back.
    const pending = Math.floor(Date.now() / 1000)
    return { events: txs.map((t) => ({ time: t.time ?? pending, token: '', delta: t.delta })), complete: txs.length < 25 }
  }
  const limit = 40
  const txs = await solHistory(solNetworkOf(chain), address, limit)
  const events: BalanceEvent[] = []
  for (const t of txs) {
    const time = t.time ?? Math.floor(Date.now() / 1000)
    if (t.lamports) events.push({ time, token: '', delta: t.lamports })
    if (t.mint && t.delta) events.push({ time, token: t.mint.toLowerCase(), delta: t.delta })
  }
  return { events, complete: txs.length < limit }
}

/** The price at `t` (ms): the latest point at or before it, else the first. */
function priceAt(series: PriceHistoryPoint[], t: number): number | undefined {
  if (!series.length) return undefined
  let lo = 0
  let hi = series.length - 1
  if (t < series[0].timestamp) return series[0].price
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series[mid].timestamp <= t) lo = mid
    else hi = mid - 1
  }
  return series[lo].price
}

/**
 * Rebuild a holding's amount at each time (ms, ascending) from its current amount and its
 * changes (newest first): amount(t) = now − the changes after t. Never below zero, which an
 * incomplete history could otherwise suggest.
 */
export function amountsOver(current: bigint, changes: BalanceEvent[], times: number[]): bigint[] {
  const out = new Array<bigint>(times.length)
  let amount = current
  let i = 0
  for (let k = times.length - 1; k >= 0; k--) {
    while (i < changes.length && changes[i].time * 1000 > times[k]) amount -= changes[i++].delta
    out[k] = amount < 0n ? 0n : amount
  }
  return out
}

export async function fetchValueHistory(portfolio: Portfolio, input: { account: WalletAccount; addresses: ChainAddresses | null; range: ValueRange; now?: number }): Promise<ValueHistory> {
  const days = RANGE_DAYS[input.range]
  const now = input.now ?? Date.now()
  const start = now - days * 86_400_000
  const holdings: Holding[] = portfolio.assets.flatMap((a) => a.holdings).filter((h) => !h.chain.isTestnet && h.coingeckoId && h.price)
  const chains = [...new Map(holdings.map((h) => [h.chain.id, h.chain])).values()]
  const ids = [...new Set(holdings.map((h) => h.coingeckoId!))]

  const [eventLists, prices] = await Promise.all([
    Promise.all(chains.map((c) => cachedEventsOn(c, input.account, input.addresses))),
    fetchPriceHistories(ids, days).catch(() => new Map<string, PriceHistoryPoint[]>()),
  ])
  const events = new Map(chains.map((c, i) => [c.id, eventLists[i]]))

  const times = Array.from({ length: STEPS + 1 }, (_, k) => start + ((now - start) * k) / STEPS)
  const values = new Array<number>(times.length).fill(0)
  let replayed = 0
  const counted = new Set<BalanceEvent>()
  for (const h of holdings) {
    const series = prices.get(h.coingeckoId!) ?? []
    const all = events.get(h.chain.id)
    const token = h.address.toLowerCase()
    const changes = all ? all.events.filter((e) => e.token === token) : []
    for (const e of changes) {
      if (e.time * 1000 <= start || counted.has(e)) continue
      counted.add(e)
      replayed++
    }
    const amounts = amountsOver(h.raw, changes, times)
    const scale = 10 ** h.decimals
    for (let k = 0; k < times.length; k++) {
      // Without a history, today's price: a coin is never drawn as worthless for lack of data.
      const p = k === times.length - 1 || !series.length ? h.price!.usd : priceAt(series, times[k])
      if (p !== undefined) values[k] += (Number(amounts[k]) / scale) * p
    }
  }

  return {
    points: times.map((t, k) => ({ timestamp: t, price: values[k] })),
    partial: chains.filter((c) => !events.get(c.id)),
    truncated: chains.filter((c) => {
      const e = events.get(c.id)
      if (!e || e.complete) return false
      // Older changes may exist: they matter only if the oldest one read is inside the range.
      const oldest = e.events[e.events.length - 1]
      return !!oldest && oldest.time * 1000 > start
    }),
    replayed,
    unpricedHistory: [...new Set(holdings.filter((h) => !prices.get(h.coingeckoId!)?.length).map((h) => h.symbol))],
  }
}
