'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { THEME_OPTIONS, type ThemeValue } from '@/components/theme-provider'
import { CHAIN_LIST, type ChainConfig, supportsWeb3, supportsPQ } from '@/src/core/chains'

interface SettingsProps {
  onBack: () => void
}

// ─── Mock data ──────────────────────────────────────────────────────────────
interface MockAccount {
  id: string
  name: string
  ethAddress: string
  pqAddress: string
  isActive: boolean
  avatar?: string
}

const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: '1',
    name: 'Account 1',
    ethAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    pqAddress: 'qr_8f3a91d2e6b5c047f1a2d3e4f5a6b7c8d9e0f1a2',
    isActive: true,
  },
  {
    id: '2',
    name: 'Trading',
    ethAddress: '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7',
    pqAddress: 'qr_4b7c2e91a5d8f3061c4e7a2b5d8f1c4e7a2b5d8f',
    isActive: false,
  },
  {
    id: '3',
    name: 'Hardware',
    ethAddress: '0x1234567890abcdef1234567890abcdef12345678',
    pqAddress: 'qr_1a2b3c4d5e6f708192a3b4c5d6e7f80a1b2c3d4e',
    isActive: false,
  },
]

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

  // Mock state
  const [language, setLanguage] = useState('en')
  const [currency, setCurrency] = useState('USD')
  const [notifications, setNotifications] = useState({
    transactions: true,
    priceAlerts: true,
    securityAlerts: true,
    marketing: false,
  })
  const [autoLock, setAutoLock] = useState('5')
  const [biometrics, setBiometrics] = useState(false)
  const [testnetMode, setTestnetMode] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null)
  const [editingNetwork, setEditingNetwork] = useState<Network | null>(null)
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>(MOCK_CONNECTED_SITES)
  const [injectedApis, setInjectedApis] = useState<InjectedApi[]>(DEFAULT_INJECTED_APIS)
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(MOCK_ADDRESS_BOOK)

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
                  value={`${MOCK_ACCOUNTS.length} accounts`}
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
              {MOCK_ACCOUNTS.map((acct) => (
                <div
                  key={acct.id}
                  className={`p-3 rounded-xl transition-all ${
                    acct.isActive
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
                        {acct.isActive && (
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
                          {acct.ethAddress.slice(0, 8)}...{acct.ethAddress.slice(-4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] mt-1">
                        <span className="text-[9px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                          PQ
                        </span>
                        <span className="text-muted-foreground font-mono truncate">
                          {acct.pqAddress.slice(0, 8)}...{acct.pqAddress.slice(-4)}
                        </span>
                      </div>
                    </div>
                    {acct.isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            className="w-full h-11 font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Key}
                label="Export Recovery Phrase"
                description="Back up your account"
                onClick={() => {}}
              />
              <MenuItem
                icon={Key}
                label="Export Private Key"
                description="For advanced users"
                onClick={() => {}}
              />
              <MenuItem
                icon={Fingerprint}
                label="Export PQ Key Pair"
                description="Dilithium / SPHINCS+ keys"
                onClick={() => {}}
              />
              <MenuItem
                icon={Trash2}
                label="Remove Account"
                description="This cannot be undone"
                onClick={() => {}}
                danger
              />
            </CardContent>
          </Card>
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
                  onClick={() => setLanguage(lang.code)}
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
                  onClick={() => setCurrency(cur.code)}
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
                      onClick={() => setAutoLock(opt.value)}
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
                onClick={() => {}}
              />
              <MenuItem
                icon={Key}
                label="View Recovery Phrase"
                description="Requires password verification"
                onClick={() => {}}
              />
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Trash2}
                label="Reset Wallet"
                description="Erase all data from this device"
                onClick={() => {}}
                danger
              />
            </CardContent>
          </Card>
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
              {filtered.map((net) => (
                <button
                  key={net.id}
                  onClick={() => {
                    setSelectedNetwork(net)
                    setEditingNetwork({ ...net })
                    setPage('network-detail')
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-accent/30 w-full text-left"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {net.symbol.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{net.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Chain ID: {net.chainId} · {net.symbol}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
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
