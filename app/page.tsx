'use client'

import { LandingPage } from '@/src/web/LandingPage'
import { ThemeProvider } from '@/components/theme-provider'

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <LandingPage />
    </ThemeProvider>
  )
}
