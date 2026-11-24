'use client'

import type { ReactNode } from 'react'
import RubberSegment from '@/components/RubberSegment'
import JellyRadio from '@/components/JellyRadio'
import { cn } from '@/lib/utils'

/**
 * One of a few views or modes (12 or 24 words, quantum-safe or classic, a chart's range): a
 * RubberSegment (React Bits, components/RubberSegment.jsx). The chosen segment is an ink thumb
 * that stretches toward the next choice and settles with a squash; it can be dragged or flicked
 * across. Arrow keys move it, as in any radio group.
 *
 * `quiet` drops the track, for a row of small choices on a card (a chart's ranges).
 */
export function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'sm',
  fill = true,
  quiet = false,
  accent,
  disabled,
  className,
}: {
  value: T
  options: readonly { value: T; label: ReactNode; icon?: ReactNode }[]
  onChange: (v: T) => void
  /** What is being chosen, for screen readers. */
  label: string
  size?: 'sm' | 'md' | 'lg'
  /** As wide as its container (each segment an equal share); otherwise as wide as its labels. */
  fill?: boolean
  quiet?: boolean
  /** The thumb's colour instead of ink, with white words on it (buy green, sell red). */
  accent?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <RubberSegment
      items={options.map((o) => ({ ...o }))}
      value={value}
      onChange={(v) => onChange(v as T)}
      aria-label={label}
      size={size}
      radius={size === 'lg' ? 14 : 10}
      trackColor={quiet ? 'transparent' : 'hsl(var(--foreground) / 0.07)'}
      thumbColor={accent ?? 'hsl(var(--foreground))'}
      textColor="hsl(var(--foreground))"
      activeTextColor={accent ? '#ffffff' : 'hsl(var(--background))'}
      disabled={disabled}
      className={cn('wallet-segment', fill && 'wallet-segment--fill', className)}
    />
  )
}

/**
 * A choice among a handful of presets that each say something (a fee speed and its wait, a
 * slippage): JellyRadio chips (React Bits, components/JellyRadio.jsx), which swell when chosen
 * and nudge their neighbours aside.
 */
export function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'sm',
  disabled,
  className,
}: {
  /** Nothing chosen when it matches no option (a custom value typed elsewhere). */
  value: T | ''
  options: readonly { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
  /** xs for a row of fine print (a swap's slippage); sm 28px; md 36px; lg 44px. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}) {
  return (
    <JellyRadio
      items={options.map((o) => ({ ...o }))}
      value={value}
      onChange={(v) => onChange(v as T)}
      ariaLabel={label}
      size={size === 'xs' ? 'sm' : size}
      gap={4}
      radius={size === 'xs' || size === 'sm' ? 8 : 12}
      chipColor="hsl(var(--foreground) / 0.07)"
      activeColor="hsl(var(--foreground))"
      textColor="hsl(var(--muted-foreground))"
      activeTextColor="hsl(var(--background))"
      disabled={disabled}
      className={cn('wallet-chips', size === 'xs' && 'wallet-chips--xs', className)}
    />
  )
}
