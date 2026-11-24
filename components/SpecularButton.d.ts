// Types for React Bits' SpecularButton (SpecularButton.jsx, installed as delivered).
import type { ButtonHTMLAttributes, CSSProperties, JSX, ReactNode } from 'react'

export interface SpecularButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  children?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  tint?: string
  tintOpacity?: number
  blur?: number
  textColor?: string
  lineColor?: string
  baseColor?: string
  intensity?: number
  idleIntensity?: number
  shineSize?: number
  shineFade?: number
  thickness?: number
  glow?: number
  speed?: number
  followMouse?: boolean
  proximity?: number
  autoAnimate?: boolean
  style?: CSSProperties
}

declare const SpecularButton: (props: SpecularButtonProps) => JSX.Element
export default SpecularButton
