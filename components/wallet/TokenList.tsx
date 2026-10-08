'use client'

import { useEffect, useMemo, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TrendingUp, TrendingDown, ChevronRight, Loader2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { formatUsd } from '@/src/core/prices'
import { tokenImages } from '@/src/core/profiles'
import { formatAmount, mergeCredentialBalances } from '@/src/core/balances'

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
  /** Which of the account's two addresses hold it (QRDX): the classic 0x one, the post-quantum one, or both. */
  heldIn?: 'classic' | 'pq' | 'both'
}

// Gradient colors for known tokens
const TOKEN_COLORS: Record<string, string> = {
  QRDX: 'from-primary to-primary/60',
  ETH: 'from-primary to-primary/70',
  USDC: 'from-primary to-primary/70',
  USDT: 'from-primary to-primary/70',
  BTC: 'from-primary to-primary/70',
  WBTC: 'from-primary to-primary/70',
  DAI: 'from-primary to-primary/70',
  WETH: 'from-primary to-primary/70',
  LINK: 'from-primary to-primary/70',
  UNI: 'from-primary to-primary/70',
  AAVE: 'from-primary to-primary/70',
  MATIC: 'from-primary to-primary/70',
  POL: 'from-primary to-primary/70',
  BNB: 'from-primary to-primary/70',
  AVAX: 'from-red-500 to-red-600',
  FTM: 'from-primary to-primary/70',
  ARB: 'from-primary to-primary/70',
  OP: 'from-primary to-primary/70',
}

/**
 * The account's holdings with live prices: both credentials' balances summed per
 * token (on QRDX, exchange tokens live in the post-quantum account), the native
 * coin always, other tokens only when held.
 */
export function useTokenList(): Token[] {
  const { balances, pqBalances, prices, activeChain } = useWallet()
  // Images token creators published (docs/PROFILES.md in qrdx-trade), by contract address.
  const [images, setImages] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const ctrl = new AbortController()
    tokenImages(activeChain, ctrl.signal).then((m) => !ctrl.signal.aborted && setImages(m))
    return () => ctrl.abort()
  }, [activeChain])

  return useMemo(() => {
    if (balances.length === 0 && pqBalances.length === 0) return []

    return mergeCredentialBalances(balances, pqBalances).map((b) => {
      const bal = Number(b.formattedBalance) || 0
      const price = prices.get(b.symbol.toUpperCase())
      const usdValue = price ? bal * price.usd : 0
      const change24h = price?.usd_24h_change ?? 0

      return {
        symbol: b.symbol,
        name: b.name ?? b.symbol,
        balance: formatAmount(b.rawBalance, b.decimals),
        balanceNum: bal,
        value: usdValue > 0 ? formatUsd(usdValue) : '',
        valueNum: usdValue,
        change24h,
        icon: b.address ? images.get(b.address.toLowerCase()) : undefined,
        color: TOKEN_COLORS[b.symbol] ?? 'from-primary/80 to-primary/50',
        contractAddress: b.address,
        decimals: b.decimals,
        heldIn: b.classicRaw > 0n && b.pqRaw > 0n ? 'both' : b.pqRaw > 0n ? 'pq' : b.classicRaw > 0n ? 'classic' : undefined,
      } satisfies Token
    }).sort((a, b) => b.valueNum - a.valueNum || b.balanceNum - a.balanceNum)
  }, [balances, pqBalances, prices, images])
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

  // Pinned tokens first, then the largest other holdings, four rows at least:
  // pinning QRDX alone must not hide every other token the account holds.
  const pinned = pinnedSymbols
    .map((s) => tokens.find((t) => t.symbol === s))
    .filter(Boolean) as Token[]
  const rest = tokens.filter((t) => !pinned.includes(t))
  const displayTokens = [...pinned, ...rest.slice(0, Math.max(0, 4 - pinned.length))]

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
          key={token.contractAddress || token.symbol}
          className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-all cursor-pointer group animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shadow-sm">
              <AvatarImage src={token.icon} alt={token.symbol} referrerPolicy="no-referrer" className="logo-mono object-cover" />
              <AvatarFallback className={`bg-gradient-to-br ${token.color} text-primary-foreground text-xs font-bold`}>
                {token.symbol.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold text-sm">{token.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {token.name}
                {token.heldIn === 'pq' ? ' · PQ address' : token.heldIn === 'classic' ? ' · 0x address' : ''}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="num font-semibold text-sm">{token.value || `${token.balance} ${token.symbol}`}</div>
            <div className="flex items-center gap-1 justify-end">
              {token.value && <span className="num text-xs text-muted-foreground">{token.balance}</span>}
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
