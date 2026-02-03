import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { WalletState, StoredWallet } from '@core/types'

interface WalletContextType {
  state: WalletState | null
  currentWallet: StoredWallet | null
  loading: boolean
  error: string | null
  unlock: (password: string) => Promise<boolean>
  lock: () => Promise<void>
  createWallet: (name: string, password: string) => Promise<void>
  importWallet: (name: string, privateKey: string, password: string) => Promise<void>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider')
  }
  return context
}

interface WalletProviderProps {
  children: ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [state, setState] = useState<WalletState | null>(null)
  const [currentWallet, setCurrentWallet] = useState<StoredWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadWalletState()
  }, [])

  const loadWalletState = async () => {
    try {
      // Platform-specific loading will be implemented
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet')
      setLoading(false)
    }
  }

  const unlock = async (password: string): Promise<boolean> => {
    try {
      setError(null)
      // Implementation will vary by platform
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock')
      return false
    }
  }

  const lock = async () => {
    try {
      setError(null)
      // Implementation will vary by platform
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock')
    }
  }

  const createWallet = async (name: string, password: string) => {
    try {
      setError(null)
      // Implementation will vary by platform
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
      throw err
    }
  }

  const importWallet = async (name: string, privateKey: string, password: string) => {
    try {
      setError(null)
      // Implementation will vary by platform
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet')
      throw err
    }
  }

  const value: WalletContextType = {
    state,
    currentWallet,
    loading,
    error,
    unlock,
    lock,
    createWallet,
    importWallet
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
