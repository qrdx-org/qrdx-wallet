'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion'

/** The wallet's one spring: quick to start, settles without a bounce. */
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }

/**
 * Changes whole screens fluidly. Screens are glass over the backdrop (transparent), so they
 * cannot slide over one another like opaque cards; instead the outgoing screen drifts away and
 * blurs out while the incoming one drifts in and sharpens, in the direction of travel: deeper
 * (a higher `depth`) comes in from the right, back comes in from the left.
 *
 * Every return of a screen-switching component goes through one ScreenStack, so React keeps it
 * mounted and only `id` changes.
 */
export function ScreenStack({ id, depth, children }: { id: string; depth: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  // The direction of the last change, kept from render to render (React's pattern for
  // information from previous renders).
  const [last, setLast] = useState({ id, depth, dir: 1 })
  if (last.id !== id) setLast({ id, depth, dir: depth >= last.depth ? 1 : -1 })
  const dir = last.id === id ? last.dir : depth >= last.depth ? 1 : -1

  return (
    <AnimatePresence initial={false} custom={dir} mode="popLayout">
      <motion.div
        key={id}
        custom={dir}
        variants={reduce ? FADE : DRIFT}
        initial="enter"
        animate="center"
        exit="exit"
        transition={SPRING}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

const DRIFT = {
  enter: (dir: number) => ({ x: dir * 44, opacity: 0, scale: 0.985, filter: 'blur(8px)' }),
  center: { x: 0, opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
  exit: (dir: number) => ({ x: dir * -44, opacity: 0, scale: 0.985, filter: 'blur(8px)' }),
}

const FADE = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}
