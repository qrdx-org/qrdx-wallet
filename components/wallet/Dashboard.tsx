'use client'

import { useState } from 'react'
import { Lock, Settings as SettingsIcon, Copy, Check, Eye, EyeOff, Shield, Bell, MoreHorizontal, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QuickActions } from './QuickActions'
import { TokenList } from './TokenList'
import { ActivityList } from './ActivityList'
import { PortfolioChart } from './PortfolioChart'
import { Settings } from './Settings'
import { formatAddress } from '@/lib/utils'
import { useWallet } from '@/src/shared/contexts/WalletContext'

export function Dashboard() {
  const { lock, currentWallet } = useWallet()
  const [copied, setCopied] = useState<'eth' | 'pq' | null>(null)
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'tokens' | 'nfts' | 'activity'>('tokens')
  const [showSettings, setShowSettings] = useState(false)
  const [addressMode, setAddressMode] = useState<'eth' | 'pq'>('eth')

  const accountName = currentWallet?.name ?? 'Account 1'
  const ethAddress = currentWallet?.ethAddress ?? currentWallet?.address ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
  const pqAddress = (currentWallet as any)?.pqAddress ?? 'qr_8f3a91d2e6b5c047f1a2d3e4f5a6b7c8d9e0f1a2'
  const activeAddress = addressMode === 'eth' ? ethAddress : pqAddress
  const totalBalance = '$29,703.62'

  const handleCopy = (type: 'eth' | 'pq') => {
    const addr = type === 'eth' ? ethAddress : pqAddress
    navigator.clipboard.writeText(addr)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleLock = async () => {
    await lock()
  }

  // Show settings page
  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />
  }

  const tabs = [
    { key: 'tokens' as const, label: 'Tokens', count: 4 },
    { key: 'nfts' as const, label: 'NFTs', count: 0 },
    { key: 'activity' as const, label: 'Activity', count: 4 },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md shadow-primary/20">
                  <span className="text-white font-bold text-xs">
                    {accountName.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div>
                <div className="font-semibold text-sm flex items-center gap-1">
                  {accountName}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </div>
                {/* Address type switcher */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAddressMode('eth')}
                    className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded transition-colors ${
                      addressMode === 'eth'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-muted-foreground/50 hover:text-muted-foreground'
                    }`}
                  >
                    ETH
                  </button>
                  <button
                    onClick={() => setAddressMode('pq')}
                    className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded transition-colors ${
                      addressMode === 'pq'
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground/50 hover:text-muted-foreground'
                    }`}
                  >
                    PQ
                  </button>
                  <button
                    onClick={() => handleCopy(addressMode)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors font-mono ml-0.5"
                  >
                    {formatAddress(activeAddress, 4)}
                    {copied === addressMode ? (
                      <Check className="h-2.5 w-2.5 text-green-500" />
                    ) : (
                      <Copy className="h-2.5 w-2.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50" onClick={() => setShowSettings(true)}>
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50" onClick={handleLock}>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Network badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Shield className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary">Quantum-Safe</span>
          </div>
          <span className="text-[10px] text-muted-foreground">QRDX Mainnet</span>
        </div>

        {/* Balance Card */}
        <Card className="glass border-primary/10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Total Balance</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setBalanceVisible(!balanceVisible)}
              >
                {balanceVisible ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className="text-3xl font-bold tracking-tight mb-1">
              {balanceVisible ? totalBalance : '••••••••'}
            </div>
            <PortfolioChart change24h={4.34} />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <QuickActions />

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-accent/30 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count > 0 && activeTab === tab.key && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Card className="glass border-border/50">
          <CardContent className="p-2">
            {activeTab === 'tokens' && <TokenList />}
            {activeTab === 'nfts' && (
              <div className="py-10 text-center">
                <div className="h-12 w-12 rounded-xl bg-accent/50 flex items-center justify-center mx-auto mb-3">
                  <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No NFTs yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Your collectibles will appear here</p>
              </div>
            )}
            {activeTab === 'activity' && <ActivityList />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
