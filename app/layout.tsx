import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QRDX Wallet - Quantum Resistant Digital Assets Wallet',
  description: 'Secure your crypto with post-quantum cryptography. Multi-platform wallet for QRDX and other quantum-resistant blockchains.',
  keywords: ['quantum resistant', 'crypto wallet', 'QRDX', 'blockchain', 'post-quantum cryptography', 'digital assets'],
  authors: [{ name: 'QRDX Foundation' }],
  creator: 'QRDX Foundation',
  publisher: 'QRDX Foundation',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QRDX Wallet',
  },
}

// viewport-fit=cover lets the installed iPhone app draw under the notch and home
// indicator; layouts pad with the safe-area insets (.pt-safe / .pb-safe).
// Zoom stays enabled for accessibility — inputs use 16px text on touch devices
// so iOS does not auto-zoom when they are focused.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#030711' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
