'use client'

import { useTheme } from 'next-themes'
import { LiquidGlassLogo } from '@/components/liquid-glass-logo'
import { QRDX_MARK_IMAGE } from '@/components/QrdxMark'

/**
 * The QRDX mark arriving through a lens of liquid glass (components/liquid-glass-logo, from
 * ReactDrops), as the About page opens; it settles on the plain mark. In the wallet's colours.
 */
export function AboutLogo() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  return (
    <LiquidGlassLogo
      key={dark ? 'dark' : 'light'}
      aria-label="QRDX"
      height={150}
      logoSize={150}
      logo={QRDX_MARK_IMAGE}
      mark=""
      ending="logo"
      tile
      theme={dark ? 'dark' : 'light'}
      logoColor={dark ? '#fafafa' : '#0a0a0a'}
      tileColor={dark ? '#141414' : '#ececec'}
      // The page behind it, for the light the glass catches; the container itself stays clear.
      background={dark ? '#080808' : '#ffffff'}
      style={{ background: 'transparent', width: 150 }}
    />
  )
}
