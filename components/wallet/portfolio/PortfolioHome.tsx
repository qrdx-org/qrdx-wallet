'use client'

/**
 * Home across every network: the total, each asset with its real price and the networks it
 * is on, QRDX first. Pickers start Send, Receive and Swap from an asset or a network.
 */

import { Tip } from '@/components/motion/Tip'
import { Loading, Spinner } from '@/components/motion/Loading'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatFiat, formatFiatPrice } from '@/src/core/fiat'
import { formatAmount } from '@/src/core/balances'
import { assetAmount, type Asset, type Holding, type Portfolio } from '@/src/core/portfolio'
import { chainFamily, isQrdxChain, type ChainConfig } from '@/src/core/chains'
import { CoinLogo, NetworkLogo } from '../CoinLogo'
import { PortfolioChart } from '../PortfolioChart'
import { RangeTabs } from '@/components/motion/RangeTabs'
import { RollingText } from '@/components/motion/RollingText'
import { BubblePanel } from '@/components/gfx/Bubble'
import { useValueHistory, type HistorySubject } from './useValueHistory'
import type { ValueRange } from '@/src/core/portfolio-history'
import { onTrustChange, setShowUnverified, showUnverified } from '@/src/core/token-trust'

/** The "show unverified tokens" preference, live. */
export function useShowUnverified(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(onTrustChange, showUnverified, () => false), setShowUnverified]
}

/** Shown with the rest: verified or trusted, worth something, QRDX itself, or every token when the user asks. */
const inMainList = (a: Asset, all: boolean) => all || a.listed || a.usd > 0 || a.key === 'qrdx'

const VALUE_RANGES: ValueRange[] = ['1D', '1W', '1M', '1Y']

export function Change({ pct, className }: { pct: number | null | undefined; className?: string }) {
  if (pct == null || !Number.isFinite(pct)) return null
  const up = pct >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-green-500' : 'text-red-500', className)}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  )
}

/** The total across networks, the day's change, and value by network. */
export function PortfolioSummary({
  portfolio,
  loading,
  onRefresh,
  visible,
  subject,
}: {
  portfolio: Portfolio | null
  loading: boolean
  onRefresh: () => void
  visible: boolean
  /** A watched address instead of the open account. */
  subject?: HistorySubject
}) {
  const [range, setRange] = useState<ValueRange>('1D')
  const { history, loading: historyLoading } = useValueHistory(portfolio, range, subject)
  const first = history?.points[0]?.price ?? 0
  const last = history?.points[history.points.length - 1]?.price ?? 0
  const rangeChange = first > 0 ? ((last - first) / first) * 100 : 0
  const byNetwork = useMemo(() => {
    const m = new Map<string, { chain: ChainConfig; usd: number }>()
    for (const a of portfolio?.assets ?? [])
      for (const h of a.holdings)
        if (h.usd) m.set(h.chain.id, { chain: h.chain, usd: (m.get(h.chain.id)?.usd ?? 0) + h.usd })
    // Dust (under a cent) is not worth a chip.
    return [...m.values()].filter((n) => n.usd >= 0.01).sort((a, b) => b.usd - a.usd)
  }, [portfolio])
  const pct = portfolio && portfolio.usd - portfolio.change24hUsd > 0 ? (portfolio.change24hUsd / (portfolio.usd - portfolio.change24hUsd)) * 100 : null

  return (
    <BubblePanel className="glass glass-clear relative overflow-hidden rounded-lg text-card-foreground shadow-sm" bubbleClassName="relative text-card-foreground">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" />
      <CardContent className="relative p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">All networks</span>
          <Tip content="Refresh balances" side="left">
            <button type="button" onClick={onRefresh} aria-label="Refresh balances" className="rounded-lg p-1.5 hover:bg-accent/50">
              {loading ? <Spinner size={14} className="text-muted-foreground" /> : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </Tip>
        </div>
        <div className={cn('mb-1 text-3xl font-bold tracking-tight tabular-nums', !visible && 'privacy-blur')}><RollingText text={portfolio ? formatFiat(portfolio.usd) : '…'} /></div>
        <div className={cn('flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground', !visible && 'privacy-blur')}>
          {portfolio && portfolio.change24hUsd !== 0 && (
            <span className="text-foreground/80">
              {portfolio.change24hUsd >= 0 ? '+' : '−'}
              {formatFiat(Math.abs(portfolio.change24hUsd))} <Change pct={pct} /> today
            </span>
          )}
        </div>
        {byNetwork.length > 0 && (
          <div className={cn('mt-3 flex flex-wrap gap-1.5', !visible && 'privacy-blur')}>
            {byNetwork.slice(0, 5).map(({ chain, usd }) => (
              <span key={chain.id} className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                <NetworkLogo chain={chain} size={12} /> {chain.shortName} {formatFiat(usd)}
              </span>
            ))}
          </div>
        )}
        {portfolio && portfolio.usd > 0 && (
          <div className={cn(!visible && 'privacy-blur')}>
            {history ? (
              <PortfolioChart data={history.points} change24h={rangeChange} changeLabel={range} bleed />
            ) : (
              <div className="flex h-[120px] items-center justify-center text-[11px] text-muted-foreground">
                {historyLoading ? <Loading label="Replaying your transactions" /> : 'Replaying your transactions…'}
              </div>
            )}
            <RangeTabs className="mt-1" value={range} options={VALUE_RANGES} onChange={setRange} />
            {history && (history.partial.length > 0 || history.truncated.length > 0 || history.unpricedHistory.length > 0) && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {history.partial.length > 0 && <>Transactions on {history.partial.map((c) => c.shortName).join(', ')} could not be read: those holdings are drawn as they are today. </>}
                {history.truncated.length > 0 && <>Older transactions on {history.truncated.map((c) => c.shortName).join(', ')} were not all read: the start of the line is approximate. </>}
                {history.unpricedHistory.length > 0 && <>No price history for {history.unpricedHistory.join(', ')}: drawn at today&apos;s price.</>}
              </p>
            )}
          </div>
        )}
        {portfolio && portfolio.failed.length > 0 && (
          <p className="mt-2 text-[10px] text-amber-500">
            Could not reach {portfolio.failed.map((c) => c.name).join(', ')}: those balances are missing, not zero.
          </p>
        )}
      </CardContent>
    </BubblePanel>
  )
}

/** Where an asset is: its network, or how many. */
function networksLabel(a: Asset): string {
  const chains = [...new Map(a.holdings.map((h) => [h.chain.id, h.chain])).values()]
  return chains.length === 1 ? chains[0].shortName : `${chains.length} networks`
}

function AssetRow({ asset, onOpen, visible }: { asset: Asset; onOpen: (a: Asset) => void; visible: boolean }) {
  const h = asset.holdings[0]
  const single = new Set(asset.holdings.map((x) => x.chain.id)).size === 1
  const amount = assetAmount(asset)
  const value = asset.usd
  return (
    <button type="button" onClick={() => onOpen(asset)} className="press flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-accent/30">
      <CoinLogo symbol={asset.symbol} verified={asset.listed && !h.trusted} size={36} network={single && h.address ? h.chain : undefined} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{asset.symbol}</span>
          {asset.testnet && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-500">Test</span>}
          {!asset.listed && <span className="rounded bg-foreground/10 px-1 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">Unverified</span>}
          {h.trusted && <span className="rounded bg-foreground/10 px-1 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">Trusted</span>}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {asset.price ? (
            <>
              <span className="tabular-nums">{formatFiatPrice(asset.price.usd)}</span>
              {asset.price.stale ? <span>last price</span> : <Change pct={asset.price.usd_24h_change} />}
            </>
          ) : (
            <span className="truncate">{networksLabel(asset)}</span>
          )}
        </span>
      </span>
      <span className={cn('max-w-[48%] shrink-0 text-right', !visible && 'privacy-blur')}>
        <span className="block text-sm font-semibold tabular-nums">{value > 0 ? formatFiat(value) : amount ? `${formatAmount(asset.holdings.reduce((s, x) => s + x.raw, 0n), h.decimals)}` : '—'}</span>
        <span className="block truncate text-[10px] text-muted-foreground tabular-nums">
          {value > 0 && amount ? `${formatAmount(asset.holdings.reduce((s, x) => s + x.raw, 0n), h.decimals)} ${asset.symbol} · ` : ''}
          {asset.price ? networksLabel(asset) : ''}
        </span>
      </span>
    </button>
  )
}

/**
 * Assets, QRDX first. Unverified tokens (airdropped, possibly spam) are folded away unless they
 * have value, the user trusts them, or the user shows every token ("Show in my list").
 */
export function AssetList({ portfolio, onOpen, visible }: { portfolio: Portfolio | null; onOpen: (a: Asset) => void; visible: boolean }) {
  const [showUnlisted, setShowUnlisted] = useState(false)
  const [showAll, setShowAll] = useShowUnverified()
  if (!portfolio) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loading label="Reading every network" />
      </div>
    )
  }
  const main = portfolio.assets.filter((a) => inMainList(a, showAll))
  const unlisted = portfolio.assets.filter((a) => !main.includes(a))
  return (
    <div className="stagger space-y-0.5">
      {main.map((a) => (
        <AssetRow key={a.key} asset={a} onOpen={onOpen} visible={visible} />
      ))}
      {main.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nothing held yet. Receive on any network to start.</p>}
      {unlisted.length > 0 && (
        <>
          <div className="flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] text-muted-foreground">
            <button type="button" onClick={() => setShowUnlisted((v) => !v)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left hover:text-foreground">
              <span>
                {unlisted.length} unverified token{unlisted.length > 1 ? 's' : ''}
                <span className="block text-[10px]">Anyone can create or send these. Open one to trust it.</span>
              </span>
              {showUnlisted ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            </button>
            <button type="button" onClick={() => setShowAll(true)} className="shrink-0 rounded-lg border border-border/60 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/50">
              Show in my list
            </button>
          </div>
          {showUnlisted && unlisted.map((a) => <AssetRow key={a.key} asset={a} onOpen={onOpen} visible={visible} />)}
        </>
      )}
      {showAll && portfolio.assets.some((a) => !inMainList(a, false)) && (
        <button type="button" onClick={() => setShowAll(false)} className="w-full rounded-xl px-3 py-2 text-left text-[10px] text-muted-foreground hover:bg-accent/30">
          Unverified tokens are shown. <span className="font-medium text-foreground underline-offset-2 hover:underline">Fold them away</span>
        </button>
      )}
    </div>
  )
}

function PickerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in sm:items-center" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl glass-strong p-3 pb-safe animate-sheet-in sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-accent/50">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Pick one holding (an asset on one network): what Send starts from. Every held token, unverified ones last. */
export function HoldingPicker({ title, portfolio, onPick, onClose }: { title: string; portfolio: Portfolio | null; onPick: (h: Holding) => void; onClose: () => void }) {
  const [showAll] = useShowUnverified()
  const held = (portfolio?.assets ?? []).flatMap((a) => a.holdings.map((h) => ({ h, main: inMainList(a, showAll) }))).filter(({ h }) => h.raw > 0n)
  const main = held.filter((x) => x.main).map((x) => x.h)
  const other = held.filter((x) => !x.main).map((x) => x.h)
  const row = (h: Holding) => (
    <button
      key={`${h.chain.id}:${h.address}:${h.credential ?? ''}`}
      type="button"
      onClick={() => onPick(h)}
      className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-accent/40"
    >
      <CoinLogo symbol={h.symbol} verified={h.listed && !h.trusted} size={32} network={h.chain} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{h.symbol}</span>
        <span className="block text-[10px] text-muted-foreground">
          {h.chain.name}
          {h.credential === 'pq' ? ' · quantum-safe address' : h.credential === 'classic' ? ' · classic address' : ''}
          {!h.listed ? ' · unverified' : h.trusted ? ' · trusted by you' : ''}
        </span>
      </span>
      <span className="text-right text-xs tabular-nums">
        {formatAmount(h.raw, h.decimals)}
        {h.usd ? <span className="block text-[10px] text-muted-foreground">{formatFiat(h.usd)}</span> : null}
      </span>
    </button>
  )
  return (
    <PickerShell title={title} onClose={onClose}>
      {!portfolio ? (
        <p className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
          <Loading label="Reading every network" />
        </p>
      ) : held.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">Nothing to send yet.</p>
      ) : (
        <>
          {main.map(row)}
          {other.length > 0 && (
            <>
              <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unverified</p>
              {other.map(row)}
            </>
          )}
        </>
      )}
    </PickerShell>
  )
}

/** Pick the network to receive on: QRDX first, then one row for every EVM network, Bitcoin, Solana. */
export function ReceiveNetworkPicker({ chains, qrdx, showTestnets, onPick, onClose }: { chains: ChainConfig[]; qrdx: ChainConfig; showTestnets?: boolean; onPick: (c: ChainConfig) => void; onClose: () => void }) {
  const evm = chains.filter((c) => c.isEvm && !isQrdxChain(c) && !c.isTestnet && !c.notLive)
  // Bitcoin and Solana have their own addresses per network: test ones too, when shown.
  const native = chains.filter((c) => chainFamily(c) !== 'evm' && (showTestnets || !c.isTestnet))
  const row = (c: ChainConfig, label: string, note: string) => (
    <button key={c.id + label} type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-accent/40">
      <NetworkLogo chain={c} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  )
  return (
    <PickerShell title="Receive on" onClose={onClose}>
      {row(qrdx, qrdx.name, 'Your quantum-safe address: QRDX, its tokens, trading')}
      {evm.length > 0 &&
        row(
          evm[0],
          'Ethereum and EVM networks',
          `One 0x address on ${evm.map((c) => c.shortName).slice(0, 6).join(', ')} and ${Math.max(0, evm.length - 6)} more`
        )}
      {native.map((c) => row(c, c.name, `Your ${c.name} address`))}
    </PickerShell>
  )
}
