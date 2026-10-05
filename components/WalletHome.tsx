'use client'

import { useState } from 'react'
import { Onboarding } from './wallet/onboarding/Onboarding'
import { Unlock } from './wallet/Unlock'
import { Dashboard } from './wallet/Dashboard'
import { ApprovalScreen } from './wallet/approval/ApprovalScreen'
import { approvalIdFromLocation } from '@/src/extension/provider/approval-protocol'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { RemoteConnectProvider } from './wallet/connect/RemoteConnect'

/** QRDX Connect wraps everything, so a ?connect= link survives onboarding and unlocking. */
export function WalletHome() {
  return (
    <RemoteConnectProvider>
      <WalletHomeInner />
    </RemoteConnectProvider>
  )
}

function WalletHomeInner() {
  const { initialized, locked, loading } = useWallet()
  // Onboarding stays mounted after the vault is created so its final steps
  // (biometrics, install, done) can run. It flags itself just before creating
  // the vault (onCommit) and hands over via onDone.
  const [onboarding, setOnboarding] = useState(false)
  // Extension approval windows open the same page with #approval=<id>.
  const [approvalId] = useState(() => approvalIdFromLocation())

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

  if (approvalId && initialized) {
    // Unlock first when needed; the approval screen also resolves "unlock" requests.
    return locked ? <Unlock /> : <ApprovalScreen id={approvalId} />
  }
  if (onboarding || !initialized)
    return <Onboarding onCommit={() => setOnboarding(true)} onDone={() => setOnboarding(false)} />
  if (locked) return <Unlock />
  return <Dashboard />
}
