import React from 'react'
import { createRoot } from 'react-dom/client'
import { WalletHome } from '../../components/WalletHome'
import { ThemeProvider } from '../../components/theme-provider'
import { WalletProvider } from '../shared/contexts/WalletContext'
import { ExtensionStorage } from '../core/storage'
import '../../app/globals.css'

const storage = new ExtensionStorage()
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <WalletProvider storage={storage}>
          <div className="w-full h-full overflow-y-auto">
            <WalletHome />
          </div>
        </WalletProvider>
      </ThemeProvider>
    </React.StrictMode>
  )
}
