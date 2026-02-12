'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { WalletProvider } from '@/src/shared/contexts/WalletContext'
import { ExtensionStorage } from '@/src/core/storage'
import { PWAProvider } from '@/src/pwa/PWAProvider'
import { useEffect, useState } from 'react'

const extensionStorage = new ExtensionStorage()

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 animate-pulse-ring" />
          </div>
          <div className="text-sm font-medium text-muted-foreground">Loading QRDX Wallet...</div>
        </div>
      </div>
    )
  }

  return (
    <PWAProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
      >
        <WalletProvider storage={extensionStorage}>
          <div className="mx-auto w-full max-w-md min-h-screen bg-background">
            {children}
          </div>
        </WalletProvider>
      </ThemeProvider>
    </PWAProvider>
  )
}
