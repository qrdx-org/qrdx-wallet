'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Flame, Loader2, Rocket, TrendingDown, TrendingUp } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { COINGECKO_API } from '@/src/core/prices'
import { formatFiat } from '@/src/core/fiat'
import { tradeApiBase, tradeGet, tradeSiteUrl } from '@/src/core/trade/api'
import type { ApiAsset, IndexPrice } from '@/src/core/trade/types'
import { cn } from '@/lib/utils'
import { TokenBadge } from './trade/kit'
import { useTokenList, type Token } from './TokenList'

/** The fields Explore reads from the trade API (qrdx-trade lib/types.ts). */
interface SpotMarket {
  id: string
  path: string
  base: ApiAsset
  quote: ApiAsset
  last: string | null
  change24h: string | null
  volume24h: string | null
  baseUsd: IndexPrice | null
  quoteIndex: IndexPrice | null
}
interface PerpMarket {
  id: string
  path: string
  base: string
  quote: string
  baseAsset: ApiAsset | null
  markPrice: string | null
  change24h: string | null
  fundingRate: string | null
  maxLeverage: string | null
  openInterest: string | null
}
interface Launch {
  token: ApiAsset
  createdHeight: number
  market: { path: string; priceUsd: string | null; change24h: string | null; marketCapUsd: string | null } | null
}
interface GeckoCoin {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  price_change_percentage_24h: number | null
  total_volume: number
}

type Sort = 'volume' | 'gainers' | 'losers'

interface Row {
  key: string
  symbol: string
  name: string
  image?: string | null
  verified: boolean
  slug?: string | null
  priceUsd: number | null
  change: number | null
  volumeUsd: number | null
  sub: string
  /** The token on this network, when it has one: opens its page. */
  token?: Token
  href?: string
}

/**
 * What is trading: on QRDX networks the exchange's markets, perpetuals and new launches (the
 * trade API); elsewhere the most-traded coins (CoinGecko). Tap a token to open its page, where
 * it can be swapped; perpetuals open on the trade site.
 */
export function Explore({ onOpenToken }: { onOpenToken: (token: Token) => void }) {
  const { activeChain } = useWallet()
  const held = useTokenList({ includeHidden: true })
  const qrdx = isQrdxChain(activeChain)
  const api = qrdx ? tradeApiBase(activeChain) : null
  const [sort, setSort] = useState<Sort>('volume')
  const [data, setData] = useState<{ key: string; spot: SpotMarket[]; perps: PerpMarket[]; launches: Launch[]; gecko: GeckoCoin[]; error: string | null } | null>(null)
  const key = `${activeChain.id}`

  useEffect(() => {
    let live = true
    const load = async () => {
      if (api) {
        const [m, l] = await Promise.all([
          tradeGet<{ spot: SpotMarket[]; perps: PerpMarket[] }>(api, '/markets'),
          tradeGet<{ launches: Launch[] }>(api, '/launches').catch(() => ({ launches: [] })),
        ])
        return { spot: m.spot, perps: m.perps, launches: l.launches, gecko: [] }
      }
      const res = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=25&page=1&price_change_percentage=24h`)
      if (!res.ok) throw new Error(`CoinGecko answered ${res.status}`)
      return { spot: [], perps: [], launches: [], gecko: (await res.json()) as GeckoCoin[] }
    }
    load()
      .then((d) => live && setData({ key, ...d, error: null }))
      .catch((e) => live && setData({ key, spot: [], perps: [], launches: [], gecko: [], error: e instanceof Error ? e.message : 'Could not load markets' }))
    return () => {
      live = false
    }
  }, [api, key])

  const current = data?.key === key ? data : null

  const tokenFor = (asset: Pick<ApiAsset, 'symbol' | 'name' | 'address' | 'decimals' | 'image'>, change: number | null): Token | undefined => {
    if (!asset.address) return undefined
    const native = asset.address.toUpperCase() === 'QRDX'
    const own = held.find((t) => (native ? !t.contractAddress : t.contractAddress?.toLowerCase() === asset.address!.toLowerCase()))
    if (own) return own
    return {
      symbol: asset.symbol,
      name: asset.name,
      balance: '0',
      balanceNum: 0,
      value: '',
      valueNum: 0,
      change24h: change ?? 0,
      icon: asset.image ?? undefined,
      color: 'from-primary/80 to-primary/50',
      contractAddress: native ? undefined : asset.address,
      decimals: asset.decimals,
    }
  }

  const rows: Row[] = (() => {
    if (!current) return []
    if (!qrdx)
      return current.gecko.map((c) => {
        const own = held.find((t) => t.symbol.toUpperCase() === c.symbol.toUpperCase())
        return {
          key: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          image: c.image,
          verified: true,
          priceUsd: c.current_price,
          change: c.price_change_percentage_24h,
          volumeUsd: c.total_volume,
          sub: c.name,
          token: own,
          href: own ? undefined : `https://www.coingecko.com/en/coins/${c.id}`,
        }
      })
    return current.spot.map((m) => {
      const price = m.baseUsd ? Number(m.baseUsd.price) : null
      const change = m.change24h != null ? Number(m.change24h) : m.baseUsd?.change24h != null ? Number(m.baseUsd.change24h) : null
      const quoteUsd = m.quoteIndex ? Number(m.quoteIndex.price) : null
      const vol = m.volume24h != null ? Number(m.volume24h) : null
      return {
        key: m.id,
        symbol: m.base.symbol,
        name: m.base.name,
        image: m.base.image,
        verified: m.base.verified,
        slug: m.base.slug,
        priceUsd: price,
        change,
        volumeUsd: vol != null && quoteUsd != null ? vol * quoteUsd : null,
        sub: `${m.base.symbol}/${m.quote.symbol}${vol != null ? ` · ${compact(vol)} ${m.quote.symbol} vol` : ''}`,
        token: tokenFor(m.base, change),
        href: tradeSiteUrl(activeChain, m.path),
      }
    })
  })()

  const sorted = [...rows].sort((a, b) =>
    sort === 'volume' ? (b.volumeUsd ?? -1) - (a.volumeUsd ?? -1) : sort === 'gainers' ? (b.change ?? -Infinity) - (a.change ?? -Infinity) : (a.change ?? Infinity) - (b.change ?? Infinity)
  )

  if (!current)
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading markets…
      </div>
    )

  return (
    <div className="space-y-4 p-1">
      {current.error && <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">{current.error}</p>}

      <section>
        <div className="mb-1.5 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold">
            <Flame className="h-3.5 w-3.5" /> {qrdx ? 'Markets' : 'Most traded'}
          </h3>
          <div className="flex gap-0.5 rounded-lg bg-accent/40 p-0.5" role="tablist" aria-label="Sort markets">
            {(['volume', 'gainers', 'losers'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={sort === s} onClick={() => setSort(s)} className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium capitalize', sort === s ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">No markets yet.</p>
        ) : (
          <div className="space-y-0.5">
            {sorted.map((r, i) => (
              <MarketRow key={r.key} rank={i + 1} row={r} onOpen={() => r.token && onOpenToken(r.token)} />
            ))}
          </div>
        )}
        {!qrdx && <p className="mt-1 px-1 text-[10px] text-muted-foreground">Prices from CoinGecko. Tokens you hold open their page.</p>}
      </section>

      {qrdx && current.perps.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold">
            <TrendingUp className="h-3.5 w-3.5" /> Perpetuals
          </h3>
          <div className="space-y-0.5">
            {current.perps.map((p) => (
              <a key={p.id} href={tradeSiteUrl(activeChain, p.path)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/30">
                <TokenBadge asset={p.baseAsset ?? { symbol: p.base, verified: true }} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {p.base}-{p.quote}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    up to {p.maxLeverage ? `${Number(p.maxLeverage)}×` : '—'}
                    {p.fundingRate != null ? ` · funding ${(Number(p.fundingRate) * 100).toFixed(4)}%/h` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-sm font-semibold">{p.markPrice ? `$${Number(p.markPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '—'}</span>
                  <Change value={p.change24h != null ? Number(p.change24h) : null} />
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              </a>
            ))}
          </div>
          <p className="mt-1 px-1 text-[10px] text-muted-foreground">Perpetuals trade on {tradeSiteUrl(activeChain, '').replace(/^https?:\/\//, '')}; mark prices in USD.</p>
        </section>
      )}

      {qrdx && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold">
            <Rocket className="h-3.5 w-3.5" /> New launches
          </h3>
          {current.launches.length === 0 ? (
            <p className="px-1 py-3 text-[11px] text-muted-foreground">No tokens launched with a pool recently.</p>
          ) : (
            <div className="space-y-0.5">
              {current.launches.slice(0, 10).map((l) => {
                const change = l.market?.change24h != null ? Number(l.market.change24h) : null
                const token = tokenFor(l.token, change)
                return (
                  <MarketRow
                    key={l.token.address ?? l.token.symbol}
                    row={{
                      key: l.token.address ?? l.token.symbol,
                      symbol: l.token.symbol,
                      name: l.token.name,
                      image: l.token.image,
                      verified: l.token.verified,
                      priceUsd: l.market?.priceUsd != null ? Number(l.market.priceUsd) : null,
                      change,
                      volumeUsd: null,
                      sub: `block ${l.createdHeight.toLocaleString()}${l.market?.marketCapUsd ? ` · ${formatFiat(Number(l.market.marketCapUsd))} cap` : ''}`,
                      token,
                    }}
                    onOpen={() => token && onOpenToken(token)}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function MarketRow({ row, rank, onOpen }: { row: Row; rank?: number; onOpen: () => void }) {
  const body = (
    <>
      {rank != null && <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{rank}</span>}
      <TokenBadge asset={{ symbol: row.symbol, verified: row.verified, slug: row.slug, image: row.image }} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{row.symbol}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{row.sub}</span>
      </span>
      <span className="text-right">
        <span className="num block text-sm font-semibold">{row.priceUsd != null ? formatFiat(row.priceUsd) : '—'}</span>
        <Change value={row.change} />
      </span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent/30'
  if (row.token)
    return (
      <button type="button" onClick={onOpen} className={cls}>
        {body}
      </button>
    )
  if (row.href)
    return (
      <a href={row.href} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    )
  return <div className={cls}>{body}</div>
}

function Change({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return <span className="block text-[10px] text-muted-foreground">—</span>
  const Icon = value >= 0 ? TrendingUp : TrendingDown
  return (
    <span className="flex items-center justify-end gap-0.5 text-[10px] tabular-nums text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      {value >= 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

function compact(n: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
}
