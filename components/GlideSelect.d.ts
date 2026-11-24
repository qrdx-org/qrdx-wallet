// Types for React Bits' GlideSelect (GlideSelect.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface GlideSelectOption<T extends string = string> {
  value: T
  label: ReactNode
  tag?: ReactNode
}

export interface GlideSelectProps<T extends string = string> {
  options?: (T | GlideSelectOption<T>)[]
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  placeholder?: ReactNode
  showTags?: boolean
  accentColor?: string
  surfaceColor?: string
  highlightColor?: string
  textColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  menuWidth?: number
  placement?: 'bottom' | 'top'
  align?: 'left' | 'right'
  popDuration?: number
  glideDuration?: number
  rememberPosition?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export default function GlideSelect<T extends string = string>(props: GlideSelectProps<T>): JSX.Element
