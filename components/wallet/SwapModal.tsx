'use client'

import { useState, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowDownUp,
  ChevronDown,
  Loader2,
  Info,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { formatUsd } from '@/src/core/prices'

interface SwapModalProps {
  onClose: () => void
}

interface TokenOption {
  symbol: string
  name: string
  balance: string
  color: string
  price: number
}

const TOKEN_COLORS: Record<string, string> = {
  QRDX: 'from-primary to-primary/60',
  ETH: 'from-blue-500 to-blue-600',
  USDC: 'from-blue-400 to-cyan-500',
  USDT: 'from-green-400 to-emerald-500',
  DAI: 'from-yellow-400 to-amber-500',
  WBTC: 'from-orange-400 to-amber-500',
  WETH: 'from-blue-500 to-blue-600',
  LINK: 'from-blue-600 to-indigo-600',
  UNI: 'from-pink-400 to-pink-600',
  AAVE: 'from-sky-400 to-indigo-500',
  BNB: 'from-yellow-500 to-yellow-600',
  AVAX: 'from-red-500 to-red-600',
  ARB: 'from-blue-500 to-sky-600',
  OP: 'from-red-500 to-rose-600',
  POL: 'from-purple-500 to-violet-600',
}

export function SwapModal({ onClose }: SwapModalProps) {
  const { balances, prices, estimateGas, activeChain } = useWallet()

  // Build token options from real balances + prices
  const TOKENS: TokenOption[] = useMemo(() => {
    return balances.map((b) => {
      const bal = parseFloat(b.formattedBalance) || 0
      const price = prices.get(b.symbol.toUpperCase())
      return {
        symbol: b.symbol,
        name: b.name ?? b.symbol,
        balance: bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }),
        color: TOKEN_COLORS[b.symbol] ?? 'from-gray-500 to-gray-600',
        price: price?.usd ?? 0,
      }
    }).filter(t => t.price > 0 || t.symbol === activeChain.nativeCurrency?.symbol) // only show tokens with known prices + native
  }, [balances, prices, activeChain])
  const [fromToken, setFromToken] = useState<TokenOption | null>(null)
  const [toToken, setToToken] = useState<TokenOption | null>(null)
  const [fromAmount, setFromAmount] = useState('')
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [gasEstimateStr, setGasEstimateStr] = useState<string | null>(null)

  // Auto-set initial tokens when TOKENS becomes available
  const from = fromToken ?? TOKENS[0] ?? { symbol: '?', name: '', balance: '0', color: 'from-gray-500 to-gray-600', price: 0 }
  const to = toToken ?? TOKENS[1] ?? TOKENS[0] ?? { symbol: '?', name: '', balance: '0', color: 'from-gray-500 to-gray-600', price: 0 }

  const toAmount = fromAmount && from.price > 0 && to.price > 0
    ? ((parseFloat(fromAmount) * from.price) / to.price).toFixed(6)
    : ''

  const rate = from.price > 0 && to.price > 0
    ? (from.price / to.price).toFixed(6)
    : '—'

  const handleSwapTokens = () => {
    const tmp = from
    setFromToken(to)
    setToToken(tmp)
    setFromAmount('')
  }

  const handleSwap = () => {
    if (!fromAmount) return
    setSwapping(true)
    setTimeout(() => setSwapping(false), 2000)
  }

  const TokenPicker = ({
    onSelect,
    exclude,
  }: {
    onSelect: (t: TokenOption) => void
    exclude: string
  }) => (
    <Card className="glass border-border/50 mb-2 animate-fade-in">
      <CardContent className="p-1">
        {TOKENS.filter((t) => t.symbol !== exclude).map((token) => (
          <button
            key={token.symbol}
            onClick={() => onSelect(token)}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-accent/30 transition-all text-left"
          >
            <div
              className={`h-7 w-7 rounded-md bg-gradient-to-br ${token.color} flex items-center justify-center`}
            >
              <span className="text-white text-[9px] font-bold">{token.symbol.slice(0, 2)}</span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{token.symbol}</div>
              <div className="text-[10px] text-muted-foreground">{token.name}</div>
            </div>
            <div className="text-[11px] text-muted-foreground">{token.balance}</div>
          </button>
        ))}
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent/50"
              onClick={onClose}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold">Swap</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-1">
        {/* From */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">You pay</span>
              <span className="text-[10px] text-muted-foreground">
                Balance: {from.balance}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowFromPicker(!showFromPicker); setShowToPicker(false) }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 transition-colors shrink-0"
              >
                <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${from.color} flex items-center justify-center`}>
                  <span className="text-white text-[9px] font-bold">{from.symbol.slice(0, 2)}</span>
                </div>
                <span className="text-sm font-semibold">{from.symbol}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                className="flex-1 text-right bg-transparent text-xl font-semibold placeholder:text-muted-foreground/30 focus:outline-none min-w-0"
              />
            </div>
          </CardContent>
        </Card>

        {showFromPicker && (
          <TokenPicker
            exclude={to.symbol}
            onSelect={(t) => { setFromToken(t); setShowFromPicker(false) }}
          />
        )}

        {/* Swap direction button */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={handleSwapTokens}
            className="h-9 w-9 rounded-xl bg-background border-2 border-border/50 flex items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm"
          >
            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* To */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">You receive</span>
              <span className="text-[10px] text-muted-foreground">
                Balance: {to.balance}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowToPicker(!showToPicker); setShowFromPicker(false) }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 transition-colors shrink-0"
              >
                <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${to.color} flex items-center justify-center`}>
                  <span className="text-white text-[9px] font-bold">{to.symbol.slice(0, 2)}</span>
                </div>
                <span className="text-sm font-semibold">{to.symbol}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className="flex-1 text-right text-xl font-semibold text-muted-foreground min-w-0 truncate">
                {toAmount || '0.00'}
              </div>
            </div>
          </CardContent>
        </Card>

        {showToPicker && (
          <TokenPicker
            exclude={from.symbol}
            onSelect={(t) => { setToToken(t); setShowToPicker(false) }}
          />
        )}

        {/* Rate & details */}
        <Card className="glass border-border/50 !mt-3">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-medium">1 {from.symbol} = {rate} {to.symbol}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Slippage tolerance</span>
              <span className="font-medium">0.5%</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Network fee</span>
              <span className="font-medium">~$4.20</span>
            </div>
          </CardContent>
        </Card>

        {/* Swap button */}
        <Button
          onClick={handleSwap}
          disabled={!fromAmount || swapping}
          className="w-full h-12 font-semibold text-base bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 disabled:opacity-40 disabled:shadow-none !mt-3"
        >
          {swapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ArrowDownUp className="h-5 w-5 mr-2" />
              Swap
            </>
          )}
        </Button>

        {/* Info */}
        <div className="flex items-start gap-2 px-1 pt-1">
          <Info className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground/50">
            Quotes are estimated and may change. Swaps are routed through QRDX DEX aggregator for the best available rate.
          </p>
        </div>
      </div>
    </div>
  )
}
