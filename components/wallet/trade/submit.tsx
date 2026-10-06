'use client'

/**
 * Review, sign and follow an exchange operation from the wallet's trading screen.
 *
 * In the wallet nothing asks for approval a second time, so every order passes
 * through a review sheet first. It describes the exact parameters about to be
 * signed with the same decoder as the approval window (exchange-describe.ts),
 * then signs with the account's PQ key and follows the receipt to its block.
 */

import { useCallback, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { describeExchangeOp, type DescribeContext } from '@/src/core/exchange-describe'
import type { ExchangeOpName, JsonValue } from '@/src/core/exchange-tx'
import { waitForExchangeReceipt } from '@/src/core/exchange-client'
import type { ApiAsset } from '@/src/core/trade/types'
import { Line, Sheet } from './kit'
import { cn } from '@/lib/utils'

export interface TradeRequest {
  op: ExchangeOpName
  params: Record<string, JsonValue>
  /** One line for the activity list. */
  label: string
  /** Assets the params name, so the summary shows symbols. */
  assets?: ApiAsset[]
  /** Or just address → symbol. */
  symbols?: Record<string, string>
  /** Estimates shown under the summary (not signed). */
  estimates?: { k: string; v: string }[]
  /** Called once the block includes it successfully. */
  onDone?: () => void
}

export interface Submission {
  id: string
  label: string
  status: 'pending' | 'done' | 'failed'
  txHash: string
  error?: string
  block?: number
  at: number
}

export function useTradeSubmit() {
  const { submitExchangeOp, activeChain } = useWallet()
  const [review, setReview] = useState<TradeRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])

  const ask = useCallback((req: TradeRequest) => {
    setError(null)
    setReview(req)
  }, [])

  const confirm = useCallback(async () => {
    if (!review) return
    const req = review
    setBusy(true)
    setError(null)
    try {
      const { txHash } = await submitExchangeOp(req.op, req.params)
      const item: Submission = { id: txHash, label: req.label, status: 'pending', txHash, at: Date.now() / 1000 }
      setSubmissions((s) => [item, ...s].slice(0, 30))
      setReview(null)
      waitForExchangeReceipt(activeChain, txHash)
        .then((r) => {
          setSubmissions((s) =>
            s.map((x) => (x.id === txHash ? { ...x, status: r.success ? 'done' : 'failed', error: r.error || undefined, block: r.block_height } : x))
          )
          if (r.success) req.onDone?.()
        })
        .catch((e) => setSubmissions((s) => s.map((x) => (x.id === txHash ? { ...x, error: (e as Error).message } : x))))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign the operation')
    } finally {
      setBusy(false)
    }
  }, [review, submitExchangeOp, activeChain])

  const sheet = (
    <ReviewSheet request={review} busy={busy} error={error} onCancel={() => !busy && setReview(null)} onConfirm={confirm} />
  )
  return { ask, sheet, submissions, pending: submissions.filter((s) => s.status === 'pending').length }
}

function ReviewSheet({
  request,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  request: TradeRequest | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { currentWallet } = useWallet()
  if (!request) return null
  const ctx: DescribeContext = { tokens: {} }
  for (const a of request.assets ?? []) if (a.address) ctx.tokens[a.address.toLowerCase()] = { symbol: a.onChainSymbol ?? a.symbol, name: a.name }
  for (const [addr, symbol] of Object.entries(request.symbols ?? {})) ctx.tokens[addr.toLowerCase()] = { symbol }
  const summary = describeExchangeOp(request.op, request.params, ctx)
  return (
    <Sheet open onClose={onCancel} title="Review and sign">
      <div className="rounded-xl border bg-background p-3">
        <p className="text-sm font-semibold leading-snug">{summary.headline}</p>
        {summary.details.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
            {summary.details.map((d) => (
              <Line key={d.label} k={d.label} v={d.value} />
            ))}
          </div>
        )}
      </div>
      {request.estimates && request.estimates.length > 0 && (
        <div className="mt-2 space-y-1 rounded-xl border border-dashed p-3">
          {request.estimates.map((e) => (
            <Line key={e.k} k={e.k} v={e.v} />
          ))}
          <p className="pt-1 text-[10px] text-muted-foreground">Estimates, not part of what is signed.</p>
        </div>
      )}
      {summary.warnings.map((w) => (
        <p key={w} className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {w}
        </p>
      ))}
      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="h-3 w-3" /> Signed by {currentWallet?.name ?? 'your account'}&apos;s post-quantum key. A gas fee of about
        0.0001 QRDX is burned when it executes.
      </p>
      {error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-500">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="h-11 rounded-xl border text-sm font-medium hover:bg-accent disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign and submit
        </button>
      </div>
    </Sheet>
  )
}

export function SubmissionList({ items }: { items: Submission[] }) {
  if (!items.length) return null
  return (
    <ul className="divide-y divide-border/60">
      {items.map((s) => (
        <li key={s.id} className="flex items-start gap-2 px-3 py-2 text-[11px]">
          {s.status === 'pending' ? (
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : s.status === 'done' ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bid" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ask" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{s.label}</span>
            <span className={cn('block', s.status === 'failed' ? 'text-ask' : 'text-muted-foreground')}>
              {s.status === 'pending' ? (s.error ?? 'Waiting for the next block (~3 min)') : s.status === 'done' ? `Executed in block ${s.block}` : `Failed: ${s.error}`}
            </span>
          </span>
          <span className="shrink-0 font-mono text-muted-foreground">{s.txHash.slice(0, 8)}</span>
        </li>
      ))}
    </ul>
  )
}
