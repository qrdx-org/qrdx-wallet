'use client'

import { useState } from 'react'
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface UnlockProps {
  onUnlock: () => void
}

export function Unlock({ onUnlock }: UnlockProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!password) {
      setError('Password is required')
      return
    }

    setIsUnlocking(true)
    
    // Simulate password verification
    setTimeout(() => {
      // TODO: Implement actual password verification
      if (password === 'wrong') {
        setError('Incorrect password')
        setIsUnlocking(false)
      } else {
        localStorage.setItem('qrdx_wallet_state', JSON.stringify({
          initialized: true,
          locked: false,
          version: '1.0.0'
        }))
        onUnlock()
      }
    }, 800)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="max-w-md w-full">
        <Card className="border-primary/20">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                <Lock className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>Enter your password to unlock your wallet</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    placeholder="Enter your password"
                    className={error ? 'border-destructive' : ''}
                    disabled={isUnlocking}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isUnlocking}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock Wallet'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => console.log('Reset password')}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          <p>Need help? Contact support</p>
        </div>
      </div>
    </div>
  )
}
