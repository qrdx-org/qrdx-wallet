'use client'

import type { ReactNode } from 'react'
import GlideSelect from '@/components/GlideSelect'
import { cn } from '@/lib/utils'

/**
 * A pick from a list (a token, a network, an account): a GlideSelect (React Bits,
 * components/GlideSelect.jsx). Its menu pops from the field and a highlight glides from row to
 * row; a finger can press and slide down the list to choose. Long lists scroll (app/globals.css).
 * Sized like the wallet's text fields: `className` sets the width and `size` the height.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder,
  size = 'lg',
  align = 'left',
  disabled,
  className,
}: {
  value: T
  options: readonly { value: T; label: ReactNode; tag?: ReactNode }[]
  onChange: (v: T) => void
  /** What is being chosen, for screen readers. */
  label: string
  placeholder?: string
  /** sm 28px, md 32px, lg 44px (a text field's height). */
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right'
  disabled?: boolean
  className?: string
}) {
  return (
    <GlideSelect
      options={options.map((o) => ({ ...o }))}
      value={value}
      onChange={(v) => onChange(v as T)}
      ariaLabel={label}
      placeholder={placeholder}
      size={size}
      align={align}
      radius={size === 'lg' ? 14 : 10}
      menuWidth={200}
      accentColor="hsl(var(--foreground))"
      surfaceColor="hsl(var(--popover))"
      highlightColor="hsl(var(--foreground) / 0.08)"
      textColor="hsl(var(--foreground))"
      disabled={disabled}
      className={cn('wallet-select', className)}
    />
  )
}
