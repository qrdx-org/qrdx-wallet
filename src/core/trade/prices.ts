/**
 * QRDX prices for the wallet's balance and chart on QRDX networks. CoinGecko does
 * not list QRDX, so these come from the trade API of the network: QRDX's USD
 * price (an index price where one exists, else routed through the network's pools
 * to a priced asset) and its chart against a USD stablecoin pair.
 */

import type { ChainConfig } from '../chains'
import type { PriceHistoryPoint, TokenPrice } from '../prices'
import { TradeApiError, tradeApiBase, tradeGet } from './api'
import type { CandleSeries, IndexPrice } from './types'

/** QRDX in USD on this network, or null when nothing prices it. */
export function qrdxUsdPrice(chain: ChainConfig): Promise<TokenPrice | null> {
  return tradeUsdPrice(chain, 'qrdx')
}

/** How long the last real price stands in when the trade API gives none. */
const LAST_PRICE_MAX_AGE_MS = 24 * 60 * 60_000
const lastPrices = new Map<string, TokenPrice>()
const lastPriceKey = (chain: ChainConfig, asset: string) => `qrdx_last_price:${chain.id}:${asset}`

function rememberPrice(key: string, price: TokenPrice): void {
  lastPrices.set(key, price)
  try {
    localStorage.setItem(key, JSON.stringify(price))
  } catch {
    /* kept for this page only */
  }
}

function lastPrice(key: string): TokenPrice | null {
  let p = lastPrices.get(key) ?? null
  if (!p) {
    try {
      p = JSON.parse(localStorage.getItem(key) ?? 'null') as TokenPrice | null
    } catch {
      p = null
    }
  }
  return p && typeof p.usd === 'number' && Date.now() - p.lastUpdated < LAST_PRICE_MAX_AGE_MS ? { ...p, stale: true } : null
}

/**
 * A verified asset's USD price (`asset` is its slug) from this network's trade API: an index
 * price, or routed through pools. When the API gives none (it is down, or the market has no
 * price for a moment), the last real price from the past day stands in, marked `stale`.
 */
export async function tradeUsdPrice(chain: ChainConfig, asset: string): Promise<TokenPrice | null> {
  const api = tradeApiBase(chain)
  if (!api) return null
  const key = lastPriceKey(chain, asset)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const p = await tradeGet<IndexPrice>(api, `/prices/${encodeURIComponent(asset)}`)
      const usd = Number(p.price)
      if (!(usd > 0)) break
      const price: TokenPrice = {
        id: `${asset}-${p.source}`,
        usd,
        usd_24h_change: p.change24h === null ? null : Number(p.change24h),
        lastUpdated: p.asOf * 1000,
      }
      rememberPrice(key, price)
      return price
    } catch (e) {
      // No price for this asset is an answer; anything else is worth one more try.
      if (e instanceof TradeApiError && e.status === 404) break
    }
  }
  return lastPrice(key)
}

/**
 * QRDX's price over the last day: the QRDX/USDC (or USDT) market's candles, the
 * market's own trades or recorded pool prices. Empty when no such market exists.
 */
export async function qrdxPriceHistory(chain: ChainConfig): Promise<PriceHistoryPoint[]> {
  const api = tradeApiBase(chain)
  if (!api) return []
  for (const quote of ['usdc', 'usdt']) {
    try {
      const s = await tradeGet<CandleSeries>(api, `/markets/qrdx/${quote}/candles?interval=15m&limit=96`)
      if (s.kind !== 'none' && s.candles.length) return s.candles.map((c) => ({ timestamp: c.t * 1000, price: Number(c.c) }))
    } catch {
      /* try the next quote */
    }
  }
  return []
}

export type HistoryRange = '1H' | '1D' | '1W' | '1M'

const RANGE_CANDLES: Record<HistoryRange, { interval: string; limit: number }> = {
  '1H': { interval: '1m', limit: 60 },
  '1D': { interval: '15m', limit: 96 },
  '1W': { interval: '1h', limit: 168 },
  '1M': { interval: '4h', limit: 180 },
}

/**
 * A native token's USD price over a range, from its market against a USD stablecoin on this
 * network's trade API (`asset` is a verified slug such as "qrdx", or a token address).
 * Empty when it has no such market.
 */
export async function tokenPriceHistory(chain: ChainConfig, asset: string, range: HistoryRange): Promise<PriceHistoryPoint[]> {
  const api = tradeApiBase(chain)
  if (!api) return []
  const { interval, limit } = RANGE_CANDLES[range]
  for (const quote of ['usdc', 'usdt']) {
    if (asset.toLowerCase() === quote) continue
    try {
      const s = await tradeGet<CandleSeries>(api, `/markets/${encodeURIComponent(asset)}/${quote}/candles?interval=${interval}&limit=${limit}`)
      if (s.kind !== 'none' && s.candles.length) return s.candles.map((c) => ({ timestamp: c.t * 1000, price: Number(c.c) }))
    } catch {
      /* try the next quote */
    }
  }
  return []
}
