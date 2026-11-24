'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
import { RollingText } from '@/components/motion/RollingText'
import { BubblePanel, useBubble } from '@/components/gfx/Bubble'
import { SoapBubbleIconButton } from '@/components/soap-bubble'
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
import { ScreenStack, SPRING } from '../motion/ScreenStack'
import { AnimatePresence, motion } from 'framer-motion'
import type { Asset, Holding } from '@/src/core/portfolio'

/** A header button: a small round soap bubble in the liquid bubble look, else a ghost button. */
function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  const bubble = useBubble()
  if (bubble.on)
    return (
      <SoapBubbleIconButton aria-label={label} title={label} onClick={onClick} style={{ fontSize: 12 }}>
        {children}
      </SoapBubbleIconButton>
    )
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50" onClick={onClick} aria-label={label} title={label}>
      {children}
    </Button>
  )
}

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
  const [activeTab, setActiveTabState] = useState<'tokens' | 'nfts' | 'activity' | 'explore'>('tokens')
  // The tab before the current one, so its content can come in from the right side.
  const [prevTab, setPrevTab] = useState(activeTab)
  const setActiveTab = (t: typeof activeTab) => {
    setPrevTab(activeTab)
    setActiveTabState(t)
  }
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

  // Home and every screen opened from it change over with one motion (home is the shallowest).
  const screen = (id: string, el: ReactNode) => (
    <ScreenStack id={id} depth={id === 'home' ? 0 : 1}>
      {el}
    </ScreenStack>
  )

  // Show settings page
  if (showSettings) {
    return screen('settings', <Settings initialPage={settingsPage} onBack={() => { setShowSettings(false); setSettingsPage('main') }} />)
  }

  // Show action modals
  if (showConnect) {
    return screen('connect', <ConnectSheet onClose={() => setShowConnect(false)} />)
  }
  if (activeModal === 'send' && family !== 'evm') {
    return screen('send-other', <OtherSendModal initialToken={sendToken} initialRecipient={sendTo} onClose={() => (setActiveModal(null), setSendToken(undefined), setSendTo(undefined))} />)
  }
  if (activeModal === 'send') {
    return screen(
      'send',
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
    return screen('receive', <ReceiveModal ethAddress={ethAddress} pqAddress={pqAddress} accountName={accountName} onClose={() => setActiveModal(null)} />)
  }
  if (activeModal === 'swap') {
    return screen(
      'swap',
      <SwapModal
        initialFrom={swapFrom}
        elsewhere={allNetworks ? (portfolio?.assets ?? []).flatMap((a) => a.holdings).filter((h) => !isQrdxChain(h.chain) && h.raw > 0n && h.listed) : []}
        onElsewhere={(h) => (setActiveModal(null), setSwapFrom(undefined), tradeFrom(h))}
        onClose={() => (setActiveModal(null), setSwapFrom(undefined))}
      />
    )
  }
  if (activeModal === 'buy') {
    return screen('buy', <BuyModal onClose={() => setActiveModal(null)} onReceive={() => setActiveModal('receive')} onSwap={() => setActiveModal('swap')} />)
  }
  if (activeModal === 'shield') {
    return screen('shield', <ShieldModal onClose={() => setActiveModal(null)} onSend={() => setActiveModal('send')} />)
  }
  if (activeModal === 'trade') {
    return screen('trade', <TradeModal onClose={() => setActiveModal(null)} />)
  }
  if (activeModal === 'stake') {
    return screen('stake', <StakeModal onClose={() => setActiveModal(null)} />)
  }

  if (tradeHolding) {
    return screen('trade-holding', <TradeSheet holding={tradeHolding} onClose={() => setTradeHolding(null)} onDone={refreshPortfolio} />)
  }
  if (openAsset && allNetworks) {
    return screen('asset', <AssetPage asset={openAsset} onClose={() => setOpenAsset(null)} onSend={sendFrom} onReceive={receiveOn} onTrade={tradeFrom} />)
  }

  if (openToken) {
    return screen(
      'token',
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
    return screen(
      'all-tokens',
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
  const tabDir = tabs.findIndex((t) => t.key === tab) >= tabs.findIndex((t) => t.key === prevTab) ? 1 : -1

  return screen(
    'home',
    <div className="min-h-screen wallet-screen">
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
                <HeaderButton label="Connect to a site" onClick={() => setShowConnect(true)}>
                  <ScanLine className="h-4 w-4 text-muted-foreground" />
                </HeaderButton>
              )}
              <HeaderButton label="Settings" onClick={() => setShowSettings(true)}>
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              </HeaderButton>
              <HeaderButton label="Lock" onClick={handleLock}>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </HeaderButton>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="stagger px-4 py-3 space-y-3">
        {/* Network badge + selector */}
        <div className="flex items-center justify-between">
          {/* Only QRDX accounts sign with a post-quantum key; elsewhere the network's own keys apply. */}
          {qrdx ? (
            <BubblePanel className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20" bubbleClassName="flex items-center gap-1.5 px-2.5 py-1" radius={9999}>
              <Shield className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary">Quantum-Safe</span>
            </BubblePanel>
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
        <BubblePanel className="glass glass-clear relative overflow-hidden rounded-lg text-card-foreground shadow-sm" bubbleClassName="relative text-card-foreground">
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
              <RollingText text={totalBalance} />
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
            <PortfolioChart data={priceHistory} change24h={portfolioChange24h} bleed />
          </CardContent>
        </BubblePanel>
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

        {/* Tabs: the pill slides to the chosen one. */}
        <BubblePanel className="glass flex gap-1 p-1 rounded-xl" bubbleClassName="flex gap-1 p-1" radius={16}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative isolate flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t.key && (
                <motion.span layoutId="home-tab" transition={SPRING} className="absolute inset-0 -z-10 rounded-lg bg-background/80 shadow-sm ring-1 ring-foreground/10" />
              )}
              {t.label}
              {t.count > 0 && tab === t.key && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </BubblePanel>

        {/* Tab Content: it drifts in from the side of the tab that was chosen. */}
        <Card className="glass overflow-hidden">
          <CardContent className="p-2">
            <AnimatePresence initial={false} mode="popLayout" custom={tabDir}>
            <motion.div
              key={tab}
              custom={tabDir}
              initial={{ opacity: 0, x: tabDir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tabDir * -24 }}
              transition={SPRING}
            >
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
            </motion.div>
            </AnimatePresence>
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
