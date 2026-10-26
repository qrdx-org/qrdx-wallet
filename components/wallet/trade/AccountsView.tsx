'use client'

/**
 * The account's exchange accounts, from the wallet's Trade screen: its perps account
 * (collateral in and out) and its sub-accounts (docs/TRADING_FEATURES.md §8): separate
 * balances, margin and orders under this wallet, which it signs for. Create one, move QRDX or
 * a token between it and the main account, and fund its perps from its own balance.
 */

import { useState } from 'react'
import { Layers, Plus, Wallet } from 'lucide-react'
import { dec, isAmount } from '@/src/core/trade/decimal'
import { fixed, size as fmtSize } from '@/src/core/trade/format'
import type { AccountResponse } from '@/src/core/trade/types'
import { CollateralSheet, collateralLabel, walletCollateral } from './PerpForm'
import { Pills, Sheet, useTradeApi } from './kit'
import { SubmissionList, useTradeSubmit } from './submit'
import { cn } from '@/lib/utils'

interface Control {
  subaccounts: { subaccount: string; index: number; name: string }[]
}

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`

export function AccountsView({ api, trader }: { api: string; trader: string }) {
  const own = useTradeApi<AccountResponse>(api, `/accounts/${trader}`, 10_000)
  const control = useTradeApi<Control>(api, `/accounts/${trader}/control`, 15_000)
  const { ask, sheet, submissions } = useTradeSubmit()
  const [collateral, setCollateral] = useState(false)
  const [name, setName] = useState('')
  const subs = control.data?.subaccounts ?? []
  const refresh = () => {
    own.refresh()
    control.refresh()
  }
  const unit = collateralLabel(own.data)

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 p-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Main account</h2>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{short(trader)}</span>
        </div>
        <PerpSummary account={own.data} />
        <button type="button" onClick={() => setCollateral(true)} className="mt-2 h-9 w-full rounded-xl border text-xs font-medium hover:bg-accent/50">
          Deposit or withdraw perps collateral
        </button>
      </section>

      <section className="rounded-2xl border border-border/70 p-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Sub-accounts</h2>
          <span className="ml-auto text-[10px] text-muted-foreground">{control.data ? `${subs.length} of 20` : ''}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Their own balances, margin and orders, signed for by this wallet. Trade one on trade.qrdx.org by choosing it as the trading account.</p>
        {control.error && !control.data ? (
          <p className="mt-2 text-[11px] text-muted-foreground">This network&apos;s node has no sub-accounts yet.</p>
        ) : (
          <>
            <div className="mt-2 space-y-2">
              {subs.map((s) => (
                <SubAccount key={s.subaccount} api={api} sub={s} main={own.data} ask={ask} onDone={refresh} />
              ))}
              {control.data && !subs.length && <p className="text-[11px] text-muted-foreground">None yet.</p>}
            </div>
            {control.data && subs.length < 20 && (
              <div className="mt-3 flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 32))}
                  placeholder="Name (optional)"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base sm:text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    ask({
                      op: 'SUBACCOUNT_CREATE',
                      params: name.trim() ? { name: name.trim() } : {},
                      label: `Create sub-account${name.trim() ? ` ${name.trim()}` : ''}`,
                      onDone: () => {
                        setName('')
                        refresh()
                      },
                    })
                  }
                  className="flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Create
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <SubmissionList items={submissions} />
      <CollateralSheet open={collateral} onClose={() => setCollateral(false)} account={own.data} unit={unit} ask={ask} onDone={refresh} />
      {sheet}
    </div>
  )
}

/** Perps equity, free collateral and open positions of one account. */
function PerpSummary({ account }: { account: AccountResponse | null }) {
  const perp = account?.perp
  const positions = Object.entries(perp?.positions ?? {}).filter(([, p]) => Number(p.size) !== 0)
  const unit = collateralLabel(account)
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ['Perps equity', perp?.equity],
          ['Free', perp?.withdrawable],
          [`In wallet (${unit})`, walletCollateral(account)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-accent/30 px-2 py-1.5">
            <div className="text-[9px] text-muted-foreground">{k}</div>
            <div className="num text-xs font-semibold">{v ? fixed(v, 2) : '—'}</div>
          </div>
        ))}
      </div>
      {positions.map(([id, p]) => (
        <div key={id} className="flex items-center justify-between text-[11px]">
          <span>{id}</span>
          <span className={cn('num', Number(p.size) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {fmtSize(p.size)} @ {fixed(p.entry_price, 2)} · PnL {fixed(p.unrealized_pnl, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SubAccount({
  api,
  sub,
  main,
  ask,
  onDone,
}: {
  api: string
  sub: { subaccount: string; index: number; name: string }
  main: AccountResponse | null
  ask: ReturnType<typeof useTradeSubmit>['ask']
  onDone: () => void
}) {
  const acct = useTradeApi<AccountResponse>(api, `/accounts/${sub.subaccount}`, 10_000)
  const [open, setOpen] = useState(false)
  const [move, setMove] = useState(false)
  const [collateral, setCollateral] = useState(false)
  const held = (acct.data?.balances ?? []).filter((b) => Number(b.balance) > 0)
  const done = () => {
    acct.refresh()
    onDone()
  }
  return (
    <div className="rounded-xl bg-accent/20 p-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <span className="text-xs font-medium">{sub.name || `Sub-account #${sub.index}`}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{short(sub.subaccount)}</span>
        <span className="num ml-auto text-[11px] text-muted-foreground">{acct.data?.perp ? `perps ${fixed(acct.data.perp.equity, 2)}` : ''}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="space-y-0.5">
            {held.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No balances yet: move some in.</p>
            ) : (
              held.map((b) => (
                <div key={b.asset.segment} className="flex justify-between text-[11px]">
                  <span>{b.asset.symbol}</span>
                  <span className="num">{fmtSize(b.balance)}</span>
                </div>
              ))
            )}
          </div>
          <PerpSummary account={acct.data} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMove(true)} className="h-8 rounded-lg border text-[11px] font-medium hover:bg-accent/50">
              Move funds
            </button>
            <button type="button" onClick={() => setCollateral(true)} className="h-8 rounded-lg border text-[11px] font-medium hover:bg-accent/50">
              Perps collateral
            </button>
          </div>
        </div>
      )}
      <MoveSheet open={move} onClose={() => setMove(false)} sub={sub} main={main} subAccount={acct.data} ask={ask} onDone={done} />
      <CollateralSheet
        open={collateral}
        onClose={() => setCollateral(false)}
        account={acct.data}
        unit={collateralLabel(acct.data)}
        ask={ask}
        onDone={done}
        actAs={sub.subaccount}
        title={`${sub.name || `Sub-account #${sub.index}`}: perps collateral`}
      />
    </div>
  )
}

/** SUBACCOUNT_TRANSFER: QRDX or a token between the main account and a sub-account. */
function MoveSheet({
  open,
  onClose,
  sub,
  main,
  subAccount,
  ask,
  onDone,
}: {
  open: boolean
  onClose: () => void
  sub: { subaccount: string; index: number; name: string }
  main: AccountResponse | null
  subAccount: AccountResponse | null
  ask: ReturnType<typeof useTradeSubmit>['ask']
  onDone: () => void
}) {
  const [dir, setDir] = useState<'to_sub' | 'from_sub'>('to_sub')
  const from = dir === 'to_sub' ? main : subAccount
  const assets = (from?.balances ?? []).filter((b) => b.asset.address && Number(b.balance) > 0)
  const [asset, setAsset] = useState('QRDX')
  const [amount, setAmount] = useState('')
  const chosen = assets.find((b) => b.asset.address === asset) ?? assets[0]
  const valid = !!chosen && isAmount(amount) && dec(amount) > 0n
  const over = valid && dec(amount) > dec(chosen.balance)
  const label = sub.name || `sub-account #${sub.index}`
  return (
    <Sheet open={open} onClose={onClose} title={`Move funds · ${label}`}>
      <div className="space-y-3">
        <Pills
          options={[
            { id: 'to_sub', label: 'To the sub-account' },
            { id: 'from_sub', label: 'Back to main' },
          ]}
          value={dir}
          onChange={setDir}
        />
        {assets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{dir === 'to_sub' ? 'The main account' : 'The sub-account'} holds nothing to move.</p>
        ) : (
          <>
            <select
              value={chosen?.asset.address ?? ''}
              onChange={(e) => setAsset(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-base sm:text-sm"
              aria-label="Asset"
            >
              {assets.map((b) => (
                <option key={b.asset.address} value={b.asset.address!}>
                  {b.asset.symbol} · {fmtSize(b.balance)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="Amount"
                className="num h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base sm:text-sm"
              />
              <button type="button" onClick={() => chosen && setAmount(chosen.balance)} className="rounded-xl border px-3 text-[11px] font-medium hover:bg-accent/50">
                Max
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          disabled={!valid || over}
          onClick={() =>
            ask({
              op: 'SUBACCOUNT_TRANSFER',
              params: { subaccount: sub.subaccount, asset: chosen!.asset.address!, amount, direction: dir },
              label: `Move ${amount} ${chosen!.asset.symbol} ${dir === 'to_sub' ? 'to' : 'from'} ${label}`,
              onDone: () => {
                setAmount('')
                onClose()
                onDone()
              },
            })
          }
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {over ? `Only ${fmtSize(chosen!.balance)} ${chosen!.asset.symbol}` : 'Move'}
        </button>
      </div>
    </Sheet>
  )
}
