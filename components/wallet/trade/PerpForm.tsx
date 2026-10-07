'use client'

import { useEffect, useState } from 'react'
import { dec, div, isAmount, mul, round, str } from '@/src/core/trade/decimal'
import { fixed, price as fmtPrice } from '@/src/core/trade/format'
import { perpMarketPrice, type Side } from '@/src/core/trade/orders'
import type { AccountResponse, OrderBook, PerpMarket } from '@/src/core/trade/types'
import { AmountField, Line, Pills, Sheet } from './kit'
import type { TradeRequest } from './submit'
import { cn } from '@/lib/utils'

const SLIPPAGE = 1
const LEVERAGE = ['2', '5', '10', '20']

/** What perps collateral is called: the node reports a token address, "QRDX", or "". */
export function collateralLabel(account: AccountResponse | null): string {
  const t = account?.perp?.collateral_token ?? ''
  if (!t) return 'collateral'
  if (t.toUpperCase() === 'QRDX') return 'QRDX'
  return account?.balances.find((b) => b.asset.address === t.toLowerCase())?.asset.symbol ?? `${t.slice(0, 8)}…`
}

/** The wallet's own balance of the collateral asset (native QRDX or the token): what can be deposited. */
export function walletCollateral(account: AccountResponse | null): string | null {
  const t = account?.perp?.collateral_token
  if (!account || !t) return null
  return account.balances.find((b) => b.asset.address?.toLowerCase() === t.toLowerCase())?.balance ?? '0'
}

/** Deposit enough to cover `margin` beyond what is free, plus 1 % for fees, rounded up to 2 places. */
export function collateralShortfall(margin: string | null, free: string | null | undefined): string | null {
  if (!margin || !free || dec(margin) <= dec(free)) return null
  return round(str(((dec(margin) - dec(free)) * 101n) / 100n), 2, 'up')
}

/**
 * Perps orders. Limit orders rest on the market's book; "market" is IOC at the
 * far side of the book plus 1 %, so it fills at the book's prices and cancels the
 * rest. Leverage and margin mode are a separate, on-chain setting per market.
 */
export function PerpForm({
  market,
  book,
  account,
  pickedPrice,
  ask,
  onDone,
}: {
  market: PerpMarket
  book: OrderBook | null
  account: AccountResponse | null
  pickedPrice: string | null
  ask: (r: TradeRequest) => void
  onDone: () => void
}) {
  const perp = account?.perp ?? null
  const unit = collateralLabel(account)
  const current = perp?.leverage[market.id]
  const position = perp?.positions[market.id]
  const effective = current?.leverage ?? (position && Number(position.size) !== 0 ? position.leverage : null)
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('limit')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [levOpen, setLevOpen] = useState(false)
  const [collateralOpen, setCollateralOpen] = useState(false)
  const ref = Number(market.markPrice ?? market.oraclePrice ?? 1)

  useEffect(() => {
    if (pickedPrice) {
      setPrice(pickedPrice)
      setKind('limit')
    }
  }, [pickedPrice])
  useEffect(() => {
    if (!price && market.markPrice) setPrice(round(market.markPrice, 1))
  }, [market.markPrice, price])

  const execPrice = kind === 'market' ? perpMarketPrice(book, side, SLIPPAGE) : price
  const notional = execPrice && isAmount(execPrice) && isAmount(size) ? str(mul(dec(execPrice), dec(size))) : null
  const leverage = effective ?? market.maxLeverage ?? ''
  const margin = notional && isAmount(leverage) && dec(leverage) > 0n ? str(div(dec(notional), dec(leverage))) : null

  // Margin beyond the free collateral can come from the wallet, deposited with the order.
  const inWallet = walletCollateral(account)
  const topUp = perp && !reduceOnly ? collateralShortfall(margin, perp.withdrawable) : null
  const canTopUp = !!topUp && inWallet !== null && dec(inWallet) >= dec(topUp)

  const problem = (() => {
    if (market.collateralToken === '') return 'No collateral on this network'
    if (!market.oraclePrice) return 'Waiting for an oracle price'
    if (!isAmount(size) || dec(size) <= 0n) return 'Enter a size'
    if (!execPrice) return kind === 'market' ? 'Book is empty on that side' : 'Enter a price'
    if (!isAmount(execPrice) || dec(execPrice) <= 0n) return 'Enter a price'
    if (topUp && !canTopUp) return `Not enough ${unit}`
    return null
  })()

  const review = () => {
    if (problem) return
    ask({
      op: 'PERP_ORDER',
      params: {
        market_id: market.id,
        side,
        size,
        price: execPrice!,
        ...(reduceOnly ? { reduce_only: true } : {}),
        ...(kind === 'market' ? { tif: 'ioc' } : {}),
      },
      label: `${side === 'buy' ? 'Long' : 'Short'} ${size} ${market.base} ${kind === 'market' ? 'market' : `@ ${execPrice}`}${reduceOnly ? ' (reduce-only)' : ''}`,
      estimates: [
        { k: 'Order value', v: notional ? `${fixed(notional, 2)} ${market.quote}` : '—' },
        { k: 'Margin', v: margin ? `${fixed(margin, 2)} ${unit} at ${leverage}×` : '—' },
        { k: 'Mark / oracle', v: `${fmtPrice(market.markPrice, ref)} / ${fmtPrice(market.oraclePrice, ref)}` },
      ],
      before: canTopUp ? [{ op: 'PERP_DEPOSIT', params: { amount: topUp! }, label: `Deposit ${topUp} ${unit} perps collateral` }] : undefined,
      onDone: () => {
        setSize('')
        onDone()
      },
    })
  }

  return (
    <div className="space-y-2.5">
      {market.collateralToken === '' && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10.5px] leading-snug">
          This network&apos;s nodes have no perps collateral configured, so deposits and orders are refused until they set one.
        </p>
      )}
      {market.collateralToken !== '' && !market.oraclePrice && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10.5px] leading-snug">
          No oracle price yet: validators have not voted a {market.base} price, so new positions are refused.
        </p>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setLevOpen(true)} className="flex-1 rounded-lg border py-1.5 text-[11px] font-semibold hover:bg-accent">
          {current ? `${Number(current.leverage)}× ${current.mode === 'cross' ? 'Cross' : 'Isolated'}` : `${effective ? Number(effective) : Number(market.maxLeverage ?? 20)}× default`}
        </button>
        <button type="button" onClick={() => setCollateralOpen(true)} className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-accent">
          Collateral
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={cn('rounded-md py-1.5 text-[12px] font-semibold transition-colors', side === s ? (s === 'buy' ? 'bg-bid text-white' : 'bg-ask text-white') : 'text-muted-foreground')}
          >
            {s === 'buy' ? 'Long' : 'Short'}
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
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Free collateral</span>
          <span className="num font-medium">{perp ? `${fixed(perp.withdrawable, 2)} ${unit}` : '—'}</span>
        </div>
        {inWallet !== null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">In wallet</span>
            <span className="num">
              {Number(inWallet).toLocaleString('en-US', { maximumFractionDigits: 2 })} {unit}
            </span>
          </div>
        )}
      </div>
      {kind === 'limit' ? (
        <AmountField label="Price" unit={market.quote} value={price} onChange={setPrice} />
      ) : (
        <p className="rounded-lg bg-muted/40 px-2 py-1.5 text-[10.5px] leading-snug text-muted-foreground">
          Fills now up to {execPrice ? fmtPrice(execPrice, ref) : '—'} (1% past the best {side === 'buy' ? 'ask' : 'bid'}); the rest is cancelled.
        </p>
      )}
      <AmountField label="Size" unit={market.base} value={size} onChange={setSize} />
      <label className="flex items-center gap-2 text-[11px]">
        <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="accent-[hsl(var(--foreground))]" />
        Reduce only
      </label>
      <div className="space-y-1 rounded-lg bg-muted/40 p-2">
        <Line k="Order value" v={notional ? `${fixed(notional, 2)} ${market.quote}` : '—'} />
        <Line k="Margin" v={margin ? `${fixed(margin, 2)} ${unit}` : '—'} />
      </div>
      <button
        type="button"
        onClick={review}
        disabled={!!problem}
        className={cn('h-10 w-full rounded-lg text-[13px] font-semibold text-white transition-opacity disabled:opacity-50', side === 'buy' ? 'bg-bid' : 'bg-ask')}
      >
        {problem ?? (canTopUp ? `Deposit ${fixed(topUp!, 2)} & ${side === 'buy' ? 'long' : 'short'}` : `${side === 'buy' ? 'Long' : 'Short'} ${market.base}`)}
      </button>

      <LeverageSheet
        open={levOpen}
        onClose={() => setLevOpen(false)}
        market={market}
        current={current ?? null}
        effective={effective}
        ask={(r) => {
          setLevOpen(false)
          ask(r)
        }}
        onDone={onDone}
      />
      <CollateralSheet
        open={collateralOpen}
        onClose={() => setCollateralOpen(false)}
        account={account}
        unit={unit}
        ask={(r) => {
          setCollateralOpen(false)
          ask(r)
        }}
        onDone={onDone}
      />
    </div>
  )
}

function LeverageSheet({
  open,
  onClose,
  market,
  current,
  effective,
  ask,
  onDone,
}: {
  open: boolean
  onClose: () => void
  market: PerpMarket
  current: { leverage: string; mode: 'cross' | 'isolated' } | null
  effective: string | null
  ask: (r: TradeRequest) => void
  onDone: () => void
}) {
  const max = Number(market.maxLeverage ?? 20)
  const [lev, setLev] = useState(String(Number(current?.leverage ?? effective ?? Math.min(10, max))))
  const [mode, setMode] = useState<'cross' | 'isolated'>(current?.mode ?? 'cross')
  const n = Number(lev)
  const ok = Number.isFinite(n) && n >= 1 && n <= max
  return (
    <Sheet open={open} onClose={onClose} title={`${market.base}-${market.quote} leverage`}>
      <div className="space-y-3">
        <Pills
          options={[
            { id: 'cross', label: 'Cross margin' },
            { id: 'isolated', label: 'Isolated' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {mode === 'cross'
            ? 'Cross: every position shares your free collateral, so one can draw on the rest before liquidation.'
            : 'Isolated: this market risks only the margin you put in it.'}
        </p>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={max} value={ok ? n : 1} onChange={(e) => setLev(e.target.value)} className="flex-1 accent-[hsl(var(--foreground))]" aria-label="Leverage" />
          <span className="num w-14 text-right text-xl font-semibold">{lev || '—'}×</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {LEVERAGE.filter((l) => Number(l) <= max).map((l) => (
            <button key={l} type="button" onClick={() => setLev(l)} className={cn('rounded-md border py-1 text-[11px] font-medium', lev === l ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}>
              {l}×
            </button>
          ))}
        </div>
        <Line k="Initial margin" v={ok ? `${+(100 / n).toFixed(2)}% of the position` : '—'} />
        <p className="text-[10.5px] text-muted-foreground">
          On chain now: {current ? `${current.leverage}× ${current.mode}` : effective ? `not set; the node applies ${round(effective, 2)}×` : 'not set; the node default applies'}.
        </p>
        <button
          type="button"
          disabled={!ok}
          onClick={() =>
            ask({
              op: 'PERP_SET_LEVERAGE',
              params: { market_id: market.id, leverage: String(n), mode },
              label: `Set ${market.id} leverage ${n}× ${mode}`,
              onDone,
            })
          }
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Set {ok ? `${n}×` : ''} {mode}
        </button>
      </div>
    </Sheet>
  )
}

function CollateralSheet({
  open,
  onClose,
  account,
  unit,
  ask,
  onDone,
}: {
  open: boolean
  onClose: () => void
  account: AccountResponse | null
  unit: string
  ask: (r: TradeRequest) => void
  onDone: () => void
}) {
  const perp = account?.perp
  const [dir, setDir] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const valid = isAmount(amount) && dec(amount) > 0n
  const over = valid && dir === 'withdraw' && perp && dec(amount) > dec(perp.withdrawable)
  return (
    <Sheet open={open} onClose={onClose} title="Perps collateral">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Equity', perp?.equity],
            ['Free', perp?.withdrawable],
            ['Collateral', perp?.collateral],
            ['Maintenance', perp?.maintenance_margin],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border px-3 py-2">
              <div className="text-[10px] text-muted-foreground">{k}</div>
              <div className="num text-sm font-semibold">{v ? fixed(v, 2) : '—'}</div>
            </div>
          ))}
        </div>
        <Pills
          options={[
            { id: 'deposit', label: 'Deposit' },
            { id: 'withdraw', label: 'Withdraw' },
          ]}
          value={dir}
          onChange={setDir}
        />
        <AmountField
          label={`Amount (${unit})`}
          unit={unit}
          value={amount}
          onChange={setAmount}
          extra={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                const max = dir === 'deposit' ? walletCollateral(account) : perp?.withdrawable
                if (max) setAmount(round(max, 2, 'down'))
              }}
              className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide hover:bg-accent hover:text-foreground"
            >
              Max {dir === 'deposit' ? `· wallet ${Number(walletCollateral(account) ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}
            </button>
          }
        />
        {perp && !perp.collateral_token && <p className="text-[11px] text-amber-500">This node has no perps collateral token configured.</p>}
        <button
          type="button"
          disabled={!valid || !!over}
          onClick={() =>
            ask({
              op: dir === 'deposit' ? 'PERP_DEPOSIT' : 'PERP_WITHDRAW',
              params: { amount },
              label: `${dir === 'deposit' ? 'Deposit' : 'Withdraw'} ${amount} ${unit} perps collateral`,
              onDone: () => {
                setAmount('')
                onDone()
              },
            })
          }
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {over ? `Only ${fixed(perp!.withdrawable, 2)} is free` : dir === 'deposit' ? 'Deposit' : 'Withdraw'}
        </button>
      </div>
    </Sheet>
  )
}
