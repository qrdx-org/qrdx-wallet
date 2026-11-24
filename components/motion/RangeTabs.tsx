'use client'

import { useBubble } from '@/components/gfx/Bubble'
import { SoapBubbleSurface } from '@/components/soap-bubble'
import { useId } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { SPRING } from './ScreenStack'

/** A chart's ranges (1D, 1W, …): the chosen one's pill slides to it. */
export function RangeTabs<T extends string>({ value, options, onChange, className }: { value: T; options: readonly T[]; onChange: (v: T) => void; className?: string }) {
  const id = useId()
  const bubble = useBubble()
  const tabs = (
    <>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn('relative isolate rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors duration-300', value === o ? 'text-background' : 'text-muted-foreground hover:text-foreground')}
        >
          {value === o && <motion.span layoutId={`range-${id}`} transition={SPRING} className="absolute inset-0 -z-10 rounded-md bg-foreground" />}
          {o}
        </button>
      ))}
    </>
  )
  // In the liquid bubble look the ranges sit in a bubble of their own.
  if (bubble.on)
    return (
      <div className={cn('flex justify-center', className)}>
        <SoapBubbleSurface radius={12} className="flex gap-1 p-1">
          {tabs}
        </SoapBubbleSurface>
      </div>
    )
  return <div className={cn('flex justify-center gap-1', className)}>{tabs}</div>
}
