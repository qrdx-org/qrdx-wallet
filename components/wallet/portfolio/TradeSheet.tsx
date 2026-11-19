'use client'

/**
 * Trading an asset held on a network QRDX does not run: bring it to QRDX over the bridge and
 * trade it there, or swap it where it is through an aggregator (LI.FI on EVM networks, Jupiter
 * on Solana), with the quote set against the market price. The DEX's own site is linked too.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, CheckCircle2, ExternalLink, Loader2, Repeat, Waypoints } from 'lucide-react'
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
import { CoinLogo, NetworkLogo } from '../CoinLogo'
import { cn } from '@/lib/utils'

type Stage = 'choose' | 'swap' | 'bridge'

export function TradeSheet({ holding, onClose, onDone }: { holding: Holding; onClose: () => void; onDone: () => void }) {
  const { homeQrdxChain, currentWallet, chainAddresses, backend } = useWallet()
  const chain = holding.chain
  const family = chainFamily(chain)
  const owner = family === 'evm' ? (currentWallet?.ethAddress ?? '') : (addressOn(chain, chainAddresses) ?? '')
  const from: SwapToken = { address: holding.address, symbol: holding.symbol, decimals: holding.decimals }
  const [stage, setStage] = useState<Stage>('choose')
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

  const swappable = !chain.isTestnet && (family === 'evm' || family === 'solana')
  const usdc = chain.tokens.find((t) => t.symbol === 'USDC')
  const link = dexLink(chain, from, usdc && usdc.address !== holding.address ? usdc : { address: '', symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals })

  if (stage === 'swap' && currentWallet) {
    return <AggregatorSwap holding={holding} owner={owner} onBack={() => setStage('choose')} onDone={onDone} signer={backend} />
  }
  if (stage === 'bridge' && route && currentWallet) {
    return <BridgeDeposit holding={holding} route={route} onBack={() => setStage('choose')} onDone={onDone} />
  }

  return (
    <SettingsPage title={`Trade ${holding.symbol}`} onBack={onClose}>
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <CoinLogo symbol={holding.symbol} verified={holding.listed} size={22} network={chain} />
        {formatAmount(holding.raw, holding.decimals)} {holding.symbol} on {chain.name}
      </div>

      <Section title="On QRDX">
        <div className="space-y-2 p-3 text-xs">
          <p className="flex items-center gap-2 font-semibold">
            <NetworkLogo chain={homeQrdxChain} size={20} /> Bring it to QRDX and trade there
          </p>
          <p className="text-[11px] text-muted-foreground">
            QRDX&apos;s order books and pools, with your quantum-safe account. The bridge mints {holding.symbol} on QRDX once the validators attest your deposit.
          </p>
          {route === undefined ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking what {homeQrdxChain.name} bridges…
            </p>
          ) : route ? (
            <PrimaryButton onClick={() => setStage('bridge')}>
              <Waypoints className="mr-1.5 h-4 w-4" /> Bridge {holding.symbol} to QRDX
            </PrimaryButton>
          ) : (
            <Notice>
              {family !== 'evm'
                ? `QRDX's bridge takes tokens from EVM networks; ${chain.name} is not bridged.`
                : !holding.address
                  ? `The bridge takes tokens, not ${chain.nativeCurrency.symbol} itself, and ${homeQrdxChain.name} lists none from ${chain.name} yet.`
                  : `${homeQrdxChain.name} does not bridge ${holding.symbol} from ${chain.name} yet.`}
            </Notice>
          )}
        </div>
      </Section>

      <Section title={`On ${chain.name}`}>
        <div className="space-y-2 p-3 text-xs">
          {swappable ? (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <Repeat className="h-4 w-4" /> Swap where it is
              </p>
              <p className="text-[11px] text-muted-foreground">
                {family === 'solana'
                  ? 'Jupiter finds the best price across Raydium, Orca, Meteora and others. You sign in this wallet.'
                  : 'LI.FI finds the best price across Uniswap, SushiSwap, Aerodrome and others on this network. You sign in this wallet.'}
              </p>
              <PrimaryButton variant="outline" onClick={() => setStage('swap')}>
                Get a quote
              </PrimaryButton>
              {link && (
                <a href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 pt-1 text-[11px] text-muted-foreground hover:text-foreground">
                  Or swap on {link.name}&apos;s site <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          ) : (
            <Notice>
              {family === 'bitcoin'
                ? 'Bitcoin has no exchange on its own chain. Send it to an exchange you use, or bridge it to QRDX once QRDX lists it.'
                : `${chain.name} is a test network: aggregators quote mainnets only.`}
            </Notice>
          )}
        </div>
      </Section>
    </SettingsPage>
  )
}

function AggregatorSwap({
  holding,
  owner,
  signer,
  onBack,
  onDone,
}: {
  holding: Holding
  owner: string
  signer: Parameters<typeof executeSwap>[0]
  onBack: () => void
  onDone: () => void
}) {
  const { currentWallet } = useWallet()
  const chain = holding.chain
  const targets = useMemo(
    () => chain.tokens.filter((t) => t.address.toLowerCase() !== holding.address.toLowerCase() && t.symbol !== 'WSOL'),
    [chain, holding.address]
  )
  const [to, setTo] = useState<ChainToken>(() => targets.find((t) => t.symbol === 'USDC') ?? targets[0])
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [market, setMarket] = useState<{ from?: number; to?: number }>({})
  const [busy, setBusy] = useState<'quote' | 'approving' | 'swapping' | 'confirming' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; ok: boolean } | null>(null)

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
      quoteSwap({ chain, owner, from: { address: holding.address, symbol: holding.symbol, decimals: holding.decimals }, to: { address: to.address, symbol: to.symbol, decimals: to.decimals }, amount: raw })
        .then((q) => live && setQuote(q))
        .catch((e) => live && setError(e instanceof Error ? e.message : 'No quote'))
        .finally(() => live && setBusy(null))
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [amount, to, holding, chain, owner])

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

  return (
    <SettingsPage title={`Swap on ${chain.name}`} onBack={onBack}>
      <Section title="You pay">
        <div className="space-y-1.5 p-2">
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount to swap"
              className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <CoinLogo symbol={holding.symbol} verified={holding.listed} size={22} /> {holding.symbol}
            </span>
          </div>
          <div className="flex justify-between px-1 text-[11px] text-muted-foreground">
            <span>
              Balance {formatAmount(holding.raw, holding.decimals)}{' '}
              <button type="button" onClick={() => setAmount(formatUnitsExact(holding.address ? holding.raw : (holding.raw * 95n) / 100n, holding.decimals))} className="font-semibold text-foreground hover:underline">
                {holding.address ? 'Max' : '95%'}
              </button>
            </span>
            {market.from && inAmt > 0 && <span>{formatFiat(inAmt * market.from)}</span>}
          </div>
        </div>
      </Section>

      <div className="flex justify-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>

      <Section title="You get">
        <div className="space-y-2 p-2">
          <div className="flex flex-wrap gap-1.5">
            {targets.map((t) => (
              <button
                key={t.address || 'native'}
                type="button"
                onClick={() => setTo(t)}
                className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', to?.address === t.address ? 'border-foreground/40 bg-accent' : 'border-border/60 hover:bg-accent/50')}
              >
                <CoinLogo symbol={t.symbol} verified size={16} /> {t.symbol}
              </button>
            ))}
          </div>
          <div className="px-1 text-xl font-bold tabular-nums">
            {busy === 'quote' ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : quote ? `${formatAmount(quote.toAmount, to.decimals, 6)} ${to.symbol}` : '—'}
          </div>
          {quote && market.to && <p className="px-1 text-[11px] text-muted-foreground">{formatFiat(out * market.to)}</p>}
        </div>
      </Section>

      {quote && (
        <Section>
          <div className="space-y-1.5 p-3 text-[11px]">
            {rate && (
              <Line k="Rate" v={`1 ${holding.symbol} = ${rate.toPrecision(6)} ${to.symbol}`} />
            )}
            {marketRate && (
              <Line
                k="Market rate"
                v={
                  <>
                    {marketRate.toPrecision(6)} {to.symbol}
                    {vsMarket != null && (
                      <span className={cn('ml-1', vsMarket < -1 ? 'text-red-500' : 'text-muted-foreground')}>
                        ({vsMarket >= 0 ? '+' : ''}
                        {vsMarket.toFixed(2)}%)
                      </span>
                    )}
                  </>
                }
              />
            )}
            {market.from && <Line k={`${holding.symbol} price`} v={formatFiatPrice(market.from)} />}
            <Line k="At least" v={`${formatAmount(quote.toAmountMin, to.decimals, 6)} ${to.symbol} (0.5% slippage)`} />
            {quote.priceImpact != null && <Line k="Price impact" v={<span className={quote.priceImpact > 2 ? 'text-red-500' : ''}>{quote.priceImpact.toFixed(2)}%</span>} />}
            {quote.feeUsd != null && <Line k="Network fee" v={`about ${formatFiat(quote.feeUsd)}`} />}
            {quote.serviceFee && <Line k={quote.serviceFee.name} v={`${quote.serviceFee.percent.toFixed(2)}%${quote.serviceFee.usd ? ` · ${formatFiat(quote.serviceFee.usd)}` : ''}, in the rate`} />}
            <Line k="Route" v={quote.route.length ? quote.route.join(' → ') : quote.provider} />
            <p className="pt-1 text-[10px] text-muted-foreground">
              Quote by {quote.provider}. {quote.approval ? `First you approve exactly ${amount} ${holding.symbol} for its contract; then the swap. ` : ''}It can change until you sign.
            </p>
          </div>
        </Section>
      )}
      {vsMarket != null && vsMarket < -3 && <Notice tone="warning">This quote is {Math.abs(vsMarket).toFixed(1)}% below the market rate. Try a smaller amount.</Notice>}
      <ErrorBanner error={error} />
      <PrimaryButton loading={!!busy && busy !== 'quote'} disabled={!quote || !!busy} onClick={swap}>
        {busy === 'approving' ? 'Approving…' : busy === 'swapping' ? 'Swapping…' : busy === 'confirming' ? 'Confirming…' : 'Swap'}
      </PrimaryButton>
    </SettingsPage>
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
