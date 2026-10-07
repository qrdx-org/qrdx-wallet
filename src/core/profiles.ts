/**
 * Images that token creators publish (qrdx-trade docs/PROFILES.md): signed by the
 * token's creator, checked by the trade site's profile service, and served through
 * its image proxy, so the wallet never contacts the creator's host. Not
 * verification: anyone can create a token and give it any image.
 */

import type { ChainConfig } from './chains'

const PROFILES_URL = (process.env.NEXT_PUBLIC_QRDX_PROFILES_URL || 'https://trade.qrdx.org/api/profiles').replace(/\/$/, '')
const TTL_MS = 5 * 60_000

/** The profile service's name for a chain; null for chains it does not cover. */
export function profileNetwork(chain: Pick<ChainConfig, 'id'>): string | null {
  return chain.id === 'qrdx-mainnet' ? 'mainnet' : chain.id === 'qrdx-testnet' ? 'testnet' : null
}

interface TokenProfile {
  address: string
  issuedAt: number
  profile: { image?: string }
}

const cache = new Map<string, { at: number; images: Map<string, string> }>()

/** Token address (lower-case) → image URL, for every token whose creator set one. Empty on failure. */
export async function tokenImages(chain: Pick<ChainConfig, 'id'>, signal?: AbortSignal): Promise<Map<string, string>> {
  const network = profileNetwork(chain)
  if (!network) return new Map()
  const hit = cache.get(network)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.images
  try {
    const res = await fetch(`${PROFILES_URL}/v1/${network}/tokens`, { signal: signal ?? AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { profiles: Record<string, TokenProfile> }
    const images = new Map(
      Object.values(body.profiles)
        .filter((p) => p.profile.image)
        .map((p) => [p.address.toLowerCase(), `${PROFILES_URL}/v1/${network}/image/token/${p.address.toLowerCase()}?v=${p.issuedAt}`])
    )
    cache.set(network, { at: Date.now(), images })
    return images
  } catch {
    return hit?.images ?? new Map()
  }
}
