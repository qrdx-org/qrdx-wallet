'use client'

/**
 * One asset across networks: its real price and chart, its market (CoinGecko, or QRDX's own
 * market), and the account's holding on each network. Send, receive and trade start here.
 */

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, ShieldAlert } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { formatFiat, formatFiatPrice } from '@/src/core/fiat'
import { formatAmount } from '@/src/core/balances'
import { fetchPriceHistory, type PriceHistoryPoint } from '@/src/core/prices'
import { tokenPriceHistory } from '@/src/core/trade/prices'
import { timeAgo } from '@/src/core/trade/format'
import { fetchMarketData, type MarketData } from '@/src/core/market'
import { isQrdxChain, type ChainConfig } from '@/src/core/chains'
import type { Asset, Holding } from '@/src/core/portfolio'
import { PortfolioChart } from '../PortfolioChart'
import { RangeTabs } from '@/components/motion/RangeTabs'
import { RollingText } from '@/components/motion/RollingText'
import { CoinLogo, NetworkLogo } from '../CoinLogo'
import { Change } from './PortfolioHome'
import { setTokenTrusted } from '@/src/core/token-trust'

const RANGES = [
  ['1D', 1],
  ['1W', 7],
  ['1M', 30],
] as const

const compact = (usd: number | null) => (usd == null ? '—' : formatFiat(usd))
const count = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n))

export function AssetPage({
  asset,
  onClose,
  onSend,
  onReceive,
  onTrade,
  readOnly,
}: {
  asset: Asset
  onClose: () => void
  onSend: (h: Holding) => void
  onReceive: (c: ChainConfig) => void
  onTrade: (h: Holding) => void
  /** A watched address: nothing to send, receive or trust from here. */
  readOnly?: boolean
}) {
  const { homeQrdxChain } = useWallet()
  const qrdx = asset.key === 'qrdx'
  const id = asset.holdings.find((h) => h.coingeckoId)?.coingeckoId
  // A QRDX verified asset CoinGecko does not price: its market on the trade API.
  const tradeAsset = asset.holdings.find((h) => h.qrdxSlug && !h.coingeckoId)
  // An unverified token (one network, one address), or one the user trusts.
  const token = asset.holdings[0]
  const trustable = !!token?.address && (!asset.listed || !!token.trusted)
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('1D')
  const [history, setHistory] = useState<{ key: string; points: PriceHistoryPoint[] } | null>(null)
  const [market, setMarket] = useState<MarketData | null>(null)
  const [choose, setChoose] = useState<'send' | 'trade' | null>(null)
  const key = `${asset.key}:${range}`

  useEffect(() => {
    let live = true
    const days = RANGES.find(([r]) => r === range)![1]
    const load = qrdx
      ? tokenPriceHistory(homeQrdxChain, 'qrdx', range)
      : id && asset.listed
        ? fetchPriceHistory(id, days)
        : tradeAsset
          ? tokenPriceHistory(tradeAsset.chain, tradeAsset.qrdxSlug!, range)
          : Promise.resolve([])
    load.then((points) => live && setHistory({ key, points })).catch(() => live && setHistory({ key, points: [] }))
    return () => {
      live = false
    }
  }, [key, qrdx, id, asset.listed, range, homeQrdxChain, tradeAsset])

  useEffect(() => {
    if (!id || !asset.listed) return
    let live = true
    fetchMarketData(id)
      .then((m) => live && setMarket(m))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, asset.listed])

  const points = history?.key === key ? history.points : null
  const price = asset.price?.usd ?? market?.price
  const holdings = asset.holdings.filter((h) => h.raw > 0n)
  const chains = [...new Map(asset.holdings.map((h) => [h.chain.id, h.chain])).values()]
  const act = (what: 'send' | 'trade') => {
    if (holdings.length === 1) return what === 'send' ? onSend(holdings[0]) : onTrade(holdings[0])
    if (holdings.length === 0 && what === 'trade' && asset.holdings[0]) return onTrade(asset.holdings[0])
    setChoose(what)
  }

  return (
    <div className="min-h-screen wallet-screen flex flex-col">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <CoinLogo symbol={asset.symbol} verified={asset.listed && !token?.trusted} size={32} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{asset.name}</h1>
            <p className="text-[10px] text-muted-foreground">
              {asset.symbol}
              {market?.rank ? ` · #${market.rank} by market cap` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-3">
        <div className="rounded-xl glass p-3">
          {price != null ? (
            <>
              <div className="text-2xl font-bold tabular-nums"><RollingText text={formatFiatPrice(price)} /></div>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                <span>
                  24h <Change pct={market?.change24h ?? asset.price?.usd_24h_change} />
                </span>
                {market?.change7d != null && (
                  <span>
                    7d <Change pct={market.change7d} />
                  </span>
                )}
                {market?.change30d != null && (
                  <span>
                    30d <Change pct={market.change30d} />
                  </span>
                )}
              </div>
              {asset.price?.stale && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  The market gives no price right now: this is its last one, from {timeAgo(asset.price.lastUpdated / 1000)}.
                </p>
              )}
              {asset.testnet && !qrdx && <p className="mt-1 text-[10px] text-muted-foreground">Test coins are shown at the real {asset.symbol}&apos;s price.</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {asset.listed ? 'No market price for this coin.' : 'No price: anyone can name a token after another coin, so the wallet prices only verified tokens and the ones you trust.'}
            </p>
          )}
          {points && points.length > 1 && <PortfolioChart data={points} change24h={market?.change24h ?? asset.price?.usd_24h_change ?? 0} changeLabel={range} />}
          {(qrdx || (id && asset.listed) || tradeAsset) && (
            <RangeTabs className="mt-1" value={range} options={RANGES.map(([r]) => r)} onChange={setRange} />
          )}
        </div>

        {!readOnly && (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['send', 'Send', ArrowUpRight, () => act('send')],
                ['receive', 'Receive', ArrowDownLeft, () => (chains.length === 1 ? onReceive(chains[0]) : onReceive(chains.find(isQrdxChain) ?? chains[0]))],
                ['trade', 'Trade', ArrowLeftRight, () => act('trade')],
              ] as const
            ).map(([k, label, Icon, run]) => (
              <button key={k} type="button" onClick={run} disabled={k === 'send' && holdings.length === 0} className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 py-3 text-xs font-medium hover:bg-accent/40 disabled:opacity-40">
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}

        {choose && (
          <section className="rounded-xl border border-border/60 p-2">
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">{choose === 'send' ? 'Send from which network?' : 'Trade the holding on which network?'}</p>
            {holdings.map((h) => (
              <button key={`${h.chain.id}:${h.credential ?? ''}`} type="button" onClick={() => (setChoose(null), choose === 'send' ? onSend(h) : onTrade(h))} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-xs hover:bg-accent/40">
                <NetworkLogo chain={h.chain} size={22} />
                <span className="flex-1">{h.chain.name}</span>
                <span className="tabular-nums">{formatAmount(h.raw, h.decimals)}</span>
              </button>
            ))}
          </section>
        )}

        {trustable && !readOnly && (
          <section className="rounded-xl border border-border/60 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-3.5 w-3.5" /> {token.trusted ? 'Trusted by you' : 'Unverified token'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {token.trusted
                ? `You trust ${token.address.slice(0, 6)}…${token.address.slice(-4)} on ${token.chain.name}: it is listed and counted like a verified token${id ? `, at ${asset.symbol}'s market price` : ''}.`
                : `Not on ${token.chain.name}'s verified list. Anyone can create a token called ${asset.symbol}; trust it only if you know where it came from.`}
            </p>
            <button
              type="button"
              onClick={() => (setTokenTrusted(token.chain.id, token.address, !token.trusted), onClose())}
              className="mt-2 w-full rounded-lg border border-border/60 py-2 text-xs font-medium hover:bg-accent/40"
            >
              {token.trusted ? 'Stop trusting it' : 'Trust this token'}
            </button>
          </section>
        )}

        <section className="rounded-xl glass p-3">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your {asset.symbol}</h2>
          {asset.holdings.map((h) => (
            <div key={`${h.chain.id}:${h.address}:${h.credential ?? ''}`} className="flex items-center gap-2.5 py-1.5 text-xs">
              <NetworkLogo chain={h.chain} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block">{h.chain.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {h.credential === 'pq' ? 'Quantum-safe address' : h.credential === 'classic' ? 'Classic address' : h.address ? `Token ${h.address.slice(0, 6)}…${h.address.slice(-4)}` : 'Network coin'}
                  {h.chain.isTestnet ? ' · test network' : ''}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {formatAmount(h.raw, h.decimals)} {h.symbol}
                {h.usd ? <span className="block text-[10px] text-muted-foreground">{formatFiat(h.usd)}</span> : null}
              </span>
            </div>
          ))}
        </section>

        {market && (
          <section className="rounded-xl glass p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Market</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {(
                [
                  ['Market cap', compact(market.marketCap)],
                  ['Volume (24h)', compact(market.volume24h)],
                  ['Fully diluted', compact(market.fdv)],
                  ['24h range', market.low24h != null && market.high24h != null ? `${formatFiatPrice(market.low24h)} – ${formatFiatPrice(market.high24h)}` : '—'],
                  ['Circulating', count(market.circulating)],
                  ['Max supply', market.maxSupply ? count(market.maxSupply) : 'None'],
                  ['All-time high', market.ath != null ? formatFiatPrice(market.ath) : '—'],
                  ['From the high', market.ath && market.price ? `${(((market.price - market.ath) / market.ath) * 100).toFixed(1)}%` : '—'],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] text-muted-foreground">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[9px] text-muted-foreground">Market data: CoinGecko</p>
          </section>
        )}
      </div>
    </div>
  )
}
