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
