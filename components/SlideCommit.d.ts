// Types for React Bits' SlideCommit (SlideCommit.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface SlideCommitProps {
  label?: ReactNode
  doneLabel?: ReactNode
  errorLabel?: ReactNode
  /** Runs when the handle reaches the end; a promise keeps it pending until it settles. */
  onConfirm?: () => unknown
  onDone?: () => void
  onError?: (reason: unknown) => void
  trackColor?: string
  handleColor?: string
  successColor?: string
  dangerColor?: string
  width?: number
  height?: number
  radius?: number
  speed?: number
  returnBounce?: number
  landingDip?: number
  holdMs?: number
  disabled?: boolean
  icon?: ReactNode
  className?: string
}

export default function SlideCommit(props: SlideCommitProps): JSX.Element
