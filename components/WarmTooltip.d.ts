// Types for React Bits' WarmTooltip (WarmTooltip.jsx, installed as delivered).
import type { JSX, ReactElement, ReactNode, RefAttributes } from 'react'

export interface WarmTooltipProps {
  content: ReactNode
  shortcut?: ReactNode
  /** One element, which receives the tooltip's aria-describedby. */
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  warmWindow?: number
  surfaceColor?: string
  inkColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  gap?: number
  arrow?: boolean
  popDuration?: number
  popScale?: number
  popBlur?: number
  showFuse?: boolean
  /** Touch: how long a press takes to show the tooltip (ms). */
  longPress?: number
  disabled?: boolean
  className?: string
}

export interface WarmTooltipGroupProps {
  delay?: number
  warmWindow?: number
  travel?: number
  lean?: number
  onWarmChange?: (warm: boolean) => void
  children?: ReactNode
}

export const WarmTooltipGroup: (props: WarmTooltipGroupProps & RefAttributes<unknown>) => JSX.Element
export default function WarmTooltip(props: WarmTooltipProps): JSX.Element
