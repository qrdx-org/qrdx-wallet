// Types for React Bits' DecryptedText (DecryptedText.jsx, installed as delivered).
import type { JSX, HTMLAttributes } from 'react'

export interface DecryptedTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  text: string
  speed?: number
  maxIterations?: number
  sequential?: boolean
  revealDirection?: 'start' | 'end' | 'center' | 'random'
  useOriginalCharsOnly?: boolean
  characters?: string
  className?: string
  parentClassName?: string
  encryptedClassName?: string
  animateOn?: 'hover' | 'view' | 'click' | 'inViewHover'
  clickMode?: 'once' | 'toggle'
  effect?: 'scramble' | 'fade' | 'flip'
  scrambleColor?: string
  loop?: boolean
  loopDelay?: number
  hoverRadius?: number
}

export default function DecryptedText(props: DecryptedTextProps): JSX.Element
