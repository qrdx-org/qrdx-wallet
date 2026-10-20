'use client'

/**
 * Swap on QRDX's native exchange (AMM pools + spot order books, routed by the node),
 * laid out like trade.qrdx.org's swap.
 *
 * Swaps are exchange transactions signed by the account's quantum-safe (0xPQ)
 * key and paid from that account's balances. The quote comes from the node's
 * router; the transaction carries `min_amount_out` derived from it and a
 * deadline, so it fails rather than fills at a worse price. It is reviewed in a
 * sheet that decodes exactly what will be signed.
 *
 * Token logos and USD estimates come from the trade API when it serves this
 * network; without it the swap still works on the node alone.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, ArrowLeft, ChevronDown, Loader2, Repeat, Search, ShieldCheck } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { weiToEth } from '@/src/core/ethereum'
import { exchange, minimumOut, NATIVE_QRDX, type ExchangeToken, type SwapQuote } from '@/src/core/exchange-client'
import { shortenAddress } from '@/src/core/address'
import { tradeApiBase, tradeGet } from '@/src/core/trade/api'
import { percent, size as fmtSize, usd } from '@/src/core/trade/format'
import type { ApiAsset, IndexPrice } from '@/src/core/trade/types'
import { routeOps, type RoutedQuote } from '@/src/core/trade/routing'
import { Line, Sheet, TokenBadge, useDebounced } from './trade/kit'
import { SubmissionList, useTradeSubmit } from './trade/submit'
import { cn } from '@/lib/utils'

interface SwapModalProps {
  onClose: () => void
  /** Pay with this token (a token address, or QRDX) instead of QRDX. */
  initialFrom?: string
}

interface Asset {
  id: string // "QRDX" or token address
  symbol: string
  name: string
  balance: string | null
  verified: boolean
  slug: string | null
}

const SLIPPAGE = ['0.1', '0.5', '1', '3'] as const
const DEADLINES = [5, 10, 30] as const
const SETTINGS_KEY = 'qrdx_swap_settings'

/** Max slippage (percent, as typed) and how long a signed swap stays valid; kept per device. */
interface SwapSettings {
  slippage: string
  deadlineMin: number
}

function readSettings(): SwapSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<SwapSettings> | null
    const slippage = typeof raw?.slippage === 'string' && validSlippage(raw.slippage) ? raw.slippage : '0.5'
    const deadlineMin = DEADLINES.includes(raw?.deadlineMin as 5) ? (raw!.deadlineMin as number) : 10
    return { slippage, deadlineMin }
  } catch {
    return { slippage: '0.5', deadlineMin: 10 }
  }
}

/** A swap's deadline: `minutes` from now, in seconds (block time). */
const deadlineIn = (minutes: number) => Math.floor(Date.now() / 1000) + minutes * 60

const validSlippage = (v: string) => /^\d*\.?\d+$/.test(v) && Number(v) > 0 && Number(v) <= 50

export function SwapModal({ onClose, initialFrom }: SwapModalProps) {
  const { activeChain, currentWallet, pqBalance, fetchBalances } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const api = qrdx ? tradeApiBase(activeChain) : null
  const [tokens, setTokens] = useState<ExchangeToken[]>([])
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<Record<string, ApiAsset>>({})
  const [usdPrices, setUsdPrices] = useState<Record<string, string>>({})
  const [fromId, setFromId] = useState(initialFrom && initialFrom.toUpperCase() !== 'QRDX' ? initialFrom : NATIVE_QRDX)
  const [toId, setToId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [settings, setSettingsState] = useState<SwapSettings>(readSettings)
  const [customSlippage, setCustomSlippage] = useState('')
  const slippage = settings.slippage
  const setSettings = (next: Partial<SwapSettings>) =>
    setSettingsState((prev) => {
      const merged = { ...prev, ...next }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
      } catch {
        /* storage unavailable: this visit only */
      }
      return merged
    })
  const [quoted, setQuoted] = useState<{ key: string; quote: SwapQuote | null; error: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const { ask, sheet, submissions } = useTradeSubmit()
  const pq = currentWallet?.pqAddress ?? ''

  const loadBalances = (list: ExchangeToken[]) =>
    Promise.all(
      list.map((t) =>
        exchange
          .tokenBalance(activeChain, t.token_address, pq)
          .then((b) => [t.token_address, b] as const)
          .catch(() => [t.token_address, '0'] as const)
      )
    ).then((entries) => setBalances(Object.fromEntries(entries)))

  useEffect(() => {
    if (!qrdx || !pq) return
    exchange
      .tokens(activeChain)
      .then((list) => {
        setTokens(list)
        if (!toId) {
          const first = list.find((t) => t.token_address.toLowerCase() !== fromId.toLowerCase())
          setToId(fromId === NATIVE_QRDX ? (first?.token_address ?? '') : NATIVE_QRDX)
        }
        return loadBalances(list)
      })
      .catch((e) => setError(e instanceof Error ? `Could not load the token list: ${e.message}` : 'Could not load tokens'))
    // Logos, verification and USD prices from the trade API, when it serves this network.
    if (api) {
      // `assets` are the verified ones on this network, `tokens` everything else.
      tradeGet<{ assets: ApiAsset[]; tokens: ApiAsset[] }>(api, '/assets?all=1')
        .then((r) => {
          const all = [...r.assets, ...r.tokens].filter((t) => t.address)
          setMeta(Object.fromEntries(all.map((t) => [t.address!.toLowerCase(), t])))
        })
        .catch(() => undefined)
    }
  }, [qrdx, pq, activeChain]) // eslint-disable-line react-hooks/exhaustive-deps

  const assets: Asset[] = useMemo(() => {
    const m = (addr: string) => meta[addr.toLowerCase()]
    return [
      { id: NATIVE_QRDX, symbol: 'QRDX', name: 'QRDX', balance: pqBalance !== null ? weiToEth(pqBalance, 18) : null, verified: true, slug: 'qrdx' },
      ...tokens.map((t) => ({
        id: t.token_address,
        symbol: t.symbol,
        name: t.name,
        balance: balances[t.token_address] ?? null,
        verified: m(t.token_address)?.verified ?? false,
        slug: m(t.token_address)?.slug ?? null,
      })),
    ]
  }, [tokens, balances, pqBalance, meta])

  // USD estimates for the two sides (routed through pools when needed).
  useEffect(() => {
    if (!api) return
    const ids = [fromId, toId].filter((x) => x && x !== NATIVE_QRDX)
    const segs = [...ids, ...(fromId === NATIVE_QRDX || toId === NATIVE_QRDX ? ['qrdx'] : [])]
    if (!segs.length) return
    tradeGet<{ prices: Record<string, IndexPrice | null> }>(api, `/prices?assets=${segs.join(',')}`)
      .then((r) => {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(r.prices)) if (v) out[k === 'qrdx' ? NATIVE_QRDX : k.toLowerCase()] = v.price
        setUsdPrices(out)
      })
      .catch(() => setUsdPrices({}))
  }, [api, fromId, toId])
  const usdOf = (id: string, amt: string | null | undefined) => {
    const p = usdPrices[id === NATIVE_QRDX ? NATIVE_QRDX : id.toLowerCase()]
    return p && amt && Number(amt) > 0 ? `≈ ${usd(String(Number(amt) * Number(p)))}` : ''
  }

  const from = assets.find((a) => a.id === fromId)
  const to = assets.find((a) => a.id === toId)
  const amountOk = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  const exceeds = amountOk && from?.balance != null && Number(amount) > Number(from.balance)
  const debounced = useDebounced(amount, 400)

  // A quote belongs to the exact inputs it was asked for.
  const quoteKey = qrdx && pq && toId && fromId !== toId && /^\d*\.?\d+$/.test(debounced) && Number(debounced) > 0 ? `${fromId}|${toId}|${debounced}` : null
  useEffect(() => {
    if (!quoteKey) return
    let cancelled = false
    exchange
      .quoteSwap(activeChain, fromId, toId, debounced, pq)
      .then((q) => !cancelled && setQuoted({ key: quoteKey, quote: q, error: null }))
      .catch((e) => !cancelled && setQuoted({ key: quoteKey, quote: null, error: e instanceof Error ? e.message : 'No quote' }))
    return () => {
      cancelled = true
    }
  }, [quoteKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // Smart routing (the trade API's /quote/route): through up to two tokens in between when no
  // direct market pays as much. Without the API, swaps stay on the direct pair.
  const [routed, setRouted] = useState<{ key: string; route: RoutedQuote | null } | null>(null)
  useEffect(() => {
    if (!quoteKey || !api) return
    let cancelled = false
    const seg = (id: string) => (id === NATIVE_QRDX ? 'qrdx' : id.toLowerCase())
    tradeGet<RoutedQuote>(api, `/quote/route?from=${seg(fromId)}&to=${seg(toId)}&amount=${debounced}&sender=${pq}`)
      .then((r) => !cancelled && setRouted({ key: quoteKey, route: r }))
      .catch(() => !cancelled && setRouted({ key: quoteKey, route: null }))
    return () => {
      cancelled = true
    }
  }, [quoteKey, api]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = quoteKey && debounced === amount && quoted?.key === quoteKey ? quoted : null
  const directQuote = current?.quote ?? null
  const routeNow = quoteKey && debounced === amount && routed?.key === quoteKey ? routed.route : null
  // The longer route only when it delivers more than the pair itself (or the pair has no market).
  const route = routeNow && routeNow.hops.length > 1 && (!directQuote || Number(routeNow.amountOut) > Number(directQuote.amount_out)) ? routeNow : null
  const quote = route
    ? { ...(directQuote ?? {}), source: 'route', pool_id: null, amount_in: route.amountIn, amount_out: route.amountOut, unfilled_in: '0', fee: '0', execution_price: route.executionPrice, price_impact: route.priceImpact ?? undefined } as NonNullable<typeof directQuote>
    : directQuote
  const quoting = !!amountOk && !current && !!toId && fromId !== toId

  const flip = () => {
    if (!toId) return
    setFromId(toId)
    setToId(fromId)
    setAmount('')
  }

  const review = () => {
    if (!quote || !from || !to) return
    if (route) {
      const { ops, minOut } = routeOps(route.hops, amount, Number(slippage), deadlineIn(settings.deadlineMin))
      const symbols = Object.fromEntries(route.hops.flatMap((h) => [h.from, h.to]).filter((a) => a.address && a.address !== NATIVE_QRDX).map((a) => [a.address!, a.symbol]))
      const label = (i: number) => `Swap ${route.hops[i].from.symbol} → ${route.hops[i].to.symbol} (${i + 1} of ${route.hops.length})`
      const last = ops[ops.length - 1]
      ask({
        op: 'SWAP',
        params: last.params,
        before: ops.slice(0, -1).map((o, i) => ({ op: 'SWAP' as const, params: o.params, label: label(i) })),
        label: `Swap ${amount} ${from.symbol} → ≥ ${fmtSize(minOut)} ${to.symbol} through ${route.hops.slice(0, -1).map((h) => h.to.symbol).join(', ')}`,
        symbols,
        estimates: [
          { k: 'Route', v: [route.hops[0].from.symbol, ...route.hops.map((h) => h.to.symbol)].join(' → ') },
          { k: 'Expected', v: `${fmtSize(route.amountOut)} ${to.symbol}` },
          ...(route.directAmountOut ? [{ k: 'Directly', v: `${fmtSize(route.directAmountOut)} ${to.symbol}` }] : []),
          { k: 'In one approval', v: `${ops.length} swaps, applied in order; each refuses to fill below its own minimum, and if a later one does, you keep what the earlier ones bought` },
        ],
        onDone: () => {
          setAmount('')
          fetchBalances()
          loadBalances(tokens)
        },
      })
      return
    }
    const min = minimumOut(quote.amount_out, Number(slippage))
    ask({
      op: 'SWAP',
      params: {
        token_in: fromId,
        token_out: toId,
        amount_in: amount,
        min_amount_out: min,
        deadline: deadlineIn(settings.deadlineMin),
      },
      label: `Swap ${amount} ${from.symbol} → ≥ ${fmtSize(min)} ${to.symbol}`,
      symbols: Object.fromEntries(assets.filter((a) => a.id !== NATIVE_QRDX).map((a) => [a.id, a.symbol])),
      estimates: [
        { k: 'Expected', v: `${fmtSize(quote.amount_out)} ${to.symbol}` },
        { k: 'Max slippage', v: `${slippage}% · valid for ${settings.deadlineMin} min` },
        { k: 'Route', v: quote.source === 'clob' ? 'Order book' : `Pool ${quote.pool_id?.slice(0, 8) ?? ''}` },
        ...(quote.price_impact ? [{ k: 'Price impact', v: percent(String(Number(quote.price_impact) * 100), false) }] : []),
      ],
      onDone: () => {
        setAmount('')
        fetchBalances()
        loadBalances(tokens)
      },
    })
  }

  const problem = !amountOk
    ? 'Enter an amount'
    : !toId
      ? 'Choose a token'
      : exceeds
        ? `Not enough ${from?.symbol}`
        : current?.error && !route
          ? noRoute(current.error, from, to)
          : !quote
            ? 'Getting a quote…'
            : null

  return (
    <div className="flex min-h-screen flex-col mono-backdrop">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Swap</h1>
            <p className="text-[10px] text-muted-foreground">{activeChain.name} · routed to the best of the book and the pools</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-4">
        {!qrdx ? (
          <div className="py-12 text-center">
            <Repeat className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-semibold">Swaps run on QRDX networks</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
              {activeChain.name} has no built-in exchange. Switch to a QRDX network to swap with your quantum-safe account.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border bg-card p-1.5 shadow-xl shadow-black/5">
              <SidePanel
                label="You pay"
                asset={from}
                onPick={() => setPicking('from')}
                onMax={from?.balance ? () => setAmount(from.balance!) : undefined}
                usdLine={usdOf(fromId, amount)}
              >
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  aria-label="Amount to pay"
                  className="num h-12 w-full min-w-0 bg-transparent text-right text-3xl font-semibold outline-none placeholder:text-muted-foreground/40"
                />
              </SidePanel>
              <div className="relative z-10 -my-3 flex justify-center">
                <button
                  type="button"
                  onClick={flip}
                  aria-label="Swap direction"
                  className="rounded-xl border-4 border-card bg-muted p-2 transition-transform hover:rotate-180"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </button>
              </div>
              <SidePanel label="You receive" asset={to} onPick={() => setPicking('to')} usdLine={usdOf(toId, quote?.amount_out)}>
                <div className={cn('num h-12 truncate text-right text-3xl font-semibold leading-[3rem]', quote ? 'text-foreground' : 'text-muted-foreground/40')}>
                  {quoting ? <Loader2 className="ml-auto mt-3 h-6 w-6 animate-spin text-muted-foreground" /> : quote ? fmtSize(quote.amount_out) : '0'}
                </div>
              </SidePanel>

              <div className="space-y-1.5 px-2.5 pb-2 pt-3">
                <Line k="Rate" v={quote && from && to ? `1 ${to.symbol} = ${fmtSize(quote.execution_price)} ${from.symbol}` : '—'} />
                <Line
                  k="Minimum received"
                  v={quote && to ? `${fmtSize(route ? routeOps(route.hops, amount, Number(slippage), 0).minOut : minimumOut(quote.amount_out, Number(slippage)))} ${to.symbol}` : '—'}
                />
                <Line k="Price impact" v={quote?.price_impact ? percent(String(Number(quote.price_impact) * 100), false) : quote ? 'n/a (order book)' : '—'} />
                <Line
                  k="Route"
                  v={route ? [route.hops[0].from.symbol, ...route.hops.map((h) => h.to.symbol)].join(' → ') : quote ? (quote.source === 'clob' ? 'Order book' : `Pool ${quote.pool_id?.slice(0, 8) ?? ''}`) : '—'}
                />
                <Line k="Fee" v={route ? route.hops.map((h) => `${fmtSize(h.fee)} ${h.from.symbol}`).join(' + ') : quote && from ? `${fmtSize(quote.fee)} ${from.symbol}` : '—'} />
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">Max slippage</span>
                  <span className="flex items-center gap-0.5">
                    {SLIPPAGE.map((s) => (
                      <button key={s} type="button" onClick={() => (setSettings({ slippage: s }), setCustomSlippage(''))} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium', slippage === s && !customSlippage ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent')}>
                        {s}%
                      </button>
                    ))}
                    <input
                      inputMode="decimal"
                      value={customSlippage || (SLIPPAGE.includes(slippage as '0.5') ? '' : slippage)}
                      onChange={(e) => {
                        const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '')
                        setCustomSlippage(v)
                        if (validSlippage(v)) setSettings({ slippage: v })
                      }}
                      placeholder="Custom"
                      aria-label="Custom max slippage in percent"
                      className={cn('num h-5 w-14 rounded-md border bg-transparent px-1 text-right text-[10px] outline-none', customSlippage && !validSlippage(customSlippage) ? 'border-foreground' : 'border-border')}
                    />
                  </span>
                </div>
                {Number(slippage) >= 5 && <p className="text-[10px] text-muted-foreground">High slippage: the swap may fill well below the quote.</p>}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Valid for</span>
                  <span className="flex gap-0.5">
                    {DEADLINES.map((d) => (
                      <button key={d} type="button" onClick={() => setSettings({ deadlineMin: d })} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium', settings.deadlineMin === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent')}>
                        {d} min
                      </button>
                    ))}
                  </span>
                </div>
                {quote && Number(quote.unfilled_in) > 0 && <p className="text-[11px] text-amber-500">Only {quote.amount_in} of {amount} can fill at current liquidity.</p>}
              </div>
              <button
                type="button"
                onClick={review}
                disabled={!!problem}
                className="h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {problem ?? `Review swap`}
              </button>
            </div>

            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-500">{error}</p>}
            <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Signed by your quantum-safe account <span className="font-mono">{shortenAddress(pq, 4)}</span>
            </p>

            {submissions.length > 0 && (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="border-b px-3 py-2 text-[11px] font-semibold">Recent swaps</div>
                <SubmissionList items={submissions} />
              </div>
            )}
          </>
        )}
      </div>

      <TokenPicker
        open={picking !== null}
        assets={assets.filter((a) => (picking === 'to' ? a.id !== fromId : true))}
        onClose={() => setPicking(null)}
        onPick={(a) => {
          if (picking === 'from') {
            setFromId(a.id)
            if (a.id === toId) setToId(fromId)
          } else setToId(a.id)
          setPicking(null)
        }}
      />
      {sheet}
    </div>
  )
}

/** The node's "no liquidity …" in words. Native QRDX trades directly against tokens with a pool. */
function noRoute(error: string, from: Asset | undefined, to: Asset | undefined): string {
  if (!/liquidity|not found|no route/i.test(error)) return error
  return `No pool or order book trades ${from?.symbol}/${to?.symbol} yet`
}

function SidePanel({
  label,
  asset,
  onPick,
  onMax,
  usdLine,
  children,
}: {
  label: string
  asset: Asset | undefined
  onPick: () => void
  onMax?: () => void
  usdLine: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-3.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        {asset?.balance != null && (
          <button type="button" onClick={onMax} disabled={!onMax} className="num hover:text-foreground disabled:hover:text-muted-foreground">
            Balance {fmtSize(asset.balance)}
            {onMax && <span className="ml-1 font-semibold text-foreground">Max</span>}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" onClick={onPick} className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2 text-sm font-semibold shadow-sm hover:bg-accent">
          {asset ? <TokenBadge asset={asset} size="md" /> : <span className="h-7 w-7 rounded-full bg-muted" />}
          {asset?.symbol ?? 'Select'}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span className={cn(!asset?.verified && asset && 'text-amber-500')}>{asset && !asset.verified ? `Unverified · ${shortenAddress(asset.id, 4)}` : ''}</span>
        <span className="num">{usdLine}</span>
      </div>
    </div>
  )
}

function TokenPicker({ open, assets, onClose, onPick }: { open: boolean; assets: Asset[]; onClose: () => void; onPick: (a: Asset) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = assets
    .filter((a) => !needle || a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || a.id.toLowerCase() === needle)
    .sort((a, b) => Number(b.verified) - Number(a.verified) || Number(b.balance ?? 0) - Number(a.balance ?? 0))
  return (
    <Sheet open={open} onClose={onClose} title="Select a token">
      <div className="mb-2 flex items-center gap-2 rounded-xl border px-3">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol, name or address" className="h-10 w-full bg-transparent text-sm outline-none" />
      </div>
      <div className="-mx-1">
        {rows.map((a) => (
          <button key={a.id} type="button" onClick={() => onPick(a)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/60">
            <TokenBadge asset={a} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{a.symbol}</span>
              <span className={cn('block truncate text-[10px]', a.verified ? 'text-muted-foreground' : 'text-amber-500')}>
                {a.verified ? a.name : `Unverified · ${shortenAddress(a.id, 4)}`}
              </span>
            </span>
            <span className="num text-right text-xs">{a.balance != null ? fmtSize(a.balance) : ''}</span>
          </button>
        ))}
        {!rows.length && <p className="py-6 text-center text-xs text-muted-foreground">No token matches.</p>}
      </div>
    </Sheet>
  )
}
