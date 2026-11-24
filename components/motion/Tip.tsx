'use client'

import type { ReactElement, ReactNode } from 'react'
import WarmTooltip, { WarmTooltipGroup } from '@/components/WarmTooltip'

/**
 * The name of an icon-only button, shown on hover or keyboard focus (and a long press on touch):
 * a WarmTooltip (React Bits, components/WarmTooltip.jsx), ink on paper inverted. Inside a
 * `TipGroup` the first tip waits a moment and the next ones follow the pointer at once, the
 * bubble gliding from button to button.
 */
export function Tip({ content, side = 'bottom', children }: { content: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactElement }) {
  return (
    <WarmTooltip content={content} side={side} size="sm" radius={8} gap={6} surfaceColor="hsl(var(--foreground))" inkColor="hsl(var(--background))">
      {children}
    </WarmTooltip>
  )
}

/** Tips that share one bubble: a toolbar's buttons. */
export function TipGroup({ children }: { children: ReactNode }) {
  return <WarmTooltipGroup delay={450}>{children}</WarmTooltipGroup>
}
