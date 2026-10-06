'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

/** The wallet is monochrome: black on white, or white on black. */
export const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', description: 'White on black' },
  { value: 'light', label: 'Light', description: 'Black on white' },
  { value: 'system', label: 'Automatic', description: 'Follows this device' },
] as const

export type ThemeValue = (typeof THEME_OPTIONS)[number]['value']

/** Earlier versions had purple and "mono-*" themes; keep the user's light/dark choice. */
const LEGACY: Record<string, string> = { 'mono-dark': 'dark', 'mono-light': 'light' }
if (typeof window !== 'undefined') {
  try {
    const t = localStorage.getItem('theme')
    if (t && LEGACY[t]) localStorage.setItem('theme', LEGACY[t])
  } catch {
    /* storage unavailable: the default applies */
  }
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider enableSystem {...props} themes={['light', 'dark']}>
      {children}
    </NextThemesProvider>
  )
}
