'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createChart, ColorType, AreaSeries, CrosshairMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'

interface PortfolioChartProps {
  data?: Array<{ time: number; value: number }>
  change24h?: number
}

// Generate realistic mock data with random walk and volatility
function generateMockData(isPositive: boolean) {
  const now = Math.floor(Date.now() / 1000)
  const baseValue = 29000
  const points = []
  
  // Seed random number generator for consistency (based on current day)
  const seed = Math.floor(now / 86400)
  const random = (n: number) => {
    const x = Math.sin(seed + n) * 10000
    return x - Math.floor(x)
  }
  
  let currentValue = baseValue
  const trendStrength = isPositive ? 12 : -8
  
  for (let i = 0; i < 48; i++) {
    const time = now - (47 - i) * 1800
    
    // Random walk component (each step depends on previous)
    const randomWalk = (random(i * 3) - 0.5) * 250
    
    // Trend component (overall direction)
    const trend = (i / 48) * trendStrength * 40
    
    // Volatility spikes (occasional larger movements)
    const volatilitySpike = random(i * 7) > 0.85 ? (random(i * 11) - 0.5) * 600 : 0
    
    // Mean reversion (pull towards base + trend)
    const targetValue = baseValue + trend
    const meanReversion = (targetValue - currentValue) * 0.15
    
    // Multi-frequency noise for more natural movement
    const noise1 = Math.sin(i * 0.4 + random(i)) * 120 * random(i * 2)
    const noise2 = Math.cos(i * 1.1 + random(i * 5)) * 80 * random(i * 4)
    const noise3 = Math.sin(i * 2.3 + random(i * 9)) * 50 * random(i * 6)
    
    // Combine all components
    currentValue += randomWalk + meanReversion + volatilitySpike * 0.3
    const finalValue = currentValue + noise1 + noise2 + noise3
    
    points.push({
      time: time as any,
      value: Math.max(finalValue, baseValue * 0.85), // Floor to prevent going too low
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
