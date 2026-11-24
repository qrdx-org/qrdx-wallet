// Types for React Bits' StatusMark (StatusMark.jsx, installed as delivered).
import type { JSX, CSSProperties, ReactNode } from 'react'

export type StatusMarkStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

export interface StatusMarkProps {
  status?: StatusMarkStatus
  /** 0 to 1 while running; without it the ring spins. */
  progress?: number
  label?: ReactNode
  color?: string
  doneColor?: string
  errorColor?: string
  size?: number
  strokeWidth?: number
  dashes?: number
  fontSize?: number
  spinDuration?: number
  arcLength?: number
  drawDuration?: number
  fillOpacity?: number
  strike?: boolean
  strikeDelay?: number
  className?: string
  style?: CSSProperties
}

export default function StatusMark(props: StatusMarkProps): JSX.Element
