/**
 * Values in the currency the user chose (Settings → Currency). Prices are USD everywhere in
 * the wallet (CoinGecko, the QRDX trade API); they are converted for display only, at
 * CoinGecko's exchange rates. Without a rate, values stay in USD rather than show a guess.
 */

import { COINGECKO_API } from './prices'

export type FiatCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF'

let current: { code: FiatCode; perUsd: number } = { code: 'USD', perUsd: 1 }
const rateCache = new Map<FiatCode, { perUsd: number; at: number }>()
const RATE_TTL_MS = 60 * 60_000

/** The currency values are shown in, and how many of it make one USD. */
export function displayCurrency(): { code: FiatCode; perUsd: number } {
  return current
}

export function setDisplayCurrency(code: FiatCode, perUsd: number): void {
  current = { code, perUsd }
}

/** Units of `code` per USD (CoinGecko /exchange_rates, which quotes every currency against BTC). */
export async function fetchUsdRate(code: FiatCode): Promise<number | null> {
  if (code === 'USD') return 1
  const hit = rateCache.get(code)
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.perUsd
  try {
    const res = await fetch(`${COINGECKO_API}/exchange_rates`)
    if (!res.ok) return hit?.perUsd ?? null
    const body = (await res.json()) as { rates?: Record<string, { value: number }> }
    const usd = body.rates?.usd?.value
    const target = body.rates?.[code.toLowerCase()]?.value
    if (!usd || !target) return hit?.perUsd ?? null
    const perUsd = target / usd
    rateCache.set(code, { perUsd, at: Date.now() })
    return perUsd
  } catch {
    return hit?.perUsd ?? null
  }
}

/** A USD value in the display currency ("€1,234.56", "¥12,345", "$0.0031"). */
export function formatFiat(usd: number): string {
  const { code, perUsd } = current
  const v = usd * perUsd
  const abs = Math.abs(v)
  const digits = code === 'JPY' ? 0 : abs >= 1 || abs === 0 ? 2 : 4
  const fmt = (n: number, notation?: 'compact') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: notation ? 0 : digits, maximumFractionDigits: notation ? 2 : digits, notation }).format(n)
  return abs >= 1_000_000 ? fmt(v, 'compact') : fmt(v)
}
