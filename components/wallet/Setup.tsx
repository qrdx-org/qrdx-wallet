'use client'

import { useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { Shield, Zap, Key, ChevronRight, Plus, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function Setup() {
  const { initialize, createWallet } = useWallet()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleCreateWallet = async () => {
    setCreating(true)
    try {
      await initialize('temp-password')
      await createWallet('My Wallet', 'temp-password')
    } finally {
      setCreating(false)
    }
  }

  const handleImportWallet = async () => {
    setImporting(true)
    try {
      await initialize('temp-password')
    } finally {
      setImporting(false)
    }
  }

  const features = [
    {
      icon: Shield,
      title: 'Quantum-Safe',
      description: 'Post-quantum cryptographic protection',
      gradient: 'from-primary to-primary/60',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Instant transactions & confirmations',
      gradient: 'from-yellow-500 to-orange-500',
    },
    {
      icon: Key,
      title: 'Self-Custody',
      description: 'Your keys, your crypto, always',
      gradient: 'from-green-500 to-emerald-500',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10 px-5 py-6">
        {/* Logo & Title */}
        <div className="text-center mb-6 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4 shadow-lg shadow-primary/25">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-1.5">
            QRDX Wallet
          </h1>
          <p className="text-sm text-muted-foreground">
            Quantum-resistant digital asset security
          </p>
        </div>

        {/* Feature Cards */}
        <div className="flex gap-2 mb-6" style={{ animationDelay: '100ms' }}>
          {features.map((feature) => (
            <Card key={feature.title} className="flex-1 p-2.5 glass hover:border-primary/30 transition-all">
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-2`}>
                <feature.icon className="h-4 w-4 text-white" />
              </div>
              <div className="text-xs font-semibold mb-0.5">{feature.title}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{feature.description}</div>
            </Card>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleCreateWallet}
            disabled={creating || importing}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all"
          >
            {creating ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Plus className="h-5 w-5 mr-2" />
            )}
            Create New Wallet
            <ChevronRight className="h-4 w-4 ml-auto" />
          </Button>

          <Button
            variant="outline"
            onClick={handleImportWallet}
            disabled={creating || importing}
            className="w-full h-12 text-base font-semibold glass hover:bg-accent/50 hover:border-primary/30 transition-all"
          >
            {importing ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Download className="h-5 w-5 mr-2" />
            )}
            Import Existing Wallet
            <ChevronRight className="h-4 w-4 ml-auto" />
          </Button>
        </div>

        {/* Terms */}
        <p className="text-center text-[10px] text-muted-foreground mt-4 px-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
