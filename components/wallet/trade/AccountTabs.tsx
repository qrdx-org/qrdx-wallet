'use client'

import { useState } from 'react'
import { dec } from '@/src/core/trade/decimal'
import { fixed, price as fmtPrice, size as fmtSize } from '@/src/core/trade/format'
import { perpCloseParams } from '@/src/core/trade/orders'
import type { AccountResponse } from '@/src/core/trade/types'
import { Empty, Tabs, TokenBadge } from './kit'
import { SubmissionList, type Submission, type TradeRequest } from './submit'
import { cn } from '@/lib/utils'

type Tab = 'orders' | 'balances' | 'positions' | 'activity'

export function AccountTabs({
  kind,
  account,
  marketId,
  ask,
  submissions,
  onDone,
}: {
  kind: 'spot' | 'perp'
  account: AccountResponse | null
  marketId: string
  ask: (r: TradeRequest) => void
  submissions: Submission[]
  onDone: () => void
}) {
  const [tab, setTab] = useState<Tab>(kind === 'spot' ? 'orders' : 'positions')
  const spotOrders = account?.spotOrders ?? []
  const perpOrders = account?.perp?.orders ?? []
  const positions = Object.entries(account?.perp?.positions ?? {}).filter(([, p]) => dec(p.size) !== 0n)
  const pending = submissions.filter((s) => s.status === 'pending').length

  const tabs: { id: Tab; label: string }[] =
    kind === 'spot'
      ? [
          { id: 'orders', label: `Orders${spotOrders.length ? ` (${spotOrders.length})` : ''}` },
          { id: 'balances', label: 'Balances' },
          { id: 'activity', label: `Activity${pending ? ` (${pending})` : ''}` },
        ]
      : [
          { id: 'positions', label: `Positions${positions.length ? ` (${positions.length})` : ''}` },
          { id: 'orders', label: `Orders${perpOrders.length ? ` (${perpOrders.length})` : ''}` },
          { id: 'activity', label: `Activity${pending ? ` (${pending})` : ''}` },
        ]

  return (
    <div className="rounded-xl border bg-card">
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-1.5" />
      {!account ? (
        <Empty>Loading your account…</Empty>
      ) : tab === 'activity' ? (
        submissions.length ? <SubmissionList items={submissions} /> : <Empty>Orders you sign here appear with their status until a block includes them.</Empty>
      ) : tab === 'balances' ? (
        <Balances account={account} />
      ) : tab === 'positions' ? (
        positions.length ? (
          <ul className="divide-y divide-border/60">
            {positions.map(([id, p]) => {
              const long = dec(p.size) > 0n
              const pnl = Number(p.unrealized_pnl)
              return (
                <li key={id} className="px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {id.replace('-PERP', '')}{' '}
                      <span className={cn('ml-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase', long ? 'bg-bid/15 text-bid' : 'bg-ask/15 text-ask')}>
                        {long ? 'Long' : 'Short'} {Number(p.leverage)}×
                      </span>
                    </span>
                    <span className={cn('num font-semibold', pnl > 0 ? 'text-bid' : pnl < 0 ? 'text-ask' : '')}>{fixed(p.unrealized_pnl, 2)}</span>
                  </div>
                  <div className="num mt-1 grid grid-cols-3 gap-1 text-muted-foreground">
                    <span>Size {fmtSize(p.size.replace('-', ''))}</span>
                    <span>Entry {fmtPrice(p.entry_price)}</span>
                    <span className="text-right">Liq {p.liquidation_price ? fmtPrice(p.liquidation_price) : '—'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      ask({
                        op: 'PERP_ORDER',
                        params: perpCloseParams(id, p.size, p.mark_price),
                        label: `Close ${id} ${p.size}`,
                        estimates: [{ k: 'Closes', v: `${fmtSize(p.size.replace('-', ''))} at about ${fmtPrice(p.mark_price)}, reduce-only` }],
                        onDone,
                      })
                    }
                    className="mt-1.5 w-full rounded-md border py-1 text-[10.5px] font-medium hover:border-ask/50 hover:text-ask"
                  >
                    Close at market
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>No open positions.</Empty>
        )
      ) : kind === 'spot' ? (
        spotOrders.length ? (
          <ul className="divide-y divide-border/60">
            {[...spotOrders]
              .sort((a, b) => Number(b.market === marketId) - Number(a.market === marketId))
              .map((o) => (
                <li key={o.orderId} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <span className={cn('w-8 font-semibold capitalize', o.side === 'buy' ? 'text-bid' : 'text-ask')}>{o.side}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{`${o.base.symbol}/${o.quote.symbol}`}</span>
                    <span className="num block text-muted-foreground">
                      {fmtSize(o.amount)} @ {fmtPrice(o.price)} · filled {fmtSize(o.filled)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      ask({
                        op: 'CANCEL_ORDER',
                        params: { order_id: o.orderId, pair: o.pair },
                        label: `Cancel ${o.side} ${o.amount} ${o.base.symbol} @ ${o.price}`,
                        assets: [o.base, o.quote],
                        onDone,
                      })
                    }
                    className="rounded-md border px-2 py-1 text-[10px] font-medium hover:border-ask/50 hover:text-ask"
                  >
                    Cancel
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <Empty>No open orders.</Empty>
        )
      ) : perpOrders.length ? (
        <ul className="divide-y divide-border/60">
          {perpOrders.map((o) => (
            <li key={o.order_id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
              <span className={cn('w-9 font-semibold', o.side === 'buy' ? 'text-bid' : 'text-ask')}>{o.side === 'buy' ? 'Long' : 'Short'}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{o.market_id}</span>
                <span className="num block text-muted-foreground">
                  {fmtSize(o.size)} @ {fmtPrice(o.price)}
                  {o.reduce_only ? ' · reduce-only' : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  ask({
                    op: 'PERP_CANCEL',
                    params: { market_id: o.market_id, order_id: o.order_id },
                    label: `Cancel ${o.market_id} order ${o.order_id.slice(0, 8)}`,
                    onDone,
                  })
                }
                className="rounded-md border px-2 py-1 text-[10px] font-medium hover:border-ask/50 hover:text-ask"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No open orders.</Empty>
      )}
    </div>
  )
}

function Balances({ account }: { account: AccountResponse }) {
  const rows = account.balances.filter((b) => Number(b.balance) > 0 || Number(b.inOrders) > 0)
  if (!rows.length) return <Empty>This account holds no tokens on this network yet.</Empty>
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((b) => (
        <li key={b.asset.segment} className="flex items-center gap-2 px-3 py-2 text-[11px]">
          <TokenBadge asset={b.asset} size="sm" />
          <span className="flex-1 font-medium">{b.asset.symbol}</span>
          <span className="num text-right">
            {fmtSize(b.balance)}
            {Number(b.inOrders) > 0 && <span className="block text-[10px] text-muted-foreground">{fmtSize(b.inOrders)} in orders</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
