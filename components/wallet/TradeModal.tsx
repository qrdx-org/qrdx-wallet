'use client'

import { ArrowLeft, TrendingUp, BarChart3, Layers, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TradeModalProps {
  onClose: () => void
}

const PAIRS = [
  { base: 'QRDX', quote: 'USDC', price: '$10.00', change: '+5.2%', positive: true },
  { base: 'qETH', quote: 'QRDX', price: '329.38', change: '+2.1%', positive: true },
  { base: 'qBTC', quote: 'QRDX', price: '8,246.90', change: '-0.8%', positive: false },
  { base: 'qUSDC', quote: 'QRDX', price: '0.10', change: '+0.0%', positive: true },
]

export function TradeModal({ onClose }: TradeModalProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-rose-500/5">
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
              <h1 className="text-base font-semibold">Trade</h1>
              <p className="text-[10px] text-muted-foreground">QRDX Protocol DEX</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <TrendingUp className="h-3 w-3 text-rose-400" />
              <span className="text-[9px] font-semibold text-rose-400">DEX</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Coming Soon */}
        <div className="flex flex-col items-center py-8 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center shadow-lg mb-4 opacity-60">
            <TrendingUp className="h-8 w-8 text-rose-400/50" />
          </div>
          <span className="text-[10px] bg-rose-500/15 text-rose-400 px-2.5 py-1 rounded-full font-semibold mb-3">
            Coming Soon
          </span>
          <h2 className="text-base font-bold text-muted-foreground">QRDX Protocol Trading</h2>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-2 max-w-[260px] leading-relaxed">
            Concentrated liquidity DEX built on Uniswap v3/v4 architecture with quantum-resistant order execution.
          </p>
        </div>

        {/* Feature preview */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
            Features
          </div>
          {[
            { icon: BarChart3, label: 'Concentrated Liquidity', desc: 'Custom price ranges for capital efficiency' },
            { icon: Layers, label: 'Multiple Fee Tiers', desc: '0.01%, 0.05%, 0.30%, 1.00%' },
            { icon: Zap, label: 'Quantum-Resistant Orders', desc: 'Dilithium-signed trades on QRDX Chain' },
          ].map((feature) => (
            <div key={feature.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/30">
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                <feature.icon className="h-4 w-4 text-rose-400/60" />
              </div>
              <div>
                <div className="text-[11px] font-semibold">{feature.label}</div>
                <div className="text-[10px] text-muted-foreground/60">{feature.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Mock pairs list */}
        <div className="space-y-1 opacity-30 pointer-events-none select-none">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1 py-1">
            Trading Pairs
          </div>
          {PAIRS.map((pair) => (
            <div
              key={`${pair.base}/${pair.quote}`}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-background/40 border border-border/30"
            >
              <div>
                <span className="text-sm font-semibold">{pair.base}</span>
                <span className="text-sm text-muted-foreground">/{pair.quote}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{pair.price}</div>
                <div className={`text-[10px] font-medium ${pair.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {pair.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-1 py-4 text-center">
          <p className="text-[10px] text-muted-foreground/50">
            QRDX Protocol DEX will launch with QRDX Chain mainnet.
          </p>
        </div>
      </div>
    </div>
  )
}
