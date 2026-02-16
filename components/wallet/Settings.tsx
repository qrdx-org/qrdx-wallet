'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Wallet,
  Shield,
  Globe,
  DollarSign,
  Bell,
  Lock,
  Key,
  Trash2,
  Plus,
  Check,
  Moon,
  Sun,
  Palette,
  Monitor,
  Info,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Save,
  Link,
  Unplug,
  Blocks,
  Code,
  Zap,
  X,
  BookUser,
  Sparkles,
  UserPlus,
  Star,
  Fingerprint,
  Users,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  FileJson,
  Upload,
  Download,
  Copy,
  ChevronLeft,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { THEME_OPTIONS, type ThemeValue } from '@/components/theme-provider'
import { CHAIN_LIST, type ChainConfig, supportsWeb3, supportsPQ } from '@/src/core/chains'
import { useWallet } from '@/src/shared/contexts/WalletContext'

interface SettingsProps {
  onBack: () => void
}



const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
]

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', label: 'Korean Won' },
  { code: 'BTC', symbol: '₿', label: 'Bitcoin' },
  { code: 'ETH', symbol: 'Ξ', label: 'Ethereum' },
]

interface Network {
  id: string
  name: string
  rpc: string
  chainId: number
  symbol: string
  explorer: string
  isTestnet: boolean
  icon?: string
  /** Transport capabilities from chains.ts */
  transport?: string
}

/**
 * Derive the Settings-local Network list from the canonical CHAIN_LIST
 * so there's a single source of truth.
 */
const NETWORKS: Network[] = CHAIN_LIST.map((c) => ({
  id: c.id,
  name: c.name,
  rpc: c.rpcUrl,
  chainId: c.chainId,
  symbol: c.nativeCurrency.symbol,
  explorer: c.explorerUrl,
  isTestnet: c.isTestnet,
  transport: c.transport,
}))

interface ConnectedSite {
  id: string
  origin: string
  name: string
  favicon?: string
  connectedAt: string
  permissions: string[]
}

const MOCK_CONNECTED_SITES: ConnectedSite[] = [
  { id: '1', origin: 'https://app.uniswap.org', name: 'Uniswap', connectedAt: '2026-01-15', permissions: ['View accounts', 'Request transactions'] },
  { id: '2', origin: 'https://opensea.io', name: 'OpenSea', connectedAt: '2026-01-22', permissions: ['View accounts'] },
  { id: '3', origin: 'https://aave.com', name: 'Aave', connectedAt: '2026-02-01', permissions: ['View accounts', 'Request transactions', 'Sign messages'] },
  { id: '4', origin: 'https://trade.qrdx.org', name: 'QRDX Trade', connectedAt: '2026-02-05', permissions: ['View accounts', 'Request transactions', 'Sign messages'] },
]

interface InjectedApi {
  id: string
  name: string
  description: string
  namespace: string
  enabled: boolean
  icon: 'ethereum' | 'qrdx' | 'legacy'
}

const DEFAULT_INJECTED_APIS: InjectedApi[] = [
  { id: 'eip1193', name: 'EIP-1193 Provider', description: 'Standard window.ethereum provider for dApps', namespace: 'window.ethereum', enabled: true, icon: 'ethereum' },
  { id: 'eip6963', name: 'EIP-6963 Multi-Provider', description: 'Multi-wallet discovery protocol', namespace: 'EIP-6963 events', enabled: true, icon: 'ethereum' },
  { id: 'web3', name: 'Legacy Web3', description: 'Deprecated window.web3 injection for older dApps', namespace: 'window.web3', enabled: false, icon: 'legacy' },
  { id: 'qrdx', name: 'QRDX API', description: 'Quantum-resistant signing & QRDX chain methods', namespace: 'window.qrdx', enabled: true, icon: 'qrdx' },
  { id: 'qrdx-pq', name: 'QRDX Post-Quantum', description: 'Dilithium & SPHINCS+ signature schemes', namespace: 'window.qrdx.pq', enabled: true, icon: 'qrdx' },
]

interface AddressBookEntry {
  id: string
  name: string
  address: string
  addressType: 'eth' | 'pq'
  chain: string
  isFavorite: boolean
}

const MOCK_ADDRESS_BOOK: AddressBookEntry[] = [
  { id: '1', name: 'Coinbase', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', addressType: 'eth', chain: 'Ethereum', isFavorite: true },
  { id: '2', name: 'Alice', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', addressType: 'eth', chain: 'Ethereum', isFavorite: false },
  { id: '3', name: 'QRDX Staking', address: 'qr_7a250d5630B4cF539739dF2C5dAcb4c659F2488D', addressType: 'pq', chain: 'QRDX', isFavorite: true },
  { id: '4', name: 'Bob (Polygon)', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', addressType: 'eth', chain: 'Polygon', isFavorite: false },
  { id: '5', name: 'Treasury (PQ)', address: 'qr_6B175474E89094C44Da98b954EedeAC495271d0F', addressType: 'pq', chain: 'QRDX', isFavorite: true },
]

// Theme preview colors for the picker
const THEME_PREVIEWS: Record<ThemeValue, { bg: string; card: string; accent: string; text: string; label: string }> = {
  dark: { bg: '#020817', card: '#0c1425', accent: '#8A50FF', text: '#f8fafc', label: 'QRDX Purple Dark' },
  light: { bg: '#ffffff', card: '#ffffff', accent: '#8A50FF', text: '#020817', label: 'QRDX Purple Light' },
  'mono-light': { bg: '#ffffff', card: '#ffffff', accent: '#0f172a', text: '#020817', label: 'Monochrome Light' },
  'mono-dark': { bg: '#020817', card: '#020817', accent: '#f8fafc', text: '#f8fafc', label: 'Monochrome Dark' },
}

// ─── Sub-page type ──────────────────────────────────────────────────────────
type SettingsPage =
  | 'main'
  | 'wallets'
  | 'theme'
  | 'language'
  | 'currency'
  | 'security'
  | 'notifications'
  | 'network'
  | 'network-detail'
  | 'connected-sites'
  | 'injected-apis'
  | 'address-book'
  | 'smart-wallet'
  | 'about'

// ─── Component ──────────────────────────────────────────────────────────────
export function Settings({ onBack }: SettingsProps) {
  const [page, setPage] = useState<SettingsPage>('main')
  const { theme, setTheme } = useTheme()
  const {
    allWallets,
    currentWallet,
    createWallet,
    importWallet,
    switchWallet,
    removeWallet,
    exportPrivateKey,
    changePassword,
    resetWallet,
    updateSettings,
    activeChain,
    setActiveChain,
    state,
    exportMnemonic,
    exportKeystoreJSON,
    importFromKeystoreJSON,
    createWalletFromMnemonic,
    generateMnemonic,
  } = useWallet()

  // Settings state (initialised from persisted settings if available)
  const savedSettings = state?.settings
  const [language, setLanguageLocal] = useState(savedSettings?.language ?? 'en')
  const [currency, setCurrencyLocal] = useState(savedSettings?.currency ?? 'USD')
  const [notifications, setNotifications] = useState({
    transactions: true,
    priceAlerts: true,
    securityAlerts: true,
    marketing: false,
  })
  const [autoLock, setAutoLockLocal] = useState(
    savedSettings?.autoLockTimeout
      ? savedSettings.autoLockTimeout === 999999
        ? 'never'
        : String(Math.round(savedSettings.autoLockTimeout / 60000))
      : '5'
  )
  const [biometrics, setBiometrics] = useState(false)
  const [testnetMode, setTestnetMode] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null)
  const [editingNetwork, setEditingNetwork] = useState<Network | null>(null)
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>(MOCK_CONNECTED_SITES)
  const [injectedApis, setInjectedApis] = useState<InjectedApi[]>(DEFAULT_INJECTED_APIS)
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(MOCK_ADDRESS_BOOK)

  // ── Account management dialogs ──────────────────────────────────────────
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [addAccountMode, setAddAccountMode] = useState<'create' | 'import'>('create')
  const [addCreateStep, setAddCreateStep] = useState<'form' | 'mnemonic-display' | 'mnemonic-confirm' | 'success'>('form')
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [newAccountKey, setNewAccountKey] = useState('')
  const [addAccountLoading, setAddAccountLoading] = useState(false)
  const [addAccountError, setAddAccountError] = useState<string | null>(null)
  const [addMnemonic, setAddMnemonic] = useState('')
  const [addMnemonicRevealed, setAddMnemonicRevealed] = useState(false)
  const [addMnemonicCopied, setAddMnemonicCopied] = useState(false)
  const [addConfirmWords, setAddConfirmWords] = useState<Record<number, string>>({})
  const [addConfirmIndices, setAddConfirmIndices] = useState<number[]>([])
  const [addImportMnemonic, setAddImportMnemonic] = useState('')
  const [addImportMode, setAddImportMode] = useState<'key' | 'mnemonic'>('key')

  const [showExportKey, setShowExportKey] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportedKey, setExportedKey] = useState<{ ethPrivateKey: string; pqSeed: string } | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Mnemonic export dialog
  const [showExportMnemonic, setShowExportMnemonic] = useState(false)
  const [mnemonicExportPassword, setMnemonicExportPassword] = useState('')
  const [exportedMnemonic, setExportedMnemonic] = useState<string | null>(null)
  const [mnemonicExportLoading, setMnemonicExportLoading] = useState(false)
  const [mnemonicExportError, setMnemonicExportError] = useState<string | null>(null)
  const [mnemonicCopied, setMnemonicCopied] = useState(false)

  // JSON keystore export dialog
  const [showExportJSON, setShowExportJSON] = useState(false)
  const [jsonExportPassword, setJsonExportPassword] = useState('')
  const [jsonExportLoading, setJsonExportLoading] = useState(false)
  const [jsonExportError, setJsonExportError] = useState<string | null>(null)

  // JSON keystore import dialog
  const [showImportJSON, setShowImportJSON] = useState(false)
  const [importKeystoreFile, setImportKeystoreFile] = useState<any>(null)
  const [importKeystoreFileName, setImportKeystoreFileName] = useState('')
  const [importKeystorePassword, setImportKeystorePassword] = useState('')
  const [importKeystoreWalletPassword, setImportKeystoreWalletPassword] = useState('')
  const [importKeystoreName, setImportKeystoreName] = useState('')
  const [importKeystoreLoading, setImportKeystoreLoading] = useState(false)
  const [importKeystoreError, setImportKeystoreError] = useState<string | null>(null)

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removePassword, setRemovePassword] = useState('')
  const [removeLoading, setRemoveLoading] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const [showChangePassword, setShowChangePassword] = useState(false)
  const [oldPasswordInput, setOldPasswordInput] = useState('')
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false)

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // ── Derived add-account mnemonic helpers ───────────────────────────────
  const addMnemonicWords = useMemo(() => addMnemonic.split(' ').filter(Boolean), [addMnemonic])

  useEffect(() => {
    if (addMnemonicWords.length === 12 && addConfirmIndices.length === 0) {
      const indices: number[] = []
      while (indices.length < 4) {
        const i = Math.floor(Math.random() * 12)
        if (!indices.includes(i)) indices.push(i)
      }
      setAddConfirmIndices(indices.sort((a, b) => a - b))
    }
  }, [addMnemonicWords.length, addConfirmIndices.length])

  const addAllConfirmCorrect = useMemo(() => {
    return addConfirmIndices.every(
      (idx) => addConfirmWords[idx]?.trim().toLowerCase() === addMnemonicWords[idx]
    )
  }, [addConfirmIndices, addConfirmWords, addMnemonicWords])

  const resetAddAccount = useCallback(() => {
    setShowAddAccount(false)
    setAddAccountMode('create')
    setAddCreateStep('form')
    setNewAccountName('')
    setNewAccountPassword('')
    setNewAccountKey('')
    setAddAccountError(null)
    setAddMnemonic('')
    setAddMnemonicRevealed(false)
    setAddMnemonicCopied(false)
    setAddConfirmWords({})
    setAddConfirmIndices([])
    setAddImportMnemonic('')
    setAddImportMode('key')
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAddAccountNextToMnemonic = () => {
    if (!newAccountName || !newAccountPassword) return
    setAddAccountError(null)
    setAddMnemonic(generateMnemonic())
    setAddMnemonicRevealed(false)
    setAddMnemonicCopied(false)
    setAddConfirmWords({})
    setAddConfirmIndices([])
    setAddCreateStep('mnemonic-display')
  }

  const handleAddAccountConfirmCreate = async () => {
    if (!addAllConfirmCorrect) {
      setAddAccountError('One or more words are incorrect.')
      return
    }
    setAddAccountLoading(true)
    setAddAccountError(null)
    try {
      await createWalletFromMnemonic(newAccountName.trim() || 'Account', addMnemonic, newAccountPassword)
      setAddCreateStep('success')
      // Auto-close after a short delay
      setTimeout(() => resetAddAccount(), 2000)
    } catch (err) {
      setAddAccountError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setAddAccountLoading(false)
    }
  }

  const handleAddAccount = async () => {
    if (!newAccountPassword || !newAccountName) return
    setAddAccountLoading(true)
    setAddAccountError(null)
    try {
      if (addAccountMode === 'import') {
        if (addImportMode === 'mnemonic') {
          if (!addImportMnemonic.trim()) throw new Error('Recovery phrase is required')
          await createWalletFromMnemonic(newAccountName, addImportMnemonic.trim(), newAccountPassword)
        } else {
          if (!newAccountKey.trim()) throw new Error('Private key is required')
          await importWallet(newAccountName, newAccountKey.trim(), newAccountPassword)
        }
      } else {
        await createWallet(newAccountName, newAccountPassword)
      }
      resetAddAccount()
    } catch (err) {
      setAddAccountError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setAddAccountLoading(false)
    }
  }

  const handleExportKey = async () => {
    if (!exportPassword) return
    setExportLoading(true)
    setExportError(null)
    try {
      const keys = await exportPrivateKey(exportPassword)
      setExportedKey(keys)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Incorrect password')
    } finally {
      setExportLoading(false)
    }
  }

  const handleExportMnemonic = async () => {
    if (!mnemonicExportPassword) return
    setMnemonicExportLoading(true)
    setMnemonicExportError(null)
    try {
      const phrase = await exportMnemonic(mnemonicExportPassword)
      if (!phrase) throw new Error('No recovery phrase found for this wallet')
      setExportedMnemonic(phrase)
    } catch (err) {
      setMnemonicExportError(err instanceof Error ? err.message : 'Incorrect password')
    } finally {
      setMnemonicExportLoading(false)
    }
  }

  const handleExportKeystoreJSON = async () => {
    if (!jsonExportPassword) return
    setJsonExportLoading(true)
    setJsonExportError(null)
    try {
      const keystore = await exportKeystoreJSON(jsonExportPassword)
      const blob = new Blob([JSON.stringify(keystore, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentWallet?.name || 'wallet'}-keystore.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setShowExportJSON(false)
      setJsonExportPassword('')
    } catch (err) {
      setJsonExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setJsonExportLoading(false)
    }
  }

  const handleImportKeystoreJSON = async () => {
    if (!importKeystoreFile || !importKeystorePassword || !importKeystoreWalletPassword) return
    setImportKeystoreLoading(true)
    setImportKeystoreError(null)
    try {
      await importFromKeystoreJSON(
        importKeystoreFile,
        importKeystorePassword,
        importKeystoreWalletPassword,
        importKeystoreName.trim() || undefined,
      )
      setShowImportJSON(false)
      setImportKeystoreFile(null)
      setImportKeystoreFileName('')
      setImportKeystorePassword('')
      setImportKeystoreWalletPassword('')
      setImportKeystoreName('')
    } catch (err) {
      setImportKeystoreError(err instanceof Error ? err.message : 'Failed to import keystore')
    } finally {
      setImportKeystoreLoading(false)
    }
  }

  const handleKeystoreFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportKeystoreFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        setImportKeystoreFile(json)
        setImportKeystoreError(null)
      } catch {
        setImportKeystoreError('Invalid JSON file')
        setImportKeystoreFile(null)
      }
    }
    reader.readAsText(file)
  }

  const handleRemoveAccount = async () => {
    if (!removePassword || !currentWallet) return
    setRemoveLoading(true)
    setRemoveError(null)
    try {
      await removeWallet(currentWallet.id, removePassword)
      setShowRemoveConfirm(false)
      setRemovePassword('')
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setRemoveLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!oldPasswordInput || !newPasswordInput) return
    if (newPasswordInput !== confirmNewPassword) return
    setChangePasswordLoading(true)
    setChangePasswordError(null)
    try {
      await changePassword(oldPasswordInput, newPasswordInput)
      setChangePasswordSuccess(true)
      setTimeout(() => {
        setShowChangePassword(false)
        setOldPasswordInput('')
        setNewPasswordInput('')
        setConfirmNewPassword('')
        setChangePasswordSuccess(false)
      }, 1500)
    } catch (err) {
      setChangePasswordError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const handleResetWallet = async () => {
    await resetWallet()
    setShowResetConfirm(false)
  }

  const handleSetLanguage = (code: string) => {
    setLanguageLocal(code)
    updateSettings({ language: code })
  }

  const handleSetCurrency = (code: string) => {
    setCurrencyLocal(code as typeof currency)
    updateSettings({ currency: code as any })
  }

  const handleSetAutoLock = (val: string) => {
    setAutoLockLocal(val)
    const ms = val === 'never' ? 999999 : parseInt(val) * 60000
    updateSettings({ autoLockTimeout: ms, autoLock: val !== 'never' })
  }

  const goBack = () => {
    if (page === 'main') {
      onBack()
    } else if (page === 'network-detail') {
      setSelectedNetwork(null)
      setEditingNetwork(null)
      setPage('network')
    } else {
      setPage('main')
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const Header = ({ title }: { title: string }) => (
    <div className="glass-strong sticky top-0 z-20">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-accent/50"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold">{title}</h1>
        </div>
      </div>
    </div>
  )

  // ── Menu item ─────────────────────────────────────────────────────────────
  const MenuItem = ({
    icon: Icon,
    label,
    description,
    onClick,
    value,
    danger,
    gradient,
  }: {
    icon: React.ElementType
    label: string
    description?: string
    onClick?: () => void
    value?: string
    danger?: boolean
    gradient?: string
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/30 transition-all text-left group"
    >
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          danger
            ? 'bg-red-500/10 text-red-500'
            : gradient
              ? `bg-gradient-to-br ${gradient} text-white`
              : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${danger ? 'text-red-500' : ''}`}>{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground truncate">{description}</div>
        )}
      </div>
      {value && (
        <span className="text-xs text-muted-foreground shrink-0">{value}</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
    </button>
  )

  // ── Toggle item ───────────────────────────────────────────────────────────
  const ToggleItem = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string
    description?: string
    checked: boolean
    onChange: (v: boolean) => void
  }) => (
    <div className="flex items-center justify-between p-3 rounded-xl">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground">{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5.5 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
        style={{ width: 40, height: 22 }}
      >
        <div
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[20px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )

  // ── Select item ───────────────────────────────────────────────────────────
  const SelectItem = ({
    label,
    selected,
    onClick,
  }: {
    label: string
    selected: boolean
    onClick: () => void
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
        selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent/30'
      }`}
    >
      <span className={`text-sm ${selected ? 'font-semibold text-primary' : ''}`}>{label}</span>
      {selected && <Check className="h-4 w-4 text-primary" />}
    </button>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Main ──────────────────────────────────────────────────────────────────
  if (page === 'main') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Settings" />
        <div className="px-4 py-3 space-y-2">
          {/* General section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                General
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                <MenuItem
                  icon={Users}
                  label="Accounts"
                  description="Manage accounts & addresses"
                  value={`${allWallets.length} account${allWallets.length !== 1 ? 's' : ''}`}
                  onClick={() => setPage('wallets')}
                  gradient="from-primary to-primary/60"
                />
                <MenuItem
                  icon={Palette}
                  label="Theme"
                  description="Appearance & color scheme"
                  value={THEME_PREVIEWS[(theme as ThemeValue) || 'dark']?.label ?? 'QRDX Purple Dark'}
                  onClick={() => setPage('theme')}
                  gradient="from-violet-500 to-pink-500"
                />
                <MenuItem
                  icon={Globe}
                  label="Language"
                  description="Display language"
                  value={LANGUAGES.find(l => l.code === language)?.label}
                  onClick={() => setPage('language')}
                  gradient="from-blue-500 to-cyan-500"
                />
                <MenuItem
                  icon={DollarSign}
                  label="Currency"
                  description="Default fiat currency"
                  value={currency}
                  onClick={() => setPage('currency')}
                  gradient="from-green-500 to-emerald-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Wallet Features section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Wallet Features
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                {/* Smart Wallet - Coming Soon */}
                <div className="relative">
                  <button
                    onClick={() => setPage('smart-wallet')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left opacity-50 cursor-default"
                  >
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-purple-500/40 to-pink-500/40 text-white/60">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Smart Wallet</span>
                        <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                          Coming Soon
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground/60 truncate">Account abstraction & gasless txns</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  </button>
                </div>
                <MenuItem
                  icon={BookUser}
                  label="Address Book"
                  description="Saved addresses & contacts"
                  value={`${addressBook.length} contacts`}
                  onClick={() => setPage('address-book')}
                  gradient="from-cyan-500 to-blue-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Security section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Security & Privacy
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                <MenuItem
                  icon={Shield}
                  label="Security"
                  description="Auto-lock, biometrics & backup"
                  onClick={() => setPage('security')}
                  gradient="from-amber-500 to-orange-500"
                />
                <MenuItem
                  icon={Bell}
                  label="Notifications"
                  description="Transaction & price alerts"
                  onClick={() => setPage('notifications')}
                  gradient="from-red-500 to-rose-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Network & Web3 section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Network & Web3
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                <MenuItem
                  icon={Monitor}
                  label="Networks"
                  description="Manage RPC endpoints"
                  value="QRDX Mainnet"
                  onClick={() => setPage('network')}
                  gradient="from-teal-500 to-emerald-500"
                />
                <MenuItem
                  icon={Link}
                  label="Connected Sites"
                  description="Manage dApp connections"
                  value={`${connectedSites.length} sites`}
                  onClick={() => setPage('connected-sites')}
                  gradient="from-blue-500 to-indigo-500"
                />
                <MenuItem
                  icon={Code}
                  label="Injected APIs"
                  description="Web3 provider & QRDX API"
                  value={`${injectedApis.filter(a => a.enabled).length}/${injectedApis.length} active`}
                  onClick={() => setPage('injected-apis')}
                  gradient="from-orange-500 to-amber-500"
                />
              </CardContent>
            </Card>
          </div>

          {/* About section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                About
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5">
                <MenuItem
                  icon={Info}
                  label="About QRDX Wallet"
                  description="v1.0.0 · Quantum-resistant"
                  onClick={() => setPage('about')}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  if (page === 'wallets') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Accounts" />
        <div className="px-4 py-3 space-y-3">
          {/* Account list */}
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              {allWallets.map((acct) => {
                const isActive = acct.id === currentWallet?.id
                return (
                  <button
                    key={acct.id}
                    onClick={async () => {
                      if (!isActive) await switchWallet(acct.id)
                    }}
                    className={`w-full p-3 rounded-xl transition-all text-left ${
                      isActive
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-accent/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm shrink-0">
                        <span className="text-white font-bold text-xs">
                          {acct.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold">{acct.name}</span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-semibold">
                              Active
                            </span>
                          )}
                        </div>
                        {/* Address pair */}
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-[9px] font-semibold bg-blue-500/15 text-blue-400 px-1 py-0.5 rounded">
                            ETH
                          </span>
                          <span className="text-muted-foreground font-mono truncate">
                            {(acct.ethAddress || acct.address).slice(0, 8)}...{(acct.ethAddress || acct.address).slice(-4)}
                          </span>
                        </div>
                        {acct.pqAddress && (
                          <div className="flex items-center gap-1.5 text-[10px] mt-1">
                            <span className="text-[9px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                              PQ
                            </span>
                            <span className="text-muted-foreground font-mono truncate">
                              {acct.pqAddress.slice(0, 8)}...{acct.pqAddress.slice(-4)}
                            </span>
                          </div>
                        )}
                      </div>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          {/* Add Account Button */}
          <Button
            onClick={() => { resetAddAccount(); setShowAddAccount(true) }}
            className="w-full h-11 font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>

          {/* Add Account — Multi-Step Dialog */}
          {showAddAccount && (
            <Card className="glass border-primary/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">

                {/* ── Step: Form (name, password, mode) ─────────────────── */}
                {addCreateStep === 'form' && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold">Add Account</h3>
                      <button onClick={resetAddAccount}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>

                    {/* Create / Import tabs */}
                    <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
                      <button
                        onClick={() => setAddAccountMode('create')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${addAccountMode === 'create' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Create New
                      </button>
                      <button
                        onClick={() => setAddAccountMode('import')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${addAccountMode === 'import' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Import
                      </button>
                    </div>

                    <input
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="Account name"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="password"
                      value={newAccountPassword}
                      onChange={(e) => setNewAccountPassword(e.target.value)}
                      placeholder="Wallet password"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />

                    {addAccountMode === 'import' && (
                      <>
                        <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
                          <button
                            onClick={() => setAddImportMode('key')}
                            className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${addImportMode === 'key' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                          >
                            Private Key
                          </button>
                          <button
                            onClick={() => setAddImportMode('mnemonic')}
                            className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${addImportMode === 'mnemonic' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                          >
                            Recovery Phrase
                          </button>
                        </div>
                        {addImportMode === 'key' ? (
                          <input
                            type="password"
                            value={newAccountKey}
                            onChange={(e) => setNewAccountKey(e.target.value)}
                            placeholder="Private key (hex)"
                            className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        ) : (
                          <textarea
                            value={addImportMnemonic}
                            onChange={(e) => setAddImportMnemonic(e.target.value)}
                            placeholder="Enter 12 or 24-word recovery phrase"
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-background/60 border border-border/50 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                          />
                        )}
                      </>
                    )}

                    {addAccountError && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {addAccountError}
                      </p>
                    )}

                    {addAccountMode === 'create' ? (
                      <Button
                        onClick={handleAddAccountNextToMnemonic}
                        disabled={!newAccountName || !newAccountPassword}
                        className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                      >
                        Continue
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleAddAccount}
                        disabled={addAccountLoading || !newAccountName || !newAccountPassword || (addImportMode === 'key' ? !newAccountKey.trim() : !addImportMnemonic.trim())}
                        className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                      >
                        {addAccountLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                        Import
                      </Button>
                    )}
                  </>
                )}

                {/* ── Step: Mnemonic Display ─────────────────────────────── */}
                {addCreateStep === 'mnemonic-display' && (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => setAddCreateStep('form')}
                        className="h-7 w-7 rounded-md bg-muted/80 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold">Recovery Phrase</h3>
                        <p className="text-[10px] text-muted-foreground">Write down these 12 words in order</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex gap-1">
                      <div className="h-1 flex-1 rounded-full bg-primary" />
                      <div className="h-1 flex-1 rounded-full bg-primary/30" />
                      <div className="h-1 flex-1 rounded-full bg-muted" />
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                        <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        <span><span className="font-semibold text-foreground">Never share this phrase.</span> Anyone with these words can access your account.</span>
                      </p>
                    </div>

                    {!addMnemonicRevealed ? (
                      <button
                        onClick={() => setAddMnemonicRevealed(true)}
                        className="w-full py-8 rounded-lg bg-muted/20 border border-border/30 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="h-5 w-5" />
                        <span className="text-xs font-medium">Tap to reveal</span>
                        <span className="text-[9px] text-muted-foreground/60">Make sure no one is watching</span>
                      </button>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          {addMnemonicWords.map((word, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-background/60 border border-border/30">
                              <span className="text-[9px] text-muted-foreground/50 font-mono w-3.5 text-right shrink-0">{i + 1}</span>
                              <span className="text-[11px] font-mono font-medium">{word}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(addMnemonic)
                            setAddMnemonicCopied(true)
                            setTimeout(() => setAddMnemonicCopied(false), 3000)
                          }}
                          className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
                        >
                          {addMnemonicCopied
                            ? <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Copied!</span></>
                            : <><Copy className="h-3 w-3" />Copy to clipboard</>
                          }
                        </button>
                      </>
                    )}

                    <Button
                      onClick={() => { setAddCreateStep('mnemonic-confirm'); setAddAccountError(null) }}
                      disabled={!addMnemonicRevealed}
                      className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                    >
                      I&apos;ve Written It Down
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </>
                )}

                {/* ── Step: Mnemonic Confirm ─────────────────────────────── */}
                {addCreateStep === 'mnemonic-confirm' && (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => setAddCreateStep('mnemonic-display')}
                        className="h-7 w-7 rounded-md bg-muted/80 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold">Confirm Phrase</h3>
                        <p className="text-[10px] text-muted-foreground">Verify you saved your recovery phrase</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex gap-1">
                      <div className="h-1 flex-1 rounded-full bg-primary" />
                      <div className="h-1 flex-1 rounded-full bg-primary" />
                      <div className="h-1 flex-1 rounded-full bg-primary/30" />
                    </div>

                    <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                        <ShieldCheck className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        Enter the correct word for each position to confirm your backup.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {addConfirmIndices.map((idx) => {
                        const isCorrect = addConfirmWords[idx]?.trim().toLowerCase() === addMnemonicWords[idx]
                        const hasValue = (addConfirmWords[idx]?.trim().length ?? 0) > 0
                        return (
                          <div key={idx}>
                            <label className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                              Word #{idx + 1}
                              {hasValue && (
                                isCorrect
                                  ? <Check className="h-2.5 w-2.5 text-green-500" />
                                  : <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                              )}
                            </label>
                            <input
                              type="text"
                              value={addConfirmWords[idx] ?? ''}
                              onChange={(e) => setAddConfirmWords(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder={`Enter word #${idx + 1}`}
                              autoComplete="off"
                              className={`w-full h-9 px-3 rounded-lg bg-background/60 border text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all ${
                                hasValue
                                  ? isCorrect ? 'border-green-500/50' : 'border-red-500/50'
                                  : 'border-border/50'
                              }`}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {addAccountError && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {addAccountError}
                      </p>
                    )}

                    <Button
                      onClick={handleAddAccountConfirmCreate}
                      disabled={addAccountLoading || !addAllConfirmCorrect}
                      className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                    >
                      {addAccountLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                      ) : (
                        <><Shield className="h-4 w-4 mr-2" />Create Account</>
                      )}
                    </Button>
                  </>
                )}

                {/* ── Step: Success ──────────────────────────────────────── */}
                {addCreateStep === 'success' && (
                  <div className="flex flex-col items-center text-center py-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-3 shadow-md shadow-green-500/20">
                      <Check className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-sm font-bold mb-1">Account Created!</h3>
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Your new quantum-resistant account is ready.
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-[9px] font-semibold text-primary">secp256k1</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-[9px] font-semibold text-primary">ML-DSA-65</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-[9px] font-semibold text-primary">AES-256</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Key}
                label="Export Private Key"
                description="View your private key"
                onClick={() => { setShowExportKey(true); setExportedKey(null); setExportError(null); setExportPassword('') }}
              />
              <MenuItem
                icon={Shield}
                label="Export Recovery Phrase"
                description="View your 12-word mnemonic"
                onClick={() => { setShowExportMnemonic(true); setExportedMnemonic(null); setMnemonicExportError(null); setMnemonicExportPassword('') }}
              />
              <MenuItem
                icon={FileJson}
                label="Export as JSON Keystore"
                description="Download encrypted keystore file"
                onClick={() => { setShowExportJSON(true); setJsonExportError(null); setJsonExportPassword('') }}
              />
              <MenuItem
                icon={Upload}
                label="Import JSON Keystore"
                description="Import from an encrypted keystore"
                onClick={() => { setShowImportJSON(true); setImportKeystoreError(null); setImportKeystoreFile(null); setImportKeystoreFileName('') }}
              />
              <MenuItem
                icon={Fingerprint}
                label="Export PQ Key Pair"
                description="Dilithium / SPHINCS+ keys"
                onClick={() => { setShowExportKey(true); setExportedKey(null); setExportError(null); setExportPassword('') }}
              />
              <MenuItem
                icon={Trash2}
                label="Remove Account"
                description="This cannot be undone"
                onClick={() => { setShowRemoveConfirm(true); setRemoveError(null); setRemovePassword('') }}
                danger
              />
            </CardContent>
          </Card>

          {/* Export Key Dialog */}
          {showExportKey && (
            <Card className="glass border-amber-500/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-amber-400">Export Private Key</h3>
                  <button onClick={() => { setShowExportKey(false); setExportedKey(null) }}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                {!exportedKey ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Enter your password to reveal the private key. Never share this with anyone.
                    </p>
                    <input
                      type="password"
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {exportError && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {exportError}
                      </p>
                    )}
                    <Button
                      onClick={handleExportKey}
                      disabled={exportLoading || !exportPassword}
                      className="w-full h-9 font-medium bg-amber-600 hover:bg-amber-500"
                    >
                      {exportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                      Reveal Key
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                          ETH Private Key
                        </label>
                        <div className="mt-1 p-2 rounded-lg bg-red-500/5 border border-red-500/20 font-mono text-[11px] text-red-400 break-all select-all">
                          0x{exportedKey.ethPrivateKey}
                        </div>
                      </div>
                      {exportedKey.pqSeed && (
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            PQ Seed
                          </label>
                          <div className="mt-1 p-2 rounded-lg bg-primary/5 border border-primary/20 font-mono text-[11px] text-primary break-all select-all">
                            {exportedKey.pqSeed}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Never share your private key. Anyone with it can steal your funds.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Export Mnemonic Dialog */}
          {showExportMnemonic && (
            <Card className="glass border-primary/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-primary">Export Recovery Phrase</h3>
                  <button onClick={() => { setShowExportMnemonic(false); setExportedMnemonic(null) }}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                {!exportedMnemonic ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Enter your password to reveal your 12-word recovery phrase.
                    </p>
                    <input
                      type="password"
                      value={mnemonicExportPassword}
                      onChange={(e) => setMnemonicExportPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {mnemonicExportError && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {mnemonicExportError}
                      </p>
                    )}
                    <Button
                      onClick={handleExportMnemonic}
                      disabled={mnemonicExportLoading || !mnemonicExportPassword}
                      className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                    >
                      {mnemonicExportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                      Reveal Phrase
                    </Button>
                  </>
                ) : (
                  <>
                    <Card className="bg-background/60 border-primary/20">
                      <CardContent className="p-3">
                        <div className="grid grid-cols-3 gap-1.5">
                          {exportedMnemonic.split(' ').map((word, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-muted/30 border border-border/30">
                              <span className="text-[9px] text-muted-foreground/50 font-mono w-3 text-right">{i + 1}</span>
                              <span className="text-[11px] font-mono font-medium">{word}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(exportedMnemonic)
                        setMnemonicCopied(true)
                        setTimeout(() => setMnemonicCopied(false), 3000)
                      }}
                      className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {mnemonicCopied
                        ? <><Check className="h-3.5 w-3.5 text-green-500" /><span className="text-green-500">Copied!</span></>
                        : <><Copy className="h-3.5 w-3.5" />Copy to clipboard</>
                      }
                    </button>
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Never share your recovery phrase. Store it safely offline.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Export JSON Keystore Dialog */}
          {showExportJSON && (
            <Card className="glass border-primary/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">Export JSON Keystore</h3>
                  <button onClick={() => setShowExportJSON(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Enter your wallet password to export an Ethereum V3 compatible JSON keystore file.
                  The exported file will include QRDX post-quantum key extensions.
                </p>
                <input
                  type="password"
                  value={jsonExportPassword}
                  onChange={(e) => setJsonExportPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {jsonExportError && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {jsonExportError}
                  </p>
                )}
                <Button
                  onClick={handleExportKeystoreJSON}
                  disabled={jsonExportLoading || !jsonExportPassword}
                  className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                >
                  {jsonExportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Download Keystore
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Import JSON Keystore Dialog */}
          {showImportJSON && (
            <Card className="glass border-primary/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">Import JSON Keystore</h3>
                  <button onClick={() => setShowImportJSON(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Import an Ethereum V3 keystore file. You&apos;ll need the keystore password and your current wallet password.
                </p>

                {/* File upload */}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleKeystoreFileUpload}
                  className="hidden"
                  id="settings-keystore-upload"
                />
                <button
                  onClick={() => document.getElementById('settings-keystore-upload')?.click()}
                  className="w-full h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-background/30 flex flex-col items-center justify-center gap-1.5 transition-all"
                >
                  {importKeystoreFile ? (
                    <>
                      <FileJson className="h-5 w-5 text-green-500" />
                      <span className="text-[11px] font-medium text-green-500">{importKeystoreFileName}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">Select keystore file</span>
                    </>
                  )}
                </button>

                <input
                  type="text"
                  value={importKeystoreName}
                  onChange={(e) => setImportKeystoreName(e.target.value)}
                  placeholder="Account name (optional)"
                  className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  type="password"
                  value={importKeystorePassword}
                  onChange={(e) => setImportKeystorePassword(e.target.value)}
                  placeholder="Keystore password"
                  className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  type="password"
                  value={importKeystoreWalletPassword}
                  onChange={(e) => setImportKeystoreWalletPassword(e.target.value)}
                  placeholder="Your wallet password"
                  className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {importKeystoreError && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {importKeystoreError}
                  </p>
                )}
                <Button
                  onClick={handleImportKeystoreJSON}
                  disabled={importKeystoreLoading || !importKeystoreFile || !importKeystorePassword || !importKeystoreWalletPassword}
                  className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                >
                  {importKeystoreLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import Keystore
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Remove Account Dialog */}
          {showRemoveConfirm && (
            <Card className="glass border-red-500/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-red-400">Remove Account</h3>
                  <button onClick={() => setShowRemoveConfirm(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This will permanently remove <strong>{currentWallet?.name}</strong> from this device.
                  Make sure you have backed up your private key first.
                </p>
                <input
                  type="password"
                  value={removePassword}
                  onChange={(e) => setRemovePassword(e.target.value)}
                  placeholder="Enter password to confirm"
                  className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {removeError && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {removeError}
                  </p>
                )}
                <Button
                  onClick={handleRemoveAccount}
                  disabled={removeLoading || !removePassword || allWallets.length <= 1}
                  variant="destructive"
                  className="w-full h-9 font-medium"
                >
                  {removeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Remove Permanently
                </Button>
                {allWallets.length <= 1 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Cannot remove the last account. Use &quot;Reset Wallet&quot; in Security settings instead.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  if (page === 'theme') {
    const currentTheme = (theme as ThemeValue) || 'dark'

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Theme" />
        <div className="px-4 py-3 space-y-3">
          <div className="px-1 mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Color Theme
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {THEME_OPTIONS.map((opt) => {
              const preview = THEME_PREVIEWS[opt.value]
              const isActive = currentTheme === opt.value

              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`group relative rounded-xl overflow-hidden border-2 transition-all ${
                    isActive
                      ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'border-border/50 hover:border-border'
                  }`}
                >
                  {/* Mini preview */}
                  <div
                    className="p-2.5 pb-2"
                    style={{ backgroundColor: preview.bg }}
                  >
                    {/* Mini header bar */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <div
                        className="h-3 w-3 rounded"
                        style={{ backgroundColor: preview.accent }}
                      />
                      <div
                        className="h-1.5 w-10 rounded-full"
                        style={{ backgroundColor: preview.text, opacity: 0.3 }}
                      />
                    </div>
                    {/* Mini card */}
                    <div
                      className="rounded-md p-1.5 mb-1.5"
                      style={{
                        backgroundColor: preview.card,
                        border: `1px solid ${preview.text}11`,
                      }}
                    >
                      <div
                        className="h-1.5 w-12 rounded-full mb-1"
                        style={{ backgroundColor: preview.text, opacity: 0.2 }}
                      />
                      <div
                        className="h-2 w-16 rounded-full"
                        style={{ backgroundColor: preview.text, opacity: 0.5 }}
                      />
                    </div>
                    {/* Mini action buttons */}
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="flex-1 h-3 rounded"
                          style={{ backgroundColor: preview.accent, opacity: i === 1 ? 0.8 : 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Label */}
                  <div
                    className="px-2.5 py-2 flex items-center justify-between"
                    style={{ backgroundColor: preview.bg }}
                  >
                    <div className="text-left">
                      <div
                        className="text-[11px] font-semibold"
                        style={{ color: preview.text }}
                      >
                        {opt.label}
                      </div>
                      <div
                        className="text-[9px]"
                        style={{ color: preview.text, opacity: 0.5 }}
                      >
                        {opt.description}
                      </div>
                    </div>
                    {isActive && (
                      <div className="h-5 w-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: preview.accent }}
                      >
                        <Check className="h-3 w-3" style={{ color: preview.bg }} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="px-1 mt-1">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Choose between QRDX branded themes with purple accents, or clean
              monochrome themes inspired by the QRDX website. Theme applies to all
              extension views.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Language ──────────────────────────────────────────────────────────────
  if (page === 'language') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Language" />
        <div className="px-4 py-3">
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              {LANGUAGES.map((lang) => (
                <SelectItem
                  key={lang.code}
                  label={lang.label}
                  selected={language === lang.code}
                  onClick={() => handleSetLanguage(lang.code)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ── Currency ──────────────────────────────────────────────────────────────
  if (page === 'currency') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Currency" />
        <div className="px-4 py-3">
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              {CURRENCIES.map((cur) => (
                <SelectItem
                  key={cur.code}
                  label={`${cur.symbol} ${cur.label} (${cur.code})`}
                  selected={currency === cur.code}
                  onClick={() => handleSetCurrency(cur.code)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ── Security ──────────────────────────────────────────────────────────────
  if (page === 'security') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Security" />
        <div className="px-4 py-3 space-y-3">
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              <div className="p-3 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">Auto-Lock Timer</div>
                    <div className="text-[11px] text-muted-foreground">
                      Lock wallet after inactivity
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {[
                    { value: '1', label: '1m' },
                    { value: '5', label: '5m' },
                    { value: '15', label: '15m' },
                    { value: '30', label: '30m' },
                    { value: 'never', label: 'Never' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSetAutoLock(opt.value)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        autoLock === opt.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent/30 text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <ToggleItem
                label="Biometric Unlock"
                description="Use fingerprint or face ID"
                checked={biometrics}
                onChange={setBiometrics}
              />
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Lock}
                label="Change Password"
                description="Update your wallet password"
                onClick={() => { setShowChangePassword(true); setChangePasswordError(null); setChangePasswordSuccess(false); setOldPasswordInput(''); setNewPasswordInput(''); setConfirmNewPassword('') }}
              />
              <MenuItem
                icon={Key}
                label="View Recovery Phrase"
                description="Requires password verification"
                onClick={() => { setShowExportKey(true); setExportedKey(null); setExportError(null); setExportPassword(''); setPage('wallets') }}
              />
            </CardContent>
          </Card>

          {/* Change Password Dialog */}
          {showChangePassword && (
            <Card className="glass border-primary/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold">Change Password</h3>
                  <button onClick={() => setShowChangePassword(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                {changePasswordSuccess ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm font-medium py-2">
                    <Check className="h-4 w-4" /> Password changed successfully!
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      value={oldPasswordInput}
                      onChange={(e) => setOldPasswordInput(e.target.value)}
                      placeholder="Current password"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="New password (min 8 characters)"
                      className="w-full h-9 px-3 rounded-lg bg-background/60 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className={`w-full h-9 px-3 rounded-lg bg-background/60 border text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 ${
                        confirmNewPassword && newPasswordInput !== confirmNewPassword
                          ? 'border-red-500'
                          : 'border-border/50'
                      }`}
                    />
                    {confirmNewPassword && newPasswordInput !== confirmNewPassword && (
                      <p className="text-[10px] text-red-500">Passwords do not match</p>
                    )}
                    {changePasswordError && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {changePasswordError}
                      </p>
                    )}
                    <Button
                      onClick={handleChangePassword}
                      disabled={changePasswordLoading || !oldPasswordInput || !newPasswordInput || newPasswordInput.length < 8 || newPasswordInput !== confirmNewPassword}
                      className="w-full h-9 font-medium bg-primary hover:bg-primary/90"
                    >
                      {changePasswordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                      Change Password
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Trash2}
                label="Reset Wallet"
                description="Erase all data from this device"
                onClick={() => setShowResetConfirm(true)}
                danger
              />
            </CardContent>
          </Card>

          {/* Reset Wallet Confirmation */}
          {showResetConfirm && (
            <Card className="glass border-red-500/30 animate-slide-up">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-red-400">Reset Wallet</h3>
                  <button onClick={() => setShowResetConfirm(false)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This will permanently erase all wallet data from this device. Make sure you have
                  backed up all private keys first. This action <strong>cannot</strong> be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 h-9 font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleResetWallet}
                    className="flex-1 h-9 font-medium"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Erase Everything
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  if (page === 'notifications') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Notifications" />
        <div className="px-4 py-3">
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              <ToggleItem
                label="Transactions"
                description="Incoming & outgoing transaction alerts"
                checked={notifications.transactions}
                onChange={(v) => setNotifications({ ...notifications, transactions: v })}
              />
              <ToggleItem
                label="Price Alerts"
                description="Significant price movements"
                checked={notifications.priceAlerts}
                onChange={(v) => setNotifications({ ...notifications, priceAlerts: v })}
              />
              <ToggleItem
                label="Security Alerts"
                description="Suspicious activity warnings"
                checked={notifications.securityAlerts}
                onChange={(v) => setNotifications({ ...notifications, securityAlerts: v })}
              />
              <ToggleItem
                label="News & Updates"
                description="Product updates & announcements"
                checked={notifications.marketing}
                onChange={(v) => setNotifications({ ...notifications, marketing: v })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ── Networks ──────────────────────────────────────────────────────────────
  if (page === 'network') {
    const filtered = NETWORKS.filter((n) => (testnetMode ? n.isTestnet : !n.isTestnet))

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Networks" />
        <div className="px-4 py-3 space-y-3">
          {/* Testnet Mode Toggle */}
          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <button
                onClick={() => setTestnetMode(!testnetMode)}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <Globe className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium">Testnet Mode</div>
                    <div className="text-[10px] text-muted-foreground">
                      {testnetMode ? 'Showing test networks' : 'Showing main networks'}
                    </div>
                  </div>
                </div>
                {testnetMode ? (
                  <ToggleRight className="h-6 w-6 text-primary" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                )}
              </button>
            </CardContent>
          </Card>

          {/* Network List */}
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              {filtered.map((net) => {
                const isActiveNet = net.id === activeChain.id
                return (
                  <button
                    key={net.id}
                    onClick={() => {
                      setActiveChain(net.id)
                    }}
                    onDoubleClick={() => {
                      setSelectedNetwork(net)
                      setEditingNetwork({ ...net })
                      setPage('network-detail')
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all w-full text-left ${
                      isActiveNet ? 'bg-primary/10 border border-primary/30' : 'hover:bg-accent/30'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isActiveNet ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                    }`}>
                      {net.symbol.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{net.name}</span>
                        {isActiveNet && (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Chain ID: {net.chainId} · {net.symbol}
                      </div>
                    </div>
                    {isActiveNet ? (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full h-10 font-medium glass hover:bg-accent/50 hover:border-primary/30"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Network
          </Button>
        </div>
      </div>
    )
  }

  // ── Network Detail / Edit ─────────────────────────────────────────────────
  if (page === 'network-detail' && editingNetwork) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title={selectedNetwork?.name ?? 'Network'} />
        <div className="px-4 py-3 space-y-3">
          {/* Network Icon & Name */}
          <div className="flex flex-col items-center py-3 animate-fade-in">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center text-lg font-bold text-primary shadow-lg shadow-primary/10 mb-2">
              {editingNetwork.symbol.slice(0, 3)}
            </div>
            <p className="text-xs text-muted-foreground">
              {editingNetwork.isTestnet ? 'Testnet' : 'Mainnet'}
            </p>
          </div>

          {/* Editable Fields */}
          <Card className="glass border-border/50">
            <CardContent className="p-3 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Network Name
                </label>
                <input
                  type="text"
                  value={editingNetwork.name}
                  onChange={(e) => setEditingNetwork({ ...editingNetwork, name: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-background/60 border border-border/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  RPC URL
                </label>
                <input
                  type="text"
                  value={editingNetwork.rpc}
                  onChange={(e) => setEditingNetwork({ ...editingNetwork, rpc: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-background/60 border border-border/50 px-3 py-2 text-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Chain ID
                  </label>
                  <input
                    type="number"
                    value={editingNetwork.chainId}
                    onChange={(e) =>
                      setEditingNetwork({ ...editingNetwork, chainId: parseInt(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg bg-background/60 border border-border/50 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Currency Symbol
                  </label>
                  <input
                    type="text"
                    value={editingNetwork.symbol}
                    onChange={(e) => setEditingNetwork({ ...editingNetwork, symbol: e.target.value })}
                    className="mt-1 w-full rounded-lg bg-background/60 border border-border/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Block Explorer URL
                </label>
                <input
                  type="text"
                  value={editingNetwork.explorer}
                  onChange={(e) => setEditingNetwork({ ...editingNetwork, explorer: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-background/60 border border-border/50 px-3 py-2 text-sm font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </CardContent>
          </Card>

          <Button className="w-full h-10 font-medium bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>

          <Button
            variant="outline"
            className="w-full h-10 font-medium glass text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove Network
          </Button>
        </div>
      </div>
    )
  }

  // ── Connected Sites ───────────────────────────────────────────────────────
  if (page === 'connected-sites') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Connected Sites" />
        <div className="px-4 py-3 space-y-3">
          {connectedSites.length === 0 ? (
            <div className="flex flex-col items-center py-10 animate-fade-in">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                <Unplug className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No connected sites</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Connect to a dApp to see it here
              </p>
            </div>
          ) : (
            <>
              <div className="px-1">
                <p className="text-[11px] text-muted-foreground">
                  These sites can view your account addresses and request transactions.
                </p>
              </div>
              <Card className="glass border-border/50">
                <CardContent className="p-1.5 space-y-0.5">
                  {connectedSites.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/30 transition-all group"
                    >
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 uppercase">
                        {site.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{site.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {site.origin}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {site.permissions.length} permission{site.permissions.length !== 1 ? 's' : ''} · Connected {site.connectedAt}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setConnectedSites(connectedSites.filter((s) => s.id !== site.id))
                        }
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Disconnect"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Button
                variant="outline"
                onClick={() => setConnectedSites([])}
                className="w-full h-10 font-medium glass text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
              >
                <Unplug className="h-4 w-4 mr-2" />
                Disconnect All Sites
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Injected APIs ─────────────────────────────────────────────────────────
  if (page === 'injected-apis') {
    const apiIcon = (type: InjectedApi['icon']) => {
      switch (type) {
        case 'ethereum':
          return <Blocks className="h-4 w-4 text-blue-400" />
        case 'qrdx':
          return <Zap className="h-4 w-4 text-primary" />
        case 'legacy':
          return <Code className="h-4 w-4 text-amber-400" />
      }
    }

    const toggleApi = (id: string) => {
      setInjectedApis(
        injectedApis.map((api) =>
          api.id === id ? { ...api, enabled: !api.enabled } : api
        )
      )
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Injected APIs" />
        <div className="px-4 py-3 space-y-3">
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">
              Control which Web3 APIs are injected into web pages. Disabling an API may break
              compatibility with some dApps.
            </p>
          </div>

          {/* Ethereum / EVM APIs */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Ethereum / EVM
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                {injectedApis
                  .filter((api) => api.icon === 'ethereum' || api.icon === 'legacy')
                  .map((api) => (
                    <div
                      key={api.id}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    >
                      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                        {apiIcon(api.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{api.name}</span>
                          {api.icon === 'legacy' && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                              Deprecated
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{api.description}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                          {api.namespace}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleApi(api.id)}
                        className="shrink-0"
                      >
                        {api.enabled ? (
                          <ToggleRight className="h-6 w-6 text-primary" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          {/* QRDX APIs */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                QRDX / Post-Quantum
              </span>
            </div>
            <Card className="glass border-border/50">
              <CardContent className="p-1.5 space-y-0.5">
                {injectedApis
                  .filter((api) => api.icon === 'qrdx')
                  .map((api) => (
                    <div
                      key={api.id}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {apiIcon(api.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{api.name}</div>
                        <div className="text-[10px] text-muted-foreground">{api.description}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                          {api.namespace}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleApi(api.id)}
                        className="shrink-0"
                      >
                        {api.enabled ? (
                          <ToggleRight className="h-6 w-6 text-primary" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          {/* Warning note */}
          <div className="px-1 py-2">
            <div className="flex gap-2 items-start text-[10px] text-muted-foreground/70">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Changes take effect on the next page load. The EIP-1193 provider is required for
                most Ethereum dApps. Only disable it if you know what you&apos;re doing.
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Smart Wallet (Coming Soon) ────────────────────────────────────────────
  if (page === 'smart-wallet') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Smart Wallet" />
        <div className="px-4 py-3 space-y-4">
          <div className="flex flex-col items-center py-8 animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shadow-lg mb-3 opacity-60">
              <Sparkles className="h-8 w-8 text-primary/50" />
            </div>
            <span className="text-[10px] bg-primary/15 text-primary px-2.5 py-1 rounded-full font-semibold mb-3">
              Coming Soon
            </span>
            <h2 className="text-base font-bold text-muted-foreground">Smart Wallet</h2>
            <p className="text-[11px] text-muted-foreground/60 text-center mt-1 max-w-[260px] leading-relaxed">
              ERC-4337 account abstraction with gasless transactions, social recovery, session keys, and batch operations.
            </p>
          </div>

          <Card className="glass border-border/50 opacity-50">
            <CardContent className="p-1.5 space-y-0.5">
              <div className="flex items-center gap-3 p-3 rounded-xl">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground/60">Gasless Transactions</div>
                  <div className="text-[10px] text-muted-foreground/40">Sponsor gas fees via paymasters</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Key className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground/60">Social Recovery</div>
                  <div className="text-[10px] text-muted-foreground/40">Recover wallet with trusted guardians</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Shield className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground/60">Session Keys</div>
                  <div className="text-[10px] text-muted-foreground/40">Approve dApps for limited-scope access</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Blocks className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground/60">Batch Operations</div>
                  <div className="text-[10px] text-muted-foreground/40">Bundle multiple transactions in one</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="px-1 py-2 text-center">
            <p className="text-[10px] text-muted-foreground/50">
              Smart wallet features are under development and will be available in a future update.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Address Book ──────────────────────────────────────────────────────────
  if (page === 'address-book') {
    const favorites = addressBook.filter((c) => c.isFavorite)
    const others = addressBook.filter((c) => !c.isFavorite)

    const toggleFavorite = (id: string) => {
      setAddressBook(
        addressBook.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c))
      )
    }

    const removeContact = (id: string) => {
      setAddressBook(addressBook.filter((c) => c.id !== id))
    }

    const ContactRow = ({ contact }: { contact: AddressBookEntry }) => (
      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-accent/30 transition-all group">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {contact.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{contact.name}</span>
            <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
              contact.addressType === 'pq'
                ? 'bg-primary/15 text-primary'
                : 'bg-blue-500/15 text-blue-400'
            }`}>
              {contact.addressType === 'pq' ? 'PQ' : 'ETH'}
            </span>
            <span className="text-[9px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded-full">
              {contact.chain}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {contact.address}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={() => toggleFavorite(contact.id)}
            className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
              contact.isFavorite
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-muted-foreground hover:bg-accent/50'
            }`}
            title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={`h-3.5 w-3.5 ${contact.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
          <button
            onClick={() => removeContact(contact.id)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Address Book" />
        <div className="px-4 py-3 space-y-3">
          {addressBook.length === 0 ? (
            <div className="flex flex-col items-center py-10 animate-fade-in">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                <BookUser className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No saved contacts</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Add addresses you send to frequently
              </p>
            </div>
          ) : (
            <>
              {favorites.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-1 mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Favorites
                    </span>
                  </div>
                  <Card className="glass border-border/50">
                    <CardContent className="p-1.5 space-y-0.5">
                      {favorites.map((c) => (
                        <ContactRow key={c.id} contact={c} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {others.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-1 mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      All Contacts
                    </span>
                  </div>
                  <Card className="glass border-border/50">
                    <CardContent className="p-1.5 space-y-0.5">
                      {others.map((c) => (
                        <ContactRow key={c.id} contact={c} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}

          <Button
            variant="outline"
            className="w-full h-10 font-medium glass hover:bg-accent/50 hover:border-primary/30"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>
    )
  }

  // ── About ─────────────────────────────────────────────────────────────────
  if (page === 'about') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="About" />
        <div className="px-4 py-3 space-y-4">
          {/* Logo & version */}
          <div className="flex flex-col items-center py-4 animate-fade-in">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25 mb-3">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-lg font-bold">QRDX Wallet</h2>
            <p className="text-xs text-muted-foreground">Version 1.0.0</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Quantum-Resistant Digital Asset Security
            </p>
          </div>

          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              <MenuItem
                icon={ExternalLink}
                label="Website"
                description="qrdx.org"
                onClick={() => window.open('https://qrdx.org', '_blank')}
              />
              <MenuItem
                icon={ExternalLink}
                label="Block Explorer"
                description="explorer.qrdx.org"
                onClick={() => window.open('https://explorer.qrdx.org', '_blank')}
              />
              <MenuItem
                icon={ExternalLink}
                label="Documentation"
                description="docs.qrdx.org"
                onClick={() => window.open('https://docs.qrdx.org', '_blank')}
              />
              <MenuItem
                icon={ExternalLink}
                label="Source Code"
                description="Open source on GitHub"
                onClick={() => window.open('https://github.com/qrdx-org', '_blank')}
              />
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-muted-foreground px-4 leading-relaxed">
            © 2026 QRDX Foundation. Built with post-quantum cryptography
            for a secure decentralized future.
          </p>
        </div>
      </div>
    )
  }

  return null
}
