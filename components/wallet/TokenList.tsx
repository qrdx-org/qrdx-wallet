'use client'

import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TrendingUp, TrendingDown, ChevronRight, Loader2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { formatUsd } from '@/src/core/prices'

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
  contractAddress?: string
  decimals: number
}

// Gradient colors for known tokens
const TOKEN_COLORS: Record<string, string> = {
  QRDX: 'from-primary to-primary/60',
  ETH: 'from-blue-500 to-blue-600',
  USDC: 'from-blue-400 to-cyan-500',
  USDT: 'from-green-400 to-emerald-500',
  BTC: 'from-orange-400 to-amber-500',
  WBTC: 'from-orange-400 to-amber-500',
  DAI: 'from-yellow-400 to-amber-500',
  WETH: 'from-blue-500 to-blue-600',
  LINK: 'from-blue-600 to-indigo-600',
  UNI: 'from-pink-400 to-pink-600',
  AAVE: 'from-sky-400 to-indigo-500',
  MATIC: 'from-purple-500 to-violet-600',
  POL: 'from-purple-500 to-violet-600',
  BNB: 'from-yellow-500 to-yellow-600',
  AVAX: 'from-red-500 to-red-600',
  FTM: 'from-blue-500 to-cyan-500',
  ARB: 'from-blue-500 to-sky-600',
  OP: 'from-red-500 to-rose-600',
}

/**
 * Build the token list from real wallet balances and live prices.
 * This replaces the old hardcoded ALL_TOKENS array.
 */
export function useTokenList(): Token[] {
  const { balances, prices } = useWallet()

  return useMemo(() => {
    if (balances.length === 0) return []

    return balances.map((b) => {
      const bal = parseFloat(b.formattedBalance) || 0
      const price = prices.get(b.symbol.toUpperCase())
      const usdValue = price ? bal * price.usd : 0
      const change24h = price?.usd_24h_change ?? 0

      return {
        symbol: b.symbol,
        name: b.name ?? b.symbol,
        balance: bal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
        balanceNum: bal,
        value: usdValue > 0 ? formatUsd(usdValue) : '',
        valueNum: usdValue,
        change24h,
        icon: undefined,
        color: TOKEN_COLORS[b.symbol] ?? 'from-gray-500 to-gray-600',
        contractAddress: b.address,
        decimals: b.decimals,
      }
    }).sort((a, b) => b.valueNum - a.valueNum) // sort by value descending
  }, [balances, prices])
}

// Keep ALL_TOKENS export for backwards compatibility with AllTokens component
// but it now reads from the hook
export const ALL_TOKENS: Token[] = []

interface TokenListProps {
  pinnedSymbols: string[]
  onViewAll: () => void
}

export function TokenList({ pinnedSymbols, onViewAll }: TokenListProps) {
  const tokens = useTokenList()
  const { balancesLoading } = useWallet()

  // Show pinned tokens if any, otherwise top 4 by value
  const pinned = pinnedSymbols
    .map((s) => tokens.find((t) => t.symbol === s))
    .filter(Boolean) as Token[]

  const displayTokens = pinned.length > 0 ? pinned : tokens.slice(0, 4)

  if (balancesLoading && tokens.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading tokens...</span>
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No tokens found</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Connect to a network to view balances</p>
      </div>
    )
  }

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
            <div className="font-semibold text-sm">{token.value || token.balance}</div>
            <div className="flex items-center gap-1 justify-end">
              <span className="text-xs text-muted-foreground">{token.balance}</span>
              {token.change24h !== 0 && (
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
              )}
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
