'use client'

import { useState } from 'react'

interface UnlockProps {
  onUnlock: () => void
}

export function Unlock({ onUnlock }: UnlockProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password) {
      setError('Please enter your password')
      return
    }

    // TODO: Implement actual unlock logic
    if (password.length > 0) {
      localStorage.setItem('qrdx_wallet_state', JSON.stringify({
        initialized: true,
        locked: false,
        version: '1.0.0'
      }))
      onUnlock()
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Unlock Wallet</h1>
          <p className="text-muted-foreground">
            Enter your password to continue
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              className="w-full py-3 px-4 bg-background border-2 border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
