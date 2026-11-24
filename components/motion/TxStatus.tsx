'use client'

import type { ReactNode } from 'react'
import StatusMark from '@/components/StatusMark'
import { cn } from '@/lib/utils'

/** A transaction's state as the wallet keeps it: in the mempool, in a block, or reverted/dropped. */
export type TxState = 'pending' | 'confirmed' | 'failed'

/**
 * Where a transaction stands: a StatusMark (React Bits, components/StatusMark.jsx). Waiting, its
 * ring spins; confirmed, the ring closes and a tick draws; failed, a cross. One mark that stays
 * mounted morphs from one to the next, so a send that confirms while on screen is seen to.
 */
export function TxStatus({
  status,
  size = 16,
  label,
  className,
}: {
  status: TxState
  size?: number
  /** Words beside the mark; otherwise the state is spoken from the mark itself. */
  label?: ReactNode
  className?: string
}) {
  return (
    <StatusMark
      status={status === 'pending' ? 'running' : status === 'confirmed' ? 'done' : 'failed'}
      size={size}
      strokeWidth={size < 18 ? 2.25 : 2}
      label={label}
      strike={false}
      fontSize={12}
      color="currentColor"
      doneColor="hsl(var(--bid))"
      errorColor="hsl(var(--ask))"
      className={cn('wallet-status', className)}
    />
  )
}
