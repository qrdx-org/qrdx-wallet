'use client'

import { useState } from 'react'
import { Lock, Settings, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { QuickActions } from './QuickActions'
import { TokenList } from './TokenList'
import { ActivityList } from './ActivityList'
import { PortfolioChart } from './PortfolioChart'
import { formatAddress } from '@/lib/utils'

export function Dashboard() {
  const [copied, setCopied] = useState(false)
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'tokens' | 'nfts' | 'activity'>('tokens')
  const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
  const totalBalance = '$29,703.62'

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLock = () => {
    localStorage.setItem('qrdx_wallet_state', JSON.stringify({
      initialized: true,
      locked: true,
      version: '1.0.0'
    }))
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 bg-gradient-to-br from-primary to-purple-600">
                <AvatarFallback className="bg-transparent text-white font-bold">
                  {address.slice(2, 4).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">QRDX Wallet</div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {formatAddress(address)}
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLock}>
                <Lock className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-purple-500/10 to-background border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Total Balance</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setBalanceVisible(!balanceVisible)}
              >
                {balanceVisible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="text-4xl font-bold mt-2">
              {balanceVisible ? totalBalance : '••••••'}
            </div>
            <PortfolioChart change24h={4.34} />
          </CardHeader>
          <CardContent>
            <QuickActions />
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-4 border-b">
          <button 
            onClick={() => setActiveTab('tokens')}
            className={`pb-3 px-1 border-b-2 ${
              activeTab === 'tokens' 
                ? 'border-primary font-semibold' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            } text-sm transition-colors`}
          >
            Tokens
          </button>
          <button 
            onClick={() => setActiveTab('nfts')}
            className={`pb-3 px-1 border-b-2 ${
              activeTab === 'nfts' 
                ? 'border-primary font-semibold' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            } text-sm transition-colors`}
          >
            NFTs
          </button>
          <button 
            onClick={() => setActiveTab('activity')}
            className={`pb-3 px-1 border-b-2 ${
              activeTab === 'activity' 
                ? 'border-primary font-semibold' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            } text-sm transition-colors`}
          >
            Activity
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'tokens' && <TokenList />}
        {activeTab === 'nfts' && (
          <Card>
            <div className="p-12 text-center">
              <p className="text-muted-foreground">No NFTs yet</p>
            </div>
          </Card>
        )}
        {activeTab === 'activity' && <ActivityList />}
      </div>
    </div>
  )
}
