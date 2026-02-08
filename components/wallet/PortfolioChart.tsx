'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PortfolioChartProps {
  data?: Array<{ time: number; value: number }>
  change24h?: number
}

export function PortfolioChart({ change24h = 4.34 }: PortfolioChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const isPositive = change24h > 0
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    if (!chartContainerRef.current) return

    let chart: any = null

    const initChart = async () => {
      try {
        const { createChart, ColorType, LineStyle } = await import('lightweight-charts')

        if (!chartContainerRef.current) return

        const container = chartContainerRef.current

        chart = createChart(container, {
          width: container.clientWidth,
          height: 100,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: 'transparent',
            fontFamily: 'Inter, sans-serif',
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          crosshair: {
            vertLine: {
              visible: false,
              labelVisible: false,
            },
            horzLine: {
              visible: false,
              labelVisible: false,
            },
          },
          rightPriceScale: { visible: false },
          timeScale: {
            visible: false,
            borderVisible: false,
          },
          handleScroll: false,
          handleScale: false,
        })

        const lineColor = isPositive ? '#22c55e' : '#ef4444'
        const topColor = isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
        const bottomColor = isPositive ? 'rgba(34, 197, 94, 0)' : 'rgba(239, 68, 68, 0)'

        const areaSeries = chart.addAreaSeries({
          lineColor,
          topColor,
          bottomColor,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })

        // Generate mock data - 48 data points over 24 hours
        const now = Math.floor(Date.now() / 1000)
        const baseValue = 29000
        const mockData = Array.from({ length: 48 }, (_, i) => {
          const time = now - (47 - i) * 1800
          const trend = isPositive ? i * 8 : -i * 5
          const noise = Math.sin(i * 0.7) * 200 + Math.cos(i * 1.3) * 150
          return {
            time: time as any,
            value: baseValue + trend + noise,
          }
        })

        areaSeries.setData(mockData)
        chart.timeScale().fitContent()
        chartRef.current = chart
        setChartReady(true)
      } catch (error) {
        console.error('Failed to init chart:', error)
      }
    }

    initChart()

    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chart) {
        chart.remove()
      }
    }
  }, [isPositive])

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
        ref={chartContainerRef}
        className="w-full h-[100px] relative"
        style={{ opacity: chartReady ? 1 : 0, transition: 'opacity 0.3s ease' }}
      />
    </div>
  )
}
