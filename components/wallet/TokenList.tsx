'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface Token {
  symbol: string
  name: string
  balance: string
  value: string
  change24h: number
  icon?: string
}

export function TokenList() {
  const tokens: Token[] = [
    {
      symbol: 'QRDX',
      name: 'Quardex',
      balance: '1,234.56',
      value: '$12,345.67',
      change24h: 5.23,
      icon: '/tokens/qrdx.png'
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      balance: '2.5',
      value: '$8,234.50',
      change24h: -2.15,
      icon: '/tokens/eth.png'
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '5,000.00',
      value: '$5,000.00',
      change24h: 0.01,
      icon: '/tokens/usdc.png'
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      balance: '0.05',
      value: '$4,123.45',
      change24h: 3.45,
      icon: '/tokens/btc.png'
    },
  ]

  return (
    <Card>
      <div className="divide-y divide-border">
        {tokens.map((token) => (
          <div
            key={token.symbol}
            className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={token.icon} alt={token.symbol} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {token.symbol.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{token.symbol}</div>
                <div className="text-sm text-muted-foreground">{token.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{token.value}</div>
              <div className="flex items-center gap-1 justify-end">
                <span className="text-sm text-muted-foreground">{token.balance}</span>
                <div
                  className={`flex items-center text-xs ${
                    token.change24h > 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {token.change24h > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(token.change24h).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
