'use client'

import { useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { Shield, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function Unlock() {
  const { unlock } = useWallet()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password) {
      setError('Please enter your password')
      return
    }

    setUnlocking(true)
    try {
      const ok = await unlock(password)
      if (!ok) {
        setError('Incorrect password')
      }
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background decorative */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10 px-5 py-6">
        {/* Logo & Title */}
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4 shadow-lg shadow-primary/25">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1.5">Welcome Back</h1>
          <p className="text-sm text-muted-foreground">
            Unlock your QRDX Wallet
          </p>
        </div>

        {/* Unlock Form */}
        <Card className="glass p-5 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  className="w-full h-11 px-4 pr-10 bg-background/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive animate-slide-up">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={unlocking}
              className="w-full h-11 font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all"
            >
              {unlocking ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </Button>
          </form>
        </Card>

        <button className="text-xs text-muted-foreground hover:text-primary text-center mt-4 transition-colors">
          Forgot password?
        </button>
      </div>
    </div>
  )
}
