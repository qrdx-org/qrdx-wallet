'use client'

import { Setup } from './wallet/Setup'
import { Unlock } from './wallet/Unlock'
import { Dashboard } from './wallet/Dashboard'
import { useWallet } from '@/src/shared/contexts/WalletContext'

export function WalletHome() {
  const { initialized, locked, loading } = useWallet()

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 animate-pulse-ring" />
            <div className="absolute inset-0 h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 opacity-30 blur-lg" />
          </div>
          <div className="text-sm font-medium text-muted-foreground">Loading QRDX Wallet...</div>
        </div>
      </div>
    )
  }

  if (!initialized) {
    return <Setup />
  }

  if (locked) {
    return <Unlock />
  }

  return <Dashboard />
}
