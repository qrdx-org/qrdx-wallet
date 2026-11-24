'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { QrdxMark } from '@/components/QrdxMark'
import { InstallHint } from '@/src/pwa/install'
import { PrimaryButton } from '../flow/FlowKit'

const HEADLINE = ['Self-custody,', 'quantum-safe.']

const FACTS = [
  ['Quantum-safe', 'ML-DSA-65 keys alongside classic ones'],
  ['Every network', 'QRDX, Ethereum and EVM, Bitcoin, Solana'],
  ['Yours alone', 'Keys never leave this device'],
] as const

const EASE = [0.16, 1, 0.3, 1] as const

// The headline rises word by word, the facts follow with their rules drawing across, then the
// buttons: one cascade, timed by `custom` (its place in the order).
const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  shown: (i: number) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE, delay: 0.12 + i * 0.07 } }),
}
const draw: Variants = {
  hidden: { scaleX: 0 },
  shown: (i: number) => ({ scaleX: 1, transition: { duration: 1.1, ease: EASE, delay: 0.12 + i * 0.07 } }),
}

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
      <motion.div variants={rise} custom={0} className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-foreground text-background">
          <QrdxMark className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">QRDX Wallet</span>
      </motion.div>

      <div className="min-h-16 flex-1" />

      <h1 className="text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em]">
        {HEADLINE.map((line, l) => (
          <span key={line} className="block">
            {words
              .filter((x) => x.l === l)
              .map((x) => (
                <motion.span key={x.key} variants={rise} custom={1 + words.indexOf(x)} className="mr-[0.22em] inline-block last:mr-0">
                  {x.w}
                </motion.span>
              ))}
          </span>
        ))}
      </h1>

      <ul className="mb-7 mt-7 sm:pr-20">
        {FACTS.map(([title, desc], i) => (
          <li key={title} className="relative py-3">
            <motion.span variants={draw} custom={after + i} className="absolute inset-x-0 top-0 h-px origin-left bg-foreground/15" />
            <motion.div variants={rise} custom={after + i} className="flex items-baseline gap-3">
              <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
              <span className="w-28 shrink-0 text-sm font-medium">{title}</span>
              <span className="text-xs leading-snug text-muted-foreground">{desc}</span>
            </motion.div>
          </li>
        ))}
      </ul>

      <motion.div variants={rise} custom={after + FACTS.length} className="space-y-2.5">
        <PrimaryButton onClick={onCreate}>
          Create a new wallet <ArrowRight className="ml-auto h-4 w-4" />
        </PrimaryButton>
        <PrimaryButton variant="outline" onClick={onImport}>
          I already have a wallet <ArrowRight className="ml-auto h-4 w-4 opacity-60" />
        </PrimaryButton>
      </motion.div>

      {install && (
        <motion.div variants={rise} custom={after + FACTS.length + 1} className="mt-5">
          <InstallHint compact />
        </motion.div>
      )}
    </motion.div>
  )
}
