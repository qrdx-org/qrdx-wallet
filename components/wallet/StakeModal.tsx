'use client'

/**
 * Staking on QRDX (qrdx-node docs/STAKING.md).
 *
 * Delegate: STAKE_DELEGATE locks QRDX from the quantum-safe account in a
 * validator's pool. After a warm-up it joins the pool as shares, earns the
 * staking rate (less the validator's commission) every epoch the validator's
 * vote is on chain, and compounds. STAKE_UNDELEGATE redeems shares ("all" also
 * refunds what is still warming up); the QRDX is paid after unbonding and the
 * withdrawal delay, and is slashed with the pool until then.
 *
 * Run a validator: STAKE_DEPOSIT registers this account itself as a validator
 * (it then needs a validator node running with this account's key); STAKE_EXIT
 * starts its exit. Kept below delegation, for the few who run one.
 *
 * Every number on the screen is read from the node: validators, pools,
 * parameters, the chain spec's epoch length and the head's epoch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Clock, Coins, Hourglass, Landmark, Server, ShieldAlert, Undo2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { ethToWei } from '@/src/core/ethereum'
import { formatAmount, formatUnitsExact } from '@/src/core/balances'
import {
  staking,
  waitForExchangeReceipt,
  type Delegations,
  type StakingParams,
  type StakingPool,
  type StakingValidator,
} from '@/src/core/exchange-client'
import { cn } from '@/lib/utils'
import { ErrorBanner, Notice, PrimaryButton, TextField } from './flow/FlowKit'
import { ConfirmSheet, type ReviewRow } from './flow/ConfirmSheet'

interface StakeModalProps {
  onClose: () => void
}

const SLASHING = [
  ['Double signing', '50%'],
  ['Surround vote', '50%'],
  ['Invalid attestation', '30%'],
  ['Extended downtime', '5%'],
  ['Bridge fraud', '100%'],
] as const

const AMOUNT_RE = /^\d+(\.\d{1,18})?$/
const WEI = 10n ** 18n
/** Kept back on "Max" so the delegation can still pay its gas. */
const GAS_RESERVE = 10n ** 16n // 0.01 QRDX

interface Snapshot {
  validators: StakingValidator[]
  pools: StakingPool[]
  params: StakingParams
  mine: Delegations | null
  clock: { slotMs: number; slotsPerEpoch: number; epochMs: number } | null
  epoch: number | null
}

const short = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a)
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`
/** A node decimal ("100085.0355…") for display; anything that is not a plain decimal is shown as given. */
const qrdx = (decimal: string, places = 4) => (/^\d+(\.\d+)?$/.test(decimal) ? formatAmount(ethToWei(decimal.replace(/^(\d+\.\d{0,18}).*$/, '$1')), 18, places) : decimal)
/** What a delegator earns a year: the staking rate on the pool, less the validator's commission. */
const earnBps = (rateBps: number, commissionBps: number) => (rateBps * (10_000 - commissionBps)) / 10_000

function epochsAsTime(epochs: number, epochMs: number | undefined): string {
  if (!epochMs) return `${epochs.toLocaleString()} epochs`
  const s = Math.max(0, Math.round((epochs * epochMs) / 1000))
  if (s < 90) return `${s} s`
  if (s < 5400) return `${Math.round(s / 60)} min`
  if (s < 172_800) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86_400).toFixed(1)} days`
}

export function StakeModal({ onClose }: StakeModalProps) {
  const { activeChain, currentWallet, pqBalance, submitExchangeOp, fetchBalances } = useWallet()
  const qrdxChain = isQrdxChain(activeChain)
  const pq = currentWallet?.pqAddress ?? ''
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!qrdxChain) return
    try {
      const [validators, pools, params, mine, clock, epoch] = await Promise.all([
        staking.validators(activeChain),
        staking.pools(activeChain),
        staking.params(activeChain),
        pq ? staking.delegations(activeChain, pq).catch(() => null) : Promise.resolve(null),
        staking.clock(activeChain),
        staking.headEpoch(activeChain),
      ])
      setSnap({ validators, pools, params, mine, clock, epoch })
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'This node does not serve staking information')
    }
  }, [qrdxChain, activeChain, pq])

  useEffect(() => {
    void load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])

  const pools = useMemo(() => new Map((snap?.pools ?? []).map((p) => [p.validator.toLowerCase(), p])), [snap])
  const commissionOf = (v: StakingValidator) => pools.get(v.address.toLowerCase())?.commission_bps ?? snap?.params.default_commission_bps ?? 1000
  const eligible = useMemo(
    () => (snap?.validators ?? []).filter((v) => v.status === 'active' && !v.slashed).sort((a, b) => Number(b.weight) - Number(a.weight)),
    [snap]
  )
  const totalWeight = eligible.reduce((s, v) => s + Number(v.weight), 0)
  const chosen = eligible.find((v) => v.address === selected) ?? eligible[0] ?? null
  const ownValidator = (snap?.validators ?? []).find((v) => v.address.toLowerCase() === pq.toLowerCase()) ?? null
  const rate = snap?.params.reward_rate_bps_per_year ?? 0
  const epochMs = snap?.clock?.epochMs
  const unbondEpochs = snap ? snap.params.unbonding_epochs + snap.params.withdrawal_delay_epochs : 0

  // ── Delegate form ──
  const balance = pqBalance ?? 0n
  const amountWei = AMOUNT_RE.test(amount) ? ethToWei(amount) : null
  const minWei = snap ? ethToWei(snap.params.min_delegation) : WEI
  const amountError = !chosen
    ? 'No active validator to delegate to'
    : !amount
      ? 'Enter an amount'
      : amountWei === null
        ? 'A number, at most 18 decimals'
        : amountWei < minWei
          ? `At least ${snap?.params.min_delegation ?? '1'} QRDX`
          : amountWei > balance
            ? 'More than your quantum-safe balance'
            : null
  const yearlyWei = !amountError && amountWei !== null && chosen ? (amountWei * BigInt(Math.round(earnBps(rate, commissionOf(chosen)) * 100))) / 1_000_000n : null
  const maxWei = balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n

  type StakeOp = 'STAKE_DELEGATE' | 'STAKE_UNDELEGATE' | 'STAKE_DEPOSIT' | 'STAKE_EXIT'
  // Every staking operation is reviewed first: `run` opens the confirmation, Confirm signs.
  const [pending, setPending] = useState<{ label: string; op: StakeOp; params: Record<string, string>; success: string } | null>(null)
  const run = (label: string, op: StakeOp, params: Record<string, string>, success: string) => setPending({ label, op, params, success })

  const execute = async (label: string, op: StakeOp, params: Record<string, string>, success: string) => {
    setBusy(label)
    setError(null)
    setDone(null)
    try {
      const { txHash } = await submitExchangeOp(op, params)
      const r = await waitForExchangeReceipt(activeChain, txHash, 60_000, 1_000)
      if (!r.success) throw new Error(r.error || 'Rejected by the network')
      setDone(success)
      if (op === 'STAKE_DELEGATE') setAmount('')
      fetchBalances()
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staking operation failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Back" className="h-8 w-8 rounded-lg hover:bg-accent/50 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Stake</h1>
            <p className="text-[10px] text-muted-foreground">Delegate QRDX to a validator</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-3">
        {!qrdxChain ? (
          <div className="text-center py-12">
            <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Staking runs on QRDX networks</p>
            <p className="text-xs text-muted-foreground mt-1">Switch to a QRDX network to stake.</p>
          </div>
        ) : !snap ? (
          loadError ? <ErrorBanner error={loadError} /> : <p className="text-xs text-muted-foreground py-6 text-center">Reading validators…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { icon: Coins, label: 'You earn', value: chosen ? pct(earnBps(rate, commissionOf(chosen))) : pct(rate) },
                { icon: Hourglass, label: 'Warm-up', value: epochsAsTime(snap.params.warmup_epochs, epochMs) },
                { icon: Clock, label: 'To unstake', value: epochsAsTime(unbondEpochs, epochMs) },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1 py-3 rounded-xl glass">
                  <s.icon className="h-3.5 w-3.5 text-foreground/70" />
                  <span className="text-sm font-bold tabular-nums">{s.value}</span>
                  <span className="text-[9px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>

            {snap.mine && (snap.mine.stakes.length > 0 || snap.mine.payouts.length > 0) && (
              <section className="rounded-xl glass p-3 space-y-2.5">
                <p className="text-xs font-semibold">Your stake</p>
                {snap.mine.stakes.map((st) => (
                  <Position
                    key={st.validator}
                    stake={st}
                    pool={pools.get(st.validator.toLowerCase()) ?? null}
                    epoch={snap.epoch}
                    epochMs={epochMs}
                    busy={busy}
                    onUndelegate={(shares, label) =>
                      run(label, 'STAKE_UNDELEGATE', { validator: st.validator, shares }, `Undelegated. The QRDX is paid in ${epochsAsTime(unbondEpochs, epochMs)}.`)
                    }
                  />
                ))}
                {snap.mine.payouts.map((p) => {
                  const left = snap.epoch != null ? p.due_epoch - snap.epoch : null
                  return (
                    <div key={p.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{p.kind === 'undelegate' ? 'Unstaking' : p.kind === 'reward' ? 'Reward' : p.kind.replace(/_/g, ' ')}</span>
                      <span className="tabular-nums text-right">
                        {qrdx(p.amount, 6)} QRDX
                        <span className="block text-muted-foreground">{left != null && left > 0 ? `in ${epochsAsTime(left, epochMs)}` : 'this epoch'}</span>
                      </span>
                    </div>
                  )
                })}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-xs font-semibold">Validator</p>
              {eligible.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No active validator on this network.</p>
              ) : (
                eligible.map((v) => {
                  const isSel = chosen?.address === v.address
                  const share = totalWeight ? (Number(v.weight) / totalWeight) * 100 : 0
                  const pool = pools.get(v.address.toLowerCase())
                  return (
                    <button
                      key={v.address}
                      type="button"
                      onClick={() => setSelected(v.address)}
                      className={cn('w-full rounded-xl border p-3 text-left transition-colors', isSel ? 'border-foreground/60 bg-foreground/5' : 'glass hover:bg-accent/40')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{short(v.address)}</span>
                        <span className="text-xs font-semibold tabular-nums">{pct(earnBps(rate, commissionOf(v)))} a year</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>
                          {share.toFixed(1)}% of stake · {pool ? `${pool.delegators} delegator${pool.delegators === 1 ? '' : 's'}` : 'no delegators yet'}
                        </span>
                        <span>{pct(commissionOf(v))} commission</span>
                      </div>
                    </button>
                  )
                })
              )}
            </section>

            <div className="space-y-1.5">
              <TextField label={`Amount (QRDX) · available ${formatAmount(balance, 18, 4)}`} value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} />
              {maxWei > 0n && (
                <button type="button" onClick={() => setAmount(formatUnitsExact(maxWei, 18))} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Use the maximum, less 0.01 QRDX for fees
                </button>
              )}
            </div>

            <div className="rounded-xl glass p-3 text-[11px] space-y-1 tabular-nums">
              <Row k="Earns a year" v={yearlyWei !== null ? `${formatAmount(yearlyWei, 18, 4)} QRDX` : '—'} />
              <Row k="Joins the pool" v={snap.epoch != null ? `epoch ${(snap.epoch + snap.params.warmup_epochs + 1).toLocaleString()} · ${epochsAsTime(snap.params.warmup_epochs, epochMs)}` : epochsAsTime(snap.params.warmup_epochs, epochMs)} />
              <Row k="To unstake" v={epochsAsTime(unbondEpochs, epochMs)} />
            </div>

            <Notice icon={<ShieldAlert className="h-4 w-4 text-foreground/70" />}>
              Delegated QRDX earns only in epochs the validator&apos;s vote is on chain, and is slashed with its pool if the validator double signs or casts conflicting votes (half the
              pool). Unstaking takes {epochsAsTime(unbondEpochs, epochMs)}, and the QRDX can still be slashed until it is paid.
            </Notice>

            <ErrorBanner error={error} />
            {done && <Notice tone="success">{done}</Notice>}

            <RunValidator
              own={ownValidator}
              params={snap.params}
              epochMs={epochMs}
              balance={balance}
              busy={busy}
              publicKey={currentWallet?.pqPublicKey ?? ''}
              onDeposit={(stakeAmount) =>
                run('deposit', 'STAKE_DEPOSIT', { validator_public_key: currentWallet?.pqPublicKey ?? '', stake_amount: stakeAmount }, 'Deposit recorded. Your validator activates after the activation delay.')
              }
              onExit={() => run('exit', 'STAKE_EXIT', {}, 'Exit requested. The stake returns after the exit is finalized.')}
            />
          </>
        )}
      </div>

      {qrdxChain && snap && (
        <div className="sticky bottom-0 p-4 pb-safe-4 glass-strong">
          <PrimaryButton
            loading={busy === 'delegate'}
            disabled={!!amountError || !!busy}
            onClick={() =>
              chosen &&
              run('delegate', 'STAKE_DELEGATE', { validator: chosen.address, amount }, `Delegated. It joins ${short(chosen.address)}'s pool in ${epochsAsTime(snap.params.warmup_epochs, epochMs)}.`)
            }
          >
            {amountError && amount ? amountError : `Delegate ${amount || ''} QRDX`}
          </PrimaryButton>
        </div>
      )}
      {pending && snap && (
        <ConfirmSheet
          title="Review staking"
          headline={stakeHeadline(pending.op, pending.params)}
          rows={stakeRows(pending.op, pending.params)}
          warnings={stakeWarnings(pending.op)}
          confirmLabel={pending.op === 'STAKE_EXIT' ? 'Request exit' : pending.op === 'STAKE_UNDELEGATE' ? 'Undelegate' : pending.op === 'STAKE_DEPOSIT' ? 'Stake as validator' : 'Delegate'}
          danger={pending.op === 'STAKE_EXIT'}
          busy={!!busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const p = pending
            void execute(p.label, p.op, p.params, p.success).finally(() => setPending(null))
          }}
        />
      )}
    </div>
  )

  function validatorName(address: string | undefined): string {
    return address ? short(address) : '—'
  }

  function stakeHeadline(op: StakeOp, params: Record<string, string>): string {
    if (op === 'STAKE_DELEGATE') return `Delegate ${params.amount} QRDX`
    if (op === 'STAKE_UNDELEGATE') return params.shares === 'all' ? 'Undelegate everything' : 'Undelegate part of your stake'
    if (op === 'STAKE_DEPOSIT') return `Stake ${Number(params.stake_amount).toLocaleString()} QRDX as a validator`
    return 'Exit as a validator'
  }

  function stakeRows(op: StakeOp, params: Record<string, string>): ReviewRow[] {
    const s = snap!
    const from: ReviewRow = { label: 'From', value: `${currentWallet?.name ?? 'Account'} · post-quantum`, sub: pq ? short(pq) : undefined }
    if (op === 'STAKE_DELEGATE') {
      const v = s.validators.find((x) => x.address === params.validator)
      const bps = v ? earnBps(rate, commissionOf(v)) : rate
      const wei = AMOUNT_RE.test(params.amount) ? ethToWei(params.amount) : 0n
      return [
        { label: 'Validator', value: validatorName(params.validator), sub: v ? `${pct(commissionOf(v))} commission` : undefined },
        { label: 'Amount', value: `${params.amount} QRDX`, strong: true },
        { label: 'Earns a year', value: `${formatAmount((wei * BigInt(Math.round(bps * 100))) / 1_000_000n, 18, 4)} QRDX`, sub: `${pct(bps)} after commission` },
        { label: 'Joins the pool', value: epochsAsTime(s.params.warmup_epochs, epochMs) },
        { label: 'To unstake', value: epochsAsTime(unbondEpochs, epochMs) },
        from,
      ]
    }
    if (op === 'STAKE_UNDELEGATE') {
      return [
        { label: 'Validator', value: validatorName(params.validator) },
        { label: 'Shares', value: params.shares === 'all' ? 'All, and anything still warming up' : qrdx(params.shares, 6), strong: true },
        { label: 'Paid', value: `in ${epochsAsTime(unbondEpochs, epochMs)}` },
        from,
      ]
    }
    if (op === 'STAKE_DEPOSIT') {
      return [
        { label: 'Stake', value: `${Number(params.stake_amount).toLocaleString()} QRDX`, strong: true },
        { label: 'Validator key', value: 'This account\u2019s post-quantum key' },
        { label: 'Active after', value: epochsAsTime(s.params.warmup_epochs, epochMs) },
        from,
      ]
    }
    return [{ label: 'Validator', value: `${currentWallet?.name ?? 'This account'}` }, { label: 'Stake returns', value: 'after the exit is finalized and the withdrawal delay' }, from]
  }

  function stakeWarnings(op: StakeOp): string[] {
    if (op === 'STAKE_DELEGATE') return ['Delegated QRDX is slashed with the validator\u2019s pool if it double signs or casts conflicting votes.']
    if (op === 'STAKE_UNDELEGATE') return ['Until it is paid, the QRDX can still be slashed with the pool.']
    if (op === 'STAKE_DEPOSIT') return ['Run a validator node with this key, or the stake earns nothing and loses to downtime penalties.']
    return ['The validator stops proposing and earning once the exit takes effect.']
  }
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}

/** One pool the account holds shares in: value, warm-up, and undelegating all or part. */
function Position({
  stake,
  pool,
  epoch,
  epochMs,
  busy,
  onUndelegate,
}: {
  stake: Delegations['stakes'][number]
  pool: StakingPool | null
  epoch: number | null
  epochMs: number | undefined
  busy: string | null
  onUndelegate: (shares: string, label: string) => void
}) {
  const [part, setPart] = useState('')
  const priceWei = pool ? ethToWei(pool.share_price.replace(/^(\d+\.\d{0,18}).*$/, '$1')) : 0n
  const ownedShares = ethToWei(stake.shares.replace(/^(\d+\.\d{0,18}).*$/, '$1'))
  // Part of the stake, in QRDX, redeemed as shares at the pool's price (rounded down).
  const partShares = part && AMOUNT_RE.test(part) && priceWei > 0n ? (ethToWei(part) * WEI) / priceWei : null
  const partError = part && (!partShares || partShares <= 0n) ? 'Enter an amount' : partShares && partShares > ownedShares ? 'More than your stake' : null
  return (
    <div className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2 text-[11px]">
        <span className="font-mono">{short(stake.validator)}</span>
        <span className="text-right tabular-nums">
          <span className="font-semibold">{qrdx(stake.value, 6)} QRDX</span>
          <span className="block text-muted-foreground">{qrdx(stake.shares, 6)} shares</span>
        </span>
      </div>
      {stake.warming_up.map((w, i) => {
        const left = epoch != null ? w.active_from_epoch - epoch : null
        return (
          <p key={i} className="text-[10px] text-muted-foreground tabular-nums">
            {qrdx(w.amount, 6)} QRDX warming up · joins {left != null && left > 0 ? `in ${epochsAsTime(left, epochMs)}` : 'this epoch'}
          </p>
        )
      })}
      <div className="flex items-center gap-1.5">
        <input
          value={part}
          onChange={(e) => setPart(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="QRDX"
          inputMode="decimal"
          aria-label="Amount to undelegate"
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground/30"
        />
        <button
          type="button"
          disabled={!!busy || !partShares || !!partError}
          onClick={() => partShares && onUndelegate(formatUnitsExact(partShares, 18), 'undelegate')}
          className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium disabled:opacity-40 hover:bg-accent/50"
        >
          {partError ?? 'Undelegate'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => onUndelegate('all', 'undelegate')}
          className="h-8 rounded-lg px-2 text-[11px] text-muted-foreground disabled:opacity-40 hover:text-foreground flex items-center gap-1"
        >
          <Undo2 className="h-3 w-3" /> All
        </button>
      </div>
    </div>
  )
}

/** Register this account as a validator (it must then run a validator node), or exit as one. */
function RunValidator({
  own,
  params,
  epochMs,
  balance,
  busy,
  publicKey,
  onDeposit,
  onExit,
}: {
  own: StakingValidator | null
  params: StakingParams
  epochMs: number | undefined
  balance: bigint
  busy: string | null
  publicKey: string
  onDeposit: (amount: string) => void
  onExit: () => void
}) {
  const [open, setOpen] = useState(!!own)
  const [amount, setAmount] = useState(params.min_validator_stake)
  const [understood, setUnderstood] = useState(false)
  const minWei = ethToWei(params.min_validator_stake)
  const amountWei = AMOUNT_RE.test(amount) ? ethToWei(amount) : null
  const amountError = amountWei === null ? 'Enter an amount' : amountWei < minWei ? `At least ${Number(params.min_validator_stake).toLocaleString()} QRDX` : amountWei > balance ? 'More than your quantum-safe balance' : null
  return (
    <section className="rounded-xl glass">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3 text-left">
        <Server className="h-3.5 w-3.5 text-foreground/70" />
        <span className="text-xs font-semibold flex-1">{own ? 'Your validator' : 'Run your own validator'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          {own ? (
            <div className="text-[11px] space-y-1 tabular-nums">
              <Row k="Status" v={`${own.status}${own.slashed ? ' (slashed)' : ''}`} />
              <Row k="Stake" v={`${qrdx(own.stake, 2)} QRDX`} />
              <Row k="Weight" v={`${qrdx(own.weight, 2)} QRDX (with delegations)`} />
              <Row k="Earned" v={`${qrdx(own.earned, 6)} QRDX`} />
              {own.activation_epoch != null && <Row k="Active from epoch" v={own.activation_epoch.toLocaleString()} />}
              {own.exit_epoch != null && <Row k="Exits at epoch" v={own.exit_epoch.toLocaleString()} />}
              {['active', 'pending'].includes(own.status) && (
                <div className="pt-2">
                  <PrimaryButton variant="outline" loading={busy === 'exit'} disabled={!!busy} onClick={onExit}>
                    Request exit
                  </PrimaryButton>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Registers <strong className="text-foreground">this account</strong> as a validator, with at least {Number(params.min_validator_stake).toLocaleString()} QRDX. To earn and avoid
                downtime penalties, run a QRDX validator node with this account&apos;s post-quantum key (export a keystore from Settings, Accounts). It activates after{' '}
                {epochsAsTime(params.warmup_epochs, epochMs)}.
              </p>
              <TextField label="Stake (QRDX)" value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                {SLASHING.map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />I will run a validator with this key and understand the stake
                can be slashed.
              </label>
              <PrimaryButton variant="outline" loading={busy === 'deposit'} disabled={!!amountError || !understood || !!busy || !publicKey} onClick={() => onDeposit(amount)}>
                {amountError ?? `Stake ${Number(amount).toLocaleString()} QRDX as a validator`}
              </PrimaryButton>
            </>
          )}
        </div>
      )}
    </section>
  )
}
