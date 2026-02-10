'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

export interface Token {
  symbol: string
  name: string
  balance: string
  balanceNum: number
  value: string
  valueNum: number
  change24h: number
  icon?: string
  color: string
}

export const ALL_TOKENS: Token[] = [
  {
    symbol: 'QRDX', name: 'QRDX Ledger', balance: '1,234.56', balanceNum: 1234.56,
    value: '$12,345.67', valueNum: 12345.67, change24h: 5.23, icon: '/tokens/qrdx.png',
    color: 'from-primary to-primary/60',
  },
  {
    symbol: 'ETH', name: 'Ethereum', balance: '2.5000', balanceNum: 2.5,
    value: '$8,234.50', valueNum: 8234.50, change24h: -2.15, icon: '/tokens/eth.png',
    color: 'from-blue-500 to-blue-600',
  },
  {
    symbol: 'USDC', name: 'USD Coin', balance: '5,000.00', balanceNum: 5000,
    value: '$5,000.00', valueNum: 5000, change24h: 0.01, icon: '/tokens/usdc.png',
    color: 'from-blue-400 to-cyan-500',
  },
  {
    symbol: 'BTC', name: 'Bitcoin', balance: '0.0500', balanceNum: 0.05,
    value: '$4,123.45', valueNum: 4123.45, change24h: 3.45, icon: '/tokens/btc.png',
    color: 'from-orange-400 to-amber-500',
  },
  {
    symbol: 'DAI', name: 'Dai Stablecoin', balance: '250.00', balanceNum: 250,
    value: '$250.00', valueNum: 250, change24h: 0.02, icon: '/tokens/dai.png',
    color: 'from-yellow-400 to-amber-500',
  },
  {
    symbol: 'LINK', name: 'Chainlink', balance: '42.80', balanceNum: 42.8,
    value: '$612.04', valueNum: 612.04, change24h: 1.87, icon: '/tokens/link.png',
    color: 'from-blue-600 to-indigo-600',
  },
  {
    symbol: 'UNI', name: 'Uniswap', balance: '15.00', balanceNum: 15,
    value: '$112.50', valueNum: 112.50, change24h: -0.93, icon: '/tokens/uni.png',
    color: 'from-pink-400 to-pink-600',
  },
  {
    symbol: 'MATIC', name: 'Polygon', balance: '890.00', balanceNum: 890,
    value: '$534.00', valueNum: 534, change24h: 4.12, icon: '/tokens/matic.png',
    color: 'from-purple-500 to-violet-600',
  },
  {
    symbol: 'AAVE', name: 'Aave', balance: '3.20', balanceNum: 3.2,
    value: '$384.00', valueNum: 384, change24h: 2.56, icon: '/tokens/aave.png',
    color: 'from-sky-400 to-indigo-500',
  },
  {
    symbol: 'SOL', name: 'Solana', balance: '8.50', balanceNum: 8.5,
    value: '$1,275.00', valueNum: 1275, change24h: -3.21, icon: '/tokens/sol.png',
    color: 'from-fuchsia-500 to-violet-600',
  },
  {
    symbol: 'DOGE', name: 'Dogecoin', balance: '10,000', balanceNum: 10000,
    value: '$800.00', valueNum: 800, change24h: 6.78, icon: '/tokens/doge.png',
    color: 'from-yellow-500 to-amber-600',
  },
  {
    symbol: 'ARB', name: 'Arbitrum', balance: '200.00', balanceNum: 200,
    value: '$164.00', valueNum: 164, change24h: -1.45, icon: '/tokens/arb.png',
    color: 'from-blue-500 to-sky-600',
  },
  {
    symbol: 'OP', name: 'Optimism', balance: '150.00', balanceNum: 150,
    value: '$225.00', valueNum: 225, change24h: 0.88, icon: '/tokens/op.png',
    color: 'from-red-500 to-rose-600',
  },
  {
    symbol: 'CRV', name: 'Curve DAO', balance: '500.00', balanceNum: 500,
    value: '$215.00', valueNum: 215, change24h: -0.32, icon: '/tokens/crv.png',
    color: 'from-yellow-600 to-red-500',
  },
]

interface TokenListProps {
  pinnedSymbols: string[]
  onViewAll: () => void
}

export function TokenList({ pinnedSymbols, onViewAll }: TokenListProps) {
  const pinned = pinnedSymbols
    .map((s) => ALL_TOKENS.find((t) => t.symbol === s))
    .filter(Boolean) as Token[]

  const displayTokens = pinned.length > 0 ? pinned : ALL_TOKENS.slice(0, 4)

  return (
    <div className="space-y-1">
      {displayTokens.map((token, index) => (
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
                  token.change24h > 0 ? 'text-green-500' : token.change24h < 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              >
                {token.change24h > 0 ? (
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                ) : token.change24h < 0 ? (
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                ) : null}
                {Math.abs(token.change24h).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* View All */}
      <button
        onClick={onViewAll}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold text-primary hover:bg-primary/5 transition-colors"
      >
        View All Tokens
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
