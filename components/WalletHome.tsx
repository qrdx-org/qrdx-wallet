'use client'

import { Loading } from '@/components/motion/Loading'
import { useState, type ReactNode } from 'react'
import { Onboarding } from './wallet/onboarding/Onboarding'
import { Unlock } from './wallet/Unlock'
import { Dashboard } from './wallet/Dashboard'
import { ApprovalScreen } from './wallet/approval/ApprovalScreen'
import { approvalIdFromLocation } from '@/src/extension/provider/approval-protocol'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { RemoteConnectProvider } from './wallet/connect/RemoteConnect'
import { ScreenStack } from './motion/ScreenStack'
import { QrdxMark } from './QrdxMark'

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

  // Loading, onboarding, unlocking and the wallet itself change over with one motion.
  const screen = (id: string, depth: number, el: ReactNode) => (
    <ScreenStack id={id} depth={depth}>
      {el}
    </ScreenStack>
  )

  if (loading) {
    return screen(
      'loading',
      0,
      <div className="flex items-center justify-center w-full h-full min-h-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <QrdxMark className="h-10 w-10 text-foreground" />
          <Loading label="Opening QRDX Wallet" />
        </div>
      </div>
    )
  }

  if (approvalId && initialized) {
    // Unlock first when needed; the approval screen also resolves "unlock" requests.
    return locked ? screen('unlock', 1, <Unlock />) : screen('approval', 2, <ApprovalScreen id={approvalId} />)
  }
  if (onboarding || !initialized)
    return screen('onboarding', 1, <Onboarding onCommit={() => setOnboarding(true)} onDone={() => setOnboarding(false)} />)
  if (locked) return screen('unlock', 1, <Unlock />)
  return screen('wallet', 2, <Dashboard />)
}
