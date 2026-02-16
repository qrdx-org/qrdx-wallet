/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Price Oracle (CoinGecko)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Fetches live token prices from the CoinGecko free API.
 *  Implements:
 *    • Batch price queries (up to 100 tokens per request)
 *    • Price caching with configurable TTL
 *    • Fallback for rate-limited / failed requests
 *    • 24h price change data
 *    • Price history for portfolio charts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenPrice {
  /** CoinGecko ID */
  id: string
  /** Current price in USD */
  usd: number
  /** 24h change percentage */
  usd_24h_change: number | null
  /** Market cap in USD */
  usd_market_cap?: number
  /** Last updated timestamp */
  lastUpdated: number
}

export interface PriceHistoryPoint {
  timestamp: number
  price: number
}

// ─── Configuration ──────────────────────────────────────────────────────────

const COINGECKO_API = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60_000 // 1 minute cache for prices
const HISTORY_CACHE_TTL_MS = 300_000 // 5 minutes for price history

// ─── Price Cache ────────────────────────────────────────────────────────────

const priceCache = new Map<string, TokenPrice>()
const historyCache = new Map<string, { data: PriceHistoryPoint[]; fetchedAt: number }>()

// ─── Mapping from common symbols to CoinGecko IDs ──────────────────────────

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MATIC: 'matic-network',
  POL: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  FTM: 'fantom',
  ARB: 'arbitrum',
  OP: 'optimism',
  SOL: 'solana',
  DOGE: 'dogecoin',
  CRV: 'curve-dao-token',
  QRDX: 'qrdx', // will 404 on CoinGecko since it's fictional — handled gracefully
}

/**
 * Resolve a symbol to a CoinGecko ID.
 * Returns undefined if no mapping exists.
 */
export function symbolToCoingeckoId(symbol: string): string | undefined {
  return SYMBOL_TO_COINGECKO[symbol.toUpperCase()]
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Price Fetching
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch prices for a list of CoinGecko IDs.
 * Uses the simple/price endpoint with 24h change data.
 */
export async function fetchPrices(
  coingeckoIds: string[],
  currency = 'usd'
): Promise<Map<string, TokenPrice>> {
  const results = new Map<string, TokenPrice>()
  const now = Date.now()

  // Check cache first
  const idsToFetch: string[] = []
  for (const id of coingeckoIds) {
    const cached = priceCache.get(id)
    if (cached && now - cached.lastUpdated < CACHE_TTL_MS) {
      results.set(id, cached)
    } else {
      idsToFetch.push(id)
    }
  }

  if (idsToFetch.length === 0) return results

  try {
    const url = `${COINGECKO_API}/simple/price?ids=${idsToFetch.join(',')}&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true`
    const res = await fetch(url)

    if (!res.ok) {
      console.warn(`CoinGecko price fetch failed: HTTP ${res.status}`)
      // Return whatever we have cached (even if stale)
      for (const id of idsToFetch) {
        const stale = priceCache.get(id)
        if (stale) results.set(id, stale)
      }
      return results
    }

    const data = await res.json()

    for (const id of idsToFetch) {
      if (data[id]) {
        const price: TokenPrice = {
          id,
          usd: data[id][currency] ?? 0,
          usd_24h_change: data[id][`${currency}_24h_change`] ?? null,
          usd_market_cap: data[id][`${currency}_market_cap`],
          lastUpdated: now,
        }
        priceCache.set(id, price)
        results.set(id, price)
      }
    }
  } catch (err) {
    console.warn('CoinGecko price fetch error:', err)
    // Return stale cache if available
    for (const id of idsToFetch) {
      const stale = priceCache.get(id)
      if (stale) results.set(id, stale)
    }
  }

  return results
}

/**
 * Fetch prices by token symbols (convenience wrapper).
 * Maps symbols → CoinGecko IDs, fetches, then maps back.
 */
export async function fetchPricesBySymbol(
  symbols: string[],
  currency = 'usd'
): Promise<Map<string, TokenPrice>> {
  const symbolToId = new Map<string, string>()
  const ids: string[] = []

  for (const sym of symbols) {
    const id = symbolToCoingeckoId(sym)
    if (id) {
      symbolToId.set(sym.toUpperCase(), id)
      ids.push(id)
    }
  }

  const priceMap = await fetchPrices([...new Set(ids)], currency)

  // Map back to symbols
  const result = new Map<string, TokenPrice>()
  for (const [sym, id] of symbolToId) {
    const price = priceMap.get(id)
    if (price) result.set(sym, price)
  }

  return result
}

/**
 * Get a single token's price by symbol.
 */
export async function getTokenPrice(
  symbol: string,
  currency = 'usd'
): Promise<TokenPrice | null> {
  const prices = await fetchPricesBySymbol([symbol], currency)
  return prices.get(symbol.toUpperCase()) ?? null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Price History (for portfolio chart)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch price history for a token over the last N days.
 * Uses the market_chart endpoint.
 *
 * @param coingeckoId CoinGecko token ID
 * @param days Number of days of history (1, 7, 30, 90, 365)
 */
export async function fetchPriceHistory(
  coingeckoId: string,
  days = 1,
  currency = 'usd'
): Promise<PriceHistoryPoint[]> {
  const cacheKey = `${coingeckoId}:${days}:${currency}`
  const cached = historyCache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const url = `${COINGECKO_API}/coins/${coingeckoId}/market_chart?vs_currency=${currency}&days=${days}`
    const res = await fetch(url)

    if (!res.ok) {
      console.warn(`CoinGecko history fetch failed: HTTP ${res.status}`)
      return cached?.data ?? []
    }

    const data = await res.json()
    const prices: PriceHistoryPoint[] = (data.prices ?? []).map(
      ([timestamp, price]: [number, number]) => ({ timestamp, price })
    )

    historyCache.set(cacheKey, { data: prices, fetchedAt: now })
    return prices
  } catch (err) {
    console.warn('CoinGecko history fetch error:', err)
    return cached?.data ?? []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Utility
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the total portfolio value given a list of token balances and prices.
 */
export function computePortfolioValue(
  balances: Array<{ symbol: string; formattedBalance: string }>,
  prices: Map<string, TokenPrice>
): { totalUsd: number; change24hPercent: number } {
  let totalUsd = 0
  let weightedChange = 0

  for (const b of balances) {
    const price = prices.get(b.symbol.toUpperCase())
    if (!price) continue

    const balance = parseFloat(b.formattedBalance) || 0
    const value = balance * price.usd
    totalUsd += value

    if (price.usd_24h_change != null) {
      weightedChange += value * price.usd_24h_change
    }
  }

  const change24hPercent = totalUsd > 0 ? weightedChange / totalUsd : 0

  return { totalUsd, change24hPercent }
}

/**
 * Format a USD value for display.
 */
export function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`
  }
  if (value > 0) {
    return `$${value.toFixed(4)}`
  }
  return '$0.00'
}

/**
 * Clear all cached prices (useful when switching currencies).
 */
export function clearPriceCache(): void {
  priceCache.clear()
  historyCache.clear()
}
