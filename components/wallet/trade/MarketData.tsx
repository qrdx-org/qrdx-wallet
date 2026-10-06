'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { CandlestickChart, LineChart } from 'lucide-react'
import { clock, compact, fixed, price as fmtPrice, priceDecimals, size as fmtSize } from '@/src/core/trade/format'
import type { CandleSeries, OrderBook, TradesResponse } from '@/src/core/trade/types'
import { Empty, useTradeApi } from './kit'
import { cn } from '@/lib/utils'

const INTERVALS = ['15m', '1h', '4h', '1d'] as const

/** Read an HSL theme variable as rgba(), which the chart parser accepts. */
function cssColor(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return `rgba(128,128,128,${alpha})`
  const m = /([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(getComputedStyle(document.documentElement).getPropertyValue(name))
  if (!m) return `rgba(128,128,128,${alpha})`
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return `rgba(${f(0)},${f(8)},${f(4)},${alpha})`
}

/** Candles from the trade API (the market's own history, recorded pool prices, or the labelled index). */
export function MiniChart({ api, base }: { api: string; base: string }) {
  const [interval, setInterval_] = useState<(typeof INTERVALS)[number]>('1h')
  const [kind, setKind] = useState<'candles' | 'line'>('candles')
  const { data, error } = useTradeApi<CandleSeries>(api, `${base}/candles?interval=${interval}&limit=200`, 30_000)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const line = useRef<ISeriesApi<'Area'> | null>(null)
  const vol = useRef<ISeriesApi<'Histogram'> | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssColor('--muted-foreground'), fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: cssColor('--border', 0.5) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    })
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: cssColor('--bid'),
      downColor: cssColor('--ask'),
      wickUpColor: cssColor('--bid'),
      wickDownColor: cssColor('--ask'),
      borderVisible: false,
    })
    line.current = c.addSeries(AreaSeries, {
      lineColor: cssColor('--foreground'),
      topColor: cssColor('--foreground', 0.14),
      bottomColor: cssColor('--foreground', 0),
      lineWidth: 2,
      visible: false,
    })
    vol.current = c.addSeries(HistogramSeries, { priceScaleId: 'v', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('v').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [resolvedTheme])

  useEffect(() => {
    candles.current?.applyOptions({ visible: kind === 'candles' })
    line.current?.applyOptions({ visible: kind === 'line' })
  }, [kind, resolvedTheme])

  useEffect(() => {
    if (!data || !candles.current || !line.current || !vol.current) return
    const rows = data.candles
    const dp = priceDecimals(Number(rows[rows.length - 1]?.c ?? 1))
    const fmt = { type: 'price' as const, precision: dp, minMove: Math.pow(10, -dp) }
    candles.current.applyOptions({ priceFormat: fmt })
    line.current.applyOptions({ priceFormat: fmt })
    candles.current.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, open: +r.o, high: +r.h, low: +r.l, close: +r.c })))
    line.current.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, value: +r.c })))
    vol.current.setData(rows.map((r) => ({ time: r.t as UTCTimestamp, value: +r.v, color: +r.c >= +r.o ? cssColor('--bid', 0.3) : cssColor('--ask', 0.3) })))
    const ts = chart.current?.timeScale()
    if (rows.length >= 50) ts?.fitContent()
    else {
      ts?.applyOptions({ barSpacing: 8 })
      ts?.scrollToRealTime()
    }
  }, [data, resolvedTheme])

  return (
    <div>
      <div className="flex items-center gap-0.5 px-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval_(i)}
            className={cn('rounded-md px-2 py-1 text-[11px] font-medium', i === interval ? 'bg-accent text-foreground' : 'text-muted-foreground')}
          >
            {i}
          </button>
        ))}
        <span className="mx-1 h-3.5 w-px bg-border" />
        <button type="button" aria-label="Candles" onClick={() => setKind('candles')} className={cn('rounded-md p-1', kind === 'candles' ? 'bg-accent' : 'text-muted-foreground')}>
          <CandlestickChart className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Line" onClick={() => setKind('line')} className={cn('rounded-md p-1', kind === 'line' ? 'bg-accent' : 'text-muted-foreground')}>
          <LineChart className="h-3.5 w-3.5" />
        </button>
        <span className="ml-auto truncate pl-2 text-[10px] text-muted-foreground">{data?.kind !== 'none' ? data?.label : ''}</span>
      </div>
      <div className="relative h-[210px]">
        <div ref={box} className="absolute inset-0" />
        {data?.kind === 'none' && <Overlay>No price history yet.</Overlay>}
        {error && !data && <Overlay>Chart unavailable.</Overlay>}
      </div>
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">{children}</div>
}

/** A compact book: asks over bids, cumulative depth bars; tap a level to use its price. */
export function MiniBook({ book, rows = 8, onPick }: { book: OrderBook | null; rows?: number; onPick?: (p: string) => void }) {
  const asks = useMemo(() => (book?.asks ?? []).slice(0, rows).reverse(), [book, rows])
  const bids = useMemo(() => (book?.bids ?? []).slice(0, rows), [book, rows])
  const ref = Number(book?.mid ?? book?.bestBid ?? book?.bestAsk ?? 1)
  const max = Math.max(Number(book?.asks[Math.min(rows, book.asks.length) - 1]?.[2] ?? 0), Number(book?.bids[Math.min(rows, book.bids.length) - 1]?.[2] ?? 0), 1e-18)
  if (!book) return <div className="space-y-1 p-2">{Array.from({ length: rows * 2 }, (_, i) => <div key={i} className="h-3 animate-pulse rounded bg-muted/60" />)}</div>
  const Row = ({ l, side }: { l: [string, string, string]; side: 'bid' | 'ask' }) => (
    <button type="button" onClick={() => onPick?.(l[0])} className="relative grid h-[18px] w-full grid-cols-2 items-center px-2 text-[10.5px] num hover:bg-accent/60">
      <span className={cn('absolute inset-y-px right-0', side === 'bid' ? 'bg-bid/10' : 'bg-ask/10')} style={{ width: `${Math.min(100, (Number(l[2]) / max) * 100)}%` }} />
      <span className={cn('relative text-left font-medium', side === 'bid' ? 'text-bid' : 'text-ask')}>{fmtPrice(l[0], ref)}</span>
      <span className="relative text-right">{fmtSize(l[1])}</span>
    </button>
  )
  return (
    <div>
      <div className="grid grid-cols-2 px-2 pb-1 text-[10px] text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>
      <div className="flex min-h-[144px] flex-col justify-end">{asks.length ? asks.map((l) => <Row key={`a${l[0]}`} l={l} side="ask" />) : <Empty>No asks</Empty>}</div>
      <div className="my-0.5 flex items-center justify-between border-y border-border/60 bg-muted/40 px-2 py-1">
        <span className="num text-[12px] font-semibold">{book.mid ? fmtPrice(book.mid, ref) : '—'}</span>
        <span className="num text-[9.5px] text-muted-foreground">{book.spreadBps ? `${fixed(String(Number(book.spreadBps) / 100), 2)}%` : ''}</span>
      </div>
      <div className="min-h-[144px]">{bids.length ? bids.map((l) => <Row key={`b${l[0]}`} l={l} side="bid" />) : <Empty>No bids</Empty>}</div>
    </div>
  )
}

export function TradesList({ data }: { data: TradesResponse | null }) {
  if (!data) return <Empty>Loading…</Empty>
  if (data.available === false) return <Empty>This network&apos;s node does not publish individual trades. The chart shows pool prices recorded every minute.</Empty>
  if (!data.trades.length) return <Empty>No trades yet.</Empty>
  const ref = Number(data.trades[0].price)
  return (
    <div>
      <div className="grid grid-cols-3 px-3 pb-1 text-[10px] text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {data.trades.slice(0, 30).map((t) => (
        <div key={t.id} className="num grid h-[19px] grid-cols-3 items-center px-3 text-[11px]">
          <span className={t.side === 'buy' ? 'text-bid' : 'text-ask'}>{fmtPrice(t.price, ref)}</span>
          <span className="text-right">{fmtSize(t.size)}</span>
          <span className="text-right text-muted-foreground">{clock(t.time)}</span>
        </div>
      ))}
    </div>
  )
}

export { compact }
