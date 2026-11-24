'use client'

import type { ReactNode } from 'react'
import SpringCheck from '@/components/SpringCheck'
import { cn } from '@/lib/utils'

/**
 * A checkbox: a SpringCheck (React Bits, components/SpringCheck.jsx), whose box fills with ink
 * on a spring and draws its tick. Its label is part of the control (tapping the words checks it);
 * without one (`aria` names it instead) it is the box alone, for a row that has its own words.
 * Never struck through: here a check means "include this" or "I agree", not "done".
 */
export function Check({
  checked,
  onChange,
  label,
  aria,
  disabled,
  size = 18,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  /** The name when there is no visible label. */
  aria?: string
  disabled?: boolean
  size?: number
  className?: string
}) {
  return (
    <SpringCheck
      checked={checked}
      onChange={onChange}
      label={label ?? ''}
      ariaLabel={aria}
      disabled={disabled}
      color="hsl(var(--foreground))"
      fillColor="hsl(var(--foreground))"
      checkColor="hsl(var(--background))"
      boxSize={size}
      boxRadius={Math.round(size / 3.2)}
      fontSize={12}
      strike="none"
      doneOpacity={1}
      className={cn('wallet-check', label == null && 'wallet-check--bare', className)}
    />
  )
}
