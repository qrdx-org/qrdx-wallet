'use client'

import { useEffect, useState } from 'react'
import { Lock, Settings as SettingsIcon, Copy, Check, Eye, EyeOff, Shield, ChevronDown, ScanLine } from 'lucide-react'
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
import { mergeCredentialBalances } from '@/src/core/balances'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { reverseQns } from '@/src/core/qns'
import { formatFiat as formatUsd } from '@/src/core/fiat'
import { AccountAvatar, AccountSwitcher } from './AccountSwitcher'
import { NftGallery } from './NftGallery'
import { TokenDetail } from './TokenDetail'
import { Explore } from './Explore'
import { useWalletNotifications } from './useWalletNotifications'
import type { Token } from './TokenList'

export function Dashboard() {
  const { lock, currentWallet, balances, pqBalances, balancesLoading, activeChain, portfolioValue, portfolioChange24h, priceHistory, transactions, pqBalance, combinedNativeBalance, prices } = useWallet()
  useWalletNotifications()
  const [showAccounts, setShowAccounts] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'main' | 'wallets'>('main')
  const [nftCount, setNftCount] = useState(0)
  const [openToken, setOpenToken] = useState<Token | null>(null)
  // Send opened from a token's page starts on that token.
  const [sendToken, setSendToken] = useState<string | undefined>(undefined)
  // "Send again" from a transaction starts with its recipient.
  const [sendTo, setSendTo] = useState<string | undefined>(undefined)
  // Swap opened from a token's page pays with that token.
  const [swapFrom, setSwapFrom] = useState<string | undefined>(undefined)
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
  const [activeTab, setActiveTab] = useState<'tokens' | 'nfts' | 'activity' | 'explore'>('tokens')
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
  // Its primary QRDX name, where the network has names (shown beside the account's own label).
  const [primaryName, setPrimaryName] = useState<{ key: string; name: string | null } | null>(null)
  const nameKey = `${activeChain.id}:${pqAddress}`
  useEffect(() => {
    if (!pqAddress) return
    let live = true
    reverseQns(activeChain, pqAddress).then((name) => live && setPrimaryName({ key: nameKey, name }))
    return () => {
      live = false
    }
  }, [activeChain, pqAddress, nameKey])
  const qnsName = primaryName?.key === nameKey ? primaryName.name : null

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

  // USD first: the portfolio value covers both credentials (every priced holding on the 0x
  // and the 0xPQ account). Without a price for the native coin the native amount leads.
  const nativePriced = prices.has(nativeSym.toUpperCase())
  const usdFirst = nativePriced || portfolioValue > 0
  const nativeTotal = `${formatUnits(combinedNativeBalance, nativeDecimals)} ${nativeSym}`
  const totalBalance = balancesLoading && portfolioValue === 0 ? '...' : usdFirst ? formatUsd(portfolioValue) : nativeTotal
  const changeUsd = usdFirst && portfolioChange24h ? (portfolioValue * portfolioChange24h) / (100 + portfolioChange24h) : null
  void hasPqFunds

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
    return <Settings initialPage={settingsPage} onBack={() => { setShowSettings(false); setSettingsPage('main') }} />
  }

  // Show action modals
  if (showConnect) {
    return <ConnectSheet onClose={() => setShowConnect(false)} />
  }
  if (activeModal === 'send') {
    return (
      <SendModal
        ethAddress={ethAddress}
        pqAddress={pqAddress}
        initialToken={sendToken}
        initialRecipient={sendTo}
        onClose={() => (setActiveModal(null), setSendToken(undefined), setSendTo(undefined))}
      />
    )
  }
  if (activeModal === 'receive') {
    return <ReceiveModal ethAddress={ethAddress} pqAddress={pqAddress} accountName={accountName} onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'swap') {
    return <SwapModal initialFrom={swapFrom} onClose={() => (setActiveModal(null), setSwapFrom(undefined))} />
  }
  if (activeModal === 'buy') {
    return <BuyModal onClose={() => setActiveModal(null)} onReceive={() => setActiveModal('receive')} onSwap={() => setActiveModal('swap')} />
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

  if (openToken) {
    return (
      <TokenDetail
        token={openToken}
        onClose={() => setOpenToken(null)}
        onAction={(action, t) => {
          if (action === 'send') setSendToken(t.contractAddress || t.symbol)
          if (action === 'swap') setSwapFrom(t.balanceNum > 0 ? t.contractAddress || 'QRDX' : undefined)
          setActiveModal(action)
        }}
      />
    )
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
        onSelect={setOpenToken}
      />
    )
  }

  const tabs = [
    { key: 'tokens' as const, label: 'Tokens', count: mergeCredentialBalances(balances, pqBalances).length },
    { key: 'nfts' as const, label: 'NFTs', count: nftCount },
    { key: 'activity' as const, label: 'Activity', count: transactions.length },
    { key: 'explore' as const, label: 'Explore', count: 0 },
  ]

  return (
    <div className="min-h-screen mono-backdrop">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => setShowAccounts(true)} aria-label="Switch account" className="relative rounded-xl">
                <AccountAvatar name={accountName} active />
              </button>
              <div>
                <button type="button" onClick={() => setShowAccounts(true)} className="font-semibold text-sm flex items-center gap-1 hover:opacity-80" aria-label={`${accountName}: switch account`}>
                  {accountName}
                  {qnsName && <span className="font-normal text-muted-foreground">· {qnsName}</span>}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
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
            {usdFirst && (
              <div className={cn('flex items-center gap-2 text-xs tabular-nums text-muted-foreground', !balanceVisible && 'privacy-blur')}>
                <span>{nativeTotal}</span>
                {changeUsd != null && (
                  <span className="text-foreground/80">
                    {changeUsd >= 0 ? '+' : '−'}
                    {formatUsd(Math.abs(changeUsd))} ({portfolioChange24h >= 0 ? '+' : ''}
                    {portfolioChange24h.toFixed(2)}%) today
                  </span>
                )}
              </div>
            )}
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
            {activeTab === 'tokens' && <TokenList pinnedSymbols={pinnedSymbols} onViewAll={() => setShowAllTokens(true)} onSelect={setOpenToken} />}
            {activeTab === 'nfts' && <NftGallery onCount={setNftCount} />}
            {activeTab === 'activity' && (
              <ActivityList
                onSendAgain={(to, token) => {
                  setSendTo(to)
                  setSendToken(token)
                  setActiveModal('send')
                }}
              />
            )}
            {activeTab === 'explore' && <Explore onOpenToken={setOpenToken} />}
          </CardContent>
        </Card>
      </div>
      {showAccounts && (
        <AccountSwitcher
          onClose={() => setShowAccounts(false)}
          onManage={() => {
            setShowAccounts(false)
            setSettingsPage('wallets')
            setShowSettings(true)
          }}
        />
      )}
    </div>
  )
}
