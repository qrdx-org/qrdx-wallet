'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from 'next-themes'
import SpecularButton from '@/components/SpecularButton'
import { SoapBubbleButton } from '@/components/soap-bubble'
import { useBubble } from '@/components/gfx/Bubble'
import { cn } from '@/lib/utils'

/**
 * SpecularButton's settings (React Bits, components/SpecularButton.jsx): on black, as configured;
 * on white, the same glass mirrored, ink lines and ink text, so it reads on paper.
 */
const SPECULAR = {
  dark: { tint: '#ffffff', tintOpacity: 0.04, textColor: '#f5f5f5', lineColor: '#ffffff', baseColor: '#525252' },
  light: { tint: '#000000', tintOpacity: 0.06, textColor: '#0a0a0a', lineColor: '#0a0a0a', baseColor: '#a3a3a3' },
} as const

/**
 * The wallet's main action button (each screen's one call to act: continue, confirm, send, pay).
 * In the normal look it is a SpecularButton, a glass button whose rim catches a light that
 * follows the pointer; in the liquid bubble look (components/gfx/Bubble.tsx), a soap bubble.
 */
export function CtaButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className,
  style,
  size = 'md',
  title,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  /** Width and height (e.g. "w-full h-12"); the look is the component's. */
  className?: string
  style?: CSSProperties
  size?: 'sm' | 'md' | 'lg'
  title?: string
  'aria-label'?: string
}) {
  const { resolvedTheme } = useTheme()
  const bubble = useBubble()
  if (bubble.on)
    return (
      <SoapBubbleButton type={type} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} className={cn('!flex items-center justify-center gap-2 font-semibold', className)} style={style}>
        {children}
      </SoapBubbleButton>
    )
  const look = SPECULAR[resolvedTheme === 'light' ? 'light' : 'dark']
  return (
    <SpecularButton
      size={size}
      radius={18}
      {...look}
      intensity={1}
      idleIntensity={0.35}
      shineSize={10}
      shineFade={34}
      thickness={1.2}
      glow={1}
      followMouse
      proximity={250}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn('cta-button font-semibold', className)}
      style={style}
    >
      {children}
    </SpecularButton>
  )
}
