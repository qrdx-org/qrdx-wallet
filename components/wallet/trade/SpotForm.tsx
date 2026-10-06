'use client'

import { useEffect, useMemo, useState } from 'react'
import { S, dec, div, isAmount, lessSlippage, mul, round, str } from '@/src/core/trade/decimal'
import { fixed, percent, price as fmtPrice, size as fmtSize } from '@/src/core/trade/format'
import { spotLimitParams, type Side } from '@/src/core/trade/orders'
import type { AccountResponse, OrderBook, SpotMarket, SwapQuote } from '@/src/core/trade/types'
import { AmountField, Line, Pills, useDebounced, useTradeApi } from './kit'
import type { TradeRequest } from './submit'
import { cn } from '@/lib/utils'

const SLIPPAGE = ['0.1', '0.5', '1', '3'] as const

/**
 * Spot orders: limit orders rest on the QRDX book and lock their funds; market
 * orders are quoted swaps routed to the better of the book and the pools, signed
 * with a minimum out so they never fill below the slippage allowance.
 */
export function SpotForm({
  api,
  market,
  book,
  account,
  trader,
  pickedPrice,
  ask,
  onDone,
}: {
  api: string
  market: SpotMarket
  book: OrderBook | null
  account: AccountResponse | null
  trader: string
  pickedPrice: string | null
  ask: (r: TradeRequest) => void
  onDone: () => void
}) {
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('limit')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState<(typeof SLIPPAGE)[number]>('0.5')
  const { base, quote } = market
  const ref = Number(book?.mid ?? market.last ?? 1)
  const places = decimalsFor(ref)

  useEffect(() => {
    if (pickedPrice) {
      setPrice(round(pickedPrice, places))
      setKind('limit')
    }
  }, [pickedPrice]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPrice('')
    setSize('')
    setAmountIn('')
  }, [market.id])
  useEffect(() => {
    if (!price && book?.mid) setPrice(round(book.mid, places))
  }, [book?.mid, price, places])

  const balanceOf = (address: string | null) => (address && account?.balances.find((b) => b.asset.address === address)?.balance) || '0'
  const avail = side === 'buy' ? balanceOf(quote.address) : balanceOf(base.address)
  const availSym = side === 'buy' ? quote.symbol : base.symbol

  const swapIn = useDebounced(amountIn, 350)
  const quotePath =
    kind === 'market' && isAmount(swapIn) && dec(swapIn) > 0n
      ? `/quote?from=${side === 'buy' ? quote.segment : base.segment}&to=${side === 'buy' ? base.segment : quote.segment}&amount=${swapIn}&venue=auto&sender=${trader}`
      : null
  const q = useTradeApi<SwapQuote>(api, quotePath, 10_000)
  const total = useMemo(() => (isAmount(price) && isAmount(size) ? str(mul(dec(price), dec(size))) : null), [price, size])

  const problem = (() => {
    if (market.status !== 'live') return 'No on-chain market'
    if (kind === 'limit') {
      if (!isAmount(price) || dec(price) <= 0n) return 'Enter a price'
      if (!isAmount(size, base.decimals) || dec(size) <= 0n) return 'Enter a size'
      if (dec(side === 'buy' ? total! : size) > dec(avail)) return `Not enough ${availSym}`
    } else {
      const d = side === 'buy' ? quote.decimals : base.decimals
      if (!isAmount(amountIn, d) || dec(amountIn) <= 0n) return 'Enter an amount'
      if (dec(amountIn) > dec(avail)) return `Not enough ${availSym}`
      if (q.error) return q.error.message
      if (!q.data || swapIn !== amountIn) return 'Getting a quote…'
    }
    return null
  })()

  const setPct = (pct: number) => {
    const part = (dec(avail) * BigInt(pct)) / 100n
    if (kind === 'market') return setAmountIn(round(str(part), side === 'buy' ? quote.decimals : base.decimals, 'down'))
    if (side === 'sell') return setSize(round(str(part), base.decimals, 'down'))
    if (isAmount(price) && dec(price) > 0n) setSize(round(str(div(part, dec(price))), base.decimals, 'down'))
  }
  const fromBook = (w: 'bid' | 'mid' | 'ask') => {
    const v = w === 'bid' ? book?.bestBid : w === 'ask' ? book?.bestAsk : book?.mid
    if (v) setPrice(round(v, places))
  }

  const review = () => {
    if (problem) return
    const done = () => {
      setSize('')
      setAmountIn('')
      onDone()
    }
    if (kind === 'limit') {
      ask({
        op: 'PLACE_ORDER',
        params: spotLimitParams(market, side, price, size),
        label: `${side === 'buy' ? 'Buy' : 'Sell'} ${size} ${base.symbol} @ ${price} ${quote.symbol}`,
        assets: [base, quote],
        estimates: [
          { k: 'You place', v: `${side === 'buy' ? 'Buy' : 'Sell'} ${size} ${base.symbol} at ${price} ${quote.symbol}` },
          { k: side === 'buy' ? 'Locks' : 'Receives at most', v: `${fixed(total!, Math.min(8, quote.decimals))} ${quote.symbol}` },
          { k: 'Fees', v: '0.02% maker · 0.05% taker' },
        ],
        onDone: done,
      })
    } else {
      const quoteData = q.data!
      const [tin, tout] = side === 'buy' ? [quote, base] : [base, quote]
      const minOut = lessSlippage(quoteData.amountOut, Number(slippage))
      ask({
        op: 'SWAP',
        params: {
          token_in: tin.address,
          token_out: tout.address,
          amount_in: amountIn,
          min_amount_out: minOut,
          venue: 'auto',
          deadline: Math.floor(Date.now() / 1000) + 30 * 60,
        },
        label: `Market ${side} · ${amountIn} ${tin.symbol} → ≥ ${round(minOut, 8)} ${tout.symbol}`,
        assets: [base, quote],
        estimates: [
          { k: 'Expected', v: `${fmtSize(quoteData.amountOut)} ${tout.symbol}` },
          { k: 'Route', v: quoteData.venue === 'clob' ? 'Order book' : 'Pool' },
          ...(quoteData.priceImpact ? [{ k: 'Price impact', v: percent(String(Number(quoteData.priceImpact) * 100), false) }] : []),
        ],
        onDone: done,
      })
    }
  }

  const avgPrice = q.data && dec(q.data.amountOut) > 0n ? (side === 'buy' ? q.data.executionPrice : S.div(q.data.amountOut, q.data.amountIn)) : null

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={cn(
              'rounded-md py-1.5 text-[12px] font-semibold transition-colors',
              side === s ? (s === 'buy' ? 'bg-bid text-white' : 'bg-ask text-white') : 'text-muted-foreground'
            )}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <Pills
        options={[
          { id: 'limit', label: 'Limit' },
          { id: 'market', label: 'Market' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">Available</span>
        <span className="num font-medium">
          {fmtSize(avail)} {availSym}
        </span>
      </div>
      {kind === 'limit' ? (
        <>
          <AmountField
            label="Price"
            unit={quote.symbol}
            value={price}
            onChange={setPrice}
            extra={
              book && (
                <span className="flex gap-0.5">
                  {(['bid', 'mid', 'ask'] as const).map((w) => (
                    <button key={w} type="button" onClick={(e) => (e.preventDefault(), fromBook(w))} className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide hover:bg-accent hover:text-foreground">
                      {w}
                    </button>
                  ))}
                </span>
              )
            }
          />
          <AmountField label="Size" unit={base.symbol} value={size} onChange={setSize} />
        </>
      ) : (
        <AmountField label={side === 'buy' ? 'Spend' : 'Sell'} unit={side === 'buy' ? quote.symbol : base.symbol} value={amountIn} onChange={setAmountIn} />
      )}
      <div className="grid grid-cols-4 gap-1">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" onClick={() => setPct(p)} className="rounded-md border py-1 text-[10px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground">
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>
      <div className="space-y-1 rounded-lg bg-muted/40 p-2">
        {kind === 'limit' ? (
          <Line k="Total" v={total ? `${fixed(total, Math.min(6, quote.decimals))} ${quote.symbol}` : '—'} />
        ) : (
          <>
            <Line k="Est. receive" v={q.data ? `${fmtSize(q.data.amountOut)} ${side === 'buy' ? base.symbol : quote.symbol}` : '—'} />
            <Line k="Avg. price" v={avgPrice ? fmtPrice(avgPrice, ref) : '—'} />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Slippage</span>
              <span className="flex gap-0.5">
                {SLIPPAGE.map((s) => (
                  <button key={s} type="button" onClick={() => setSlippage(s)} className={cn('rounded px-1.5 py-0.5 text-[10px]', slippage === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent')}>
                    {s}%
                  </button>
                ))}
              </span>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={review}
        disabled={!!problem}
        className={cn(
          'h-10 w-full rounded-lg text-[13px] font-semibold text-white transition-opacity disabled:opacity-50',
          side === 'buy' ? 'bg-bid' : 'bg-ask'
        )}
      >
        {problem && problem !== 'Getting a quote…' ? problem : `${side === 'buy' ? 'Buy' : 'Sell'} ${base.symbol}`}
      </button>
    </div>
  )
}

function decimalsFor(ref: number) {
  const a = Math.abs(ref)
  return a >= 1000 ? 2 : a >= 1 ? 4 : Math.min(12, -Math.floor(Math.log10(a || 1)) + 5)
}
