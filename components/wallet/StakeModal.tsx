'use client'

import { ArrowLeft, Landmark, Shield, Coins, Clock, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface StakeModalProps {
  onClose: () => void
}

export function StakeModal({ onClose }: StakeModalProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-violet-500/5">
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
              <h1 className="text-base font-semibold">Stake</h1>
              <p className="text-[10px] text-muted-foreground">QR-PoS Staking</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <Landmark className="h-3 w-3 text-violet-400" />
              <span className="text-[9px] font-semibold text-violet-400">PoS</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Coming Soon */}
        <div className="flex flex-col items-center py-8 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center shadow-lg mb-4 opacity-60">
            <Landmark className="h-8 w-8 text-violet-400/50" />
          </div>
          <span className="text-[10px] bg-violet-500/15 text-violet-400 px-2.5 py-1 rounded-full font-semibold mb-3">
            Coming Soon
          </span>
          <h2 className="text-base font-bold text-muted-foreground">QRDX Staking</h2>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-2 max-w-[260px] leading-relaxed">
            Stake QRDX to secure the network with Quantum-Resistant Proof-of-Stake and earn rewards.
          </p>
        </div>

        {/* Stats preview */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {[
            { label: 'APY', value: '5-12%', icon: TrendingUp },
            { label: 'Min Stake', value: '100K', icon: Coins },
            { label: 'Block Time', value: '2s', icon: Clock },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-background/50 border border-border/30">
              <stat.icon className="h-3.5 w-3.5 text-violet-400/60" />
              <span className="text-sm font-bold">{stat.value}</span>
              <span className="text-[9px] text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Feature preview */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
            Features
          </div>
          {[
            { icon: Shield, label: 'Quantum-Resistant PoS', desc: 'Dilithium-signed validator attestations' },
            { icon: Coins, label: 'Dynamic Rewards', desc: '5-12% APY based on network participation' },
            { icon: Landmark, label: 'Delegation', desc: 'Delegate to validators without running a node' },
          ].map((feature) => (
            <div key={feature.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/30">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <feature.icon className="h-4 w-4 text-violet-400/60" />
              </div>
              <div>
                <div className="text-[11px] font-semibold">{feature.label}</div>
                <div className="text-[10px] text-muted-foreground/60">{feature.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Mock staking card */}
        <div className="opacity-30 pointer-events-none select-none">
          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                Stake Amount
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 shrink-0">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">QR</span>
                  </div>
                  <span className="text-sm font-semibold">QRDX</span>
                </div>
                <div className="flex-1 text-right text-xl font-semibold text-muted-foreground">
                  100,000
                </div>
              </div>
              <div className="flex justify-between mt-2 px-0.5">
                <span className="text-[10px] text-muted-foreground">Est. yearly rewards</span>
                <span className="text-[10px] text-violet-400 font-semibold">~8,000 QRDX</span>
              </div>
            </CardContent>
          </Card>

          <Button
            disabled
            className="w-full h-12 mt-3 font-semibold text-base bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg"
          >
            <Landmark className="h-5 w-5 mr-2" />
            Stake QRDX
          </Button>
        </div>

        <div className="px-1 py-4 text-center">
          <p className="text-[10px] text-muted-foreground/50">
            Staking will be available when QRDX Chain mainnet launches.
          </p>
        </div>
      </div>
    </div>
  )
}
