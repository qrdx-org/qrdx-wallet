'use client'

import { useState } from 'react'

interface SetupProps {
  onComplete: () => void
}

export function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState<'welcome' | 'create' | 'import'>('welcome')

  const handleCreateWallet = () => {
    // TODO: Implement wallet creation
    localStorage.setItem('qrdx_wallet_state', JSON.stringify({
      initialized: true,
      locked: false,
      version: '1.0.0'
    }))
    onComplete()
  }

  const handleImportWallet = () => {
    // TODO: Implement wallet import
    localStorage.setItem('qrdx_wallet_state', JSON.stringify({
      initialized: true,
      locked: false,
      version: '1.0.0'
    }))
    onComplete()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Welcome to QRDX Wallet
          </h1>
          <p className="text-muted-foreground text-lg">
            Secure your digital assets with quantum-resistant cryptography
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateWallet}
            className="w-full py-4 px-6 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold text-lg"
          >
            Create New Wallet
          </button>

          <button
            onClick={handleImportWallet}
            className="w-full py-4 px-6 border-2 border-border bg-card text-card-foreground rounded-lg hover:bg-accent transition-colors font-semibold text-lg"
          >
            Import Existing Wallet
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
