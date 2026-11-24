'use client'

/**
 * Send on Bitcoin or Solana (src/core/other-chains.ts): pick the coin, the recipient and the
 * amount, review exactly what leaves and the network fee, then sign inside the wallet.
 */

import { Spinner } from '@/components/motion/Loading'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CheckCircle2, ClipboardPaste, ExternalLink } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily } from '@/src/core/chains'
import { formatAmount, formatUnitsExact } from '@/src/core/balances'
import { formatFiat } from '@/src/core/fiat'
import {
  btcFeeRates,
  confirmOtherSend,
  explorerTxUrl,
  isAddressOn,
  planOtherSend,
  submitOtherSend,
  type FeeSpeed,
  type OtherSendPlan,
} from '@/src/core/other-chains'
import type { BtcFeeRates } from '@/src/core/bitcoin'
import { SettingsPage, Section } from './settings/shared'
import { ErrorBanner, Notice, PrimaryButton } from './flow/FlowKit'
import { CoinLogo, isVerifiedToken } from './CoinLogo'
import { cn } from '@/lib/utils'

const SPEEDS: { key: FeeSpeed; label: string; eta: string }[] = [
  { key: 'fast', label: 'Fast', eta: '~10 min' },
  { key: 'normal', label: 'Normal', eta: '~30 min' },
  { key: 'slow', label: 'Slow', eta: '~1 hour' },
]

export function OtherSendModal({ initialToken, initialRecipient, onClose }: { initialToken?: string; initialRecipient?: string; onClose: () => void }) {
  const { activeChain, activeAddress, balances, prices, backend, currentWallet, fetchBalances, refreshTransactions } = useWallet()
  const family = chainFamily(activeChain)
  const native = activeChain.nativeCurrency
  const [token, setToken] = useState(() => (initialToken && balances.some((b) => b.address === initialToken) ? initialToken : ''))
  const [to, setTo] = useState(initialRecipient ?? '')
  const [amount, setAmount] = useState('')
  const [speed, setSpeed] = useState<FeeSpeed>('normal')
  const [rates, setRates] = useState<BtcFeeRates | null>(null)
  const [plan, setPlan] = useState<OtherSendPlan | null>(null)
  const [busy, setBusy] = useState<'plan' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ id: string; state: 'pending' | 'done' | 'failed' } | null>(null)

  useEffect(() => {
    if (family !== 'bitcoin') return
    btcFeeRates(activeChain.isTestnet ? 'testnet' : 'mainnet')
      .then(setRates)
      .catch(() => setRates(null))
  }, [family, activeChain.isTestnet])

  const coin = balances.find((b) => b.address === token) ?? balances.find((b) => b.address === '')
  const symbol = coin?.symbol ?? native.symbol
  const decimals = coin?.decimals ?? native.decimals
  const price = prices.get(symbol.toUpperCase())?.usd
  const toValid = to.trim() !== '' && isAddressOn(activeChain, to.trim())
  const amountNum = Number(amount)
  const amountValid = amount === 'max' || (amount.trim() !== '' && Number.isFinite(amountNum) && amountNum > 0)
  const over = coin && amount !== 'max' && amountValid && amountNum > Number(coin.formattedBalance)
  const fiat = (raw: bigint, d = decimals) => (price ? formatFiat(Number(formatUnitsExact(raw, d)) * price) : null)
  const nativePrice = prices.get(native.symbol.toUpperCase())?.usd

  const review = async () => {
    if (!activeAddress) return
    setBusy('plan')
    setError(null)
    try {
      setPlan(
        await planOtherSend({
          chain: activeChain,
          from: activeAddress,
          to,
          amount,
          token: token || undefined,
          feeRate: rates?.[speed],
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the transaction')
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    if (!plan || !currentWallet) return
    setBusy('send')
    setError(null)
    try {
      const id = await submitOtherSend(backend, activeChain, plan, currentWallet.id)
      setSent({ id, state: 'pending' })
      confirmOtherSend(activeChain, id)
        .then((ok) => setSent({ id, state: ok ? 'done' : 'failed' }))
        .catch(() => undefined)
        .finally(() => {
          fetchBalances()
          refreshTransactions()
        })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The network refused the transaction')
    } finally {
      setBusy(null)
    }
  }

  const tokens = useMemo(() => balances.filter((b) => b.address === '' || b.rawBalance > 0n), [balances])

  if (!activeAddress) {
    return (
      <SettingsPage title={`Send on ${activeChain.name}`} onBack={onClose}>
        <Notice>This account was imported from a private key, so it has no Solana address. Accounts from a recovery phrase have one.</Notice>
      </SettingsPage>
    )
  }

  if (sent) {
    const url = explorerTxUrl(activeChain, sent.id)
    return (
      <SettingsPage title="Sent" onBack={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          {sent.state === 'pending' && family === 'solana' ? (
            <Spinner size={40} className="text-muted-foreground" />
          ) : (
            <CheckCircle2 className={cn('h-10 w-10', sent.state === 'failed' ? 'text-red-500' : 'text-green-500')} />
          )}
          <p className="text-sm font-semibold">
            {sent.state === 'failed'
              ? 'The transaction failed'
              : family === 'bitcoin'
                ? 'Sent. It confirms in the next block, usually within the time you chose.'
                : sent.state === 'done'
                  ? 'Confirmed'
                  : 'Waiting for confirmation…'}
          </p>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            View on explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </SettingsPage>
    )
  }

  if (plan) {
    const fee = plan.fee
    const sending = plan.amount
    const feeLine = `${formatUnitsExact(fee, native.decimals)} ${native.symbol}`
    return (
      <SettingsPage title="Review" onBack={() => setPlan(null)}>
        <Section>
          <div className="space-y-3 p-3 text-xs">
            <div className="flex items-center gap-3">
              <CoinLogo symbol={symbol} verified={isVerifiedToken(activeChain, token)} size={36} />
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {formatUnitsExact(sending, plan.family === 'solana' ? plan.decimals : native.decimals)} {symbol}
                </p>
                {fiat(sending) && <p className="text-muted-foreground">{fiat(sending)}</p>}
              </div>
            </div>
            <Line k="To" v={<span className="break-all font-mono">{plan.to}</span>} />
            <Line k="Network" v={activeChain.name} />
            <Line
              k="Network fee"
              v={
                <>
                  {feeLine}
                  {nativePrice ? <span className="text-muted-foreground"> · {formatFiat(Number(formatUnitsExact(fee, native.decimals)) * nativePrice)}</span> : null}
                </>
              }
            />
            {plan.family === 'bitcoin' && (
              <Line k="Fee rate" v={`${plan.feeRate} sat/vB · ${plan.inputs} coin${plan.inputs > 1 ? 's' : ''} spent`} />
            )}
          </div>
        </Section>
        {plan.family === 'solana' && plan.symbol !== native.symbol && fee > 10_000n && (
          <Notice>The fee includes about 0.002 SOL to open the recipient&apos;s {plan.symbol} account, which they have not used before.</Notice>
        )}
        <Notice tone="warning">Transfers on {activeChain.name} cannot be reversed. Check the address.</Notice>
        <ErrorBanner error={error} />
        <PrimaryButton loading={busy === 'send'} onClick={send}>
          Send
        </PrimaryButton>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title={`Send on ${activeChain.name}`} onBack={onClose}>
      {tokens.length > 1 && (
        <Section title="Coin">
          <div className="flex flex-wrap gap-1.5 p-2">
            {tokens.map((b) => (
              <button
                key={b.address || 'native'}
                type="button"
                onClick={() => (setToken(b.address), setAmount(''))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  token === b.address ? 'border-foreground/40 bg-accent' : 'border-border/60 hover:bg-accent/50'
                )}
              >
                <CoinLogo symbol={b.symbol} verified={isVerifiedToken(activeChain, b.address)} size={18} />
                {b.symbol}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="To">
        <div className="space-y-1 p-2">
          <div className="flex gap-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={family === 'bitcoin' ? (activeChain.isTestnet ? 'tb1…' : 'bc1…, 1… or 3…') : 'Solana address'}
              aria-label="Recipient address"
              spellCheck={false}
              autoCapitalize="off"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.readText().then((t) => setTo(t.trim())).catch(() => undefined)}
              className="flex h-11 items-center gap-1 rounded-xl border border-border px-3 text-xs hover:bg-accent/50"
              aria-label="Paste address"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
          </div>
          {to.trim() && !toValid && (
            <p className="px-1 text-[11px] text-red-500">
              That is not a {activeChain.name} address{family === 'bitcoin' && activeChain.isTestnet ? ' (testnet addresses start with tb1)' : ''}.
            </p>
          )}
          {to.trim() === activeAddress && <p className="px-1 text-[11px] text-red-500">That is this account&apos;s own address.</p>}
        </div>
      </Section>

      <Section title="Amount">
        <div className="space-y-1.5 p-2">
          <div className="relative">
            <input
              value={amount === 'max' ? '' : amount}
              placeholder={amount === 'max' ? 'Everything, less the fee' : '0.00'}
              onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
              inputMode="decimal"
              aria-label="Amount"
              className="h-12 w-full rounded-xl border border-border bg-background px-3 pr-24 text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              <span className="text-sm font-semibold text-muted-foreground">{symbol}</span>
              <button
                type="button"
                onClick={() => setAmount('max')}
                className={cn('rounded-md px-2 py-1 text-[11px] font-semibold', amount === 'max' ? 'bg-foreground text-background' : 'bg-accent hover:bg-accent/70')}
              >
                Max
              </button>
            </div>
          </div>
          <div className="flex justify-between px-1 text-[11px] text-muted-foreground">
            <span>
              Balance: {coin ? formatAmount(coin.rawBalance, coin.decimals) : '0'} {symbol}
            </span>
            {price && amountValid && amount !== 'max' && <span>{formatFiat(amountNum * price)}</span>}
          </div>
          {over && <p className="px-1 text-[11px] text-red-500">More than this account holds.</p>}
        </div>
      </Section>

      {family === 'bitcoin' && (
        <Section title="Speed">
          <div className="grid grid-cols-3 gap-1.5 p-2">
            {SPEEDS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSpeed(s.key)}
                className={cn('rounded-xl border px-2 py-2 text-left', speed === s.key ? 'border-foreground/40 bg-accent' : 'border-border/60 hover:bg-accent/50')}
              >
                <span className="block text-xs font-semibold">{s.label}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {s.eta}
                  {rates ? ` · ${rates[s.key]} sat/vB` : ''}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <ErrorBanner error={error} />
      <PrimaryButton loading={busy === 'plan'} disabled={!toValid || to.trim() === activeAddress || !amountValid || !!over} onClick={review}>
        <ArrowUpRight className="mr-1.5 h-4 w-4" /> Review
      </PrimaryButton>
    </SettingsPage>
  )
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}
