'use client'

/**
 * Swap on QRDX's native exchange (AMM pools + spot order books, routed by the node).
 *
 * Swaps are exchange transactions signed by the account's quantum-safe (0xPQ)
 * key and paid from that account's balances. The quote comes from the node's
 * router; the transaction carries `min_amount_out` derived from it and a
 * deadline, so it fails rather than fills at a worse price.
 *
 * Other networks have no built-in exchange; the screen says so instead of
 * pretending.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, ArrowLeft, Loader2, Repeat, Shield, CheckCircle2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { weiToEth } from '@/src/core/ethereum'
import {
  exchange,
  minimumOut,
  waitForExchangeReceipt,
  NATIVE_QRDX,
  type ExchangeToken,
  type SwapQuote,
} from '@/src/core/exchange-client'
import { shortenAddress } from '@/src/core/address'
import { ErrorBanner, Notice, PrimaryButton } from './flow/FlowKit'
import { Segmented } from './settings/shared'

interface SwapModalProps {
  onClose: () => void
}

interface Asset {
  id: string // "QRDX" or token address
  symbol: string
  name: string
  balance: string | null
}

function AssetSelect({
  assets,
  value,
  onChange,
  exclude,
}: {
  assets: Asset[]
  value: string
  onChange: (v: string) => void
  exclude?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Token"
      className="bg-muted/60 rounded-lg px-2 py-1.5 text-sm font-semibold max-w-[45%]"
    >
      {assets
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.symbol}
            {a.id !== NATIVE_QRDX ? ` · ${shortenAddress(a.id, 3)}` : ''}
          </option>
        ))}
    </select>
  )
}

const SLIPPAGE = [
  { value: '0.1', label: '0.1%' },
  { value: '0.5', label: '0.5%' },
  { value: '1', label: '1%' },
  { value: '3', label: '3%' },
] as const

export function SwapModal({ onClose }: SwapModalProps) {
  const { activeChain, currentWallet, pqBalance, submitExchangeOp, fetchBalances } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const [tokens, setTokens] = useState<ExchangeToken[]>([])
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [fromId, setFromId] = useState(NATIVE_QRDX)
  const [toId, setToId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<(typeof SLIPPAGE)[number]['value']>('0.5')
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'signing' | 'pending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const pq = currentWallet?.pqAddress ?? ''

  useEffect(() => {
    if (!qrdx || !pq) return
    exchange
      .tokens(activeChain)
      .then(async (list) => {
        setTokens(list)
        if (!toId && list[0]) setToId(list[0].token_address)
        const entries = await Promise.all(
          list.map((t) =>
            exchange
              .tokenBalance(activeChain, t.token_address, pq)
              .then((b) => [t.token_address, b] as const)
              .catch(() => [t.token_address, '0'] as const)
          )
        )
        setBalances(Object.fromEntries(entries))
      })
      .catch((e) =>
        setError(
          e instanceof Error
            ? `Could not load the token list: ${e.message}`
            : 'Could not load tokens'
        )
      )
  }, [qrdx, pq, activeChain]) // eslint-disable-line react-hooks/exhaustive-deps

  const assets: Asset[] = useMemo(
    () => [
      {
        id: NATIVE_QRDX,
        symbol: 'QRDX',
        name: 'QRDX',
        balance: pqBalance !== null ? weiToEth(pqBalance, 18) : null,
      },
      ...tokens.map((t) => ({
        id: t.token_address,
        symbol: t.symbol,
        name: t.name,
        balance: balances[t.token_address] ?? null,
      })),
    ],
    [tokens, balances, pqBalance]
  )
  const from = assets.find((a) => a.id === fromId)
  const to = assets.find((a) => a.id === toId)
  const amountOk = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  const exceeds = amountOk && from?.balance != null && Number(amount) > Number(from.balance)

  useEffect(() => {
    setQuote(null)
    if (!qrdx || !amountOk || !toId || fromId === toId || !pq) return
    let cancelled = false
    setQuoting(true)
    const t = setTimeout(() => {
      exchange
        .quoteSwap(activeChain, fromId, toId, amount, pq)
        .then((q) => !cancelled && (setQuote(q), setError(null)))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'No quote'))
        .finally(() => !cancelled && setQuoting(false))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [fromId, toId, amount, qrdx, pq, activeChain]) // eslint-disable-line react-hooks/exhaustive-deps

  const flip = () => {
    if (!toId) return
    setFromId(toId)
    setToId(fromId)
    setAmount('')
  }

  const swap = async () => {
    if (!quote) return
    setError(null)
    setStatus('signing')
    try {
      const { txHash } = await submitExchangeOp('SWAP', {
        token_in: fromId,
        token_out: toId,
        amount_in: amount,
        min_amount_out: minimumOut(quote.amount_out, Number(slippage)),
        deadline: Math.floor(Date.now() / 1000) + 600,
      })
      setTxHash(txHash)
      setStatus('pending')
      const r = await waitForExchangeReceipt(activeChain, txHash)
      if (!r.success) throw new Error(r.error || 'The swap failed on-chain')
      setStatus('done')
      fetchBalances()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed')
      setStatus('idle')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
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
            <h1 className="text-base font-semibold">Swap</h1>
            <p className="text-[10px] text-muted-foreground">QRDX native exchange</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-3">
        {!qrdx ? (
          <div className="text-center py-12">
            <Repeat className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Swaps run on QRDX networks</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              {activeChain.name} has no built-in exchange. Switch to a QRDX network to swap with
              your quantum-safe account.
            </p>
          </div>
        ) : (
          <>
            <Notice icon={<Shield className="h-4 w-4 text-primary" />}>
              Signed by your quantum-safe account{' '}
              <span className="font-mono">{shortenAddress(pq, 4)}</span> and paid from its balance.
            </Notice>

            <div className="rounded-2xl glass p-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>You pay</span>
                <span>Balance {from?.balance ?? '…'}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
                  placeholder="0.0"
                  className="flex-1 min-w-0 bg-transparent text-2xl font-bold focus:outline-none"
                />
                <AssetSelect
                  assets={assets}
                  value={fromId}
                  onChange={(v) => {
                    setFromId(v)
                    if (v === toId) setToId('')
                  }}
                />
              </div>
              {from?.balance && (
                <button
                  type="button"
                  onClick={() => setAmount(from.balance!)}
                  className="text-[10px] text-primary font-semibold mt-1"
                >
                  MAX
                </button>
              )}
            </div>

            <div className="flex justify-center -my-1">
              <button
                type="button"
                onClick={flip}
                aria-label="Swap direction"
                className="h-9 w-9 rounded-xl glass flex items-center justify-center"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl glass p-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>You receive (estimated)</span>
                <span>Balance {to?.balance ?? '…'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-2xl font-bold text-muted-foreground truncate">
                  {quoting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    (quote?.amount_out ?? '0.0')
                  )}
                </div>
                {assets.length > 1 ? (
                  <AssetSelect assets={assets} value={toId} onChange={setToId} exclude={fromId} />
                ) : (
                  <span className="text-xs text-muted-foreground">No tokens yet</span>
                )}
              </div>
            </div>

            <div className="rounded-xl glass p-3 space-y-2">
              <div className="text-[11px] text-muted-foreground">Max slippage</div>
              <Segmented value={slippage} options={[...SLIPPAGE]} onChange={setSlippage} />
              {quote && (
                <div className="text-[11px] space-y-1 pt-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Route</span>
                    <span>
                      {quote.source.toUpperCase()}
                      {quote.pool_id ? ` · pool ${quote.pool_id.slice(0, 8)}` : ` · ${quote.pair}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span>
                      {Number(quote.execution_price).toPrecision(6)} {from?.symbol}/{to?.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool fee</span>
                    <span>
                      {quote.fee} {from?.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Minimum received</span>
                    <span>
                      {minimumOut(quote.amount_out, Number(slippage))} {to?.symbol}
                    </span>
                  </div>
                  {Number(quote.unfilled_in) > 0 && (
                    <p className="text-amber-500">
                      Only {quote.amount_in} of {amount} can fill at current liquidity.
                    </p>
                  )}
                </div>
              )}
            </div>

            {exceeds && <ErrorBanner error={`Exceeds your quantum-safe ${from?.symbol} balance`} />}
            <ErrorBanner error={error} />
            {status === 'done' && (
              <div className="flex items-center gap-2 text-xs text-green-500">
                <CheckCircle2 className="h-4 w-4" /> Swap confirmed{' '}
                {txHash && <span className="font-mono">{txHash.slice(0, 10)}…</span>}
              </div>
            )}
          </>
        )}
      </div>

      {qrdx && (
        <div className="sticky bottom-0 p-4 glass-strong pb-safe">
          <PrimaryButton
            loading={status === 'signing' || status === 'pending'}
            disabled={!quote || exceeds || status !== 'idle'}
            onClick={swap}
          >
            {status === 'pending' ? 'Waiting for the next block…' : 'Swap'}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}
