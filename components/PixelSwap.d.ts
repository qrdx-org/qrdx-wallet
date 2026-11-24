// Types for React Bits' PixelSwap (PixelSwap.jsx, installed as delivered).
import type { JSX, CSSProperties, ReactNode } from 'react'

export interface PixelSwapProps {
  firstContent: ReactNode
  secondContent: ReactNode
  pattern?:
    | 'pointer'
    | 'random'
    | 'center'
    | 'edges'
    | 'left-to-right'
    | 'right-to-left'
    | 'top-to-bottom'
    | 'bottom-to-top'
    | 'diagonal'
    | 'spiral'
  pixelSize?: number
  gap?: number
  pixelRadius?: number
  pixelScale?: number
  pixelSpin?: number
  duration?: number
  pixelDuration?: number
  randomness?: number
  bounce?: number
  /** 'hover' or 'click'; anything else leaves it to `active`. */
  trigger?: 'hover' | 'click' | 'none'
  intro?: boolean
  initialActive?: boolean
  /** Showing the second content. */
  active?: boolean
  onActiveChange?: (active: boolean) => void
  onComplete?: (active: boolean) => void
  aspectRatio?: string
  className?: string
  style?: CSSProperties
}

export default function PixelSwap(props: PixelSwapProps): JSX.Element
