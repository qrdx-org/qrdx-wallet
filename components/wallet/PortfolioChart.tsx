'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface PortfolioChartProps {
  data?: Array<{ time: number; value: number }>
  change24h?: number
}

export function PortfolioChart({ change24h = 4.34 }: PortfolioChartProps) {
  const isPositive = change24h > 0

  // Simple mock chart data
  const chartPoints = Array.from({ length: 24 }, (_, i) => ({
    x: (i / 23) * 100,
    y: 50 + Math.sin(i * 0.5) * 20 + (isPositive ? i * 0.5 : -i * 0.5),
  }))

  const pathD = chartPoints
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500" />
        )}
        <span className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{change24h.toFixed(2)}% (24h)
        </span>
      </div>
      
      <div className="w-full h-24 relative">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor={isPositive ? '#10b981' : '#ef4444'}
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor={isPositive ? '#10b981' : '#ef4444'}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          
          <path
            d={`${pathD} L 100 100 L 0 100 Z`}
            fill="url(#chartGradient)"
          />
          
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? '#10b981' : '#ef4444'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  )
}
