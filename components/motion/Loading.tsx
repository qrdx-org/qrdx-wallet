'use client'

import LatticeLoader from '@/components/LatticeLoader'
import { cn } from '@/lib/utils'

/**
 * The wallet's loading states: React Bits' LatticeLoader (components/LatticeLoader.jsx), a lattice
 * of dots lit in turn, in the wallet's ink. `Loading` is a section's state with its words
 * ("Reading every network"); `Spinner` is icon-sized, for buttons and inline, its words spoken
 * to screen readers but not shown. Both hold still under reduced motion (the loader's CSS).
 */
export function Loading({ label, className, timer = false }: { label: string; className?: string; timer?: boolean }) {
  return <LatticeLoader label={label} pattern="orbit" cellSize={5} gap={2} fontSize={12} showTimer={timer} className={cn('text-muted-foreground', className)} />
}

export function Spinner({ size = 14, label = 'Loading', className }: { size?: number; label?: string; className?: string }) {
  // Three cells and two gaps across `size` pixels.
  const gap = size >= 20 ? 2 : 1
  const cell = Math.max(2, Math.round((size - 2 * gap) / 3))
  return <LatticeLoader label={label} pattern="orbit" cellSize={cell} gap={gap} fontSize={12} showTimer={false} className={cn('lattice-icon', className)} />
}
