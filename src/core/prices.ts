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
  /** The last price the market gave, kept because it gives none right now (see trade/prices.ts). */
  stale?: boolean
}

export interface PriceHistoryPoint {
  timestamp: number
  price: number
}

// ─── Configuration ──────────────────────────────────────────────────────────

export const COINGECKO_API = 'https://api.coingecko.com/api/v3'
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
  S: 'sonic-3',
  MNT: 'mantle',
  XDAI: 'xdai',
  CELO: 'celo',
  ARB: 'arbitrum',
  OP: 'optimism',
  SOL: 'solana',
  WSOL: 'wrapped-solana',
  JUP: 'jupiter-exchange-solana',
  BONK: 'bonk',
  PYTH: 'pyth-network',
  JITOSOL: 'jito-staked-sol',
  MSOL: 'msol',
  DOGE: 'dogecoin',
  CRV: 'curve-dao-token',
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
      // CoinGecko's free API rate-limits; DefiLlama serves the same coins by their CoinGecko id.
      const llama = currency === 'usd' ? await fetchLlamaPrices(idsToFetch).catch(() => new Map<string, TokenPrice>()) : new Map<string, TokenPrice>()
      for (const id of idsToFetch) {
        const p = llama.get(id) ?? priceCache.get(id)
        if (p) {
          if (llama.has(id)) priceCache.set(id, p)
          results.set(id, p)
        }
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
//  DefiLlama (coins.llama.fi): the same coins by CoinGecko id, keyless, several per request
// ═══════════════════════════════════════════════════════════════════════════════

export const LLAMA_API = 'https://coins.llama.fi'

/** Current USD prices and 24 h change, for when CoinGecko refuses. */
async function fetchLlamaPrices(ids: string[]): Promise<Map<string, TokenPrice>> {
  const coins = ids.map((id) => `coingecko:${id}`).join(',')
  const [cur, pct] = await Promise.all([
    fetch(`${LLAMA_API}/prices/current/${coins}`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json() as Promise<{ coins: Record<string, { price: number }> }>),
    fetch(`${LLAMA_API}/percentage/${coins}?period=24h`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json() as Promise<{ coins: Record<string, number> }>)
      .catch(() => ({ coins: {} as Record<string, number> })),
  ])
  const out = new Map<string, TokenPrice>()
  for (const id of ids) {
    const p = cur.coins[`coingecko:${id}`]
    if (p) out.set(id, { id, usd: p.price, usd_24h_change: pct.coins[`coingecko:${id}`] ?? null, lastUpdated: Date.now() })
  }
  return out
}

/** Points per range: (period, count) so each history has 24 to 120 points. */
const LLAMA_PERIODS: [number, string, number][] = [
  [1, '30m', 48],
  [7, '2h', 84],
  [30, '8h', 90],
  [365, '3d', 122],
]

/**
 * Price histories for several coins over the last `days`, USD, timestamps in ms. DefiLlama in
 * one request; CoinGecko for any it lacks. A coin with no history is absent from the map.
 */
export async function fetchPriceHistories(ids: string[], days: number): Promise<Map<string, PriceHistoryPoint[]>> {
  const out = new Map<string, PriceHistoryPoint[]>()
  const todo: string[] = []
  for (const id of ids) {
    const hit = historyCache.get(`llama:${id}:${days}`)
    if (hit && Date.now() - hit.fetchedAt < HISTORY_CACHE_TTL_MS) out.set(id, hit.data)
    else todo.push(id)
  }
  if (todo.length) {
    const [, period, span] = LLAMA_PERIODS.find(([d]) => days <= d) ?? LLAMA_PERIODS[LLAMA_PERIODS.length - 1]
    const start = Math.floor(Date.now() / 1000) - days * 86_400
    try {
      const res = await fetch(`${LLAMA_API}/chart/${todo.map((id) => `coingecko:${id}`).join(',')}?start=${start}&span=${span}&period=${period}`, { signal: AbortSignal.timeout(20_000) })
      const body = (await res.json()) as { coins?: Record<string, { prices: { timestamp: number; price: number }[] }> }
      for (const id of todo) {
        const prices = body.coins?.[`coingecko:${id}`]?.prices
        if (prices?.length) {
          const data = prices.map((p) => ({ timestamp: p.timestamp * 1000, price: p.price }))
          historyCache.set(`llama:${id}:${days}`, { data, fetchedAt: Date.now() })
          out.set(id, data)
        }
      }
    } catch (err) {
      console.warn('DefiLlama history fetch error:', err)
    }
    for (const id of todo.filter((x) => !out.has(x))) {
      const data = await fetchPriceHistory(id, days)
      if (data.length) out.set(id, data)
    }
  }
  return out
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
