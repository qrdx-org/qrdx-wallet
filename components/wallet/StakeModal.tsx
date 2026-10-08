'use client'

/**
 * Staking on QRDX: run a validator with this account.
 *
 * What the node actually supports (qrdx/exchange/state_manager.py
 * `_op_stake_deposit` / `_op_stake_exit`): a STAKE_DEPOSIT registers the
 * *sending* quantum-safe account as a validator, debiting the stake from its
 * balance; STAKE_EXIT starts the exit, and the stake is refunded at the
 * finalized exit epoch unless the validator was slashed. There is no
 * delegation yet, so this screen does not offer it.
 *
 * Earning rewards requires a validator node running with this account's
 * post-quantum key — the screen says so plainly before taking any stake.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Clock, Coins, Landmark, Server, ShieldAlert } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { weiToEth } from '@/src/core/ethereum'
import { waitForExchangeReceipt } from '@/src/core/exchange-client'
import { ErrorBanner, Notice, PrimaryButton, TextField } from './flow/FlowKit'

interface StakeModalProps {
  onClose: () => void
}

/** From qrdx/constants.py — shown, and enforced again by the node. */
const PARAMS = {
  minActivation: 100_000,
  maxEffective: 1_000_000,
  ejectionBelow: 50_000,
  activationDelayEpochs: 4,
  epochSeconds: 64,
  slashing: [
    ['Double signing', '50%'],
    ['Surround vote', '50%'],
    ['Invalid attestation', '30%'],
    ['Extended downtime', '5%'],
    ['Bridge fraud', '100%'],
  ],
}

interface ValidatorRecord {
  address: string
  status: string
  stake: string
  effective_stake: string
  slashed?: boolean | number
  activation_epoch?: number | null
  exit_epoch?: number | null
}

export function StakeModal({ onClose }: StakeModalProps) {
  const { activeChain, currentWallet, pqBalance, submitExchangeOp, fetchBalances } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const [validator, setValidator] = useState<ValidatorRecord | null | undefined>(undefined)
  const [amount, setAmount] = useState(String(PARAMS.minActivation))
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const pq = currentWallet?.pqAddress ?? ''

  const loadValidator = async () => {
    if (!qrdx || !activeChain.nodeApiUrl || !pq) return setValidator(null)
    try {
      const res = await fetch(`${activeChain.nodeApiUrl}/get_validators`)
      const body = (await res.json()) as { result?: ValidatorRecord[] }
      setValidator(body.result?.find((v) => v.address.toLowerCase() === pq.toLowerCase()) ?? null)
    } catch {
      setValidator(null)
    }
  }

  useEffect(() => {
    loadValidator()
  }, [qrdx, pq, activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const balanceQrdx = pqBalance !== null ? Number(weiToEth(pqBalance, 18)) : 0
  const amountNum = Number(amount)
  const amountError = !/^\d+(\.\d+)?$/.test(amount)
    ? 'Enter an amount'
    : amountNum < PARAMS.minActivation
      ? `At least ${PARAMS.minActivation.toLocaleString()} QRDX is needed to activate`
      : amountNum > balanceQrdx
        ? 'More than your quantum-safe balance'
        : null

  const run = async (op: 'STAKE_DEPOSIT' | 'STAKE_EXIT') => {
    if (!currentWallet) return
    setBusy(true)
    setError(null)
    try {
      const { txHash } = await submitExchangeOp(
        op,
        op === 'STAKE_DEPOSIT'
          ? { validator_public_key: currentWallet.pqPublicKey, stake_amount: amount }
          : {}
      )
      const r = await waitForExchangeReceipt(activeChain, txHash)
      if (!r.success) throw new Error(r.error || 'Rejected by the network')
      setDone(
        op === 'STAKE_DEPOSIT'
          ? 'Deposit recorded. Your validator activates after the activation delay.'
          : 'Exit requested. The stake returns after the exit is finalized.'
      )
      fetchBalances()
      loadValidator()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staking operation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="h-8 w-8 rounded-lg hover:bg-accent/50 flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Stake</h1>
            <p className="text-[10px] text-muted-foreground">Quantum-resistant proof of stake</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-3">
        {!qrdx ? (
          <div className="text-center py-12">
            <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Staking runs on QRDX networks</p>
            <p className="text-xs text-muted-foreground mt-1">Switch to a QRDX network to stake.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { icon: Coins, label: 'Minimum', value: `${PARAMS.minActivation / 1000}K` },
                {
                  icon: Landmark,
                  label: 'Max effective',
                  value: `${PARAMS.maxEffective / 1_000_000}M`,
                },
                { icon: Clock, label: 'Epoch', value: `${PARAMS.epochSeconds}s` },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl glass"
                >
                  <s.icon className="h-3.5 w-3.5 text-foreground/70" />
                  <span className="text-sm font-bold">{s.value}</span>
                  <span className="text-[9px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>

            {validator === undefined ? (
              <p className="text-xs text-muted-foreground">Checking validator status…</p>
            ) : validator ? (
              <div className="rounded-xl glass p-3 text-[12px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-semibold capitalize">
                    {validator.status}
                    {validator.slashed ? ' (slashed)' : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stake</span>
                  <span>{Number(validator.stake).toLocaleString()} QRDX</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Effective stake</span>
                  <span>{Number(validator.effective_stake).toLocaleString()} QRDX</span>
                </div>
                {validator.activation_epoch != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Activation epoch</span>
                    <span>{validator.activation_epoch}</span>
                  </div>
                )}
                {validator.exit_epoch != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exit epoch</span>
                    <span>{validator.exit_epoch}</span>
                  </div>
                )}
                {['active', 'pending'].includes(validator.status) && (
                  <div className="pt-2">
                    <PrimaryButton
                      variant="outline"
                      loading={busy}
                      onClick={() => run('STAKE_EXIT')}
                    >
                      Request exit
                    </PrimaryButton>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Notice icon={<Server className="h-4 w-4 text-primary" />}>
                  Staking registers <strong>this account</strong> as a validator. To earn rewards —
                  and avoid downtime penalties — you must run a QRDX validator node with this
                  account’s post-quantum key (export a keystore from Settings → Accounts).
                  Delegating to someone else’s validator is not available yet.
                </Notice>
                <TextField
                  label={`Stake (QRDX) — available ${balanceQrdx.toLocaleString()}`}
                  value={amount}
                  onChange={setAmount}
                />
                <div className="rounded-xl glass p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Slashing
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    {PARAMS.slashing.map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    A validator ejected below {PARAMS.ejectionBelow.toLocaleString()} QRDX, or
                    slashed, may lose stake. Exits take several epochs to finalize.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-0.5"
                  />
                  I will run a validator with this key and understand the stake can be slashed.
                </label>
              </>
            )}
            <ErrorBanner error={error} />
            {done && <Notice tone="success">{done}</Notice>}
            {balanceQrdx < PARAMS.minActivation && !validator && (
              <div className="flex items-start gap-2 text-[11px] text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5" /> Your quantum-safe account holds
                less than the minimum. Move funds to it from the Send screen.
              </div>
            )}
          </>
        )}
      </div>

      {qrdx && validator === null && (
        <div className="sticky bottom-0 p-4 pb-safe-4 glass-strong">
          <PrimaryButton
            loading={busy}
            disabled={!!amountError || !understood}
            onClick={() => run('STAKE_DEPOSIT')}
          >
            {amountError && amount
              ? amountError
              : `Stake ${amountNum ? amountNum.toLocaleString() : ''} QRDX`}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}
