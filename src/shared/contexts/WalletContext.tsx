import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import type { WalletState, StoredWallet } from '../../core/types'
import { WalletManager } from '../../core/wallet-manager'
import { WalletStorage, type IStorage } from '../../core/storage'
import { type ChainConfig, DEFAULT_CHAIN, CHAIN_LIST, getChain, supportsWeb3 } from '../../core/chains'
import {
  probeChainIdentity,
  clearChainIdentityCache,
  trustChainId,
  setTrustedChainIds,
  ChainIdentityError,
} from '../../core/chain-identity'
import { getEvmProvider, type TokenBalance, type EthTransactionRequest, type EthTransactionReceipt, type GasEstimate } from '../../core/ethereum'
import { fetchPricesBySymbol, computePortfolioValue, fetchPriceHistory, type TokenPrice, type PriceHistoryPoint } from '../../core/prices'
import { fetchAllTransactionHistory, type TransactionHistoryItem } from '../../core/history'
import { type SignedTransaction } from '../../core/transaction'
import { generateMnemonic as generateMnemonicCrypto } from '../../core/crypto'
import {
  AddressBook,
  type AddressBookEntry,
  type AddressBookInput,
} from '../../core/address-book'
import {
  SitePermissions,
  type SitePermission,
  type SiteCapability,
} from '../../core/permissions'

/**
 * Connectivity and identity of the active chain's RPC endpoint.
 *
 * `mismatch` is deliberately distinct from `unreachable`: the endpoint answered,
 * but with a chain ID other than the one this network is configured for. The
 * wallet will refuse to sign in that state, so the UI must be able to say why
 * and offer the explicit trust decision rather than showing a generic error.
 */
export type NetworkStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'connected'; chainId: number; rpcUrl: string }
  | {
      state: 'mismatch'
      liveChainId: number
      configuredChainId: number
      rpcUrl: string
    }
  | { state: 'unreachable'; message: string }

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
  /** Create a wallet from a BIP-39 mnemonic phrase (returns the mnemonic) */
  createWalletFromMnemonic: (name: string, mnemonic: string, password: string) => Promise<void>
  importWallet: (name: string, privateKey: string, password: string) => Promise<void>
  /** Import from a JSON keystore file */
  importFromKeystoreJSON: (keystore: any, keystorePassword: string, walletPassword: string, name?: string) => Promise<void>
  // ── Account management ─────────────────────────────────────────────────
  /** All stored wallets */
  allWallets: StoredWallet[]
  /** Switch to a different wallet by ID */
  switchWallet: (walletId: string) => Promise<void>
  /** Remove a wallet by ID (requires password confirmation) */
  removeWallet: (walletId: string, password: string) => Promise<void>
  /** Decrypt and return the private key for the current wallet (requires password) */
  exportPrivateKey: (password: string) => Promise<{ ethPrivateKey: string; pqSeed: string }>
  /** Export the BIP-39 mnemonic (if wallet was created with one) */
  exportMnemonic: (password: string) => Promise<string | null>
  /** Export the current wallet as a JSON keystore */
  exportKeystoreJSON: (password: string) => Promise<any>
  /** Change the wallet password (re-encrypts all wallet keys) */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  /** Erase all wallet data and reset to initial state */
  resetWallet: () => Promise<void>
  /** Update wallet settings (auto-lock, currency, language) */
  updateSettings: (settings: Partial<import('../../core/types').WalletSettings>) => Promise<void>
  /** Generate a fresh mnemonic phrase (does not persist anything) */
  generateMnemonic: () => string
  // ── Chain-aware EVM operations ─────────────────────────────────────────
  /** Currently selected chain */
  activeChain: ChainConfig
  /** Switch the active chain (persisted across restarts) */
  setActiveChain: (chainId: string) => void
  /** All chains available */
  chains: ChainConfig[]
  /** Live connectivity / chain-id status of the active chain */
  networkStatus: NetworkStatus
  /** Re-probe the active chain's endpoint */
  refreshNetworkStatus: () => Promise<void>
  /**
   * Accept the chain ID the active network's node actually reports, even though
   * it differs from the registry, and persist that decision. Only call from an
   * explicit user confirmation — it re-enables signing on a network whose
   * identity did not verify.
   */
  trustActiveChainId: () => Promise<void>
  /** Whether testnets are shown in network pickers */
  showTestnets: boolean
  /** Fetch native + ERC-20 balances for current wallet on active chain */
  fetchBalances: () => Promise<TokenBalance[]>
  /** Balances cache for the active chain */
  balances: TokenBalance[]
  /** Whether balances are currently loading */
  balancesLoading: boolean
  /**
   * Native balance held at this account's post-quantum (`0xPQ`) address, in wei.
   *
   * A separate figure from `balances`: the PQ address is a distinct on-chain
   * identity with its own holdings, not a different rendering of the EVM
   * account. `null` means it has not been read yet.
   */
  pqBalance: bigint | null
  /**
   * Native balance across both of the account's identities, in wei.
   *
   * The wallet issues the EVM and post-quantum addresses as a pair, so this is
   * the figure that answers "how much do I have"; the per-identity numbers
   * remain available for the breakdown and for deciding which one can fund a
   * given transfer.
   */
  combinedNativeBalance: bigint
  /** Send native QRDX from the post-quantum address (UTXO layer, ML-DSA signed) */
  sendPqTransaction: (
    to: string,
    amount: string,
    fee?: string,
  ) => Promise<{ txHash: string; from: string; fee: string }>
  // ── Signing & Transactions ─────────────────────────────────────────────
  /** Sign a message with the ETH key (EIP-191 personal_sign) */
  signMessage: (message: string) => Promise<string>
  /** Sign a message with the PQ key */
  signMessagePQ: (message: string) => Promise<string>
  /** Build an unsigned native send transaction */
  buildSend: (to: string, amount: string) => Promise<EthTransactionRequest>
  /** Build an unsigned ERC-20 token transfer */
  buildTokenSend: (tokenAddress: string, to: string, amount: string, decimals: number) => Promise<EthTransactionRequest>
  /** Estimate gas for a native send */
  estimateGas: (to: string, amount: string) => Promise<GasEstimate>
  /** Sign and broadcast a native-currency transfer (real on-chain send) */
  sendTransaction: (to: string, amount: string) => Promise<{ hash: string; signed: SignedTransaction }>
  /** Sign and broadcast an ERC-20 token transfer */
  sendTokenTransaction: (tokenAddress: string, to: string, amount: string, decimals: number) => Promise<{ hash: string; signed: SignedTransaction }>
  // ── Prices ─────────────────────────────────────────────────────────────
  /** Current token prices (keyed by symbol) */
  prices: Map<string, TokenPrice>
  /** Total portfolio value in USD */
  portfolioValue: number
  /** 24h portfolio change percentage */
  portfolioChange24h: number
  /** Price history for chart */
  priceHistory: PriceHistoryPoint[]
  /** Refresh prices */
  refreshPrices: () => Promise<void>
  // ── Transaction history ────────────────────────────────────────────────
  /** Transaction history for active chain */
  transactions: TransactionHistoryItem[]
  /** Whether transactions are loading */
  transactionsLoading: boolean
  /** Refresh transaction history */
  refreshTransactions: () => Promise<void>
  // ── Address book ───────────────────────────────────────────────────────
  /** Saved recipients, favourites first */
  addressBook: AddressBookEntry[]
  /** Add a contact. Rejects invalid or duplicate addresses. */
  addContact: (input: AddressBookInput) => Promise<void>
  /** Update a contact's fields */
  updateContact: (id: string, changes: Partial<AddressBookInput>) => Promise<void>
  /** Delete a contact */
  removeContact: (id: string) => Promise<void>
  /** Toggle a contact's favourite flag */
  toggleContactFavorite: (id: string) => Promise<void>
  // ── Connected sites ────────────────────────────────────────────────────
  /** dApp origins holding permissions, most recently used first */
  connectedSites: SitePermission[]
  /** Remove specific capabilities from a site */
  revokeSiteCapability: (origin: string, capability: SiteCapability) => Promise<void>
  /** Disconnect a site entirely */
  disconnectSite: (origin: string) => Promise<void>
  /** Disconnect every site */
  disconnectAllSites: () => Promise<void>
  /** Re-read connected sites from storage */
  refreshConnectedSites: () => Promise<void>
  /** Access the underlying WalletManager for advanced operations */
  manager: WalletManager
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

  // Both stores are thin wrappers over the same platform storage; keep one
  // instance each so callers never race on separate caches.
  const addressBookRef = useRef<AddressBook | null>(null)
  if (!addressBookRef.current) addressBookRef.current = new AddressBook(storage)
  const addressBookStore = addressBookRef.current

  const sitePermissionsRef = useRef<SitePermissions | null>(null)
  if (!sitePermissionsRef.current) sitePermissionsRef.current = new SitePermissions(storage)
  const sitePermissions = sitePermissionsRef.current

  const [state, setState] = useState<WalletState | null>(null)
  const [currentWallet, setCurrentWallet] = useState<StoredWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChain, setActiveChainState] = useState<ChainConfig>(DEFAULT_CHAIN)
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [pqBalance, setPqBalance] = useState<bigint | null>(null)
  const [prices, setPrices] = useState<Map<string, TokenPrice>>(new Map())
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [portfolioChange24h, setPortfolioChange24h] = useState(0)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([])
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({ state: 'idle' })
  /** Monotonic probe counter; only the newest probe may publish a result. */
  const probeSeqRef = useRef(0)
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([])
  const [connectedSites, setConnectedSites] = useState<SitePermission[]>([])

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

  const createWalletFromMnemonic = async (name: string, mnemonic: string, password: string) => {
    try {
      setError(null)
      await manager.createWalletFromMnemonic(name, mnemonic, password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
      throw err
    }
  }

  const importFromKeystoreJSON = async (keystore: any, keystorePassword: string, walletPassword: string, name?: string) => {
    try {
      setError(null)
      await manager.importFromKeystoreJSON(keystore, keystorePassword, walletPassword, name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import keystore')
      throw err
    }
  }

  // ── Account management ──────────────────────────────────────────────────
  const allWallets = state?.wallets ?? []

  const switchWallet = async (walletId: string) => {
    try {
      setError(null)
      await manager.switchWallet(walletId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch wallet')
      throw err
    }
  }

  const removeWallet = async (walletId: string, password: string) => {
    try {
      setError(null)
      await manager.removeWallet(walletId, password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove wallet')
      throw err
    }
  }

  const exportPrivateKey = async (password: string) => {
    return manager.exportPrivateKey(password)
  }

  const exportMnemonic = async (password: string) => {
    return manager.exportMnemonic(password)
  }

  const exportKeystoreJSONFn = async (password: string) => {
    return manager.exportAsKeystoreJSON(password)
  }

  const generateMnemonicFn = () => {
    return generateMnemonicCrypto(128)
  }

  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      setError(null)
      await manager.changePassword(oldPassword, newPassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
      throw err
    }
  }

  const resetWallet = async () => {
    try {
      setError(null)
      await manager.resetWallet()
      setState(null)
      setCurrentWallet(null)
      setBalances([])
      setTransactions([])
      setPrices(new Map())
      setPortfolioValue(0)
      setPortfolioChange24h(0)
      setPriceHistory([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset wallet')
      throw err
    }
  }

  const updateSettings = async (settings: Partial<import('../../core/types').WalletSettings>) => {
    try {
      setError(null)
      await manager.updateSettings(settings)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
      throw err
    }
  }

  // ── Chain / EVM ─────────────────────────────────────────────────────────

  const setActiveChain = (chainId: string) => {
    const chain = getChain(chainId)
    if (!chain) return

    setActiveChainState(chain)
    // Balances, prices and history are all chain-scoped; showing the previous
    // chain's figures under a new network's name would be actively misleading.
    setBalances([])
    setPqBalance(null)
    setTransactions([])
    setPriceHistory([])
    setPortfolioValue(0)
    setPortfolioChange24h(0)
    setNetworkStatus({ state: 'idle' })

    // Persist, but only once a wallet exists to hold settings.
    if (state?.initialized) {
      manager.updateSettings({ activeChainId: chainId }).catch(err => {
        console.warn('Could not persist network selection:', err)
      })
    }
  }

  /**
   * Restore the persisted network selection and any trusted chain IDs once
   * wallet state loads. Runs on `state?.settings` rather than on mount because
   * settings are not readable until the wallet has been initialised.
   */
  const restoredChainRef = useRef(false)
  useEffect(() => {
    const settings = state?.settings
    if (!settings || restoredChainRef.current) return
    restoredChainRef.current = true

    if (settings.trustedChainIds) {
      setTrustedChainIds(settings.trustedChainIds)
    }
    const saved = settings.activeChainId ? getChain(settings.activeChainId) : undefined
    if (saved) setActiveChainState(saved)
  }, [state?.settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshNetworkStatus = useCallback(async () => {
    // Probes race: the wallet mounts on the default chain, then restores the
    // persisted one, so two probes can be in flight at once. An unreachable
    // endpoint fails only after a DNS or connect timeout, so the *older* probe
    // frequently resolves last and would overwrite a good result — leaving a
    // connected chain showing another chain's failure. Stamp each probe and
    // discard any result that is no longer the current one.
    const seq = ++probeSeqRef.current
    const probedChain = activeChain
    const isStale = () => seq !== probeSeqRef.current

    setNetworkStatus({ state: 'checking' })
    try {
      const identity = await probeChainIdentity(probedChain, true)
      if (isStale()) return

      if (identity.matches || identity.trusted) {
        setNetworkStatus({
          state: 'connected',
          chainId: identity.liveChainId,
          rpcUrl: identity.rpcUrl,
        })
      } else {
        setNetworkStatus({
          state: 'mismatch',
          liveChainId: identity.liveChainId,
          configuredChainId: identity.configuredChainId,
          rpcUrl: identity.rpcUrl,
        })
      }
    } catch (err) {
      if (isStale()) return
      setNetworkStatus({
        state: 'unreachable',
        message:
          err instanceof ChainIdentityError || err instanceof Error
            ? err.message
            : 'Could not reach the network',
      })
    }
  }, [activeChain])

  // Probe whenever the selected chain changes.
  useEffect(() => {
    refreshNetworkStatus()
  }, [activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const trustActiveChainId = async () => {
    if (networkStatus.state !== 'mismatch') return

    trustChainId(activeChain.id, networkStatus.liveChainId)

    const merged = {
      ...(state?.settings.trustedChainIds ?? {}),
      [activeChain.id]: networkStatus.liveChainId,
    }
    try {
      await manager.updateSettings({ trustedChainIds: merged })
      await refresh()
    } catch (err) {
      console.warn('Could not persist trusted chain id:', err)
    }
    await refreshNetworkStatus()
  }

  const fetchBalances = async (): Promise<TokenBalance[]> => {
    if (!currentWallet) return []
    if (!supportsWeb3(activeChain)) return []

    setBalancesLoading(true)
    try {
      const provider = getEvmProvider(activeChain.id)

      // The PQ address holds native QRDX on the UTXO layer; eth_getBalance
      // resolves it and converts to wei. Fetched alongside the EVM balances so
      // the two identities are never shown with one another's figures.
      const [result, pq] = await Promise.all([
        provider.getAllBalances(currentWallet.ethAddress),
        currentWallet.pqAddress
          ? provider.getBalance(currentWallet.pqAddress).catch(() => null)
          : Promise.resolve(null),
      ])

      setBalances(result)
      setPqBalance(pq)
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

  // ── Signing & Transactions ──────────────────────────────────────────────

  const signMessage = async (message: string): Promise<string> => {
    return manager.signMessage(message)
  }

  const signMessagePQ = async (message: string): Promise<string> => {
    return manager.signMessagePQ(message)
  }

  const buildSend = async (to: string, amount: string): Promise<EthTransactionRequest> => {
    return manager.buildSend(activeChain.id, to, amount)
  }

  const buildTokenSend = async (
    tokenAddress: string,
    to: string,
    amount: string,
    decimals: number
  ): Promise<EthTransactionRequest> => {
    return manager.buildTokenSend(activeChain.id, tokenAddress, to, amount, decimals)
  }

  const estimateGas = async (to: string, amount: string) => {
    return manager.estimateSendGas(activeChain.id, to, amount)
  }

  // ── Real send (sign + broadcast) ────────────────────────────────────────

  const sendTransaction = async (to: string, amount: string) => {
    try {
      setError(null)
      const result = await manager.signAndSendTransaction(activeChain.id, to, amount)
      // Refresh balances and tx history after send
      fetchBalances()
      refreshTransactions()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setError(msg)
      throw err
    }
  }

  const sendTokenTransaction = async (tokenAddress: string, to: string, amount: string, decimals: number) => {
    try {
      setError(null)
      const result = await manager.signAndSendTokenTransaction(activeChain.id, tokenAddress, to, amount, decimals)
      fetchBalances()
      refreshTransactions()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Token transfer failed'
      setError(msg)
      throw err
    }
  }

  /**
   * Native holdings across both identities.
   *
   * Both figures are wei-denominated: `eth_getBalance` scales the node's
   * microQRDX UTXO amounts up to wei, so the PQ balance arrives in the same
   * units as the EVM one and they can be added directly.
   */
  const evmNativeWei = (() => {
    const native = balances.find(b => b.address === '')
    if (!native) return 0n
    return native.rawBalance
  })()

  const combinedNativeBalance = evmNativeWei + (pqBalance ?? 0n)

  const sendPqTransaction = async (to: string, amount: string, fee = '0') => {
    try {
      setError(null)
      const result = await manager.sendNativePqTransaction(activeChain.id, to, amount, fee)
      // The PQ balance lives outside `balances`, so refresh both.
      fetchBalances()
      refreshTransactions()
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Post-quantum transfer failed'
      setError(message)
      throw err
    }
  }

  // ── Price oracle ────────────────────────────────────────────────────────

  const refreshPrices = useCallback(async () => {
    if (balances.length === 0) return

    const symbols = balances.map(b => b.symbol)
    const priceMap = await fetchPricesBySymbol(symbols)
    setPrices(priceMap)

    // Compute portfolio value
    const { totalUsd, change24hPercent } = computePortfolioValue(balances, priceMap)
    setPortfolioValue(totalUsd)
    setPortfolioChange24h(change24hPercent)

    // Fetch price history for the native token (for chart)
    const nativeSymbol = activeChain.nativeCurrency?.symbol ?? 'ETH'
    const nativeId = priceMap.get(nativeSymbol)?.id
    if (nativeId) {
      const history = await fetchPriceHistory(nativeId, 1)
      setPriceHistory(history)
    }
  }, [balances, activeChain]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch prices when balances update
  useEffect(() => {
    if (balances.length > 0 && !locked) {
      refreshPrices()
    }
  }, [balances, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transaction history ─────────────────────────────────────────────────

  const refreshTransactions = useCallback(async () => {
    if (!currentWallet) return

    setTransactionsLoading(true)
    try {
      const txs = await fetchAllTransactionHistory(currentWallet.ethAddress, activeChain.id)
      setTransactions(txs)
    } catch (err) {
      console.warn('Failed to fetch transactions:', err)
    } finally {
      setTransactionsLoading(false)
    }
  }, [currentWallet?.ethAddress, activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch transactions when wallet or chain changes
  useEffect(() => {
    if (currentWallet && !locked) {
      refreshTransactions()
    }
  }, [currentWallet?.id, activeChain.id, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Address book ────────────────────────────────────────────────────────

  const refreshAddressBook = useCallback(async () => {
    setAddressBook(await addressBookStore.list())
  }, [addressBookStore])

  const refreshConnectedSites = useCallback(async () => {
    setConnectedSites(await sitePermissions.list())
  }, [sitePermissions])

  // Both stores live outside the encrypted wallet blob, so they can be read as
  // soon as the provider mounts rather than waiting for an unlock.
  useEffect(() => {
    refreshAddressBook().catch(err => console.warn('Address book load failed:', err))
    refreshConnectedSites().catch(err => console.warn('Connected sites load failed:', err))
  }, [refreshAddressBook, refreshConnectedSites])

  /**
   * Address-book mutations surface their failure reason through `error` and
   * rethrow, so a form can show the specific problem ("already in your address
   * book") while the caller still knows the write did not happen.
   */
  const runAddressBookOp = async (op: () => Promise<unknown>) => {
    try {
      setError(null)
      await op()
      await refreshAddressBook()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address book update failed')
      throw err
    }
  }

  const addContact = (input: AddressBookInput) =>
    runAddressBookOp(() => addressBookStore.add(input))

  const updateContact = (id: string, changes: Partial<AddressBookInput>) =>
    runAddressBookOp(() => addressBookStore.update(id, changes))

  const removeContact = (id: string) =>
    runAddressBookOp(() => addressBookStore.remove(id))

  const toggleContactFavorite = (id: string) =>
    runAddressBookOp(() => addressBookStore.toggleFavorite(id))

  // ── Connected sites ─────────────────────────────────────────────────────

  const revokeSiteCapability = async (origin: string, capability: SiteCapability) => {
    await sitePermissions.revoke(origin, [capability])
    await refreshConnectedSites()
  }

  const disconnectSite = async (origin: string) => {
    await sitePermissions.revokeAll(origin)
    await refreshConnectedSites()
  }

  const disconnectAllSites = async () => {
    await sitePermissions.revokeEverything()
    await refreshConnectedSites()
  }

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
    createWalletFromMnemonic,
    importWallet,
    importFromKeystoreJSON,
    allWallets,
    switchWallet,
    removeWallet,
    exportPrivateKey,
    exportMnemonic,
    exportKeystoreJSON: exportKeystoreJSONFn,
    changePassword,
    resetWallet,
    updateSettings,
    generateMnemonic: generateMnemonicFn,
    activeChain,
    setActiveChain,
    chains: CHAIN_LIST,
    networkStatus,
    refreshNetworkStatus,
    trustActiveChainId,
    showTestnets: state?.settings.showTestnets ?? false,
    fetchBalances,
    balances,
    balancesLoading,
    pqBalance,
    combinedNativeBalance,
    sendPqTransaction,
    signMessage,
    signMessagePQ,
    buildSend,
    buildTokenSend,
    estimateGas,
    sendTransaction,
    sendTokenTransaction,
    prices,
    portfolioValue,
    portfolioChange24h,
    priceHistory,
    refreshPrices,
    transactions,
    transactionsLoading,
    refreshTransactions,
    addressBook,
    addContact,
    updateContact,
    removeContact,
    toggleContactFavorite,
    connectedSites,
    revokeSiteCapability,
    disconnectSite,
    disconnectAllSites,
    refreshConnectedSites,
    manager,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
