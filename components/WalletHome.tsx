'use client'

import { useState, useEffect } from 'react'
import { Setup } from './wallet/Setup'
import { Unlock } from './wallet/Unlock'
import { Dashboard } from './wallet/Dashboard'

export function WalletHome() {
  const [initialized, setInitialized] = useState(false)
  const [locked, setLocked] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check wallet state from localStorage
    const checkWalletState = () => {
      const state = localStorage.getItem('qrdx_wallet_state')
      if (state) {
        const parsed = JSON.parse(state)
        setInitialized(parsed.initialized || false)
        setLocked(parsed.locked !== false)
      }
      setLoading(false)
    }

    checkWalletState()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!initialized) {
    return <Setup onComplete={() => setInitialized(true)} />
  }

  if (locked) {
    return <Unlock onUnlock={() => setLocked(false)} />
  }

  return <Dashboard />
}
