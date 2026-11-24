import type { Variants } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * The first screens' entrance: a parent goes from "hidden" to "shown", and each child rises out
 * of a blur, or (DRAW) draws across, in turn. `custom` is the child's place in the order.
 */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  shown: (i: number) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE, delay: 0.12 + i * 0.07 } }),
}

export const DRAW: Variants = {
  hidden: { scaleX: 0 },
  shown: (i: number) => ({ scaleX: 1, transition: { duration: 1.1, ease: EASE, delay: 0.12 + i * 0.07 } }),
}
