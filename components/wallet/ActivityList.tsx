'use client'

import { ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils'

interface Activity {
  id: string
  type: 'send' | 'receive' | 'swap'
  token: string
  amount: string
  value: string
  timestamp: number
  status: 'completed' | 'pending' | 'failed'
  address?: string
}

export function ActivityList() {
  const activities: Activity[] = [
    {
      id: '1',
      type: 'receive',
      token: 'QRDX',
      amount: '+123.45',
      value: '$1,234.56',
      timestamp: Date.now() - 1000 * 60 * 5,
      status: 'completed',
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
    },
    {
      id: '2',
      type: 'send',
      token: 'ETH',
      amount: '-0.5',
      value: '$1,646.90',
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
      status: 'completed',
      address: '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7'
    },
    {
      id: '3',
      type: 'swap',
      token: 'USDC → QRDX',
      amount: '500',
      value: '$500.00',
      timestamp: Date.now() - 1000 * 60 * 60 * 24,
      status: 'completed',
    },
    {
      id: '4',
      type: 'receive',
      token: 'BTC',
      amount: '+0.01',
      value: '$824.69',
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
      status: 'completed',
      address: '0x1234567890abcdef1234567890abcdef12345678'
    },
  ]

  const getIcon = (type: Activity['type']) => {
    switch (type) {
      case 'send':
        return <ArrowUpRight className="h-4 w-4" />
      case 'receive':
        return <ArrowDownLeft className="h-4 w-4" />
      case 'swap':
        return <RefreshCw className="h-4 w-4" />
    }
  }

  const getIconStyle = (type: Activity['type']) => {
    switch (type) {
      case 'send':
        return 'text-red-500 bg-red-500/10'
      case 'receive':
        return 'text-green-500 bg-green-500/10'
      case 'swap':
        return 'text-primary bg-primary/10'
    }
  }

  const getAmountColor = (type: Activity['type']) => {
    switch (type) {
      case 'send':
        return 'text-red-500'
      case 'receive':
        return 'text-green-500'
      case 'swap':
        return 'text-foreground'
    }
  }

  return (
    <div className="space-y-1">
      <div className="px-1 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Recent Activity</h3>
      </div>
      {activities.map((activity, index) => (
        <div
          key={activity.id}
          className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-all cursor-pointer group animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${getIconStyle(activity.type)}`}>
              {getIcon(activity.type)}
            </div>
            <div>
              <div className="font-medium text-sm capitalize">{activity.type}</div>
              <div className="text-xs text-muted-foreground">
                {formatTimestamp(activity.timestamp)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-semibold text-sm ${getAmountColor(activity.type)}`}>
              {activity.amount} {activity.token}
            </div>
            <div className="text-xs text-muted-foreground">{activity.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
