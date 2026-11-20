'use client'

/**
 * The account's portfolio across every network (src/core/portfolio.ts), shared by the home
 * screen and asset pages: fetched once, kept for a minute, refreshed on demand.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { fetchPortfolio, portfolioChains, type Portfolio } from '@/src/core/portfolio'
import { WatchedTokens } from '@/src/core/watched-tokens'
import { createDefaultStorage } from '@/src/core/storage'
import { onTrustChange } from '@/src/core/token-trust'

const FRESH_MS = 60_000
const cache = new Map<string, { at: number; value?: Portfolio; pending?: Promise<Portfolio> }>()
const listeners = new Set<() => void>()
let watched: WatchedTokens | null = null

export function usePortfolio(enabled = true): { portfolio: Portfolio | null; loading: boolean; refresh: () => void } {
  const { currentWallet, chainAddresses, chains, showTestnets, homeQrdxChain, locked } = useWallet()
  const networks = useMemo(() => portfolioChains(chains, homeQrdxChain, showTestnets), [chains, homeQrdxChain, showTestnets])
  // Wait for the Bitcoin and Solana addresses, or those networks would read as empty.
  const key = enabled && currentWallet && chainAddresses && !locked ? `${currentWallet.id}|${networks.map((c) => c.id).join(',')}` : null
  const [, setVersion] = useState(0)

  useEffect(() => {
    const l = () => setVersion((v) => v + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const load = useCallback(
    (force: boolean) => {
      if (!key || !currentWallet) return
      const hit = cache.get(key)
      if (hit?.pending || (!force && hit?.value && Date.now() - hit.at < FRESH_MS)) return
      watched ??= new WatchedTokens(createDefaultStorage())
      const pending = fetchPortfolio({ chains: networks, account: currentWallet, addresses: chainAddresses, extraTokens: (id) => watched!.list(id) })
      cache.set(key, { at: hit?.at ?? 0, value: hit?.value, pending })
      listeners.forEach((l) => l())
      pending
        .then((value) => cache.set(key, { at: Date.now(), value }))
        .catch(() => cache.set(key, { at: Date.now(), value: hit?.value }))
        .finally(() => listeners.forEach((l) => l()))
    },
    [key, currentWallet, networks, chainAddresses]
  )

  useEffect(() => load(false), [load])
  // Trusting a token prices it and lists it with the rest.
  useEffect(() => onTrustChange((what) => what === 'trust' && load(true)), [load])

  const entry = key ? cache.get(key) : undefined
  return { portfolio: entry?.value ?? null, loading: !!entry?.pending || !entry, refresh: () => load(true) }
}
