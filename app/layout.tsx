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
    icon: '/logo.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'QRDX Wallet',
  },
}

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
