// Types for React Bits' PulseHeart (PulseHeart.jsx, installed as delivered).
import type { JSX } from 'react'

export interface PulseHeartProps {
  liked?: boolean
  defaultLiked?: boolean
  count?: number
  onChange?: (liked: boolean) => void
  showCount?: boolean
  icon?: 'heart' | 'star' | 'thumb'
  idleOutline?: boolean
  size?: number
  corner?: number
  likedColor?: string
  idleColor?: string
  pillColor?: string
  textColor?: string
  duration?: number
  dotSize?: number
  overshoot?: number
  beat?: number
  rollDuration?: number
  disabled?: boolean
  label?: string
  className?: string
}

export default function PulseHeart(props: PulseHeartProps): JSX.Element
