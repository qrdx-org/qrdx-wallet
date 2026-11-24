'use client'

import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Wordmark } from '@/components/QrdxMark'
import { DRAW, RISE } from '@/components/motion/cascade'
import { InstallHint } from '@/src/pwa/install'
import { PrimaryButton } from '../flow/FlowKit'

const HEADLINE = ['Self-custody,', 'quantum-safe.']

const FACTS = [
  ['Quantum-safe', 'ML-DSA-65 keys alongside classic ones'],
  ['Every network', 'QRDX, Ethereum and EVM, Bitcoin, Solana'],
  ['Yours alone', 'Keys never leave this device'],
] as const

/**
 * The first screen: the wallet's name at the top, clear of the backdrop's orb (top right on a
 * phone, beside the column on a wide window, where the text stops short of it); what it is,
 * large, at the bottom where the thumb is, with the two ways in.
 */
export function Welcome({ onCreate, onImport, install }: { onCreate: () => void; onImport: () => void; install: boolean }) {
  const reduce = useReducedMotion()
  const words = HEADLINE.flatMap((line, l) => line.split(' ').map((w, i) => ({ w, l, key: `${l}-${i}` })))
  const after = words.length
  return (
    <motion.div className="flex flex-1 flex-col" initial={reduce ? false : 'hidden'} animate="shown">
      <motion.div variants={RISE} custom={0}>
        <Wordmark />
      </motion.div>

      <div className="min-h-16 flex-1" />

      <h1 className="text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em]">
        {/* Real spaces between the words and lines, so the headline reads as one sentence. */}
        {HEADLINE.map((line, l) => (
          <Fragment key={line}>
            {l > 0 && ' '}
            <span className="block">
              {words
                .filter((x) => x.l === l)
                .map((x, i) => (
                  <Fragment key={x.key}>
                    {i > 0 && ' '}
                    <motion.span variants={RISE} custom={1 + words.indexOf(x)} className="inline-block">
                      {x.w}
                    </motion.span>
                  </Fragment>
                ))}
            </span>
          </Fragment>
        ))}
      </h1>

      <ul className="mb-7 mt-7 sm:pr-20">
        {FACTS.map(([title, desc], i) => (
          <li key={title} className="relative py-3">
            <motion.span variants={DRAW} custom={after + i} className="absolute inset-x-0 top-0 h-px origin-left bg-foreground/15" />
            <motion.div variants={RISE} custom={after + i} className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
              <span className="w-28 shrink-0 text-sm font-medium">{title}</span>
              <span className="text-xs leading-snug text-muted-foreground">{desc}</span>
            </motion.div>
          </li>
        ))}
      </ul>

      <motion.div variants={RISE} custom={after + FACTS.length} className="space-y-2.5">
        <PrimaryButton onClick={onCreate}>
          Create a new wallet <ArrowRight className="ml-auto h-4 w-4" />
        </PrimaryButton>
        <PrimaryButton variant="outline" onClick={onImport}>
          I already have a wallet <ArrowRight className="ml-auto h-4 w-4 opacity-60" />
        </PrimaryButton>
      </motion.div>

      {install && (
        <motion.div variants={RISE} custom={after + FACTS.length + 1} className="mt-5">
          <InstallHint compact />
        </motion.div>
      )}
    </motion.div>
  )
}
