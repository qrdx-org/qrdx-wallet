'use client'

import { CtaButton } from '@/components/motion/CtaButton'
import { HoldConfirm } from '@/components/motion/HoldConfirm'
import { Spinner } from '@/components/motion/Loading'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet } from './FlowKit'

export interface ReviewRow {
  label: string
  value: ReactNode
  /** A second line under the value (USD, an address in full). */
  sub?: ReactNode
  /** Emphasised (the amount, the total). */
  strong?: boolean
}

/**
 * The review step before anything is signed: what moves, to whom, from which account and
 * network, and what it costs. Nothing is signed until Confirm.
 */
export function ConfirmSheet({
  title,
  headline,
  rows,
  warnings = [],
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  /** The one-line summary at the top ("Send 5 QRDX"). */
  headline?: ReactNode
  rows: ReviewRow[]
  warnings?: ReactNode[]
  confirmLabel?: string
  /** A destructive action: confirmed by holding the button (components/motion/HoldConfirm.tsx). */
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet title={title} onClose={busy ? () => undefined : onCancel}>
      {headline && <p className="mb-4 text-lg font-semibold tracking-tight">{headline}</p>}
      <div className="divide-y divide-border/60 rounded-xl border border-border/70">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs">
            <span className="shrink-0 text-muted-foreground">{r.label}</span>
            <span className={cn('min-w-0 break-words text-right tabular-nums', r.strong && 'text-sm font-semibold')}>
              {r.value}
              {r.sub != null && <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{r.sub}</span>}
            </span>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-foreground/70" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
      {error && <p className="mt-3 rounded-xl border border-foreground/30 bg-foreground/5 px-3 py-2 text-[11px] text-foreground">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-11 rounded-xl border border-border text-sm font-medium transition-colors hover:bg-accent/50 disabled:opacity-40"
        >
          Cancel
        </button>
        {danger ? (
          <HoldConfirm onConfirm={onConfirm} disabled={busy} size="sm" doneLabel={busy ? 'Working…' : 'Confirmed'} className="!h-11 w-full text-sm">
            {busy && <Spinner size={16} />}
            Hold to {confirmLabel.toLowerCase()}
          </HoldConfirm>
        ) : (
          <CtaButton onClick={onConfirm} disabled={busy} className="h-11 text-sm" size="sm">
            {busy && <Spinner size={16} />}
            {confirmLabel}
          </CtaButton>
        )}
      </div>
    </Sheet>
  )
}

interface ConfirmRequest {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

/**
 * Ask before a destructive action (remove a contact, disconnect a site): `await confirm({...})`
 * resolves true on Confirm. Render `dialog` once in the component.
 */
export function useConfirm(): { dialog: ReactNode; confirm: (req: ConfirmRequest) => Promise<boolean> } {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const confirm = useCallback(
    (r: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setReq(r)
      }),
    []
  )
  const close = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setReq(null)
  }
  const dialog = req ? (
    <Sheet title={req.title} onClose={() => close(false)}>
      <div className="text-xs leading-relaxed text-muted-foreground">{req.message}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => close(false)} className="h-11 rounded-xl border border-border text-sm font-medium hover:bg-accent/50">
          Cancel
        </button>
        {req.danger ? (
          <HoldConfirm onConfirm={() => close(true)} size="sm" className="!h-11 w-full text-sm">
            Hold to {(req.confirmLabel ?? 'confirm').toLowerCase()}
          </HoldConfirm>
        ) : (
          <CtaButton onClick={() => close(true)} className="h-11 text-sm" size="sm">
            {req.confirmLabel ?? 'Confirm'}
          </CtaButton>
        )}
      </div>
    </Sheet>
  ) : null
  return { dialog, confirm }
}
