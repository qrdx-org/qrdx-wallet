// Types for React Bits' SpringCheck (SpringCheck.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface SpringCheckProps {
  label?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  color?: string
  fillColor?: string
  checkColor?: string
  boxSize?: number
  boxRadius?: number
  fontSize?: number
  bounce?: number
  strikeLag?: number
  /** The label's opacity once checked. */
  doneOpacity?: number
  strike?: 'left' | 'right' | 'center' | 'none'
  ariaLabel?: string
  className?: string
}

export default function SpringCheck(props: SpringCheckProps): JSX.Element
