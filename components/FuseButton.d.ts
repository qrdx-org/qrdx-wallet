// Types for React Bits' FuseButton (FuseButton.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export type FusePhase = 'idle' | 'armed' | 'settled'

export interface FuseButtonProps {
  label?: ReactNode
  undoLabel?: ReactNode
  doneLabel?: ReactNode
  icon?: ReactNode
  color?: string
  background?: string
  fuseColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  /** How long Undo is offered, in ms. */
  undoWindow?: number
  fuse?: 'outline' | 'line'
  fuseThickness?: number
  crossfadeMs?: number
  /** 'press' commits at once (Undo reverses it); 'fuseEnd' commits only when the window runs out. */
  commitOn?: 'press' | 'fuseEnd'
  pauseOnHover?: boolean
  settle?: 'reset' | 'stay'
  disabled?: boolean
  onCommit?: (via: 'press' | 'fuseEnd') => void
  onUndo?: () => void
  onFuseEnd?: () => void
  onPhaseChange?: (phase: FusePhase) => void
  className?: string
  type?: 'button' | 'submit'
}

export default function FuseButton(props: FuseButtonProps): JSX.Element
