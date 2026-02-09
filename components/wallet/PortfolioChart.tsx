'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createChart, ColorType, AreaSeries, CrosshairMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'

interface PortfolioChartProps {
  data?: Array<{ time: number; value: number }>
  change24h?: number
}

// Generate deterministic mock data so chart always has something to show
function generateMockData(isPositive: boolean) {
  const now = Math.floor(Date.now() / 1000)
  const baseValue = 29000
  const points = []
  for (let i = 0; i < 48; i++) {
    const time = now - (47 - i) * 1800
    const trend = isPositive ? i * 8 : -i * 5
    const noise = Math.sin(i * 0.7) * 200 + Math.cos(i * 1.3) * 150
    points.push({
      time: time as any,
      value: baseValue + trend + noise,
    })
  }
  return points
}

export function PortfolioChart({ change24h = 4.34 }: PortfolioChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const isPositive = change24h > 0
  const [ready, setReady] = useState(false)
  const [hoverData, setHoverData] = useState<{ price: string; time: string } | null>(null)

  const setupChart = useCallback(() => {
    const container = chartContainerRef.current
    if (!container) return

    // Destroy previous instance if exists
    if (chartInstanceRef.current) {
      try { chartInstanceRef.current.remove() } catch {}
      chartInstanceRef.current = null
      seriesRef.current = null
    }

    // Ensure container has real dimensions
    const rect = container.getBoundingClientRect()
    const w = Math.max(rect.width, 200)
    const h = 90

    const chart = createChart(container, {
      width: w,
      height: h,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
        fontFamily: 'Inter, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          visible: true,
          labelVisible: false,
          width: 1,
          color: 'rgba(138, 80, 255, 0.4)',
          style: 0,
        },
        horzLine: {
          visible: true,
          labelVisible: false,
          width: 1,
          color: 'rgba(138, 80, 255, 0.2)',
          style: 2,
        },
      },
      rightPriceScale: { visible: false, borderVisible: false },
      leftPriceScale: { visible: false, borderVisible: false },
      timeScale: { visible: false, borderVisible: false },
      handleScroll: false,
      handleScale: false,
      watermark: { visible: false },
    } as any)

    const lineColor = isPositive ? '#22c55e' : '#ef4444'

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: isPositive ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      bottomColor: 'transparent',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: isPositive ? '#22c55e' : '#ef4444',
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBackgroundColor: '#0a0e1a',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const mockData = generateMockData(isPositive)
    series.setData(mockData)
    chart.timeScale().fitContent()

    chartInstanceRef.current = chart
    seriesRef.current = series
    setReady(true)

    // Show price tooltip on hover
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHoverData(null)
        return
      }
      const data = param.seriesData.get(series) as any
      if (data?.value !== undefined) {
        const price = data.value.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
        })
        const date = new Date((param.time as number) * 1000)
        const time = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        setHoverData({ price, time })
      }
    })

    // Hide TradingView attribution link only (do NOT hide tables — lightweight-charts uses them internally)
    requestAnimationFrame(() => {
      const tvLinks = container.querySelectorAll('a[href*="tradingview"]')
      tvLinks.forEach((el) => {
        ;(el as HTMLElement).style.display = 'none'
      })
    })
  }, [isPositive])

  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) return

    // Use ResizeObserver to detect when the container has real dimensions,
    // then initialize the chart. This is more reliable than setTimeout in
    // extension popups where layout may be deferred.
    let initialized = false
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width } = entry.contentRect
      if (width > 0 && !initialized) {
        initialized = true
        observer.disconnect()
        setupChart()
      } else if (width > 0 && chartInstanceRef.current) {
        // Handle subsequent resizes
        chartInstanceRef.current.applyOptions({ width })
      }
    })
    observer.observe(container)

    // Fallback: if ResizeObserver doesn't fire within 200ms, force init
    const fallback = setTimeout(() => {
      if (!initialized) {
        initialized = true
        observer.disconnect()
        setupChart()
      }
    }, 200)

    return () => {
      clearTimeout(fallback)
      observer.disconnect()
      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.remove() } catch {}
        chartInstanceRef.current = null
      }
    }
  }, [setupChart])

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2">
        {isPositive ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-semibold text-green-500">
              +{change24h.toFixed(2)}%
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs font-semibold text-red-500">
              {change24h.toFixed(2)}%
            </span>
          </div>
        )}
        <span className="text-xs text-muted-foreground">24h</span>
      </div>

      <div
        className="w-full relative"
        onMouseLeave={() => setHoverData(null)}
      >
        {/* Price tooltip on hover */}
        {hoverData && (
          <div className="absolute top-0 left-0 z-10 flex items-center gap-2 pointer-events-none">
            <span className="text-sm font-semibold text-foreground">{hoverData.price}</span>
            <span className="text-[10px] text-muted-foreground">{hoverData.time}</span>
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full relative"
          style={{
            height: 90,
            minWidth: 200,
            opacity: ready ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
