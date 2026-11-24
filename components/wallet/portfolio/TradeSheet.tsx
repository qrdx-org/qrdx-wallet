'use client'

/**
 * Trading an asset held on a network QRDX does not run. Where an aggregator quotes the network
 * (LI.FI on EVM networks, Jupiter on Solana) it opens straight on the swap, laid out like QRDX's
 * own, with the quote set against the market price; bringing the asset to QRDX over the bridge
 * is offered beside it when QRDX bridges it. Elsewhere (Bitcoin, test networks) it explains the
 * options. The DEX's own site is linked too.
 */

import { Loading, Spinner } from '@/components/motion/Loading'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Waypoints } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, type ChainToken } from '@/src/core/chains'
import { formatAmount, formatUnitsExact } from '@/src/core/balances'
import { formatFiat, formatFiatPrice } from '@/src/core/fiat'
import { fetchPrices } from '@/src/core/prices'
import { parseUnits } from '@/src/core/solana'
import { addressOn, explorerTxUrl } from '@/src/core/other-chains'
import { dexLink, executeSwap, quoteSwap, type SwapQuote, type SwapToken } from '@/src/core/aggregators'
import { bridgeConfig, bridgeRouteFor, depositToQrdx, type BridgeRoute } from '@/src/core/bridge'
import type { Holding } from '@/src/core/portfolio'
import { SettingsPage, Section } from '../settings/shared'
import { ErrorBanner, Notice, PrimaryButton } from '../flow/FlowKit'
import { Sheet } from '../trade/kit'
import { CoinLogo, NetworkLogo } from '../CoinLogo'
import { cn } from '@/lib/utils'

export function TradeSheet({ holding, onClose, onDone }: { holding: Holding; onClose: () => void; onDone: () => void }) {
  const { homeQrdxChain, currentWallet, chainAddresses, backend } = useWallet()
  const chain = holding.chain
  const family = chainFamily(chain)
  const owner = family === 'evm' ? (currentWallet?.ethAddress ?? '') : (addressOn(chain, chainAddresses) ?? '')
  const swappable = !chain.isTestnet && (family === 'evm' || family === 'solana')
  const [bridging, setBridging] = useState(false)
  const [route, setRoute] = useState<BridgeRoute | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    bridgeConfig(homeQrdxChain)
      .then((cfg) => live && setRoute(bridgeRouteFor(cfg, chain, holding.address)))
      .catch(() => live && setRoute(null))
    return () => {
      live = false
    }
  }, [homeQrdxChain, chain, holding.address])

  if (bridging && route && currentWallet) {
    return <BridgeDeposit holding={holding} route={route} onBack={() => setBridging(false)} onDone={onDone} />
  }
  if (swappable && currentWallet) {
    return <AggregatorSwap holding={holding} owner={owner} signer={backend} route={route} onBridge={() => setBridging(true)} onBack={onClose} onDone={onDone} />
  }

  return (
    <SettingsPage title={`Trade ${holding.symbol}`} onBack={onClose}>
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <CoinLogo symbol={holding.symbol} verified={holding.listed && !holding.trusted} size={22} network={chain} />
        {formatAmount(holding.raw, holding.decimals)} {holding.symbol} on {chain.name}
      </div>
      <Notice>
        {family === 'bitcoin'
          ? 'Bitcoin has no exchange on its own chain. Send it to an exchange you use, or bridge it to QRDX once QRDX lists it.'
          : `${chain.name} is a test network: aggregators quote mainnets only. Swap on QRDX instead, or send it where you trade.`}
      </Notice>
      <BridgeOffer holding={holding} route={route} onBridge={() => setBridging(true)} />
    </SettingsPage>
  )
}

/** Bringing the holding to QRDX: the button when QRDX bridges it, else why not. */
function BridgeOffer({ holding, route, onBridge, compact }: { holding: Holding; route: BridgeRoute | null | undefined; onBridge: () => void; compact?: boolean }) {
  const { homeQrdxChain } = useWallet()
  const chain = holding.chain
  if (route === undefined) return compact ? null : <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><Loading label={`Checking what ${homeQrdxChain.name} bridges`} /></p>
  if (route)
    return (
      <button type="button" onClick={onBridge} className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left hover:bg-accent/40">
        <NetworkLogo chain={homeQrdxChain} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Bring it to QRDX instead</span>
          <span className="block text-[11px] text-muted-foreground">Trade {holding.symbol} on QRDX&apos;s order books and pools with your quantum-safe account.</span>
        </span>
        <Waypoints className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    )
  if (compact) return null
  return (
    <p className="px-1 text-[11px] text-muted-foreground">
      {chainFamily(chain) !== 'evm'
        ? `QRDX's bridge takes tokens from EVM networks; ${chain.name} is not bridged yet.`
        : `${homeQrdxChain.name} does not bridge ${holding.address ? holding.symbol : chain.nativeCurrency.symbol} from ${chain.name} yet.`}
    </p>
  )
}

function AggregatorSwap({
  holding,
  owner,
  signer,
  route,
  onBridge,
  onBack,
  onDone,
}: {
  holding: Holding
  owner: string
  signer: Parameters<typeof executeSwap>[0]
  route: BridgeRoute | null | undefined
  onBridge: () => void
  onBack: () => void
  onDone: () => void
}) {
  const { currentWallet } = useWallet()
  const chain = holding.chain
  const from: SwapToken = { address: holding.address, symbol: holding.symbol, decimals: holding.decimals }
  const targets = useMemo(
    () => chain.tokens.filter((t) => t.address.toLowerCase() !== holding.address.toLowerCase() && t.symbol !== 'WSOL'),
    [chain, holding.address]
  )
  const [to, setTo] = useState<ChainToken>(() => targets.find((t) => t.symbol === 'USDC') ?? targets[0])
  const [picking, setPicking] = useState(false)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [market, setMarket] = useState<{ from?: number; to?: number }>({})
  const [busy, setBusy] = useState<'quote' | 'approving' | 'swapping' | 'confirming' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; ok: boolean } | null>(null)
  const link = dexLink(chain, from, to ?? { address: '', symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals })

  // Market prices of both sides, to set the quote against.
  useEffect(() => {
    const ids = [holding.coingeckoId, to?.coingeckoId].filter((x): x is string => !!x)
    if (!ids.length) return
    fetchPrices(ids)
      .then((m) => setMarket({ from: holding.coingeckoId ? m.get(holding.coingeckoId)?.usd : undefined, to: to?.coingeckoId ? m.get(to.coingeckoId)?.usd : undefined }))
      .catch(() => undefined)
  }, [holding.coingeckoId, to])

  // Quote as the amount or the target changes, after a pause in typing.
  useEffect(() => {
    setQuote(null)
    setError(null)
    if (!to || !amount || Number(amount) <= 0) return
    let raw: bigint
    try {
      raw = parseUnits(amount, holding.decimals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid amount')
      return
    }
    if (raw > holding.raw) {
      setError(`More than this account holds on ${chain.name}`)
      return
    }
    let live = true
    const t = setTimeout(() => {
      setBusy('quote')
      quoteSwap({ chain, owner, from, to: { address: to.address, symbol: to.symbol, decimals: to.decimals }, amount: raw })
        .then((q) => live && setQuote(q))
        .catch((e) => live && setError(e instanceof Error ? e.message : 'No quote'))
        .finally(() => live && setBusy(null))
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [amount, to, holding, chain, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  const swap = async () => {
    if (!quote || !currentWallet) return
    setError(null)
    try {
      setDone(await executeSwap(signer, currentWallet, owner, quote, (s) => setBusy(s)))
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The swap failed')
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    return (
      <SettingsPage title="Swap" onBack={onBack}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className={cn('h-10 w-10', done.ok ? 'text-green-500' : 'text-red-500')} />
          <p className="text-sm font-semibold">{done.ok ? 'Swapped' : 'The swap failed on chain'}</p>
          <a href={explorerTxUrl(chain, done.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            View on explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <PrimaryButton onClick={onBack}>Done</PrimaryButton>
      </SettingsPage>
    )
  }

  const out = quote ? Number(formatUnitsExact(quote.toAmount, to.decimals)) : 0
  const inAmt = Number(amount) || 0
  const rate = quote && inAmt ? out / inAmt : null
  const marketRate = market.from && market.to ? market.from / market.to : null
  const vsMarket = rate && marketRate ? ((rate - marketRate) / marketRate) * 100 : null
  const max = () => setAmount(formatUnitsExact(holding.address ? holding.raw : (holding.raw * 95n) / 100n, holding.decimals))
  const problem = !inAmt ? 'Enter an amount' : busy === 'quote' || (!quote && !error) ? 'Getting a quote…' : !quote ? 'No quote' : null

  return (
    <div className="flex min-h-screen flex-col wallet-screen">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onBack} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Swap</h1>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <NetworkLogo chain={chain} size={11} /> {chain.name} · {chainFamily(chain) === 'solana' ? 'best price across Solana DEXs, by Jupiter' : 'best price across its DEXs, by LI.FI'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border bg-card p-1.5 shadow-xl shadow-black/5">
          <div className="rounded-xl bg-muted/60 p-3.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>You pay</span>
              <button type="button" onClick={max} className="tabular-nums hover:text-foreground">
                Balance {formatAmount(holding.raw, holding.decimals)} <span className="ml-1 font-semibold text-foreground">{holding.address ? 'Max' : '95%'}</span>
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2.5 text-sm font-semibold shadow-sm">
                <CoinLogo symbol={holding.symbol} verified={holding.listed && !holding.trusted} size={26} network={holding.address ? chain : undefined} /> {holding.symbol}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to swap"
                className="h-12 w-full min-w-0 bg-transparent text-right text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <div className="mt-0.5 text-right text-[10px] text-muted-foreground tabular-nums">{market.from && inAmt > 0 ? `≈ ${formatFiat(inAmt * market.from)}` : ''}</div>
          </div>
          <div className="relative z-10 -my-3 flex justify-center">
            <span className="rounded-xl border-4 border-card bg-muted p-2">
              <ArrowDown className="h-4 w-4" />
            </span>
          </div>
          <div className="rounded-xl bg-muted/60 p-3.5">
            <div className="text-[11px] text-muted-foreground">You receive</div>
            <div className="mt-1.5 flex items-center gap-2">
              <button type="button" onClick={() => setPicking(true)} className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2 text-sm font-semibold shadow-sm hover:bg-accent">
                {to ? <CoinLogo symbol={to.symbol} verified size={26} /> : <span className="h-[26px] w-[26px] rounded-full bg-muted" />}
                {to?.symbol ?? 'Select'}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <div className={cn('h-12 min-w-0 flex-1 truncate text-right text-3xl font-semibold leading-[3rem] tabular-nums', quote ? 'text-foreground' : 'text-muted-foreground/40')}>
                {busy === 'quote' ? <Spinner size={24} className="ml-auto mt-3 text-muted-foreground" /> : quote ? formatAmount(quote.toAmount, to.decimals, 6) : '0'}
              </div>
            </div>
            <div className="mt-0.5 text-right text-[10px] text-muted-foreground tabular-nums">{quote && market.to ? `≈ ${formatFiat(out * market.to)}` : ''}</div>
          </div>

          <div className="space-y-1.5 px-2.5 pb-2 pt-3 text-[11px]">
            <Line k="Rate" v={rate ? `1 ${holding.symbol} = ${rate.toPrecision(6)} ${to.symbol}` : '—'} />
            {marketRate && (
              <Line
                k="Market rate"
                v={
                  <>
                    {marketRate.toPrecision(6)} {to.symbol}
                    {vsMarket != null && <span className={cn('ml-1', vsMarket < -1 ? 'text-red-500' : 'text-muted-foreground')}>({vsMarket >= 0 ? '+' : ''}{vsMarket.toFixed(2)}%)</span>}
                  </>
                }
              />
            )}
            {market.from && <Line k={`${holding.symbol} price`} v={formatFiatPrice(market.from)} />}
            <Line k="Minimum received" v={quote ? `${formatAmount(quote.toAmountMin, to.decimals, 6)} ${to.symbol} (0.5% slippage)` : '—'} />
            {quote?.priceImpact != null && <Line k="Price impact" v={<span className={quote.priceImpact > 2 ? 'text-red-500' : ''}>{quote.priceImpact.toFixed(2)}%</span>} />}
            {quote?.feeUsd != null && <Line k="Network fee" v={`about ${formatFiat(quote.feeUsd)}`} />}
            {quote?.serviceFee && <Line k={quote.serviceFee.name} v={`${quote.serviceFee.percent.toFixed(2)}%${quote.serviceFee.usd ? ` · ${formatFiat(quote.serviceFee.usd)}` : ''}, in the rate`} />}
            {quote && <Line k="Route" v={quote.route.length ? quote.route.join(' → ') : quote.provider} />}
          </div>
          <PrimaryButton loading={!!busy && busy !== 'quote'} disabled={!!problem || !!busy} onClick={swap}>
            {busy === 'approving' ? 'Approving…' : busy === 'swapping' ? 'Swapping…' : busy === 'confirming' ? 'Confirming…' : (problem ?? (quote?.approval ? 'Approve and swap' : 'Swap'))}
          </PrimaryButton>
        </div>

        {quote && (
          <p className="px-1 text-[10px] text-muted-foreground">
            Quote by {quote.provider}; it can change until you sign. {quote.approval ? `You first approve exactly ${amount} ${holding.symbol} for its contract, then swap; you sign both in this wallet.` : 'You sign it in this wallet.'}
          </p>
        )}
        {vsMarket != null && vsMarket < -3 && <Notice tone="warning">This quote is {Math.abs(vsMarket).toFixed(1)}% below the market rate. Try a smaller amount.</Notice>}
        <ErrorBanner error={error} />
        <BridgeOffer holding={holding} route={route} onBridge={onBridge} compact />
        {link && (
          <a href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 pt-1 text-[11px] text-muted-foreground hover:text-foreground">
            Or swap on {link.name}&apos;s site <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Receive">
        <div className="-mx-1 pb-2">
          {targets.map((t) => (
            <button
              key={t.address || 'native'}
              type="button"
              onClick={() => (setTo(t), setPicking(false))}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60', to?.address === t.address && 'bg-accent/50')}
            >
              <CoinLogo symbol={t.symbol} verified size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.symbol}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {t.name} on {chain.name}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function BridgeDeposit({ holding, route, onBack, onDone }: { holding: Holding; route: BridgeRoute; onBack: () => void; onDone: () => void }) {
  const { currentWallet, backend, homeQrdxChain } = useWallet()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)

  const deposit = async () => {
    if (!currentWallet) return
    setError(null)
    try {
      const raw = parseUnits(amount, holding.decimals)
      if (raw <= 0n || raw > holding.raw) throw new Error(`Enter up to ${formatAmount(holding.raw, holding.decimals)}`)
      const r = await depositToQrdx(backend, currentWallet, holding.chain, route, raw, (s) => setBusy(s === 'approving' ? 'Approving…' : 'Depositing…'))
      setHash(r.hash)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The deposit failed')
    } finally {
      setBusy(null)
    }
  }

  if (hash) {
    return (
      <SettingsPage title="Bridging" onBack={onBack}>
        <Notice tone="success">
          Deposited. {homeQrdxChain.name} mints {route.asset.symbol} to your quantum-safe address once the validators attest it, usually within minutes. It then shows in your portfolio under QRDX.
        </Notice>
        <a href={`${holding.chain.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          View the deposit <ExternalLink className="h-3 w-3" />
        </a>
        <PrimaryButton onClick={onBack}>Done</PrimaryButton>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title={`Bridge ${holding.symbol} to QRDX`} onBack={onBack}>
      <Section title="Amount">
        <div className="p-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="0.00" aria-label="Amount to bridge" className="h-12 w-full rounded-xl border border-border bg-background px-3 text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50" />
          <p className="px-1 pt-1 text-[11px] text-muted-foreground">
            Balance {formatAmount(holding.raw, holding.decimals)} {holding.symbol} on {holding.chain.name}
          </p>
        </div>
      </Section>
      <Notice>
        The lockbox on {holding.chain.name} ({route.lockbox.slice(0, 8)}…) holds your {holding.symbol}; {homeQrdxChain.name} mints the same amount to your quantum-safe address. Withdraw back the same way. A deposit not minted within its window can be refunded by the lockbox&apos;s custodian.
      </Notice>
      <ErrorBanner error={error} />
      <PrimaryButton loading={!!busy} disabled={!amount} onClick={deposit}>
        {busy ?? 'Approve and deposit'}
      </PrimaryButton>
    </SettingsPage>
  )
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  )
}
