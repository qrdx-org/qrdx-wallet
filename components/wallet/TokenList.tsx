'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface Token {
  symbol: string
  name: string
  balance: string
  value: string
  change24h: number
  icon?: string
  color: string
}

export function TokenList() {
  const tokens: Token[] = [
    {
      symbol: 'QRDX',
      name: 'QRDX Ledger',
      balance: '1,234.56',
      value: '$12,345.67',
      change24h: 5.23,
      icon: '/tokens/qrdx.png',
      color: 'from-primary to-primary/60',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      balance: '2.5',
      value: '$8,234.50',
      change24h: -2.15,
      icon: '/tokens/eth.png',
      color: 'from-blue-500 to-blue-600',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '5,000.00',
      value: '$5,000.00',
      change24h: 0.01,
      icon: '/tokens/usdc.png',
      color: 'from-blue-400 to-cyan-500',
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      balance: '0.05',
      value: '$4,123.45',
      change24h: 3.45,
      icon: '/tokens/btc.png',
      color: 'from-orange-400 to-amber-500',
    },
  ]

  return (
    <div className="space-y-1">
      {tokens.map((token, index) => (
        <div
          key={token.symbol}
          className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-all cursor-pointer group animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shadow-sm">
              <AvatarImage src={token.icon} alt={token.symbol} />
              <AvatarFallback className={`bg-gradient-to-br ${token.color} text-white text-xs font-bold`}>
                {token.symbol.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold text-sm">{token.symbol}</div>
              <div className="text-xs text-muted-foreground">{token.name}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-sm">{token.value}</div>
            <div className="flex items-center gap-1 justify-end">
              <span className="text-xs text-muted-foreground">{token.balance}</span>
              <div
                className={`flex items-center text-[11px] font-medium ${
                  token.change24h > 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {token.change24h > 0 ? (
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                )}
                {Math.abs(token.change24h).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
