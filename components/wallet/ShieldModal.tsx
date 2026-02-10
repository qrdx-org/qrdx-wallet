'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Info,
  Lock,
  CheckCircle2,
  Coins,
  Clock,
  Zap,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ShieldModalProps {
  onClose: () => void
}

interface ShieldableAsset {
  symbol: string
  name: string
  shieldedSymbol: string
  balance: string
  balanceNum: number
  value: string
  color: string
}

const SHIELDABLE_ASSETS: ShieldableAsset[] = [
  { symbol: 'ETH', name: 'Ethereum', shieldedSymbol: 'qETH', balance: '2.5000', balanceNum: 2.5, value: '$8,234.50', color: 'from-blue-500 to-blue-600' },
  { symbol: 'BTC', name: 'Bitcoin', shieldedSymbol: 'qBTC', balance: '0.0500', balanceNum: 0.05, value: '$4,123.45', color: 'from-orange-400 to-amber-500' },
  { symbol: 'USDC', name: 'USD Coin', shieldedSymbol: 'qUSDC', balance: '5,000.00', balanceNum: 5000, value: '$5,000.00', color: 'from-blue-400 to-cyan-500' },
  { symbol: 'DAI', name: 'Dai Stablecoin', shieldedSymbol: 'qDAI', balance: '250.00', balanceNum: 250, value: '$250.00', color: 'from-yellow-400 to-amber-500' },
  { symbol: 'LINK', name: 'Chainlink', shieldedSymbol: 'qLINK', balance: '42.80', balanceNum: 42.8, value: '$612.04', color: 'from-blue-600 to-indigo-600' },
]

type Step = 'select-asset' | 'configure' | 'confirm'

const SHIELDING_STEPS = [
  { icon: Lock, label: 'Lock' },
  { icon: ShieldCheck, label: 'Verify' },
  { icon: Coins, label: 'Mint' },
]

export function ShieldModal({ onClose }: ShieldModalProps) {
  const [step, setStep] = useState<Step>('select-asset')
  const [selectedAsset, setSelectedAsset] = useState<ShieldableAsset | null>(null)
  const [amount, setAmount] = useState('')
  const [shielding, setShielding] = useState(false)
  const [activeShieldStep, setActiveShieldStep] = useState(-1)

  const handleSelectAsset = (asset: ShieldableAsset) => {
    setSelectedAsset(asset)
    setStep('configure')
  }

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('configure')
    } else if (step === 'configure') {
      setStep('select-asset')
      setAmount('')
    } else {
      onClose()
    }
  }

  const handleMax = () => {
    if (selectedAsset) {
      setAmount(selectedAsset.balance.replace(/,/g, ''))
    }
  }

  const bridgeFee = amount
    ? (parseFloat(amount.replace(/,/g, '') || '0') * 0.001)
    : 0

  const receiveAmount = amount
    ? (parseFloat(amount.replace(/,/g, '') || '0') - bridgeFee)
    : 0

  const handleShield = () => {
    setStep('confirm')
    setShielding(true)
    setActiveShieldStep(0)
    // Simulate the 3-step shielding process
    setTimeout(() => setActiveShieldStep(1), 1500)
    setTimeout(() => setActiveShieldStep(2), 3000)
    setTimeout(() => {
      setActiveShieldStep(3)
      setShielding(false)
    }, 4500)
  }

  /* ─── Step 1: Select Asset ─── */
  if (step === 'select-asset') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-cyan-500/5 flex flex-col">
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
              <div className="flex-1">
                <h1 className="text-base font-semibold">Shield Assets</h1>
                <p className="text-[10px] text-muted-foreground">Bridge to quantum-resistant QRDX Chain</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Shield className="h-3 w-3 text-cyan-400" />
                <span className="text-[9px] font-semibold text-cyan-400">PQ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-cyan-400/90 leading-relaxed">
              <span className="font-semibold">Asset Shielding</span> converts your tokens into quantum-resistant equivalents on QRDX Chain using CRYSTALS-Dilithium signatures. Your assets are backed 1:1.
            </div>
          </div>
        </div>

        {/* Asset list */}
        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1 py-2">
            Available to Shield
          </div>
          {SHIELDABLE_ASSETS.map((asset) => (
            <button
              key={asset.symbol}
              onClick={() => handleSelectAsset(asset)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent/30 active:bg-accent/50 transition-all group text-left"
            >
              {/* Asset icon */}
              <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${asset.color} flex items-center justify-center shadow-lg shadow-black/10 group-hover:scale-105 transition-transform`}>
                <span className="text-white text-xs font-bold">{asset.symbol.slice(0, 2)}</span>
              </div>

              {/* From → To */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{asset.symbol}</span>
                  <ArrowRight className="h-3 w-3 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">{asset.shieldedSymbol}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {asset.balance} {asset.symbol} available
                </div>
              </div>

              {/* Value */}
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{asset.value}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom stats */}
        <div className="px-4 pb-4">
          <div className="glass border border-border/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Bridge Fee</div>
                <div className="text-[11px] font-semibold">0.1%</div>
              </div>
              <div className="w-px h-6 bg-border/50" />
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Backing</div>
                <div className="text-[11px] font-semibold">1:1</div>
              </div>
              <div className="w-px h-6 bg-border/50" />
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Unshield</div>
                <div className="text-[11px] font-semibold">7 days</div>
              </div>
            </div>
            <Shield className="h-4 w-4 text-cyan-400/40" />
          </div>
        </div>
      </div>
    )
  }

  const asset = selectedAsset!

  /* ─── Step 3: Confirm / Shielding Progress ─── */
  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-cyan-500/5 flex flex-col">
        {/* Header */}
        <div className="glass-strong sticky top-0 z-20">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              {!shielding && activeShieldStep < 3 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-accent/50"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <h1 className="text-base font-semibold">
                {activeShieldStep >= 3 ? 'Shielding Complete' : 'Shielding in Progress'}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-6">
          {/* Progress animation */}
          <div className="relative mb-8">
            <div className={`h-20 w-20 rounded-2xl flex items-center justify-center ${activeShieldStep >= 3 ? 'bg-gradient-to-br from-cyan-500 to-teal-600' : 'bg-gradient-to-br from-cyan-500/20 to-teal-600/20 border border-cyan-500/30'}`}>
              {activeShieldStep >= 3 ? (
                <ShieldCheck className="h-10 w-10 text-white" />
              ) : (
                <Shield className="h-10 w-10 text-cyan-400 animate-pulse" />
              )}
            </div>
          </div>

          {/* Steps */}
          <div className="w-full max-w-[260px] space-y-3 mb-8">
            {SHIELDING_STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = i === activeShieldStep
              const isDone = i < activeShieldStep
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                    isDone
                      ? 'bg-cyan-500/10 border border-cyan-500/20'
                      : isActive
                      ? 'bg-cyan-500/5 border border-cyan-500/30 animate-pulse'
                      : 'bg-muted/30 border border-transparent'
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                    isDone ? 'bg-cyan-500 text-white' : isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-muted/50 text-muted-foreground/40'
                  }`}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${isDone || isActive ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                      {i === 0 && `Lock ${asset.symbol} on Ethereum`}
                      {i === 1 && 'Verify with PQ signatures'}
                      {i === 2 && `Mint ${asset.shieldedSymbol} on QRDX`}
                    </div>
                  </div>
                  {isDone && <CheckCircle2 className="h-4 w-4 text-cyan-400" />}
                  {isActive && <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />}
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="w-full glass border border-border/50 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Shielding</span>
              <span className="text-[11px] font-semibold">{amount} {asset.symbol}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Bridge fee (0.1%)</span>
              <span className="text-[11px] font-medium">-{bridgeFee.toFixed(6)} {asset.symbol}</span>
            </div>
            <div className="w-full h-px bg-border/50" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">You receive</span>
              <span className="text-sm font-bold text-cyan-400">{receiveAmount.toFixed(6)} {asset.shieldedSymbol}</span>
            </div>
          </div>

          {/* Done button */}
          {activeShieldStep >= 3 && (
            <Button
              onClick={onClose}
              className="w-full h-12 mt-6 font-semibold text-base rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 shadow-lg shadow-cyan-500/25 transition-all"
            >
              <ShieldCheck className="h-5 w-5 mr-2" />
              Done
            </Button>
          )}
        </div>
      </div>
    )
  }

  /* ─── Step 2: Configure Amount ─── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-cyan-500/5 flex flex-col">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent/50"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2.5 flex-1">
              <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${asset.color} flex items-center justify-center shadow-md`}>
                <span className="text-white text-xs font-bold">{asset.symbol.slice(0, 2)}</span>
              </div>
              <div>
                <h1 className="text-base font-semibold">Shield {asset.symbol}</h1>
                <p className="text-[10px] text-muted-foreground">{asset.symbol} → {asset.shieldedSymbol}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto">
        {/* Conversion visual */}
        <div className="flex items-center gap-2">
          {/* From */}
          <button
            onClick={() => setStep('select-asset')}
            className="flex-1 rounded-xl border border-border/50 bg-background/50 p-3 group cursor-pointer hover:border-cyan-500/30 transition-all"
          >
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mb-2">From</div>
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${asset.color} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <span className="text-white text-[10px] font-bold">{asset.symbol.slice(0, 2)}</span>
              </div>
              <div>
                <div className="text-sm font-semibold">{asset.symbol}</div>
                <div className="text-[10px] text-muted-foreground">{asset.name}</div>
              </div>
            </div>
          </button>

          {/* Arrow */}
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <ArrowRight className="h-4 w-4 text-cyan-400" />
          </div>

          {/* To */}
          <div className="flex-1 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="text-[9px] text-cyan-400 uppercase tracking-wider font-medium mb-2">To (Shielded)</div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-cyan-400">{asset.shieldedSymbol}</div>
                <div className="text-[10px] text-muted-foreground">QRDX Chain</div>
              </div>
            </div>
          </div>
        </div>

        {/* Amount */}
        <Card className="glass border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Amount to Shield</span>
              <button
                onClick={handleMax}
                className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-md hover:bg-cyan-500/20 transition-colors"
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-background/60 border border-border/50 rounded-xl px-3 py-2.5 text-xl font-bold placeholder:text-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/30 transition-all pr-20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${asset.color} flex items-center justify-center`}>
                  <span className="text-white text-[8px] font-bold">{asset.symbol.slice(0, 2)}</span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground">{asset.symbol}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground">
                Balance: {asset.balance} {asset.symbol}
              </span>
              {amount && (
                <span className="text-[10px] text-muted-foreground">
                  ≈ ${(parseFloat(amount.replace(/,/g, '') || '0') * (parseFloat(asset.value.replace(/[$,]/g, '')) / asset.balanceNum)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transaction details */}
        <div className="glass border border-border/50 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Coins className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Bridge fee (0.1%)</span>
            </div>
            <span className="text-[11px] font-medium">
              {amount ? `-${bridgeFee.toFixed(6)} ${asset.symbol}` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">You receive</span>
            </div>
            <span className="text-[11px] font-semibold text-cyan-400">
              {amount ? `${receiveAmount.toFixed(6)} ${asset.shieldedSymbol}` : '—'}
            </span>
          </div>
          <div className="w-full h-px bg-border/30" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Network</span>
            </div>
            <span className="text-[11px] font-medium">Ethereum → QRDX Chain</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Est. time</span>
            </div>
            <span className="text-[11px] font-medium">~2 minutes</span>
          </div>
        </div>

        {/* Unshielding notice */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <Clock className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <span className="text-[10px] text-cyan-400/90 leading-relaxed">
            Shielded assets can be unshielded back to their original chain with a <span className="font-semibold">7-day withdrawal period</span> for security verification.
          </span>
        </div>
      </div>

      {/* Sticky shield button */}
      <div className="sticky bottom-0 p-4 glass-strong">
        <Button
          onClick={handleShield}
          disabled={!amount || parseFloat(amount.replace(/,/g, '') || '0') <= 0}
          className="w-full h-12 font-semibold text-base rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:shadow-none transition-all"
        >
          <Shield className="h-5 w-5 mr-2" />
          Shield {asset.symbol} → {asset.shieldedSymbol}
        </Button>
      </div>
    </div>
  )
}
