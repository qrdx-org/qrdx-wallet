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
import { OtherSendModal } from './OtherSendModal'
import { ReceiveModal } from './ReceiveModal'
import { SwapModal } from './SwapModal'
import { BuyModal } from './BuyModal'
import { ShieldModal } from './ShieldModal'
import { TradeModal } from './TradeModal'
import { StakeModal } from './StakeModal'
import { cn, formatAddress } from '@/lib/utils'
import { mergeCredentialBalances } from '@/src/core/balances'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, isQrdxChain } from '@/src/core/chains'
import { accountAuthority, qnsGetName, qnsNamesOf, reverseQns } from '@/src/core/qns'
import { migrationState } from '@/src/core/migration'
import { sameAccount } from '@/src/core/account-id'
import { formatFiat as formatUsd } from '@/src/core/fiat'
import { AccountAvatar, AccountSwitcher } from './AccountSwitcher'
import { NftGallery } from './NftGallery'
import { TokenDetail } from './TokenDetail'
import { Explore } from './Explore'
import { useWalletNotifications } from './useWalletNotifications'
import type { Token } from './TokenList'
import { usePortfolio } from './portfolio/usePortfolio'
import { AssetList, HoldingPicker, PortfolioSummary, ReceiveNetworkPicker } from './portfolio/PortfolioHome'
import { PortfolioActivity } from './portfolio/PortfolioActivity'
import { AssetPage } from './portfolio/AssetPage'
import { TradeSheet } from './portfolio/TradeSheet'
import type { Asset, Holding } from '@/src/core/portfolio'

export function Dashboard() {
  const { lock, currentWallet, balances, pqBalances, balancesLoading, activeChain, activeAddress: chainAddress, portfolioValue, portfolioChange24h, priceHistory, transactions, pqBalance, combinedNativeBalance, prices, allNetworks, homeQrdxChain, setActiveChain, chains, showTestnets } = useWallet()
  const family = chainFamily(activeChain)
  // All networks: one portfolio (src/core/portfolio.ts). Actions on an asset elsewhere switch to
  // its network for as long as they are open; home then returns to the QRDX network.
  const { portfolio, loading: portfolioLoading, refresh: refreshPortfolio } = usePortfolio(allNetworks)
  const [openAsset, setOpenAsset] = useState<Asset | null>(null)
  const [tradeHolding, setTradeHolding] = useState<Holding | null>(null)
  const [picker, setPicker] = useState<'send' | 'receive' | null>(null)
  const qrdx = isQrdxChain(activeChain)
  // What works here: everything on QRDX; sending, receiving and funding on other EVM networks;
  // sending and receiving on Bitcoin and Solana.
  const actions: QuickActionType[] = qrdx ? ['send', 'receive', 'swap', 'shield', 'buy', 'trade', 'stake'] : family === 'evm' ? ['send', 'receive', 'buy'] : ['send', 'receive']
  useWalletNotifications()
  const [showAccounts, setShowAccounts] = useState(false)
  const [settingsPage, setSettingsPage] = useState<'main' | 'wallets' | 'quantum-safety'>('main')
  const [nftCount, setNftCount] = useState(0)
  const [openToken, setOpenToken] = useState<Token | null>(null)
  // Send opened from a token's page starts on that token.
  const [sendToken, setSendToken] = useState<string | undefined>(undefined)
  // "Send again" from a transaction starts with its recipient.
  const [sendTo, setSendTo] = useState<string | undefined>(undefined)
  // Send from a holding picked on the home screen: the QRDX address that holds it.
  const [sendCredential, setSendCredential] = useState<'classic' | 'pq' | undefined>(undefined)
  // Swap opened from a token's page pays with that token.
  const [swapFrom, setSwapFrom] = useState<string | undefined>(undefined)
  const nativeSym = activeChain.nativeCurrency?.symbol ?? 'ETH'
  const [copied, setCopied] = useState<'eth' | 'pq' | 'chain' | null>(null)
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
  useEffect(() => {
    if (allNetworks && !activeModal && !tradeHolding && !isQrdxChain(activeChain)) setActiveChain(homeQrdxChain.id)
  }, [allNetworks, activeModal, tradeHolding, activeChain, homeQrdxChain]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendFrom = (h: Holding) => {
    setPicker(null)
    setActiveChain(h.chain.id)
    setSendToken(h.address || (chainFamily(h.chain) === 'evm' ? h.chain.nativeCurrency.symbol : undefined))
    setSendCredential(h.credential)
    setActiveModal('send')
  }
  const tradeFrom = (h: Holding) => {
    setPicker(null)
    if (isQrdxChain(h.chain)) {
      setActiveChain(h.chain.id)
      setSwapFrom(h.address || 'QRDX')
      setActiveModal('swap')
    } else {
      setActiveChain(h.chain.id)
      setTradeHolding(h)
    }
  }
  const receiveOn = (c: { id: string }) => {
    setPicker(null)
    setActiveChain(c.id)
    setActiveModal('receive')
  }
  const [showAllTokens, setShowAllTokens] = useState(false)
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>([nativeSym])
  const [favoritedSymbols, setFavoritedSymbols] = useState<string[]>([nativeSym])

  const accountName = currentWallet?.name ?? 'Account 1'
  const ethAddress = currentWallet?.ethAddress ?? currentWallet?.address ?? ''
  const pqAddress = currentWallet?.pqAddress ?? ''
  // Only QRDX has a post-quantum address; elsewhere the header shows the one address the network uses.
  const mode = qrdx ? addressMode : family === 'evm' ? 'eth' : 'chain'
  const activeAddress = mode === 'chain' ? (chainAddress ?? '') : mode === 'eth' ? ethAddress : pqAddress
  // Its QRDX name, where the network has names (shown beside the account's own label): its
  // primary name, or else a name it holds that points to it, which others do not see yet.
  const [primaryName, setPrimaryName] = useState<{ key: string; name: string | null; primary: boolean } | null>(null)
  const nameKey = `${activeChain.id}:${pqAddress}`
  useEffect(() => {
    if (!pqAddress) return
    let live = true
    ;(async () => {
      const primary = await reverseQns(activeChain, pqAddress)
      if (primary) return live && setPrimaryName({ key: nameKey, name: primary, primary: true })
      const held = (await qnsNamesOf(activeChain, pqAddress).catch(() => null)) ?? []
      for (const n of held) {
        const info = await qnsGetName(activeChain, n).catch(() => null)
        if (info && !info.expired && info.address && sameAccount(info.address, pqAddress)) return live && setPrimaryName({ key: nameKey, name: n, primary: false })
      }
      if (live) setPrimaryName({ key: nameKey, name: null, primary: false })
    })()
    return () => {
      live = false
    }
  }, [activeChain, pqAddress, nameKey])
  // QRDX: a classic address that holds QRDX but has no quantum-safe successor yet (Settings → Quantum safety).
  const classicQrdx = qrdx ? (balances.find((b) => b.address === '')?.rawBalance ?? 0n) : 0n
  const [unprotected, setUnprotected] = useState<string | null>(null)
  useEffect(() => {
    setUnprotected(null)
    if (!qrdx || classicQrdx === 0n || !ethAddress || !pqAddress) return
    let live = true
    accountAuthority(activeChain, ethAddress)
      .then((auth) => live && auth && migrationState(auth, pqAddress).kind === 'unprotected' && setUnprotected(`${activeChain.id}:${ethAddress}`))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [qrdx, classicQrdx > 0n, activeChain, ethAddress, pqAddress]) // eslint-disable-line react-hooks/exhaustive-deps
  const showProtect = unprotected === `${activeChain.id}:${ethAddress}`
  const qnsName = primaryName?.key === nameKey ? primaryName.name : null
  const qnsIsPrimary = primaryName?.key === nameKey && primaryName.primary

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

  const handleCopy = (type: 'eth' | 'pq' | 'chain') => {
    const addr = type === 'chain' ? (chainAddress ?? '') : type === 'eth' ? ethAddress : pqAddress
    if (!addr) return
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
  if (activeModal === 'send' && family !== 'evm') {
    return <OtherSendModal initialToken={sendToken} initialRecipient={sendTo} onClose={() => (setActiveModal(null), setSendToken(undefined), setSendTo(undefined))} />
  }
  if (activeModal === 'send') {
    return (
      <SendModal
        ethAddress={ethAddress}
        pqAddress={pqAddress}
        initialToken={sendToken}
        initialRecipient={sendTo}
        initialCredential={sendCredential}
        onClose={() => (setActiveModal(null), setSendToken(undefined), setSendTo(undefined), setSendCredential(undefined))}
      />
    )
  }
  if (activeModal === 'receive') {
    return <ReceiveModal ethAddress={ethAddress} pqAddress={pqAddress} accountName={accountName} onClose={() => setActiveModal(null)} />
  }
  if (activeModal === 'swap') {
    return (
      <SwapModal
        initialFrom={swapFrom}
        elsewhere={allNetworks ? (portfolio?.assets ?? []).flatMap((a) => a.holdings).filter((h) => !isQrdxChain(h.chain) && h.raw > 0n && h.listed) : []}
        onElsewhere={(h) => (setActiveModal(null), setSwapFrom(undefined), tradeFrom(h))}
        onClose={() => (setActiveModal(null), setSwapFrom(undefined))}
      />
    )
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

  if (tradeHolding) {
    return <TradeSheet holding={tradeHolding} onClose={() => setTradeHolding(null)} onDone={refreshPortfolio} />
  }
  if (openAsset && allNetworks) {
    return <AssetPage asset={openAsset} onClose={() => setOpenAsset(null)} onSend={sendFrom} onReceive={receiveOn} onTrade={tradeFrom} />
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

  // NFTs and Explore are QRDX's (its NFT ledger and exchange markets) and CoinGecko's on EVM networks.
  const tabs = [
    { key: 'tokens' as const, label: 'Tokens', count: allNetworks ? (portfolio?.assets.length ?? 0) : mergeCredentialBalances(balances, pqBalances).length },
    ...(qrdx ? [{ key: 'nfts' as const, label: 'NFTs', count: nftCount }] : []),
    { key: 'activity' as const, label: 'Activity', count: transactions.length },
    ...(family === 'evm' ? [{ key: 'explore' as const, label: 'Explore', count: 0 }] : []),
  ]
  const tab = tabs.some((t) => t.key === activeTab) ? activeTab : 'tokens'

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
                  {qnsName && (
                    <span
                      className="font-normal text-muted-foreground"
                      title={qnsIsPrimary ? 'Your primary QRDX name' : 'A name you hold. Make it your primary name (Settings → Names) so others see it for this account.'}
                    >
                      · {qnsName}
                      {!qnsIsPrimary && <span className="text-[10px]"> (not primary)</span>}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {/* Address type switcher (QRDX: classic and quantum-safe), or the network's one address */}
                <div className="flex items-center gap-1">
                  {!qrdx ? (
                    <span className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-foreground/10 text-foreground/70">{family === 'evm' ? '0x' : activeChain.nativeCurrency.symbol}</span>
                  ) : (
                  <>
                  <button
                    onClick={() => setAddressMode('eth')}
                    className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded transition-colors ${
                      addressMode === 'eth'
                        ? 'bg-foreground/10 text-foreground/70'
                        : 'text-muted-foreground/50 hover:text-muted-foreground'
                    }`}
                  >
                    0x
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
                  </>
                  )}
                  <button
                    onClick={() => handleCopy(mode)}
                    disabled={!activeAddress}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors font-mono ml-0.5"
                  >
                    {activeAddress ? formatAddress(activeAddress, 4) : family === 'solana' && chainAddress === null ? 'No Solana address' : '…'}
                    {copied === mode ? (
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
          {/* Only QRDX accounts sign with a post-quantum key; elsewhere the network's own keys apply. */}
          {qrdx ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <Shield className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary">Quantum-Safe</span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">{family === 'evm' ? 'Classic 0x account' : `${activeChain.name} account`}</span>
          )}
          <NetworkSelector />
        </div>

        {/* Blocking network problems sit in the flow, above the balance, so the
            figures below are never presented as trustworthy while the chain
            cannot be verified. */}
        {!allNetworks && <NetworkStatusBanner />}

        {allNetworks ? (
          <PortfolioSummary portfolio={portfolio} loading={portfolioLoading} onRefresh={refreshPortfolio} visible={balanceVisible} />
        ) : (
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
            {qrdx && (
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
            )}
            <PortfolioChart data={priceHistory} change24h={portfolioChange24h} />
          </CardContent>
        </Card>
        )}

        {showProtect && (
          <button
            type="button"
            onClick={() => (setSettingsPage('quantum-safety'), setShowSettings(true))}
            className="flex w-full items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left"
          >
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="block font-semibold text-foreground">Protect your classic address</span>
              It holds {formatUnits(classicQrdx, nativeDecimals)} QRDX and signs with ECDSA, which a quantum computer could break. One approval makes your quantum-safe address its successor.
            </span>
          </button>
        )}

        {/* Quick Actions */}
        <QuickActions
          onAction={(a) => (allNetworks && (a === 'send' || a === 'receive') ? setPicker(a) : (allNetworks && a === 'swap' && setActiveChain(homeQrdxChain.id), setActiveModal(a)))}
          available={allNetworks ? ['send', 'receive', 'swap', 'shield', 'buy', 'trade', 'stake'] : actions}
        />

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
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === t.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.count > 0 && tab === t.key && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Card className="glass border-border/50">
          <CardContent className="p-2">
            {tab === 'tokens' &&
              (allNetworks ? (
                <AssetList portfolio={portfolio} onOpen={setOpenAsset} visible={balanceVisible} />
              ) : (
                <TokenList pinnedSymbols={pinnedSymbols} onViewAll={() => setShowAllTokens(true)} onSelect={setOpenToken} />
              ))}
            {tab === 'nfts' && <NftGallery onCount={setNftCount} />}
            {tab === 'activity' && allNetworks && <PortfolioActivity portfolio={portfolio} />}
            {tab === 'activity' && !allNetworks && (
              <ActivityList
                onSendAgain={(to, token) => {
                  setSendTo(to)
                  setSendToken(token)
                  setActiveModal('send')
                }}
              />
            )}
            {tab === 'explore' && <Explore onOpenToken={setOpenToken} />}
          </CardContent>
        </Card>
      </div>
      {picker === 'send' && <HoldingPicker title="Send what?" portfolio={portfolio} onPick={sendFrom} onClose={() => setPicker(null)} />}
      {picker === 'receive' && <ReceiveNetworkPicker chains={chains} qrdx={homeQrdxChain} showTestnets={showTestnets} onPick={receiveOn} onClose={() => setPicker(null)} />}
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
