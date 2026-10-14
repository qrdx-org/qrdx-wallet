/**
 * QRDX prices for the wallet's balance and chart on QRDX networks. CoinGecko does
 * not list QRDX, so these come from the trade API of the network: QRDX's USD
 * price (an index price where one exists, else routed through the network's pools
 * to a priced asset) and its chart against a USD stablecoin pair.
 */

import type { ChainConfig } from '../chains'
import type { PriceHistoryPoint, TokenPrice } from '../prices'
import { tradeApiBase, tradeGet } from './api'
import type { CandleSeries, IndexPrice } from './types'

/** QRDX in USD on this network, or null when nothing prices it. */
export async function qrdxUsdPrice(chain: ChainConfig): Promise<TokenPrice | null> {
  const api = tradeApiBase(chain)
  if (!api) return null
  try {
    const p = await tradeGet<IndexPrice>(api, '/prices/qrdx')
    return {
      id: `qrdx-${p.source}`,
      usd: Number(p.price),
      usd_24h_change: p.change24h === null ? null : Number(p.change24h),
      lastUpdated: p.asOf * 1000,
    }
  } catch {
    return null
  }
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
