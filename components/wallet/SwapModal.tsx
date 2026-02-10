'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowDownUp,
  ChevronDown,
  Loader2,
  Info,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

const TOKENS: TokenOption[] = [
  { symbol: 'QRDX', name: 'QRDX Ledger', balance: '1,234.56', color: 'from-primary to-primary/60', price: 10.0 },
  { symbol: 'ETH', name: 'Ethereum', balance: '2.5', color: 'from-blue-500 to-blue-600', price: 3293.80 },
  { symbol: 'USDC', name: 'USD Coin', balance: '5,000.00', color: 'from-blue-400 to-cyan-500', price: 1.0 },
  { symbol: 'BTC', name: 'Bitcoin', balance: '0.05', color: 'from-orange-400 to-amber-500', price: 82469.0 },
]

export function SwapModal({ onClose }: SwapModalProps) {
  const [fromToken, setFromToken] = useState(TOKENS[0])
  const [toToken, setToToken] = useState(TOKENS[1])
  const [fromAmount, setFromAmount] = useState('')
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const toAmount = fromAmount
    ? ((parseFloat(fromAmount) * fromToken.price) / toToken.price).toFixed(6)
    : ''

  const rate = (fromToken.price / toToken.price).toFixed(6)

  const handleSwapTokens = () => {
    const tmp = fromToken
    setFromToken(toToken)
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
                Balance: {fromToken.balance}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowFromPicker(!showFromPicker); setShowToPicker(false) }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 transition-colors shrink-0"
              >
                <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${fromToken.color} flex items-center justify-center`}>
                  <span className="text-white text-[9px] font-bold">{fromToken.symbol.slice(0, 2)}</span>
                </div>
                <span className="text-sm font-semibold">{fromToken.symbol}</span>
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
            exclude={toToken.symbol}
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
                Balance: {toToken.balance}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowToPicker(!showToPicker); setShowFromPicker(false) }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 hover:border-primary/30 transition-colors shrink-0"
              >
                <div className={`h-6 w-6 rounded-md bg-gradient-to-br ${toToken.color} flex items-center justify-center`}>
                  <span className="text-white text-[9px] font-bold">{toToken.symbol.slice(0, 2)}</span>
                </div>
                <span className="text-sm font-semibold">{toToken.symbol}</span>
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
            exclude={fromToken.symbol}
            onSelect={(t) => { setToToken(t); setShowToPicker(false) }}
          />
        )}

        {/* Rate & details */}
        <Card className="glass border-border/50 !mt-3">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-medium">1 {fromToken.symbol} = {rate} {toToken.symbol}</span>
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
