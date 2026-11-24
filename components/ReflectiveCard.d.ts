// Types for React Bits' ReflectiveCard (ReflectiveCard.jsx, installed as delivered).
import type { CSSProperties, JSX, ReactNode } from 'react'

export interface ReflectiveCardProps {
  name?: string
  role?: string
  badge?: string
  status?: string
  statusColor?: string
  idLabel?: string
  idValue?: string
  children?: ReactNode
  theme?: 'dark' | 'light'
  videoSrc?: string
  /** Off unless set: the card never asks for the camera by itself. */
  webcam?: boolean
  onWebcamError?: (error: unknown) => void
  tint?: string
  metalness?: number
  roughness?: number
  blurStrength?: number
  grayscale?: number
  warp?: number
  warpScale?: number
  shine?: number
  bevel?: number
  glare?: number
  enableTilt?: boolean
  tiltStrength?: number
  intro?: boolean
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
  style?: CSSProperties
}

declare const ReflectiveCard: (props: ReflectiveCardProps) => JSX.Element
export default ReflectiveCard
