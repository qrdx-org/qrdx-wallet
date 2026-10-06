'use client'

import { useState } from 'react'
import { Lock, Settings as SettingsIcon, Copy, Check, Eye, EyeOff, Shield, MoreHorizontal, ChevronDown, ScanLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QuickActions } from './QuickActions'
import { ConnectSheet, ConnectedSites } from './connect/ConnectSheet'
import { useRemoteConnect } from './connect/RemoteConnect'
import type { QuickActionType } from './QuickActions'
import { TokenList } from './TokenList'
import { AllTokens } from './AllTokens'
import { ActivityList } from './ActivityList'
import { PortfolioChart } from './PortfolioChart'
import { Settings } from './Settings'
import { NetworkSelector, NetworkStatusBanner } from './NetworkSelector'
import { SendModal } from './SendModal'
import { ReceiveModal } from './ReceiveModal'
import { SwapModal } from './SwapModal'
import { BuyModal } from './BuyModal'
import { ShieldModal } from './ShieldModal'
import { TradeModal } from './TradeModal'
import { StakeModal } from './StakeModal'
import { cn, formatAddress } from '@/lib/utils'
import { useWallet } from '@/src/shared/contexts/WalletContext'

export function Dashboard() {
  const { lock, currentWallet, balances, balancesLoading, activeChain, portfolioValue, portfolioChange24h, priceHistory, transactions, pqBalance, combinedNativeBalance } = useWallet()
  const nativeSym = activeChain.nativeCurrency?.symbol ?? 'ETH'
  const [copied, setCopied] = useState<'eth' | 'pq' | null>(null)
  // Hidden balances stay hidden across visits (a per-device preference).
  const [balanceVisible, setBalanceVisibleState] = useState(() => {
    try {
      return typeof window === 'undefined' || localStorage.getItem('qrdx_hide_balances') !== '1'
    } catch {
      return true
    }
  })
  const setBalanceVisible = (v: boolean) => {
    setBalanceVisibleState(v)
    try {
      localStorage.setItem('qrdx_hide_balances', v ? '0' : '1')
    } catch {
      /* storage unavailable: this visit only */
    }
  }
  const [activeTab, setActiveTab] = useState<'tokens' | 'nfts' | 'activity'>('tokens')
  const [showSettings, setShowSettings] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  const rc = useRemoteConnect()
  // Installed-app shortcuts (manifest.json) open /wallet?action=send|receive.
  const [activeModal, setActiveModal] = useState<QuickActionType | null>(() => {
    if (typeof location === 'undefined') return null
    const action = new URLSearchParams(location.search).get('action')
    return action === 'send' || action === 'receive' ? action : null
  })
  const [addressMode, setAddressMode] = useState<'eth' | 'pq'>('eth')
  const [showAllTokens, setShowAllTokens] = useState(false)
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>([nativeSym])
  const [favoritedSymbols, setFavoritedSymbols] = useState<string[]>([nativeSym])

  const accountName = currentWallet?.name ?? 'Account 1'
  const ethAddress = currentWallet?.ethAddress ?? currentWallet?.address ?? ''
  const pqAddress = currentWallet?.pqAddress ?? ''
  const activeAddress = addressMode === 'eth' ? ethAddress : pqAddress

  // The wallet issues the EVM and post-quantum addresses as a pair, so the
  // headline figure is the combined native holding across both. The per-identity
  // amounts are shown underneath rather than hidden behind the address toggle:
  // they are separate accounts, and which one holds the funds determines what
  // can be spent and how.
  const nativeBalance = balances.find(b => b.address === '')
  const nativeDecimals = activeChain.nativeCurrency?.decimals ?? 18

  const formatUnits = (wei: bigint, decimals: number, places = 4) => {
    const divisor = 10n ** BigInt(decimals)
    const whole = wei / divisor
    const frac = (wei % divisor).toString().padStart(decimals, '0').slice(0, places)
    return `${whole.toLocaleString('en-US')}.${frac}`
  }

  const evmNativeWei = nativeBalance?.rawBalance ?? 0n
  const pqNativeWei = pqBalance ?? 0n
  const hasPqFunds = pqNativeWei > 0n

  const totalBalance = balancesLoading
    ? '...'
    : portfolioValue > 0
      // A fiat total only covers priced EVM assets, so it is shown only when
      // the PQ side holds nothing that it would silently omit.
      ? hasPqFunds
        ? `${formatUnits(combinedNativeBalance, nativeDecimals)} ${nativeSym}`
        : `$${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${formatUnits(combinedNativeBalance, nativeDecimals)} ${nativeSym}`

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

  // Show action modals
  if (showConnect) {
    return <ConnectSheet onClose={() => setShowConnect(false)} />
  }
  if (activeModal === 'send') {
    return <SendModal ethAddress={ethAddress} pqAddress={pqAddress} onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'receive') {
    return <ReceiveModal ethAddress={ethAddress} pqAddress={pqAddress} accountName={accountName} onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'swap') {
    return <SwapModal onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'buy') {
    return <BuyModal onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'shield') {
    return <ShieldModal onClose={() => setActiveModal(null)} onSend={() => setActiveModal('send')} />
  }
  if (activeModal === 'trade') {
    return <TradeModal onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'stake') {
    return <StakeModal onClose={() => setActiveModal(null)} />
  }

  // Show all tokens view
  if (showAllTokens) {
    return (
      <AllTokens
        pinnedSymbols={pinnedSymbols}
        favoritedSymbols={favoritedSymbols}
        onPinnedChange={setPinnedSymbols}
        onFavoritedChange={setFavoritedSymbols}
        onClose={() => setShowAllTokens(false)}
      />
    )
  }

  const tabs = [
    { key: 'tokens' as const, label: 'Tokens', count: balances.length },
    { key: 'nfts' as const, label: 'NFTs', count: 0 },
    { key: 'activity' as const, label: 'Activity', count: transactions.length },
  ]

  return (
    <div className="min-h-screen mono-backdrop">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md shadow-primary/20">
                  <span className="text-primary-foreground font-bold text-xs">
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
                        ? 'bg-foreground/10 text-foreground/70'
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
              {rc.available && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-accent/50"
                  onClick={() => setShowConnect(true)}
                  aria-label="Connect to a site"
                  title="Connect to a site"
                >
                  <ScanLine className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
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
        {/* Network badge + selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Shield className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary">Quantum-Safe</span>
          </div>
          <NetworkSelector />
        </div>

        {/* Blocking network problems sit in the flow, above the balance, so the
            figures below are never presented as trustworthy while the chain
            cannot be verified. */}
        <NetworkStatusBanner />

        {/* Balance Card */}
        <Card className="glass metal-card relative overflow-hidden border-border/70">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" />
          <CardContent className="p-4 relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">
                Total Balance
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setBalanceVisible(!balanceVisible)}
                aria-label={balanceVisible ? 'Hide balances' : 'Show balances'}
                title={balanceVisible ? 'Hide balances' : 'Show balances'}
              >
                {balanceVisible ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className={cn('text-3xl font-bold tracking-tight mb-1 tabular-nums', !balanceVisible && 'privacy-blur')} aria-hidden={!balanceVisible}>
              {totalBalance}
            </div>
            {/* Breakdown of the combined figure. Always shown so the split is
                visible rather than something the user has to go looking for. */}
            <div className="flex items-center gap-3 mt-1.5">
              <button
                onClick={() => setAddressMode('eth')}
                className={`flex items-center gap-1.5 text-[10px] transition-colors ${
                  addressMode === 'eth' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
                <span className="font-medium uppercase tracking-wide">EVM</span>
                <span className={cn('font-mono', !balanceVisible && 'privacy-blur')}>{formatUnits(evmNativeWei, nativeDecimals)}</span>
              </button>
              <button
                onClick={() => setAddressMode('pq')}
                className={`flex items-center gap-1.5 text-[10px] transition-colors ${
                  addressMode === 'pq' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="font-medium uppercase tracking-wide">PQ</span>
                <span className={cn('font-mono', !balanceVisible && 'privacy-blur')}>{formatUnits(pqNativeWei, nativeDecimals)}</span>
              </button>
            </div>
            <PortfolioChart data={priceHistory} change24h={portfolioChange24h} />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <QuickActions onAction={setActiveModal} />

        {(rc.linkPairing || rc.sessions.length > 0) && (
          <div className="space-y-2">
            {rc.linkPairing && (
              <div
                className={`rounded-xl border p-3 text-xs ${rc.linkPairing.state === 'failed' ? 'border-red-500/30 bg-red-500/10' : 'border-primary/20 bg-primary/5'}`}
                onClick={rc.dismissLinkPairing}
                role="status"
              >
                {rc.linkPairing.message}
              </div>
            )}
            {rc.sessions.length > 0 && (
              <>
                <p className="text-[11px] text-muted-foreground">Connected by QR code. Keep this app open while you trade.</p>
                <ConnectedSites compact />
              </>
            )}
          </div>
        )}

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
            {activeTab === 'tokens' && <TokenList pinnedSymbols={pinnedSymbols} onViewAll={() => setShowAllTokens(true)} />}
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
