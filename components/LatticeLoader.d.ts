// Types for React Bits' LatticeLoader (LatticeLoader.jsx, installed as delivered).
import type { CSSProperties, JSX } from 'react'

export interface LatticeLoaderProps {
  label?: string
  doneLabel?: string
  errorLabel?: string
  status?: 'working' | 'done' | 'error'
  pattern?: 'arrow' | 'dots' | 'ripple' | 'spiral' | 'orbit' | 'snake' | 'sweep' | 'spin' | 'rain' | 'pulse' | { cells: (number | null)[]; loop?: number; scale?: number; lit?: number }
  grid?: 3 | 4
  shape?: 'round' | 'square'
  color?: string
  doneColor?: string
  errorColor?: string
  cellSize?: number
  gap?: number
  fontSize?: number
  step?: number
  idleOpacity?: number
  glow?: boolean
  glowColor?: string
  showTimer?: boolean
  elapsed?: number
  className?: string
  style?: CSSProperties
}

export default function LatticeLoader(props: LatticeLoaderProps): JSX.Element
