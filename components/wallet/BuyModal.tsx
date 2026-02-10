'use client'

import { ArrowLeft, CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface BuyModalProps {
  onClose: () => void
}

export function BuyModal({ onClose }: BuyModalProps) {
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
            <h1 className="text-base font-semibold">Buy Crypto</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Coming Soon overlay */}
        <div className="flex flex-col items-center py-10 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center shadow-lg mb-4 opacity-60">
            <CreditCard className="h-8 w-8 text-orange-400/50" />
          </div>
          <span className="text-[10px] bg-primary/15 text-primary px-2.5 py-1 rounded-full font-semibold mb-3">
            Coming Soon
          </span>
          <h2 className="text-base font-bold text-muted-foreground">Buy Crypto</h2>
          <p className="text-[11px] text-muted-foreground/60 text-center mt-2 max-w-[260px] leading-relaxed">
            Purchase crypto directly with your credit card, debit card, or bank transfer. Powered by on-ramp partners.
          </p>
        </div>

        {/* Greyed out mock UI */}
        <div className="space-y-3 opacity-30 pointer-events-none select-none">
          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                You pay
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 shrink-0">
                  <span className="text-sm font-semibold">USD</span>
                </div>
                <div className="flex-1 text-right text-xl font-semibold text-muted-foreground">
                  100.00
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                You receive
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50 shrink-0">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">QR</span>
                  </div>
                  <span className="text-sm font-semibold">QRDX</span>
                </div>
                <div className="flex-1 text-right text-xl font-semibold text-muted-foreground">
                  ~10.00
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment methods */}
          <Card className="glass border-border/50">
            <CardContent className="p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Payment method
              </div>
              {['Credit / Debit Card', 'Bank Transfer', 'Apple Pay'].map((method) => (
                <div
                  key={method}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-background/40 border border-border/30"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground/60">{method}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            disabled
            className="w-full h-12 font-semibold text-base bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg"
          >
            <CreditCard className="h-5 w-5 mr-2" />
            Buy QRDX
          </Button>
        </div>

        <div className="px-1 py-4 text-center">
          <p className="text-[10px] text-muted-foreground/50">
            On-ramp integration is under development and will be available in a future update.
          </p>
        </div>
      </div>
    </div>
  )
}
