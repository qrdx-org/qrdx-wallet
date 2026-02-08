import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ClientLayout } from '@/components/ClientLayout'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QRDX Wallet - Quantum Resistant Digital Assets Wallet',
  description: 'Secure your crypto with post-quantum cryptography. Multi-platform wallet for QRDX and other quantum-resistant blockchains.',
  keywords: ['quantum resistant', 'crypto wallet', 'QRDX', 'blockchain', 'post-quantum cryptography', 'digital assets'],
  authors: [{ name: 'QRDX Foundation' }],
  creator: 'QRDX Foundation',
  publisher: 'QRDX Foundation',
  icons: {
    icon: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} w-[375px] h-[600px] overflow-hidden`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
