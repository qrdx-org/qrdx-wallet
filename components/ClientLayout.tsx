'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { WalletProvider } from '@/src/shared/contexts/WalletContext'
import { ExtensionStorage } from '@/src/core/storage'
import { useEffect, useRef, useState } from 'react'

// Single shared storage instance for the web / extension context
const extensionStorage = new ExtensionStorage()

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
    >
      <WalletProvider storage={extensionStorage}>
        <div className="w-full h-full overflow-y-auto">
          {children}
        </div>
      </WalletProvider>
    </ThemeProvider>
  )
}
