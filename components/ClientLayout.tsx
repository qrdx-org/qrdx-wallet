'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { WalletProvider } from '@/src/shared/contexts/WalletContext'
import { useHydrated } from '@/lib/use-hydrated'


export function ClientLayout({ children }: { children: React.ReactNode }) {
  // Wallet storage and the platform probe exist only in the browser.
  const mounted = useHydrated()

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
      <WalletProvider>
        <div className="w-full h-full overflow-y-auto">
          {children}
        </div>
      </WalletProvider>
    </ThemeProvider>
  )
}
