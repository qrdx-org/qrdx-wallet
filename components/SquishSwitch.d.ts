// Types for React Bits' SquishSwitch (SquishSwitch.jsx, installed as delivered).
import type { JSX } from 'react'

export interface SquishSwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  trackColor?: string
  trackOnColor?: string
  thumbColor?: string
  thumbOnColor?: string
  width?: number
  height?: number
  radius?: number
  speed?: number
  stretch?: number
  hoverScale?: number
  colorDuration?: number
  ariaLabel?: string
  className?: string
  id?: string
}

export default function SquishSwitch(props: SquishSwitchProps): JSX.Element
