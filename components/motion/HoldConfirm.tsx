'use client'

import type { ReactNode } from 'react'
import HoldButton from '@/components/HoldButton'
import { cn } from '@/lib/utils'

/**
 * The confirm button of an action that cannot be taken back (erase the wallet, remove an
 * account, disconnect every site, exit a stake): a HoldButton (React Bits,
 * components/HoldButton.jsx). It acts only after a press held for `holdTime`, the red filling it
 * from the left as a wave meanwhile; letting go early drains it, so a stray tap does nothing.
 * Enter or Space held does the same from the keyboard. Both looks use it: it is a safeguard, not
 * a style.
 */
export function HoldConfirm({
  children,
  doneLabel = 'Done',
  onConfirm,
  disabled,
  holdTime = 1200,
  size = 'lg',
  className,
}: {
  children: ReactNode
  doneLabel?: ReactNode
  onConfirm: () => void
  disabled?: boolean
  holdTime?: number
  size?: 'sm' | 'md' | 'lg'
  /** Width and height; the look is the component's. */
  className?: string
}) {
  return (
    <HoldButton
      onHold={onConfirm}
      disabled={disabled}
      holdTime={holdTime}
      releaseTime={260}
      size={size}
      radius={size === 'sm' ? 12 : 14}
      backgroundColor="hsl(var(--destructive) / 0.1)"
      fillColor="hsl(var(--destructive))"
      textColor="hsl(var(--destructive))"
      fillTextColor="#ffffff"
      doneLabel={doneLabel}
      resetAfter={1500}
      className={cn('wallet-hold font-semibold', className)}
    >
      {children}
    </HoldButton>
  )
}
