/**
 * A coin's market (CoinGecko /coins/markets): price, changes, market cap, volume, supply and
 * all-time high. Kept for five minutes.
 */

import { COINGECKO_API } from './prices'

export interface MarketData {
  price: number
  change1h: number | null
  change24h: number | null
  change7d: number | null
  change30d: number | null
  high24h: number | null
  low24h: number | null
  marketCap: number | null
  rank: number | null
  fdv: number | null
  volume24h: number | null
  circulating: number | null
  totalSupply: number | null
  maxSupply: number | null
  ath: number | null
  athDate: string | null
}

const cache = new Map<string, { at: number; data: MarketData | null }>()
const TTL_MS = 5 * 60_000

export async function fetchMarketData(coingeckoId: string): Promise<MarketData | null> {
  const hit = cache.get(coingeckoId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  const res = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coingeckoId)}&price_change_percentage=1h,24h,7d,30d`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`CoinGecko answered ${res.status}`)
  const [m] = (await res.json()) as Record<string, number | string | null>[]
  const n = (k: string) => (typeof m?.[k] === 'number' ? (m[k] as number) : null)
  const data: MarketData | null = m
    ? {
        price: n('current_price') ?? 0,
        change1h: n('price_change_percentage_1h_in_currency'),
        change24h: n('price_change_percentage_24h_in_currency') ?? n('price_change_percentage_24h'),
        change7d: n('price_change_percentage_7d_in_currency'),
        change30d: n('price_change_percentage_30d_in_currency'),
        high24h: n('high_24h'),
        low24h: n('low_24h'),
        marketCap: n('market_cap'),
        rank: n('market_cap_rank'),
        fdv: n('fully_diluted_valuation'),
        volume24h: n('total_volume'),
        circulating: n('circulating_supply'),
        totalSupply: n('total_supply'),
        maxSupply: n('max_supply'),
        ath: n('ath'),
        athDate: typeof m.ath_date === 'string' ? m.ath_date : null,
      }
    : null
  cache.set(coingeckoId, { at: Date.now(), data })
  return data
}
