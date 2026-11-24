// Types for React Bits' JellyRadio (JellyRadio.jsx, installed as delivered).
import type { JSX, ReactNode } from 'react'

export interface JellyRadioItem<T extends string = string> {
  value: T
  label: ReactNode
}

export interface JellyRadioProps<T extends string = string> {
  items?: (T | JellyRadioItem<T>)[]
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  chipColor?: string
  activeColor?: string
  textColor?: string
  activeTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  gap?: number
  radius?: number
  swell?: number
  barge?: number
  shrink?: number
  jelly?: number
  bounce?: number
  stagger?: number
  stiffness?: number
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export default function JellyRadio<T extends string = string>(props: JellyRadioProps<T>): JSX.Element
