import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import type { WalletState, StoredWallet } from '../../core/types'
import { WalletManager } from '../../core/wallet-manager'
import { WalletStorage, type IStorage } from '../../core/storage'
import { type ChainConfig, DEFAULT_CHAIN, CHAIN_LIST, getChain, supportsWeb3 } from '../../core/chains'
import { getEvmProvider, type TokenBalance } from '../../core/ethereum'

// ─── Public context type ────────────────────────────────────────────────────
export interface WalletContextType {
  state: WalletState | null
  currentWallet: StoredWallet | null
  loading: boolean
  error: string | null
  initialized: boolean
  locked: boolean
  unlock: (password: string) => Promise<boolean>
  lock: () => Promise<void>
  initialize: (password: string) => Promise<void>
  createWallet: (name: string, password: string) => Promise<void>
  importWallet: (name: string, privateKey: string, password: string) => Promise<void>
  // ── Chain-aware EVM operations ─────────────────────────────────────────
  /** Currently selected chain */
  activeChain: ChainConfig
  /** Switch the active chain */
  setActiveChain: (chainId: string) => void
  /** All chains available */
  chains: ChainConfig[]
  /** Fetch native + ERC-20 balances for current wallet on active chain */
  fetchBalances: () => Promise<TokenBalance[]>
  /** Balances cache for the active chain */
  balances: TokenBalance[]
  /** Whether balances are currently loading */
  balancesLoading: boolean
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider')
  }
  return context
}

// ─── Provider props ─────────────────────────────────────────────────────────
interface WalletProviderProps {
  children: ReactNode
  /**
   * Platform-specific storage backend.
   * Extension/web: pass `new ExtensionStorage()`
   * Mobile: pass `new MobileStorage(secureStore)`
   */
  storage: IStorage
}

export function WalletProvider({ children, storage }: WalletProviderProps) {
  // Create WalletManager once and keep it stable across renders
  const managerRef = useRef<WalletManager | null>(null)
  if (!managerRef.current) {
    managerRef.current = new WalletManager(new WalletStorage(storage))
  }
  const manager = managerRef.current

  const [state, setState] = useState<WalletState | null>(null)
  const [currentWallet, setCurrentWallet] = useState<StoredWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChain, setActiveChainState] = useState<ChainConfig>(DEFAULT_CHAIN)
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [balancesLoading, setBalancesLoading] = useState(false)

  // Derived convenience flags
  const initialized = state?.initialized ?? false
  const locked = state?.locked ?? true

  // ── Refresh helpers ─────────────────────────────────────────────────────
  const refresh = async () => {
    const s = await manager.getState()
    setState(s)
    if (s && !s.locked) {
      const ws = new WalletStorage(storage)
      setCurrentWallet(await ws.getCurrentWallet())
    } else {
      setCurrentWallet(null)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load wallet')
      } finally {
        setLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────────
  const initialize = async (password: string) => {
    try {
      setError(null)
      await manager.initialize(password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize')
      throw err
    }
  }

  const unlock = async (password: string): Promise<boolean> => {
    try {
      setError(null)
      const ok = await manager.unlock(password)
      if (ok) await refresh()
      return ok
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock')
      return false
    }
  }

  const lock = async () => {
    try {
      setError(null)
      await manager.lock()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock')
    }
  }

  const createWallet = async (name: string, password: string) => {
    try {
      setError(null)
      await manager.createWallet(name, password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
      throw err
    }
  }

  const importWallet = async (name: string, privateKey: string, password: string) => {
    try {
      setError(null)
      await manager.importWallet(name, privateKey, password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet')
      throw err
    }
  }

  // ── Chain / EVM ─────────────────────────────────────────────────────────

  const setActiveChain = (chainId: string) => {
    const chain = getChain(chainId)
    if (chain) {
      setActiveChainState(chain)
      setBalances([]) // clear stale balances
    }
  }

  const fetchBalances = async (): Promise<TokenBalance[]> => {
    if (!currentWallet) return []
    if (!supportsWeb3(activeChain)) return []

    setBalancesLoading(true)
    try {
      const provider = getEvmProvider(activeChain.id)
      const result = await provider.getAllBalances(currentWallet.ethAddress)
      setBalances(result)
      return result
    } catch (err) {
      console.warn('Failed to fetch balances:', err)
      return []
    } finally {
      setBalancesLoading(false)
    }
  }

  // Auto-fetch balances when wallet or chain changes
  useEffect(() => {
    if (currentWallet && !locked && supportsWeb3(activeChain)) {
      fetchBalances()
    }
  }, [currentWallet?.id, activeChain.id, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: WalletContextType = {
    state,
    currentWallet,
    loading,
    error,
    initialized,
    locked,
    unlock,
    lock,
    initialize,
    createWallet,
    importWallet,
    activeChain,
    setActiveChain,
    chains: CHAIN_LIST,
    fetchBalances,
    balances,
    balancesLoading,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
