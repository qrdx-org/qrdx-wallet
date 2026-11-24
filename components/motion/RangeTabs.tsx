'use client'

import { useBubble } from '@/components/gfx/Bubble'
import { SoapBubbleSurface } from '@/components/soap-bubble'
import { cn } from '@/lib/utils'
import { Segment } from './Segment'

/** A chart's ranges (1D, 1W, …): a rubber thumb (components/motion/Segment.tsx) that stretches to the chosen one. */
export function RangeTabs<T extends string>({ value, options, onChange, className }: { value: T; options: readonly T[]; onChange: (v: T) => void; className?: string }) {
  const bubble = useBubble()
  const tabs = <Segment label="Chart range" size="sm" quiet fill={false} value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} className="wallet-ranges" />
  // In the liquid bubble look the ranges sit in a bubble of their own.
  if (bubble.on)
    return (
      <div className={cn('flex justify-center', className)}>
        <SoapBubbleSurface radius={12} className="p-1">
          {tabs}
        </SoapBubbleSurface>
      </div>
    )
  return <div className={cn('flex justify-center', className)}>{tabs}</div>
}
