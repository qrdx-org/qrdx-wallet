/**
 * Which tokens count as verified, and the user's say over the rest.
 *
 * Verified: a network's own coin, a token its registry (chains.ts) lists by address, and on
 * QRDX networks the trade site's verified assets (its /assets registry: USDC, qETH, …), each
 * standing for a real coin whose market prices it.
 *
 * Trusted: a token the user vouched for (Settings, or its page), shown and counted like a
 * verified one, per network and in this browser. "Show unverified tokens" lists every other
 * token with the rest instead of folding them away.
 */

import { isQrdxChain, type ChainConfig } from './chains'
import { tradeApiBase, tradeGet } from './trade/api'
import type { ApiAsset } from './trade/types'

export interface VerifiedAsset {
  /** The coin it stands for ("USDC" for qUSDC): what prices it. */
  symbol: string
  slug: string
}

const VERIFIED_TTL_MS = 5 * 60_000
const verifiedCache = new Map<string, { at: number; value: Promise<Map<string, VerifiedAsset>> }>()

/** A QRDX network's verified assets by token address (lower case); empty elsewhere or when the trade API is down. */
export function qrdxVerifiedAssets(chain: ChainConfig): Promise<Map<string, VerifiedAsset>> {
  const api = isQrdxChain(chain) ? tradeApiBase(chain) : null
  if (!api) return Promise.resolve(new Map())
  const hit = verifiedCache.get(chain.id)
  if (hit && Date.now() - hit.at < VERIFIED_TTL_MS) return hit.value
  const value = tradeGet<{ assets: ApiAsset[]; tokens?: ApiAsset[] }>(api, '/assets?all=1')
    .then(
      (r) =>
        new Map(
          [...r.assets, ...(r.tokens ?? [])]
            .filter((a) => a.verified && a.address && a.address.toUpperCase() !== 'QRDX')
            .map((a) => [a.address!.toLowerCase(), { symbol: a.symbol.toUpperCase(), slug: a.slug ?? a.symbol.toLowerCase() }])
        )
    )
    .catch(() => {
      // A failure is not kept: the next look asks again.
      verifiedCache.delete(chain.id)
      return new Map<string, VerifiedAsset>()
    })
  verifiedCache.set(chain.id, { at: Date.now(), value })
  return value
}

// ─── Trusted tokens and the "show unverified" preference ────────────────────

const trustKey = (chainId: string) => `qrdx_trusted_tokens:${chainId}`
const SHOW_KEY = 'qrdx_show_unverified'
const listeners = new Set<(what: 'trust' | 'show') => void>()
const trustCache = new Map<string, Set<string>>()

export function trustedTokens(chainId: string): Set<string> {
  let set = trustCache.get(chainId)
  if (!set) {
    try {
      const raw = JSON.parse(localStorage.getItem(trustKey(chainId)) ?? '[]')
      set = new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').map((x: string) => x.toLowerCase()) : [])
    } catch {
      set = new Set()
    }
    trustCache.set(chainId, set)
  }
  return set
}

export function isTrustedToken(chainId: string, address: string): boolean {
  return !!address && trustedTokens(chainId).has(address.toLowerCase())
}

export function setTokenTrusted(chainId: string, address: string, trusted: boolean): void {
  if (!address) return
  const next = new Set(trustedTokens(chainId))
  if (trusted) next.add(address.toLowerCase())
  else next.delete(address.toLowerCase())
  trustCache.set(chainId, next)
  try {
    localStorage.setItem(trustKey(chainId), JSON.stringify([...next]))
  } catch {
    /* trusted for this page only */
  }
  listeners.forEach((l) => l('trust'))
}

let showUnverifiedValue: boolean | null = null

/** List unverified tokens with the rest instead of folding them away. */
export function showUnverified(): boolean {
  if (showUnverifiedValue === null) {
    try {
      showUnverifiedValue = localStorage.getItem(SHOW_KEY) === '1'
    } catch {
      showUnverifiedValue = false
    }
  }
  return showUnverifiedValue
}

export function setShowUnverified(show: boolean): void {
  showUnverifiedValue = show
  try {
    localStorage.setItem(SHOW_KEY, show ? '1' : '0')
  } catch {
    /* this page only */
  }
  listeners.forEach((l) => l('show'))
}

/** Called when a token is trusted or no longer ('trust'), or the preference changes ('show'). */
export function onTrustChange(listener: (what: 'trust' | 'show') => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
