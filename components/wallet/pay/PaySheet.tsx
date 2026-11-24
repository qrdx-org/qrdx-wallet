'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import SlideCommit from '@/components/SlideCommit'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { CHAIN_LIST, chainFamily, isQrdxChain } from '@/src/core/chains'
import { ethToWei, weiToEth } from '@/src/core/ethereum'
import { formatFiat as formatUsd } from '@/src/core/fiat'
import { isQnsName, resolveQnsName } from '@/src/core/qns'
import type { ScannedPayment } from '@/src/core/payment-uri'
import type { SendQuote } from '@/src/core/tx-service'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/motion/Loading'
import { CtaButton } from '@/components/motion/CtaButton'
import { Segment } from '@/components/motion/Segment'
import { TxStatus } from '@/components/motion/TxStatus'
import { Sheet } from '../flow/FlowKit'
import { NetworkLogo } from '../CoinLogo'

/** The slider's colours on black and on white. */
const SLIDE = {
  dark: { trackColor: '#262626', handleColor: '#f5f5f5' },
  light: { trackColor: '#e5e5e5', handleColor: '#0a0a0a' },
}

/**
 * Paying a request (a scanned payment QR, or the wallet link one holds; src/core/payment-uri.ts):
 * what it costs, in full, and a slide to pay.
 *
 * The request says who, how much, on which network and in what; nothing else in it is trusted.
 * Its network must be one this wallet knows (it switches to it); its token must be one the
 * account holds there (the wallet's own name and decimals for it, never the code's); a QRDX name
 * is resolved and its address shown. The fee is quoted from the network before the slider wakes,
 * and the payment is the wallet's ordinary send.
 */
export function PaySheet({ request, onClose }: { request: ScannedPayment & { amount: string }; onClose: () => void }) {
  const { activeChain, setActiveChain, balances, pqBalances, balancesLoading, quoteSend, send, prices, networkStatus, transactions, refreshTransactions } = useWallet()
  const { resolvedTheme } = useTheme()
  const target = request.chainId ? CHAIN_LIST.find((c) => c.chainId === request.chainId && chainFamily(c) === 'evm') : chainFamily(activeChain) === 'evm' ? activeChain : undefined
  const onChain = !!target && target.id === activeChain.id
  const qrdx = isQrdxChain(activeChain)
  const [credential, setCredential] = useState<'pq' | 'classic'>(qrdx ? 'pq' : 'classic')
  const [quote, setQuote] = useState<SendQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [resolved, setResolved] = useState<{ name: string; address: string | null } | null>(null)
  const slideBox = useRef<HTMLDivElement>(null)
  const [slideWidth, setSlideWidth] = useState(300)

  // The request's network: switch to it (the wallet asks nothing else of it).
  useEffect(() => {
    if (target && target.id !== activeChain.id) setActiveChain(target.id)
  }, [target, activeChain.id, setActiveChain])
  useEffect(() => setCredential(qrdx ? 'pq' : 'classic'), [qrdx])

  // Paid: the payment's mark spins until its block, then ticks (or crosses); read from the
  // account's activity, refreshed while it waits.
  const sent = hash ? transactions.find((t) => t.hash.toLowerCase() === hash.toLowerCase()) : undefined
  const sentState = sent?.status ?? 'pending'
  useEffect(() => {
    if (!hash || sentState !== 'pending') return
    const t = setInterval(() => void refreshTransactions(), 5000)
    return () => clearInterval(t)
  }, [hash, sentState, refreshTransactions])

  // A QRDX name pays the address it points to, shown.
  const named = isQnsName(request.to)
  useEffect(() => {
    if (!named || !onChain) return
    let off = false
    resolveQnsName(activeChain, request.to)
      .then((r) => !off && setResolved({ name: r.name, address: r.state === 'resolved' ? r.address : null }))
      .catch(() => !off && setResolved({ name: request.to, address: null }))
    return () => {
      off = true
    }
  }, [named, onChain, activeChain, request.to])
  const to = named ? (resolved?.address ?? null) : request.to

  const list = credential === 'pq' ? pqBalances : balances
  const native = list.find((b) => !b.address)
  const asset = request.token ? list.find((b) => b.address.toLowerCase() === request.token!.toLowerCase()) : native
  const symbol = asset?.symbol ?? (request.token ? 'tokens' : activeChain.nativeCurrency.symbol)
  const amountBase = useMemo(() => {
    try {
      return asset ? ethToWei(request.amount, asset.decimals) : null
    } catch {
      return null
    }
  }, [asset, request.amount])

  // The fee, from the network, once everything it needs is known.
  useEffect(() => {
    // Once paid, the quote it was paid with stays on show.
    if (hash) return
    setQuote(null)
    setQuoteError(null)
    if (!onChain || !to || !asset || amountBase === null) return
    let off = false
    quoteSend({ credential, to, amount: request.amount, token: asset.address ? { address: asset.address, decimals: asset.decimals, symbol: asset.symbol } : undefined })
      .then((q) => !off && setQuote(q))
      .catch((e) => !off && setQuoteError(e instanceof Error ? e.message : 'Could not estimate the fee'))
    return () => {
      off = true
    }
  }, [onChain, to, asset?.address, asset?.decimals, credential, request.amount, amountBase, hash]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = slideBox.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSlideWidth(Math.max(220, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fee = quote ? BigInt(quote.fee) : null
  const nativeSymbol = activeChain.nativeCurrency.symbol
  const usd = (sym: string, v: string) => {
    const p = prices.get(sym.toUpperCase())?.usd
    const n = Number(v)
    return p && Number.isFinite(n) ? `≈ ${formatUsd(n * p)}` : null
  }
  const isNative = !!asset && !asset.address
  const short = fee !== null && asset && amountBase !== null && (isNative ? asset.rawBalance < amountBase + fee : asset.rawBalance < amountBase || (native?.rawBalance ?? 0n) < fee)
  const networkBlocked = networkStatus.state === 'mismatch' || networkStatus.state === 'unreachable'

  const problem = !target
    ? `This request is for network ${request.chainId}, which this wallet does not know.`
    : !onChain || balancesLoading
      ? null
      : named && resolved && !resolved.address
        ? `${resolved.name} is not a registered QRDX name.`
        : request.token && !asset
          ? `You hold none of that token (${request.token.slice(0, 10)}…) on ${activeChain.name}. The wallet does not take a token's name from a code.`
          : amountBase === null
            ? 'The amount is not one this token can hold.'
            : networkBlocked
              ? `${activeChain.name} cannot be verified right now.`
              : short
                ? `Not enough: you hold ${asset!.formattedBalance} ${asset!.symbol}${isNative ? ', and the fee comes on top' : ''}.`
                : quoteError
  const ready = !!quote && !problem && !!to && !!asset

  const pay = async () => {
    setPayError(null)
    if (!ready || !to || !asset) throw new Error('Not ready')
    const r = await send({ credential, to, amount: request.amount, token: asset.address ? { address: asset.address, decimals: asset.decimals, symbol: asset.symbol } : undefined }, quote!)
    setHash(r.hash)
  }

  const total = fee !== null && isNative && amountBase !== null ? weiToEth(amountBase + fee, asset!.decimals) : null
  const after = fee !== null && asset && amountBase !== null && !short ? weiToEth(asset.rawBalance - amountBase - (isNative ? fee : 0n), asset.decimals) : null

  return (
    <Sheet title="Pay request" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">They ask for</p>
          <p className="mt-1 text-4xl font-semibold tracking-[-0.03em] tabular-nums">
            {request.amount} <span className="text-2xl">{symbol}</span>
          </p>
          {asset && <p className="text-xs text-muted-foreground">{usd(asset.symbol, request.amount) ?? 'no USD price'}</p>}
        </div>

        {request.note && (
          <blockquote className="rounded-xl border border-border/60 px-3 py-2 text-xs">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Their note</span>
            <span className="break-words">“{request.note}”</span>
          </blockquote>
        )}

        <dl className="divide-y divide-border/60 rounded-xl border border-border/70 text-xs">
          <Row k="To">
            {named && <span className="block font-semibold">{request.to}</span>}
            <span className="block break-all font-mono text-[11px]">{to ?? (named ? 'Resolving…' : request.to)}</span>
          </Row>
          <Row k="Network">
            <span className="inline-flex items-center gap-1.5">
              {target && <NetworkLogo chain={target} size={14} />} {target?.name ?? `#${request.chainId}`}
            </span>
          </Row>
          {qrdx && onChain && (
            <Row k="Pay from">
              <Segment<'pq' | 'classic'>
                label="Pay from"
                fill={false}
                disabled={!!hash}
                value={credential}
                onChange={setCredential}
                options={[
                  { value: 'pq', label: 'Quantum-safe' },
                  { value: 'classic', label: 'Classic' },
                ]}
              />
            </Row>
          )}
          <Row k="Network fee">
            {quote ? (
              <>
                {Number(quote.feeFormatted).toLocaleString('en-US', { maximumFractionDigits: 6 })} {nativeSymbol}
                {usd(nativeSymbol, quote.feeFormatted) && <span className="block text-[10px] text-muted-foreground">{usd(nativeSymbol, quote.feeFormatted)}</span>}
              </>
            ) : problem ? (
              '—'
            ) : (
              <Spinner size={12} label="Estimating the fee" />
            )}
          </Row>
          {total && (
            <Row k="Total" strong>
              {total} {nativeSymbol}
              {usd(nativeSymbol, total) && <span className="block text-[10px] font-normal text-muted-foreground">{usd(nativeSymbol, total)}</span>}
            </Row>
          )}
          {after && (
            <Row k="Balance after">
              {after} {asset!.symbol}
            </Row>
          )}
        </dl>

        {problem && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {problem}
          </p>
        )}

        {hash ? (
          <div className="space-y-3 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold" aria-live="polite">
              <TxStatus status={sentState} size={20} />
              {sentState === 'confirmed' ? `Paid. Confirmed on ${activeChain.name}.` : sentState === 'failed' ? `It failed on ${activeChain.name}.` : `Sent. Confirming on ${activeChain.name}.`}
            </p>
            <a href={`${activeChain.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground underline">
              {hash.slice(0, 18)}… <ExternalLink className="h-3 w-3" />
            </a>
            <CtaButton onClick={onClose} className="h-12 w-full text-base">
              Done
            </CtaButton>
          </div>
        ) : (
          <>
            <div ref={slideBox} className="flex justify-center">
              <SlideCommit
                width={slideWidth}
                height={58}
                radius={29}
                label={`Slide to pay ${request.amount} ${symbol}`}
                doneLabel="Paid"
                errorLabel="Payment failed"
                disabled={!ready}
                onConfirm={pay}
                onError={(e) => setPayError(e instanceof Error ? e.message : 'The payment failed')}
                successColor="#22c55e"
                dangerColor="#e5484d"
                {...SLIDE[resolvedTheme === 'light' ? 'light' : 'dark']}
              />
            </div>
            {payError && <p className="text-center text-xs text-red-500">{payError}</p>}
            <p className="text-center text-[10px] leading-relaxed text-muted-foreground">Only pay requests you expect. A payment cannot be reversed.</p>
          </>
        )}
      </div>
    </Sheet>
  )
}

function Row({ k, strong, children }: { k: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className={cn('min-w-0 text-right', strong && 'font-semibold')}>{children}</dd>
    </div>
  )
}
