'use client'

/**
 * Trade from the wallet: QRDX spot and perpetual markets, after trade.qrdx.org.
 *
 * Market data (books, candles, quotes, the account) comes from the trade API for
 * this network, checked to serve the chain the wallet is on. Orders are built
 * here (src/core/trade/orders.ts, the same rules as the site), reviewed in a
 * sheet that decodes exactly what will be signed, then signed with the
 * account's quantum-safe key and followed to their block.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, ChevronDown, ExternalLink, Loader2, Search } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { tradeApiBase, tradeSiteUrl, verifyTradeApi, type TradeApiStatus } from '@/src/core/trade/api'
import { compact, percent, price as fmtPrice, tone, usd } from '@/src/core/trade/format'
import type { AccountResponse, MarketsResponse, OrderBook, PerpMarket, SpotMarket, TradesResponse } from '@/src/core/trade/types'
import { AccountTabs } from './trade/AccountTabs'
import { MiniBook, MiniChart, TradesList } from './trade/MarketData'
import { PerpForm } from './trade/PerpForm'
import { SpotForm } from './trade/SpotForm'
import { Empty, PairBadge, Tabs, TokenBadge, usePriceFlash, useTradeApi } from './trade/kit'
import { useTradeSubmit } from './trade/submit'
import { cn } from '@/lib/utils'

interface TradeModalProps {
  onClose: () => void
}

type View = { kind: 'list' } | { kind: 'spot' | 'perp'; base: string; quote: string }

const LAST_KEY = (chain: string) => `qrdx_trade_last:${chain}`

export function TradeModal({ onClose }: TradeModalProps) {
  const { activeChain } = useWallet()
  // A different network is a different exchange: start over.
  return <TradeScreen key={activeChain.id} onClose={onClose} />
}

/** The last market opened on this network, to come back to. */
function lastView(chainId: string): View {
  try {
    const last = localStorage.getItem(LAST_KEY(chainId))
    return last ? (JSON.parse(last) as View) : { kind: 'list' }
  } catch {
    return { kind: 'list' }
  }
}

function TradeScreen({ onClose }: TradeModalProps) {
  const { activeChain, currentWallet } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const api = qrdx ? tradeApiBase(activeChain) : null
  const [status, setStatus] = useState<TradeApiStatus | null>(null)
  const [view, setView] = useState<View>(() => lastView(activeChain.id))

  useEffect(() => {
    if (!qrdx) return
    let live = true
    verifyTradeApi(activeChain).then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [qrdx, activeChain])

  const open = (v: View) => {
    setView(v)
    try {
      if (v.kind !== 'list') localStorage.setItem(LAST_KEY(activeChain.id), JSON.stringify(v))
    } catch {
      /* this visit only */
    }
  }

  const back = view.kind === 'list' ? onClose : () => setView({ kind: 'list' })

  return (
    <div className="flex min-h-screen flex-col mono-backdrop">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button type="button" onClick={back} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold leading-tight">{view.kind === 'list' ? 'Trade' : view.kind === 'perp' ? 'Perpetuals' : 'Spot'}</h1>
            <p className="truncate text-[10px] text-muted-foreground">{activeChain.name} · QRDX exchange</p>
          </div>
          {status?.ok && view.kind !== 'list' && (
            <a
              href={tradeSiteUrl(activeChain, `/${view.kind === 'perp' ? 'perps' : 'trade'}/${view.base}/${view.quote}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              trade.qrdx.org <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 px-3 pb-6 pt-2">
        {!qrdx ? (
          <Centered title="Trading runs on QRDX networks" text={`${activeChain.name} has no QRDX exchange. Switch to a QRDX network to trade with your quantum-safe account.`} />
        ) : !status ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !status.ok || !api ? (
          <Centered title="Trading service unavailable" text={status.message ?? 'Try again later.'} />
        ) : !currentWallet ? null : view.kind === 'list' ? (
          <MarketList api={api} onOpen={open} />
        ) : (
          <MarketView key={`${view.kind}:${view.base}/${view.quote}`} api={api} view={view} trader={currentWallet.pqAddress} onSwitch={() => setView({ kind: 'list' })} />
        )}
      </div>
    </div>
  )
}

function Centered({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-16 text-center">
      <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{text}</p>
    </div>
  )
}

// ── market list ───────────────────────────────────────────────────────────────

function segments(path: string): [string, string] {
  const [, , b, q] = path.split('/')
  return [b, q]
}

function MarketList({ api, onOpen }: { api: string; onOpen: (v: View) => void }) {
  const { data, error } = useTradeApi<MarketsResponse>(api, '/markets', 10_000)
  const [tab, setTab] = useState<'spot' | 'perps'>('spot')
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (tab === 'perps')
      return (data?.perps ?? [])
        .filter((m) => !needle || m.id.toLowerCase().includes(needle))
        .map((m) => ({ key: m.id, path: m.path, name: `${m.base}-${m.quote}`, sub: `Perp · up to ${Number(m.maxLeverage ?? 20)}×`, badge: <TokenBadge asset={m.baseAsset ?? { symbol: m.base, verified: true }} size="md" />, last: m.markPrice, change: m.change24h, vol: m.volume24h, verified: true }))
    return (data?.spot ?? [])
      .filter((m) => m.status === 'live')
      .filter((m) => !needle || [m.base.symbol, m.quote.symbol, m.base.name, m.base.address ?? ''].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.base.verified) - Number(a.base.verified) || Number(b.volume24h ?? 0) - Number(a.volume24h ?? 0))
      .map((m) => ({ key: m.id, path: m.path, name: `${m.base.symbol}/${m.quote.symbol}`, sub: m.base.verified ? m.base.name : 'Unverified', badge: <PairBadge base={m.base} quote={m.quote} size="sm" />, last: m.last, change: m.change24h, vol: m.volume24h, verified: m.base.verified }))
  }, [data, tab, q])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border bg-card px-3">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Tabs
          tabs={[
            { id: 'spot', label: 'Spot' },
            { id: 'perps', label: 'Perpetuals' },
          ]}
          value={tab}
          onChange={setTab}
          className="px-1.5"
        />
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Market</span>
          <span className="text-right">Price</span>
          <span className="w-14 text-right">24h</span>
        </div>
        {error && !data && <Empty>{error.message}</Empty>}
        {data && !rows.length && <Empty>{q ? 'Nothing matches.' : 'No markets on this network yet.'}</Empty>}
        {!data && !error && <Empty>Loading markets…</Empty>}
        {rows.map((r) => {
          const [b, qq] = segments(r.path)
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onOpen({ kind: tab === 'perps' ? 'perp' : 'spot', base: b, quote: qq })}
              className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-2 text-left transition-colors hover:bg-accent/50"
            >
              <span className="flex min-w-0 items-center gap-2">
                {r.badge}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                  <span className={cn('block truncate text-[10px]', r.verified ? 'text-muted-foreground' : 'text-amber-500')}>
                    {r.sub}
                    {Number(r.vol) > 0 ? ` · vol ${compact(r.vol)}` : ''}
                  </span>
                </span>
              </span>
              <span className="num text-right text-[12px]">{fmtPrice(r.last)}</span>
              <span className={cn('num w-14 rounded-md py-0.5 text-center text-[11px] font-medium', Number(r.change) > 0 ? 'bg-bid/15 text-bid' : Number(r.change) < 0 ? 'bg-ask/15 text-ask' : 'bg-muted text-muted-foreground')}>
                {percent(r.change)}
              </span>
            </button>
          )
        })}
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        Books, prices and fills come from the QRDX chain. Orders are signed by your quantum-safe account and execute in the next block (~3 min).
      </p>
    </div>
  )
}

// ── market view ───────────────────────────────────────────────────────────────

function MarketView({ api, view, trader, onSwitch }: { api: string; view: Extract<View, { base: string }>; trader: string; onSwitch: () => void }) {
  const perp = view.kind === 'perp'
  const base = `/${perp ? 'perps' : 'markets'}/${view.base}/${view.quote}`
  const market = useTradeApi<SpotMarket | PerpMarket>(api, base, 5_000)
  const live = perp || (market.data as SpotMarket | null)?.status === 'live'
  const book = useTradeApi<OrderBook>(api, market.data && live ? `${base}/orderbook?depth=20` : null, 3_000)
  const trades = useTradeApi<TradesResponse>(api, market.data && live ? `${base}/trades?limit=40` : null, 8_000)
  const account = useTradeApi<AccountResponse>(api, `/accounts/${trader}`, 6_000)
  const { ask, sheet, submissions } = useTradeSubmit()
  const [panel, setPanel] = useState<'book' | 'trades'>('book')
  const [chart, setChart] = useState(true)
  const [picked, setPicked] = useState<string | null>(null)
  const refresh = () => {
    account.refresh()
    book.refresh()
    market.refresh()
  }

  const m = market.data
  const last = m ? (perp ? (m as PerpMarket).markPrice : (m as SpotMarket).last) : null
  const flash = usePriceFlash(last)
  if (market.error && !m) return <Empty>{market.error.message}</Empty>
  if (!m) return <Empty>Loading market…</Empty>

  const spot = !perp ? (m as SpotMarket) : null
  const pm = perp ? (m as PerpMarket) : null
  const ref = Number(last ?? 1)
  const stats: { k: string; v: string; cls?: string }[] = pm
    ? [
        { k: 'Oracle', v: fmtPrice(pm.oraclePrice, ref) },
        { k: 'Funding', v: pm.fundingRate ? `${(Number(pm.fundingRate) * 100).toFixed(4)}%` : '—', cls: tone(pm.fundingRate) },
        { k: 'Open interest', v: compact(pm.openInterest) },
        { k: '24h volume', v: compact(pm.volume24h) },
      ]
    : [
        { k: '24h volume', v: compact(spot!.volume24h) },
        { k: 'Bid / ask', v: spot!.bestBid || spot!.bestAsk ? `${fmtPrice(spot!.bestBid, ref)} / ${fmtPrice(spot!.bestAsk, ref)}` : '—' },
        ...(spot!.baseUsd && !spot!.quote.symbol.startsWith('USD') ? [{ k: `${spot!.base.symbol} in USD`, v: usd(spot!.baseUsd.price) }] : []),
      ]

  return (
    <div className="space-y-2">
      {/* header */}
      <div className="rounded-xl border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSwitch} className="flex min-w-0 items-center gap-2 rounded-lg py-0.5 pr-1.5 hover:bg-accent/50">
            {spot ? <PairBadge base={spot.base} quote={spot.quote} size="md" /> : <TokenBadge asset={pm!.baseAsset ?? { symbol: pm!.base, verified: true }} size="md" />}
            <span className="min-w-0 text-left">
              <span className="flex items-center gap-1 text-[15px] font-semibold leading-tight">
                {spot ? `${spot.base.symbol}/${spot.quote.symbol}` : `${pm!.base}-${pm!.quote}`}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">{spot ? (spot.base.verified ? spot.base.name : 'Unverified token') : `Perpetual · up to ${Number(pm!.maxLeverage ?? 20)}×`}</span>
            </span>
          </button>
          <div className={cn('ml-auto rounded-md px-1.5 text-right leading-tight', flash)}>
            <div className={cn('num text-lg font-semibold', tone(m.change24h))}>{fmtPrice(last, ref)}</div>
            <div className={cn('num text-[10px]', tone(m.change24h))}>{percent(m.change24h)}</div>
          </div>
        </div>
        <div className="mt-2 flex gap-4 overflow-x-auto border-t border-border/60 pt-2 [scrollbar-width:none]">
          {stats.map((s) => (
            <div key={s.k} className="shrink-0 leading-tight">
              <div className="text-[9.5px] text-muted-foreground">{s.k}</div>
              <div className={cn('num text-[11px] font-medium', s.cls)}>{s.v}</div>
            </div>
          ))}
        </div>
        {spot && !spot.base.verified && (
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-500">
            {spot.base.symbol} is unverified. Anyone can create a token with any name; check {spot.base.address?.slice(0, 10)}… before you trade.
          </p>
        )}
      </div>

      {/* chart */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <button type="button" onClick={() => setChart((c) => !c)} className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          Chart <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', chart && 'rotate-180')} />
        </button>
        {chart && <MiniChart api={api} base={base} />}
      </div>

      {spot && spot.status !== 'live' ? (
        <div className="rounded-xl border bg-card p-3 text-[11px] text-muted-foreground">No pool exists for this pair yet, so it has no order book.</div>
      ) : (
        /* form + book */
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2">
          <div className="rounded-xl border bg-card p-2.5">
            {spot ? (
              <SpotForm api={api} market={spot} book={book.data} account={account.data} trader={trader} pickedPrice={picked} ask={ask} onDone={refresh} />
            ) : (
              <PerpForm market={pm!} book={book.data} account={account.data} pickedPrice={picked} ask={ask} onDone={refresh} />
            )}
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Tabs
              tabs={[
                { id: 'book', label: 'Book' },
                { id: 'trades', label: 'Trades' },
              ]}
              value={panel}
              onChange={setPanel}
              className="px-1"
            />
            <div className="pt-1.5">{panel === 'book' ? <MiniBook book={book.data} onPick={setPicked} /> : <TradesList data={trades.data} />}</div>
          </div>
        </div>
      )}

      <AccountTabs kind={perp ? 'perp' : 'spot'} account={account.data} marketId={m.id} ask={ask} submissions={submissions} onDone={refresh} />
      {sheet}
    </div>
  )
}
