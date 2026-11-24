'use client'

import { useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { PriceHistoryPoint } from '@/src/core/prices'
import { formatFiatPrice } from '@/src/core/fiat'
import { cn } from '@/lib/utils'
import { ditherChart, type ChartFrame } from '@/components/gfx/dither-chart'
import { RollingText } from '@/components/motion/RollingText'

const HEIGHT = 112

interface PortfolioChartProps {
  data?: PriceHistoryPoint[]
  change24h?: number
  /** What the change covers (the token page's chart shows ranges). */
  changeLabel?: string
  /** Run the chart out to the card's edges (it sits in a card with 1rem of padding). */
  bleed?: boolean
}

/**
 * Renders real price history only.
 *
 * An earlier version synthesised a plausible-looking random walk around $29,000
 * whenever `data` was empty. In a wallet that is not a harmless placeholder: it
 * renders an invented portfolio trend indistinguishable from a real one, on a
 * screen people use to make financial decisions. When there is no price history
 * — a new chain, an unpriced token, an offline oracle — the honest answer is to
 * say so.
 *
 * The line is drawn in the backdrop's dots (components/gfx/dither-chart.ts). Scrubbing it shows
 * that moment's price, time and change since the range opened, in place of the range's change.
 */
export function PortfolioChart({ data, change24h = 0, changeLabel = '24h', bleed = false }: PortfolioChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const endRef = useRef<HTMLSpanElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const priceRef = useRef<HTMLSpanElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const deltaRef = useRef<HTMLSpanElement>(null)
  const chart = useRef<ReturnType<typeof ditherChart> | null>(null)
  const dataRef = useRef(data)
  const shownIndex = useRef(-1)

  const hasData = !!data && data.length > 0
  const isPositive = change24h > 0

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!hasData || !wrap || !canvas) return

    // Positions and text that follow every frame are set here, not through React state.
    const onFrame = ({ end, scrub }: ChartFrame) => {
      const dot = endRef.current
      if (dot) {
        dot.style.opacity = end ? String(1 - (scrub?.alpha ?? 0)) : '0'
        if (end) dot.style.transform = `translate(${end[0]}px, ${end[1]}px)`
      }
      const a = scrub?.alpha ?? 0
      if (summaryRef.current) summaryRef.current.style.opacity = String(1 - a)
      if (readoutRef.current) readoutRef.current.style.opacity = String(a)
      const points = dataRef.current
      if (!scrub || !points?.length || scrub.index === shownIndex.current) return
      shownIndex.current = scrub.index
      const p = points[Math.min(scrub.index, points.length - 1)]
      const span = points.length > 1 ? points[points.length - 1].timestamp - points[0].timestamp : 0
      const date = new Date(p.timestamp)
      // In the chosen currency; with the date when the chart spans more than a day.
      if (priceRef.current) priceRef.current.textContent = formatFiatPrice(p.price)
      if (timeRef.current)
        timeRef.current.textContent =
          span > 36 * 3_600_000
            ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
            : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      if (deltaRef.current) {
        const open = points[0].price
        const pct = open > 0 ? ((p.price - open) / open) * 100 : 0
        deltaRef.current.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
        deltaRef.current.className = cn('tabular-nums', Math.abs(pct) < 0.005 ? 'text-muted-foreground' : pct > 0 ? 'text-green-500' : 'text-red-500')
      }
    }

    const c = ditherChart(canvas, { height: HEIGHT, onFrame })
    chart.current = c
    c.resize(wrap.clientWidth)
    const observer = new ResizeObserver(([entry]) => entry && c.resize(entry.contentRect.width))
    observer.observe(wrap)
    return () => {
      observer.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [hasData])

  useEffect(() => {
    dataRef.current = data
    shownIndex.current = -1
    if (data?.length) chart.current?.setData(data.map((p) => p.price))
  }, [data])

  if (!hasData) {
    return (
      <div className="mt-2">
        <div
          className="w-full rounded-lg border border-dashed border-border/60 flex items-center justify-center"
          style={{ height: 90 }}
        >
          <p className="text-[11px] text-muted-foreground">
            No price history for this network yet
          </p>
        </div>
      </div>
    )
  }

  const flat = Math.abs(change24h) < 0.005
  const scrubAt = (e: React.PointerEvent) => chart.current?.scrub(e.clientX - e.currentTarget.getBoundingClientRect().left)
  // A mouse leaves by leaving; a finger by lifting.
  const release = (e: React.PointerEvent) => e.pointerType !== 'mouse' && chart.current?.scrub(null)

  return (
    <div className="mt-2 space-y-2">
      <div className="relative h-6">
        <div ref={summaryRef} className="absolute inset-0 flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors duration-500',
              flat ? 'bg-muted text-muted-foreground' : isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
            )}
          >
            {!flat && (isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
            <RollingText className="text-xs font-semibold" text={`${isPositive ? '+' : ''}${(flat ? 0 : change24h).toFixed(2)}%`} />
          </div>
          <span className="text-xs text-muted-foreground">{changeLabel}</span>
        </div>
        <div ref={readoutRef} className="pointer-events-none absolute inset-0 flex items-center gap-2 text-xs opacity-0" aria-hidden>
          <span ref={priceRef} className="text-sm font-semibold tabular-nums text-foreground" />
          <span ref={deltaRef} className="tabular-nums" />
          <span ref={timeRef} className="text-[10px] text-muted-foreground" />
        </div>
      </div>

      <div
        ref={wrapRef}
        className={cn('relative cursor-crosshair touch-pan-y select-none', bleed && '-mx-4')}
        style={{ height: HEIGHT }}
        onPointerDown={scrubAt}
        onPointerMove={scrubAt}
        onPointerUp={release}
        onPointerCancel={() => chart.current?.scrub(null)}
        onPointerLeave={() => chart.current?.scrub(null)}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* The newest price, live: a dot that breathes. */}
        <span ref={endRef} className="chart-live pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-300" aria-hidden />
      </div>
    </div>
  )
}
