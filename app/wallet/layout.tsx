'use client'

import { Loading } from '@/components/motion/Loading'
import { ThemeProvider } from '@/components/theme-provider'
import { WalletProvider } from '@/src/shared/contexts/WalletContext'
import { PWAProvider } from '@/src/pwa/PWAProvider'
import { useHydrated } from '@/lib/use-hydrated'
import { Backdrop } from '@/components/gfx/Backdrop'
import { QrdxMark } from '@/components/QrdxMark'
import { BubbleProvider } from '@/components/gfx/Bubble'


export default function WalletLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Wallet storage and the platform probe exist only in the browser.
  const mounted = useHydrated()

  if (!mounted) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-screen">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <QrdxMark className="h-10 w-10 text-foreground" />
          <Loading label="Opening QRDX Wallet" />
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
        <WalletProvider>
          <BubbleProvider>
          <Backdrop />
          {/* Transparent: every screen is glass over the backdrop. */}
          <div className="relative mx-auto w-full max-w-md min-h-screen">
            {children}
          </div>
          </BubbleProvider>
        </WalletProvider>
      </ThemeProvider>
    </PWAProvider>
  )
}
