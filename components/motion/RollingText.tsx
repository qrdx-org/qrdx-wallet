'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { SPRING } from './ScreenStack'

/**
 * A figure whose digits roll to their new values, like an odometer: a balance that changes, a
 * price that ticks. Characters are matched from the right, so the units stay put when the figure
 * grows a digit. Needs tabular figures (every digit the same width), which the wallet's numbers use.
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <span className={className}>{text}</span>
  const chars = [...text]
  return (
    <span className={cn('inline-flex tabular-nums', className)}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) => {
        const at = chars.length - i
        return /\d/.test(ch) ? (
          <Digit key={at} value={+ch} />
        ) : (
          <span key={`${at}${ch}`} aria-hidden className="inline-block whitespace-pre">
            {ch}
          </span>
        )
      })}
    </span>
  )
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function Digit({ value }: { value: number }) {
  return (
    <span aria-hidden className="relative inline-block overflow-hidden [mask-image:linear-gradient(transparent,black_18%,black_82%,transparent)]">
      <span className="invisible">0</span>
      <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={false} animate={{ y: `${-value * 10}%` }} transition={SPRING}>
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </motion.span>
    </span>
  )
}
