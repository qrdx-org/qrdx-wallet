'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export const THEME_OPTIONS = [
  { value: 'dark', label: 'QRDX Purple', description: 'Dark purple accent theme' },
  { value: 'light', label: 'QRDX Light', description: 'Light purple accent theme' },
  { value: 'mono-light', label: 'Monochrome Light', description: 'Clean light slate theme' },
  { value: 'mono-dark', label: 'Monochrome Dark', description: 'Minimal dark slate theme' },
] as const

export type ThemeValue = (typeof THEME_OPTIONS)[number]['value']

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      {...props}
      themes={['light', 'dark', 'mono-light', 'mono-dark']}
    >
      {children}
    </NextThemesProvider>
  )
}
