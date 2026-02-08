'use client'

import { useState } from 'react'
import { Key, Download, Shield, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWallet } from '@/src/shared/contexts/WalletContext'

export function Setup() {
  const { initialize, createWallet } = useWallet()
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateWallet = async () => {
    setIsCreating(true)
    try {
      await initialize('temp-password')
      await createWallet('My Wallet', 'temp-password')
    } catch {
      setIsCreating(false)
    }
  }

  const handleImportWallet = async () => {
    await initialize('temp-password')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center animate-glow">
              <Shield className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">Welcome to QRDX Wallet</h1>
          <p className="text-muted-foreground text-lg">
            Quantum-resistant security for the future of digital assets
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-primary/20">
            <CardHeader>
              <Shield className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Quantum-Resistant</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Protected against future quantum computing threats
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader>
              <Zap className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Lightning Fast</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Instant transactions with minimal fees
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader>
              <Key className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Your Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Full control with non-custodial storage
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-primary/50 hover:border-primary transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Key className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Create New Wallet</CardTitle>
                  <CardDescription>Generate a new quantum-resistant wallet</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCreateWallet}
                disabled={isCreating}
                className="w-full"
                size="lg"
              >
                {isCreating ? 'Creating...' : 'Create Wallet'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-all cursor-pointer group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-accent transition-colors">
                  <Download className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle>Import Wallet</CardTitle>
                  <CardDescription>Use an existing recovery phrase</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleImportWallet}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Import Wallet
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            By proceeding, you agree to our{' '}
            <a href="#" className="text-primary hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-primary hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
