import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react'
import type { WalletState, WalletAccount, WalletSettings } from '../../core/types'
import type { IStorage } from '../../core/storage'
import { createDefaultStorage } from '../../core/storage'
import type { UnlockResult } from '../../core/wallet-manager'
import {
  type ChainConfig,
  DEFAULT_CHAIN,
  CHAIN_LIST,
  getChain,
  supportsWeb3,
  isQrdxChain,
} from '../../core/chains'
import {
  probeChainIdentity,
  trustChainId,
  setTrustedChainIds,
  ChainIdentityError,
} from '../../core/chain-identity'
import { type TokenBalance, type GasEstimate } from '../../core/ethereum'
import {
  fetchPricesBySymbol,
  computePortfolioValue,
  fetchPriceHistory,
  type TokenPrice,
  type PriceHistoryPoint,
} from '../../core/prices'
import { fetchAllTransactionHistory, type TransactionHistoryItem } from '../../core/history'
import { newMnemonic } from '../../core/keyring'
import {
  fetchBalances as fetchCredentialBalances,
  quoteSend as quoteSendCore,
  send as sendCore,
  submitExchangeOp as submitExchangeOpCore,
  type Credential,
  type SendQuote,
  type SendResult,
} from '../../core/tx-service'
import type { ExchangeOpName, JsonValue } from '../../core/exchange-tx'
import type { KeystoreV3 } from '../../core/keystore'
import { WatchedTokens } from '../../core/watched-tokens'
import { exchange } from '../../core/exchange-client'
import { ActivityLog, fetchQrdxHistory } from '../../core/activity'
import { AddressBook, type AddressBookEntry, type AddressBookInput } from '../../core/address-book'
import { SitePermissions, type SitePermission, type SiteCapability } from '../../core/permissions'
import { createBackend, createLocalBackend, type WalletBackend } from '../backend'
import { detectPlatform, type PlatformInfo } from '../platform'
import {
  createPasskey,
  deviceLabel,
  passkeySupport,
  unlockSecret,
  type PasskeySupport,
} from '../passkey'

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
  | { state: 'mismatch'; liveChainId: number; configuredChainId: number; rpcUrl: string }
  | { state: 'unreachable'; message: string }

export interface SendInput {
  credential: Credential
  to: string
  amount: string
  token?: { address: string; decimals: number; symbol?: string }
}

// ─── Public context type ────────────────────────────────────────────────────
export interface WalletContextType {
  state: WalletState | null
  currentWallet: WalletAccount | null
  loading: boolean
  error: string | null
  initialized: boolean
  locked: boolean
  /** Which target this is running as, and what it can do. */
  platform: PlatformInfo
  /** Direct access to the wallet backend (in-page manager or extension proxy). */
  backend: WalletBackend
  /** Re-read wallet state after calling `backend` directly. */
  refreshState: () => Promise<void>

  // ── Session ────────────────────────────────────────────────────────────
  unlock: (password: string) => Promise<UnlockResult>
  unlockWithBiometrics: () => Promise<UnlockResult>
  lock: () => Promise<void>
  /** Passkey PRF support on this device, and whether one is enrolled for it. */
  biometrics: { support: PasskeySupport; enrolled: boolean }
  enableBiometrics: (password: string) => Promise<void>
  disableBiometrics: (credentialId: string) => Promise<void>

  // ── Creating / importing ───────────────────────────────────────────────
  generateMnemonic: (words?: 12 | 24) => string
  createWallet: (input: {
    password: string
    mnemonic: string
    accountName?: string
    imported?: boolean
    backedUp?: boolean
  }) => Promise<void>
  createWalletFromPrivateKey: (input: {
    password: string
    privateKey: string
    accountName?: string
  }) => Promise<void>
  createWalletFromKeystore: (input: {
    password: string
    keystore: unknown
    keystorePassword: string
    accountName?: string
  }) => Promise<void>

  // ── Accounts ───────────────────────────────────────────────────────────
  allWallets: WalletAccount[]
  addAccount: (name?: string) => Promise<WalletAccount>
  importMnemonic: (mnemonic: string, name?: string) => Promise<WalletAccount>
  importPrivateKey: (privateKey: string, name?: string) => Promise<WalletAccount>
  importKeystore: (
    keystore: unknown,
    keystorePassword: string,
    name?: string
  ) => Promise<WalletAccount>
  switchWallet: (accountId: string) => Promise<void>
  renameAccount: (accountId: string, name: string) => Promise<void>
  removeWallet: (accountId: string, password: string) => Promise<void>
  exportPrivateKey: (
    password: string,
    accountId?: string
  ) => Promise<{ ethPrivateKey: string; pqSeed: string }>
  exportMnemonic: (password: string, keyringId?: string) => Promise<string>
  exportKeystoreJSON: (
    password: string,
    keystorePassword: string,
    accountId?: string
  ) => Promise<KeystoreV3>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  resetWallet: () => Promise<void>
  updateSettings: (settings: Partial<WalletSettings>) => Promise<void>

  // ── Network ────────────────────────────────────────────────────────────
  activeChain: ChainConfig
  setActiveChain: (chainId: string) => void
  chains: ChainConfig[]
  networkStatus: NetworkStatus
  refreshNetworkStatus: () => Promise<void>
  /**
   * Accept the chain ID the active network's node actually reports, even though
   * it differs from the registry, and persist that decision. Only call from an
   * explicit user confirmation — it re-enables signing on a network whose
   * identity did not verify.
   */
  trustActiveChainId: () => Promise<void>
  showTestnets: boolean

  // ── Balances ───────────────────────────────────────────────────────────
  fetchBalances: () => Promise<TokenBalance[]>
  /** Classic (0x) account balances on the active chain. */
  balances: TokenBalance[]
  /** Post-quantum (0xPQ) account balances on the active chain (QRDX only). */
  pqBalances: TokenBalance[]
  balancesLoading: boolean
  /** Native balance of the PQ account in wei; null until read or off-QRDX. */
  pqBalance: bigint | null
  /** Native balance across both credentials, in wei. */
  combinedNativeBalance: bigint

  // ── Sending & signing ──────────────────────────────────────────────────
  quoteSend: (input: SendInput) => Promise<SendQuote>
  send: (input: SendInput, quote?: SendQuote) => Promise<SendResult>
  /** Classic native-send gas estimate (kept for the swap preview). */
  estimateGas: (to: string, amount: string) => Promise<GasEstimate>
  signMessage: (message: string) => Promise<string>
  signMessagePQ: (message: string) => Promise<string>
  submitExchangeOp: (
    op: ExchangeOpName,
    params?: Record<string, JsonValue>
  ) => Promise<{ txHash: string }>

  // ── Prices / history ───────────────────────────────────────────────────
  prices: Map<string, TokenPrice>
  portfolioValue: number
  portfolioChange24h: number
  priceHistory: PriceHistoryPoint[]
  refreshPrices: () => Promise<void>
  transactions: TransactionHistoryItem[]
  transactionsLoading: boolean
  refreshTransactions: () => Promise<void>

  // ── Address book ───────────────────────────────────────────────────────
  addressBook: AddressBookEntry[]
  addContact: (input: AddressBookInput) => Promise<void>
  updateContact: (id: string, changes: Partial<AddressBookInput>) => Promise<void>
  removeContact: (id: string) => Promise<void>
  toggleContactFavorite: (id: string) => Promise<void>

  // ── Connected sites ────────────────────────────────────────────────────
  connectedSites: SitePermission[]
  revokeSiteCapability: (origin: string, capability: SiteCapability) => Promise<void>
  disconnectSite: (origin: string) => Promise<void>
  disconnectAllSites: () => Promise<void>
  refreshConnectedSites: () => Promise<void>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}

interface WalletProviderProps {
  children: ReactNode
  /**
   * Storage for non-secret stores (address book, site permissions) and — when
   * no backend is given — the vault. Defaults to chrome.storage in the
   * extension and localStorage elsewhere.
   */
  storage?: IStorage
  /** Override the backend (tests, previews). */
  backend?: WalletBackend
}

const ACTIVITY_THROTTLE_MS = 15_000

export function WalletProvider({
  children,
  storage: storageProp,
  backend: backendProp,
}: WalletProviderProps) {
  const storageRef = useRef<IStorage | null>(null)
  if (!storageRef.current) storageRef.current = storageProp ?? createDefaultStorage()
  const storage = storageRef.current

  const backendRef = useRef<WalletBackend | null>(null)
  if (!backendRef.current)
    backendRef.current =
      backendProp ?? (storageProp ? createLocalBackend(storageProp) : createBackend())
  const backend = backendRef.current

  const platform = useMemo(() => detectPlatform(), [])

  const addressBookRef = useRef<AddressBook | null>(null)
  if (!addressBookRef.current) addressBookRef.current = new AddressBook(storage)
  const addressBookStore = addressBookRef.current

  const watchedRef = useRef<WatchedTokens | null>(null)
  if (!watchedRef.current) watchedRef.current = new WatchedTokens(storage)
  const watchedTokens = watchedRef.current

  const activityRef = useRef<ActivityLog | null>(null)
  if (!activityRef.current) activityRef.current = new ActivityLog(storage)
  const activity = activityRef.current

  const sitePermissionsRef = useRef<SitePermissions | null>(null)
  if (!sitePermissionsRef.current) sitePermissionsRef.current = new SitePermissions(storage)
  const sitePermissions = sitePermissionsRef.current

  const [state, setState] = useState<WalletState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChain, setActiveChainState] = useState<ChainConfig>(DEFAULT_CHAIN)
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [pqBalances, setPqBalances] = useState<TokenBalance[]>([])
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [prices, setPrices] = useState<Map<string, TokenPrice>>(new Map())
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [portfolioChange24h, setPortfolioChange24h] = useState(0)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([])
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({ state: 'idle' })
  const probeSeqRef = useRef(0)
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([])
  const [connectedSites, setConnectedSites] = useState<SitePermission[]>([])
  const [passkeyAvailability, setPasskeyAvailability] = useState<PasskeySupport>('unknown')

  const initialized = state?.initialized ?? false
  const locked = state?.locked ?? true
  const allWallets = state?.wallets ?? []
  const currentWallet = useMemo(
    () =>
      state && !state.locked
        ? (state.wallets.find((w) => w.id === state.currentWalletId) ?? state.wallets[0] ?? null)
        : null,
    [state]
  )

  // ── State sync ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setState(await backend.getState())
  }, [backend])

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
    // Auto-lock and changes made elsewhere (another popup, the provider) arrive as events.
    return backend.subscribe(() => {
      refresh().catch(() => undefined)
    })
  }, [backend, refresh])

  useEffect(() => {
    passkeySupport()
      .then(setPasskeyAvailability)
      .catch(() => setPasskeyAvailability('unsupported'))
  }, [])

  /** Run a backend action, surface its error, refresh state. */
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, fallback: string): Promise<T> => {
      try {
        setError(null)
        const out = await fn()
        await refresh()
        return out
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback)
        throw err
      }
    },
    [refresh]
  )

  // ── Activity → auto-lock deadline; lock when hidden (PWA) ───────────────
  const lastTouchRef = useRef(0)
  useEffect(() => {
    if (locked || typeof window === 'undefined') return
    const onActivity = () => {
      const now = Date.now()
      if (now - lastTouchRef.current < ACTIVITY_THROTTLE_MS) return
      lastTouchRef.current = now
      backend.touch().catch(() => undefined)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [locked, backend])

  const lockOnHideAfter = state?.settings.lockOnHideAfter
  useEffect(() => {
    if (
      locked ||
      lockOnHideAfter === undefined ||
      platform.target === 'extension' ||
      typeof document === 'undefined'
    )
      return
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        if (lockOnHideAfter === 0) backend.lock().then(refresh)
      } else if (hiddenAt && Date.now() - hiddenAt >= lockOnHideAfter) {
        backend.lock().then(refresh)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [locked, lockOnHideAfter, platform.target, backend, refresh])

  // ── Session ─────────────────────────────────────────────────────────────
  const unlock = async (password: string): Promise<UnlockResult> => {
    setError(null)
    const result = await backend.unlock(password)
    await refresh()
    return result
  }

  const unlockWithBiometrics = async (): Promise<UnlockResult> => {
    setError(null)
    const challenges = await backend.passkeyChallenges()
    const { credentialId, prfOutput } = await unlockSecret(challenges)
    const result = await backend.unlockWithPasskey(credentialId, prfOutput)
    await refresh()
    return result
  }

  const lock = () => run(() => backend.lock(), 'Failed to lock')

  const biometricsEnrolled = useMemo(() => {
    if (typeof location === 'undefined') return false
    return (state?.passkeys ?? []).some((p) => p.rpId === location.hostname)
  }, [state?.passkeys])

  const enableBiometrics = (password: string) =>
    run(async () => {
      if (!(await backend.verifyPassword(password))) throw new Error('Incorrect password')
      const label = deviceLabel()
      const pk = await createPasskey(`QRDX Wallet · ${label}`)
      await backend.enrollPasskey(password, { ...pk, label })
    }, 'Could not enable biometric unlock')

  const disableBiometrics = (credentialId: string) =>
    run(() => backend.removePasskey(credentialId), 'Could not remove biometric unlock')

  // ── Creating / importing ────────────────────────────────────────────────
  const createWallet: WalletContextType['createWallet'] = (input) =>
    run(async () => void (await backend.createVaultFromMnemonic(input)), 'Failed to create wallet')
  const createWalletFromPrivateKey: WalletContextType['createWalletFromPrivateKey'] = (input) =>
    run(async () => void (await backend.createVaultFromPrivateKey(input)), 'Failed to import key')
  const createWalletFromKeystore: WalletContextType['createWalletFromKeystore'] = (input) =>
    run(
      async () => void (await backend.createVaultFromKeystore(input)),
      'Failed to import keystore'
    )

  // ── Accounts ────────────────────────────────────────────────────────────
  const addAccount = (name?: string) =>
    run(() => backend.addHdAccount({ name }), 'Failed to add account')
  const importMnemonic = (mnemonic: string, name?: string) =>
    run(() => backend.importMnemonic({ mnemonic, name }), 'Failed to import phrase')
  const importPrivateKey = (privateKey: string, name?: string) =>
    run(() => backend.importPrivateKey({ privateKey, name }), 'Failed to import key')
  const importKeystore = (keystore: unknown, keystorePassword: string, name?: string) =>
    run(
      () => backend.importKeystore({ keystore, keystorePassword, name }),
      'Failed to import keystore'
    )
  const switchWallet = (id: string) =>
    run(() => backend.selectAccount(id), 'Failed to switch account')
  const renameAccount = (id: string, name: string) =>
    run(() => backend.renameAccount(id, name), 'Failed to rename account')
  const removeWallet = (id: string, password: string) =>
    run(() => backend.removeAccount(id, password), 'Failed to remove account')
  const exportPrivateKey = (password: string, accountId?: string) =>
    backend.exportPrivateKey(password, accountId)
  const exportMnemonic = (password: string, keyringId?: string) =>
    backend.exportMnemonic(password, keyringId)
  const exportKeystoreJSON = (password: string, keystorePassword: string, accountId?: string) =>
    backend.exportKeystore(password, keystorePassword, accountId)
  const changePassword = (oldPassword: string, newPassword: string) =>
    run(() => backend.changePassword(oldPassword, newPassword), 'Failed to change password')

  const resetWallet = async () => {
    await run(() => backend.reset(), 'Failed to reset wallet')
    setBalances([])
    setPqBalances([])
    setTransactions([])
    setPrices(new Map())
    setPortfolioValue(0)
    setPortfolioChange24h(0)
    setPriceHistory([])
  }

  const updateSettings = (settings: Partial<WalletSettings>) =>
    run(() => backend.updateSettings(settings), 'Failed to update settings')

  // ── Chain ───────────────────────────────────────────────────────────────
  const setActiveChain = (chainId: string) => {
    const chain = getChain(chainId)
    if (!chain) return
    setActiveChainState(chain)
    // Balances, prices and history are chain-scoped; showing the previous
    // chain's figures under a new network's name would be actively misleading.
    setBalances([])
    setPqBalances([])
    setTransactions([])
    setPriceHistory([])
    setPortfolioValue(0)
    setPortfolioChange24h(0)
    setNetworkStatus({ state: 'idle' })
    if (state?.initialized && !state.locked) {
      backend
        .updateSettings({ activeChainId: chainId })
        .catch((err) => console.warn('Could not persist network selection:', err))
    }
  }

  const restoredChainRef = useRef(false)
  useEffect(() => {
    const settings = state?.settings
    if (!settings || restoredChainRef.current) return
    restoredChainRef.current = true
    if (settings.trustedChainIds) setTrustedChainIds(settings.trustedChainIds)
    const saved = settings.activeChainId ? getChain(settings.activeChainId) : undefined
    if (saved) setActiveChainState(saved)
  }, [state?.settings])

  const refreshNetworkStatus = useCallback(async () => {
    // Probes race (mount on the default chain, then restore the saved one); only
    // the newest probe may publish so a slow failure cannot overwrite a success.
    const seq = ++probeSeqRef.current
    const probedChain = activeChain
    const isStale = () => seq !== probeSeqRef.current
    setNetworkStatus({ state: 'checking' })
    try {
      const identity = await probeChainIdentity(probedChain, true)
      if (isStale()) return
      setNetworkStatus(
        identity.matches || identity.trusted
          ? { state: 'connected', chainId: identity.liveChainId, rpcUrl: identity.rpcUrl }
          : {
              state: 'mismatch',
              liveChainId: identity.liveChainId,
              configuredChainId: identity.configuredChainId,
              rpcUrl: identity.rpcUrl,
            }
      )
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
      await backend.updateSettings({ trustedChainIds: merged })
      await refresh()
    } catch (err) {
      console.warn('Could not persist trusted chain id:', err)
    }
    await refreshNetworkStatus()
  }

  // ── Balances ────────────────────────────────────────────────────────────
  const fetchBalances = async (): Promise<TokenBalance[]> => {
    if (!currentWallet || !supportsWeb3(activeChain)) return []
    setBalancesLoading(true)
    try {
      const watched = await watchedTokens.list(activeChain.id).catch(() => [])
      // QRDX native tokens are ERC-20s inside the EVM; discover them from the node.
      const native = isQrdxChain(activeChain)
        ? await exchange
            .tokens(activeChain)
            .then((list) =>
              list.map((t) => ({
                address: t.token_address,
                symbol: t.symbol,
                name: t.name,
                decimals: t.decimals,
              }))
            )
            .catch(() => [])
        : []
      const extra = [...native, ...watched]
      const [classic, pq] = await Promise.all([
        fetchCredentialBalances(activeChain, currentWallet, 'classic', extra),
        isQrdxChain(activeChain)
          ? fetchCredentialBalances(activeChain, currentWallet, 'pq', extra).catch(() => [])
          : Promise.resolve([]),
      ])
      setBalances(classic)
      setPqBalances(pq)
      return classic
    } catch (err) {
      console.warn('Failed to fetch balances:', err)
      return []
    } finally {
      setBalancesLoading(false)
    }
  }

  useEffect(() => {
    if (currentWallet && !locked && supportsWeb3(activeChain)) fetchBalances()
  }, [currentWallet?.id, activeChain.id, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  const pqBalance = useMemo(
    () =>
      pqBalances.find((b) => b.address === '')?.rawBalance ??
      (isQrdxChain(activeChain) && pqBalances.length ? 0n : null),
    [pqBalances, activeChain]
  )
  const combinedNativeBalance =
    (balances.find((b) => b.address === '')?.rawBalance ?? 0n) + (pqBalance ?? 0n)

  // ── Sending ─────────────────────────────────────────────────────────────
  const requireAccount = () => {
    if (!currentWallet) throw new Error('Unlock the wallet first')
    return currentWallet
  }

  const quoteSend = (input: SendInput) =>
    quoteSendCore({ chain: activeChain, account: requireAccount(), ...input })

  const send = async (input: SendInput, quote?: SendQuote) => {
    try {
      setError(null)
      const result = await sendCore(
        backend,
        { chain: activeChain, account: requireAccount(), ...input },
        quote
      )
      await activity
        .add({
          hash: result.hash,
          chain: activeChain.id,
          kind: 'send',
          track: 'evm',
          credential: input.credential,
          from: result.from,
          to: input.to,
          value: `${input.amount} ${input.token?.symbol ?? activeChain.nativeCurrency.symbol}`,
        })
        .catch(() => undefined)
      fetchBalances()
      refreshTransactions()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
      throw err
    }
  }

  const estimateGas = async (to: string, amount: string): Promise<GasEstimate> => {
    const q = await quoteSend({ credential: 'classic', to, amount })
    return {
      gasLimit: BigInt(q.gasLimit),
      gasPrice: BigInt(q.gasPrice),
      estimatedCostWei: BigInt(q.fee),
    }
  }

  const signMessage = (message: string) =>
    backend.signPersonalMessage(message, { accountId: currentWallet?.id })
  const signMessagePQ = async (message: string) =>
    (await backend.signPqMessage(message, currentWallet?.id)).signature

  const submitExchangeOp = async (op: ExchangeOpName, params?: Record<string, JsonValue>) => {
    const account = requireAccount()
    const result = await submitExchangeOpCore(backend, { chain: activeChain, account, op, params })
    await activity
      .add({
        hash: result.txHash,
        chain: activeChain.id,
        kind: op === 'SWAP' ? 'swap' : op.startsWith('STAKE_') ? 'stake' : 'exchange',
        track: 'exchange',
        credential: 'pq',
        from: account.pqAddress,
        to: '',
        value:
          op === 'SWAP' && params
            ? `${params.amount_in} ${params.token_in === 'QRDX' ? 'QRDX' : 'token'}`
            : op === 'STAKE_DEPOSIT' && params
              ? `${params.stake_amount} QRDX`
              : '',
        label: op.replace(/_/g, ' ').toLowerCase(),
      })
      .catch(() => undefined)
    return result
  }

  // ── Prices ──────────────────────────────────────────────────────────────
  const refreshPrices = useCallback(async () => {
    const all = [...balances, ...pqBalances]
    if (all.length === 0) return
    const priceMap = await fetchPricesBySymbol([...new Set(all.map((b) => b.symbol))])
    setPrices(priceMap)
    const { totalUsd, change24hPercent } = computePortfolioValue(all, priceMap)
    setPortfolioValue(totalUsd)
    setPortfolioChange24h(change24hPercent)
    const nativeId = priceMap.get(activeChain.nativeCurrency?.symbol ?? 'ETH')?.id
    if (nativeId) setPriceHistory(await fetchPriceHistory(nativeId, 1))
  }, [balances, pqBalances, activeChain])

  useEffect(() => {
    if ((balances.length > 0 || pqBalances.length > 0) && !locked) refreshPrices()
  }, [balances, pqBalances, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── History ─────────────────────────────────────────────────────────────
  const refreshTransactions = useCallback(async () => {
    if (!currentWallet) return
    setTransactionsLoading(true)
    try {
      if (isQrdxChain(activeChain)) {
        const tokens = [
          ...(await watchedTokens.list(activeChain.id).catch(() => [])),
          ...(await exchange
            .tokens(activeChain)
            .then((l) =>
              l.map((t) => ({ address: t.token_address, symbol: t.symbol, decimals: t.decimals }))
            )
            .catch(() => [])),
        ]
        setTransactions(await fetchQrdxHistory(activity, activeChain, [currentWallet], tokens))
      } else {
        setTransactions(await fetchAllTransactionHistory(currentWallet.ethAddress, activeChain.id))
      }
    } catch (err) {
      console.warn('Failed to fetch transactions:', err)
    } finally {
      setTransactionsLoading(false)
    }
  }, [currentWallet?.ethAddress, activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentWallet && !locked) refreshTransactions()
  }, [currentWallet?.id, activeChain.id, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Address book & sites (not secret; readable while locked) ────────────
  const refreshAddressBook = useCallback(
    async () => setAddressBook(await addressBookStore.list()),
    [addressBookStore]
  )
  const refreshConnectedSites = useCallback(
    async () => setConnectedSites(await sitePermissions.list()),
    [sitePermissions]
  )

  useEffect(() => {
    refreshAddressBook().catch((err) => console.warn('Address book load failed:', err))
    refreshConnectedSites().catch((err) => console.warn('Connected sites load failed:', err))
  }, [refreshAddressBook, refreshConnectedSites])

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

  const value: WalletContextType = {
    state,
    currentWallet,
    loading,
    error,
    initialized,
    locked,
    platform,
    backend,
    refreshState: refresh,
    unlock,
    unlockWithBiometrics,
    lock,
    biometrics: { support: passkeyAvailability, enrolled: biometricsEnrolled },
    enableBiometrics,
    disableBiometrics,
    generateMnemonic: (words = 12) => newMnemonic(words),
    createWallet,
    createWalletFromPrivateKey,
    createWalletFromKeystore,
    allWallets,
    addAccount,
    importMnemonic,
    importPrivateKey,
    importKeystore,
    switchWallet,
    renameAccount,
    removeWallet,
    exportPrivateKey,
    exportMnemonic,
    exportKeystoreJSON,
    changePassword,
    resetWallet,
    updateSettings,
    activeChain,
    setActiveChain,
    chains: CHAIN_LIST,
    networkStatus,
    refreshNetworkStatus,
    trustActiveChainId,
    showTestnets: state?.settings.showTestnets ?? false,
    fetchBalances,
    balances,
    pqBalances,
    balancesLoading,
    pqBalance,
    combinedNativeBalance,
    quoteSend,
    send,
    estimateGas,
    signMessage,
    signMessagePQ,
    submitExchangeOp,
    prices,
    portfolioValue,
    portfolioChange24h,
    priceHistory,
    refreshPrices,
    transactions,
    transactionsLoading,
    refreshTransactions,
    addressBook,
    addContact: (input) => runAddressBookOp(() => addressBookStore.add(input)),
    updateContact: (id, changes) => runAddressBookOp(() => addressBookStore.update(id, changes)),
    removeContact: (id) => runAddressBookOp(() => addressBookStore.remove(id)),
    toggleContactFavorite: (id) => runAddressBookOp(() => addressBookStore.toggleFavorite(id)),
    connectedSites,
    revokeSiteCapability: async (origin, capability) => {
      await sitePermissions.revoke(origin, [capability])
      await refreshConnectedSites()
    },
    disconnectSite: async (origin) => {
      await sitePermissions.revokeAll(origin)
      await refreshConnectedSites()
    },
    disconnectAllSites: async () => {
      await sitePermissions.revokeEverything()
      await refreshConnectedSites()
    },
    refreshConnectedSites,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
