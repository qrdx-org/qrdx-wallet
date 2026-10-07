'use client'

/**
 * Building blocks of the wallet's trading screens, after trade.qrdx.org:
 * the same structure and numbers, in the wallet's monochrome.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { tradeGet } from '@/src/core/trade/api'
import type { ApiAsset } from '@/src/core/trade/types'
import { cn } from '@/lib/utils'

// ── data ───────────────────────────────────────────────────────────────────────

export interface Polled<T> {
  data: T | null
  error: Error | null
  refresh: () => void
}

/** GET a trade API path, refreshed every `ms` while the page is visible. */
export function useTradeApi<T>(base: string | null, path: string | null, ms = 0): Polled<T> {
  const key = base && path !== null ? base + path : null
  // Results are stored with the request they answer, so a new path never shows the old one's data.
  const [state, setState] = useState<{ key: string | null; data: T | null; error: Error | null }>({ key: null, data: null, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!key) return
    const ctrl = new AbortController()
    tradeGet<T>(base!, path!, ctrl.signal).then(
      (data) => setState({ key, data, error: null }),
      (e) => {
        if ((e as Error).name !== 'AbortError') setState((s) => ({ key, data: s.key === key ? s.data : null, error: e as Error }))
      }
    )
    return () => ctrl.abort()
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key || !ms) return
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') setTick((n) => n + 1)
    }, ms)
    return () => clearInterval(t)
  }, [key, ms])

  const refresh = useCallback(() => setTick((n) => n + 1), [])
  const mine = state.key === key
  return { data: mine ? state.data : null, error: mine ? state.error : null, refresh }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** 'flash-up' / 'flash-down' for a moment after `value` moves. */
export function usePriceFlash(value: string | null | undefined): string {
  const prev = useRef<number | null>(null)
  const [cls, setCls] = useState('')
  useEffect(() => {
    const n = value == null ? null : Number(value)
    const before = prev.current
    prev.current = n
    if (n === null || before === null || n === before) return
    const on = setTimeout(() => setCls(n > before ? 'flash-up' : 'flash-down'), 0)
    const off = setTimeout(() => setCls(''), 900)
    return () => {
      clearTimeout(on)
      clearTimeout(off)
    }
  }, [value])
  return cls
}

// ── tokens ─────────────────────────────────────────────────────────────────────

const LOGOS = new Set(['qrdx', 'btc', 'eth', 'usdc', 'usdt', 'sol', 'bnb', 'avax', 'link', 'uni', 'ada', 'dot', 'doge'])
const SIZES = { xs: 'h-4 w-4 text-[6px]', sm: 'h-5 w-5 text-[7px]', md: 'h-7 w-7 text-[9px]', lg: 'h-9 w-9 text-[11px]' }

/**
 * Verified assets show their logo in greyscale; others the image their creator
 * published, also greyscale, or an initials disc. Unverified tokens keep a dashed
 * ring either way, so a borrowed logo still reads as unverified.
 */
export function TokenBadge({
  asset,
  size = 'sm',
  className,
}: {
  asset: Pick<ApiAsset, 'symbol' | 'verified'> & { slug?: string | null; image?: string | null }
  size?: keyof typeof SIZES
  className?: string
}) {
  const [broken, setBroken] = useState<string | null>(null)
  const slug = asset.verified ? (asset.slug ?? asset.symbol.toLowerCase().replace(/^[qw](?=[a-z]{3})/, '')) : null
  if (slug && LOGOS.has(slug)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/tokens/${slug}.svg`} alt="" aria-hidden className={cn('logo-mono shrink-0 rounded-full', SIZES[size], className)} />
  }
  if (asset.image && broken !== asset.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.image}
        alt=""
        aria-hidden
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(asset.image ?? null)}
        className={cn('logo-mono shrink-0 rounded-full bg-muted object-cover', !asset.verified && 'outline-dashed outline-1 outline-offset-1 outline-amber-500', SIZES[size], className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold uppercase text-background',
        !asset.verified && 'outline-dashed outline-1 outline-offset-1 outline-amber-500',
        SIZES[size],
        className
      )}
    >
      {asset.symbol.replace(/^0x/, '').replace(/^[qw](?=[A-Z])/, '').slice(0, 3)}
    </span>
  )
}

export function PairBadge({ base, quote, size = 'md' }: { base: ApiAsset; quote: ApiAsset; size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex items-center">
      <TokenBadge asset={base} size={size} className="relative z-[1] ring-2 ring-background" />
      <TokenBadge asset={quote} size={size} className="-ml-2 ring-2 ring-background" />
    </span>
  )
}

// ── layout ─────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex h-9 items-center gap-0.5 border-b border-border/60', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'relative h-full whitespace-nowrap px-2.5 text-[12px] font-medium transition-colors',
            value === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
          {value === t.id && <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-foreground" />}
        </button>
      ))}
    </div>
  )
}

export function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            value === o.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A bottom sheet over the screen. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up rounded-t-2xl border-t bg-card pb-safe shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

/** A labelled amount input with its unit inside. Labels stay real <label>s. */
export function AmountField({
  label,
  unit,
  value,
  onChange,
  placeholder = '0.00',
  extra,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  extra?: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        {extra}
      </span>
      <span className="relative block">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
          placeholder={placeholder}
          className="num h-10 w-full rounded-lg border border-border bg-background pl-3 pr-14 text-right text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex max-w-[52px] items-center truncate text-[11px] font-medium text-muted-foreground">
          {unit}
        </span>
      </span>
    </label>
  )
}

export function Line({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn('num text-right', className)}>{v}</span>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-muted-foreground">{children}</p>
}
