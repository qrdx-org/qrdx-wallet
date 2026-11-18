'use client'

/**
 * Quantum safety (src/core/migration.ts): protect this account's classic 0x address by binding
 * its own 0xPQ address as the successor, with one approval from the classic key. Once bound, the
 * post-quantum key can turn the classic key off and move what the classic address holds; both
 * keep working after the Doomsday Protocol stops ECDSA.
 */

import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock, KeyRound, Loader2, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { weiToEth } from '@/src/core/ethereum'
import { accountAuthority, type Authority } from '@/src/core/qns'
import { callFromClassic } from '@/src/core/tx-service'
import { spendable } from '@/src/core/fee-reserve'
import { bindSuccessorCall, doomsdayStatus, EXCHANGE_WRITE_ADDRESS, migrationState, SEND_ACTION_FALLBACK_GAS, type DoomsdayStatus } from '@/src/core/migration'
import { useTradeSubmit, SubmissionList } from '../trade/submit'
import { useConfirm } from '../flow/ConfirmSheet'
import { ErrorBanner, Notice, PrimaryButton } from '../flow/FlowKit'
import { Row, Section, SettingsPage } from './shared'

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`
const DOCS = 'https://docs.qrdx.org/docs/guides/quantum-migration'

export function QuantumSafetyPage({ onBack }: { onBack: () => void }) {
  const { activeChain, currentWallet, backend, balances, fetchBalances } = useWallet()
  const { ask, sheet, submissions } = useTradeSubmit()
  const { dialog, confirm } = useConfirm()
  const classic = currentWallet?.ethAddress ?? ''
  const successor = currentWallet?.pqAddress ?? ''
  const [auth, setAuth] = useState<Authority | null>(null)
  const [doomsday, setDoomsday] = useState<DoomsdayStatus | null>(null)
  const [fee, setFee] = useState<bigint | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isQrdxChain(activeChain) || !classic || !currentWallet) return
    let live = true
    setReadError(null)
    Promise.all([
      accountAuthority(activeChain, classic),
      doomsdayStatus(activeChain),
      callFromClassic(backend, { chain: activeChain, account: currentWallet, to: EXCHANGE_WRITE_ADDRESS, data: bindSuccessorCall(successor), fallbackGas: SEND_ACTION_FALLBACK_GAS }, true).catch(() => null),
    ])
      .then(([a, d, q]) => {
        if (!live) return
        setAuth(a)
        setDoomsday(d)
        setFee(q?.fee ?? null)
        if (!a) setReadError(`${activeChain.name}'s node predates account control.`)
      })
      .catch((e) => live && setReadError(e instanceof Error ? e.message : 'Could not read this address'))
    return () => {
      live = false
    }
  }, [activeChain, classic, successor, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const state = auth ? migrationState(auth, successor) : null
  // A binding runs at the start of the block after the one that includes it: look again until it shows.
  useEffect(() => {
    if (!sent) return
    if (state && state.kind !== 'unprotected') {
      setSent(null)
      return
    }
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [sent, state?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isQrdxChain(activeChain)) {
    return (
      <SettingsPage title="Quantum safety" onBack={onBack}>
        <Notice>Quantum safety is set on QRDX networks. Switch to one to protect this account&apos;s classic address there.</Notice>
      </SettingsPage>
    )
  }

  const native = balances.find((b) => b.address === '')?.rawBalance ?? 0n
  const nativeText = weiToEth(native, activeChain.nativeCurrency.decimals)
  const triggered = !!doomsday?.triggered
  const canPay = fee !== null && native >= fee
  const movable = spendable(nativeText, 'QRDX')

  const protect = async () => {
    if (!currentWallet) return
    const ok = await confirm({
      title: 'Protect your classic address',
      message: (
        <>
          Your classic key signs one transaction that makes <strong className="text-foreground">{short(successor)}</strong>, this account&apos;s quantum-safe address, a
          controller of <strong className="text-foreground">{short(classic)}</strong>. It can then sign anything for the classic address, withdrawals included, and keeps
          working if ECDSA is ever broken.
        </>
      ),
      confirmLabel: 'Sign with the classic key',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const { hash } = await callFromClassic(backend, { chain: activeChain, account: currentWallet, to: EXCHANGE_WRITE_ADDRESS, data: bindSuccessorCall(successor), fallbackGas: SEND_ACTION_FALLBACK_GAS })
      setSent(hash)
      void fetchBalances()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the transaction')
    } finally {
      setBusy(false)
    }
  }

  const refreshSoon = () => setTimeout(() => setTick((n) => n + 1), 1500)

  return (
    <SettingsPage title="Quantum safety" onBack={onBack}>
      <Notice icon={<ShieldCheck className="h-4 w-4" />}>
        Your quantum-safe address ({short(successor)}) signs with ML-DSA-65. Your classic address ({short(classic)}) signs with ECDSA, which a large quantum computer could
        break. Bind the quantum-safe address as the classic one&apos;s successor while ECDSA still holds.{' '}
        <a href={DOCS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          How it works
        </a>
      </Notice>

      {triggered && (
        <Notice tone="warning" icon={<Siren className="h-4 w-4 text-amber-500" />}>
          The Doomsday Protocol has triggered on {activeChain.name}: ECDSA keys no longer sign here. A classic address acts only through a successor bound before it.
        </Notice>
      )}

      {readError ? (
        <Notice>{readError}</Notice>
      ) : !auth || !state ? (
        <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {short(classic || '0x')}…
        </p>
      ) : (
        <>
          <Section title="Classic address">
            <Row
              icon={state.kind === 'protected' ? <CheckCircle2 className="h-4 w-4" /> : state.kind === 'waiting' ? <Clock className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              danger={state.kind === 'unprotected' && native > 0n}
              label={state.kind === 'protected' ? 'Protected' : state.kind === 'waiting' ? 'Binding waits out your delay' : 'Not protected'}
              description={
                state.kind === 'protected'
                  ? `${short(successor)} controls it${state.via === 'registry' ? ', proven from the Ethereum migration registry' : ''}.`
                  : state.kind === 'waiting'
                    ? `The successor is bound ${new Date(state.due * 1000).toLocaleString()}.`
                    : `Holds ${nativeText} ${activeChain.nativeCurrency.symbol} on ${activeChain.name}.`
              }
            />
          </Section>

          {state.kind === 'unprotected' && (
            <div className="space-y-2">
              {sent ? (
                <Notice icon={<Loader2 className="h-4 w-4 animate-spin" />}>
                  Sent ({sent.slice(0, 10)}…). The binding runs at the start of the block after the one that includes it; this page updates when it shows.
                </Notice>
              ) : triggered ? null : !canPay ? (
                <Notice tone="warning">
                  {native === 0n
                    ? 'This classic address holds no QRDX here, so nothing is at risk on this network yet. To protect it anyway, send it a little QRDX for the fee first.'
                    : `The classic address needs about ${fee !== null ? weiToEth(fee, activeChain.nativeCurrency.decimals) : 'a little'} ${activeChain.nativeCurrency.symbol} for the fee, and holds ${nativeText}.`}
                </Notice>
              ) : (
                <>
                  <PrimaryButton loading={busy} onClick={protect}>
                    Protect with one approval
                  </PrimaryButton>
                  <p className="px-1 text-[11px] text-muted-foreground">
                    Fee about {weiToEth(fee!, activeChain.nativeCurrency.decimals)} {activeChain.nativeCurrency.symbol}, paid by the classic address.
                    {auth.delay > 0 ? ' Your account has a delay on changes, so the binding waits it out.' : ''}
                  </p>
                </>
              )}
              <ErrorBanner error={error} />
            </div>
          )}

          {state.kind === 'protected' && (
            <>
              <Section title="Classic key">
                <Row
                  icon={state.ownKey ? <KeyRound className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  label={state.ownKey ? 'On: the ECDSA key still signs' : 'Off: only the quantum-safe key signs'}
                  description={
                    state.ownKey
                      ? 'Turn it off and nobody who breaks ECDSA can move anything from the classic address. Its funds then move only by your quantum-safe key.'
                      : 'The classic address now acts only through your quantum-safe address.'
                  }
                  right={
                    state.ownKey ? (
                      <button
                        type="button"
                        className="text-[11px] text-red-500 hover:underline"
                        onClick={() => ask({ op: 'ACCOUNT_POLICY', params: { action: 'own_key', enabled: false }, actAs: classic, label: 'Turn the classic key off', onDone: refreshSoon })}
                      >
                        Turn off
                      </button>
                    ) : undefined
                  }
                />
              </Section>

              {Number(movable) > 0 && (
                <Section title="Move funds">
                  <Row
                    icon={<ArrowRight className="h-4 w-4" />}
                    label={`Move ${movable} ${activeChain.nativeCurrency.symbol} to your quantum-safe address`}
                    description="Signed by your quantum-safe key for the classic address. The network keeps 1 QRDX back for fees."
                    onClick={() =>
                      ask({
                        op: 'TOKEN_TRANSFER',
                        params: { token_address: 'QRDX', to: successor, amount: movable },
                        actAs: classic,
                        label: `Move ${movable} QRDX from the classic address`,
                        onDone: () => {
                          void fetchBalances()
                          refreshSoon()
                        },
                      })
                    }
                  />
                </Section>
              )}
            </>
          )}
          <SubmissionList items={submissions} />
        </>
      )}
      {sheet}
      {dialog}
    </SettingsPage>
  )
}
