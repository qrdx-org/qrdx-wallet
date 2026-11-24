// Types for React Bits' RubberSegment (RubberSegment.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface RubberSegmentItem<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export interface RubberSegmentProps<T extends string = string> {
  items: (T | RubberSegmentItem<T>)[]
  value?: T
  defaultValue?: T
  onChange?: (value: T, index: number) => void
  trackColor?: string
  thumbColor?: string
  textColor?: string
  activeTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  inset?: number
  /** Every segment as wide as the widest. */
  equalSlots?: boolean
  stretch?: number
  squash?: number
  speed?: number
  glide?: number
  draggable?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export default function RubberSegment<T extends string = string>(props: RubberSegmentProps<T>): JSX.Element
