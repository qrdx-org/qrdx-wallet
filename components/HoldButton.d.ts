// Types for React Bits' HoldButton (HoldButton.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface HoldButtonProps {
  children?: ReactNode
  doneLabel?: ReactNode
  icon?: ReactNode
  doneIcon?: ReactNode
  backgroundColor?: string
  fillColor?: string
  textColor?: string
  fillTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  fillDirection?: 'right' | 'up'
  /** How long the press must last, in ms. */
  holdTime?: number
  releaseTime?: number
  pressScale?: number
  wave?: boolean
  waveAmplitude?: number
  glow?: boolean
  /** Back to idle this long after completing (ms); 0 stays done. */
  resetAfter?: number
  disabled?: boolean
  /** The hold completed. */
  onHold?: () => void
  /** A short press, released before it could count as a hold. */
  onTap?: () => void
  className?: string
}

export default function HoldButton(props: HoldButtonProps): JSX.Element
