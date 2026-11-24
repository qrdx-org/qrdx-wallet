'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import FuseButton from '@/components/FuseButton'
import { cn } from '@/lib/utils'

/**
 * Remove something this device keeps (a contact, a price alert, a network, a site's access)
 * with a moment to take it back, instead of asking first: a FuseButton (React Bits,
 * components/FuseButton.jsx). The press turns it into Undo, whose outline burns down over
 * `window`; the removal happens when it runs out. Leaving the screen before then completes it,
 * as walking away from an undo bar does.
 */
export function UndoButton({
  label,
  what,
  icon,
  onRemove,
  window = 4000,
  disabled,
  className,
}: {
  /** The action ("Remove"). */
  label: ReactNode
  /** What it removes, for screen readers in a list of them ("Remove Alice"). */
  what?: string
  icon?: ReactNode
  onRemove: () => void
  window?: number
  disabled?: boolean
  className?: string
}) {
  const armed = useRef(false)
  const remove = useRef(onRemove)
  useEffect(() => {
    remove.current = onRemove
  })
  // Unmounted mid-window (the sheet closed): the press stands.
  useEffect(
    () => () => {
      if (armed.current) remove.current()
    },
    []
  )
  return (
    <FuseButton
      label={
        <>
          {label}
          {what && <span className="sr-only"> {what}</span>}
        </>
      }
      icon={icon}
      undoLabel="Undo"
      doneLabel="Removed"
      commitOn="fuseEnd"
      undoWindow={window}
      settle="stay"
      size="sm"
      radius={10}
      fuse="outline"
      fuseThickness={1.5}
      color="hsl(var(--foreground))"
      background="hsl(var(--foreground) / 0.06)"
      fuseColor="hsl(var(--foreground))"
      disabled={disabled}
      onPhaseChange={(p) => (armed.current = p === 'armed')}
      onCommit={() => {
        armed.current = false
        remove.current()
      }}
      className={cn('wallet-undo', className)}
    />
  )
}
