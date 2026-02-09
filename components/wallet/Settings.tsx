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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { THEME_OPTIONS, type ThemeValue } from '@/components/theme-provider'

interface SettingsProps {
  onBack: () => void
}

// ─── Mock data ──────────────────────────────────────────────────────────────
const MOCK_WALLETS = [
  { id: '1', name: 'Main Wallet', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', isActive: true },
  { id: '2', name: 'Trading', address: '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7', isActive: false },
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
}

const NETWORKS: Network[] = [
  // ── QRDX ──
  { id: 'qrdx-mainnet', name: 'QRDX Mainnet', rpc: 'https://rpc.qrdx.org', chainId: 7225, symbol: 'QRDX', explorer: 'https://explorer.qrdx.org', isTestnet: false },
  { id: 'qrdx-testnet', name: 'QRDX Testnet', rpc: 'https://testnet-rpc.qrdx.org', chainId: 7226, symbol: 'QRDX', explorer: 'https://testnet.explorer.qrdx.org', isTestnet: true },
  // ── Ethereum ──
  { id: 'eth-mainnet', name: 'Ethereum', rpc: 'https://eth.llamarpc.com', chainId: 1, symbol: 'ETH', explorer: 'https://etherscan.io', isTestnet: false },
  { id: 'eth-sepolia', name: 'Ethereum Sepolia', rpc: 'https://rpc.sepolia.org', chainId: 11155111, symbol: 'ETH', explorer: 'https://sepolia.etherscan.io', isTestnet: true },
  // ── Polygon ──
  { id: 'polygon-mainnet', name: 'Polygon', rpc: 'https://polygon-rpc.com', chainId: 137, symbol: 'POL', explorer: 'https://polygonscan.com', isTestnet: false },
  { id: 'polygon-amoy', name: 'Polygon Amoy', rpc: 'https://rpc-amoy.polygon.technology', chainId: 80002, symbol: 'POL', explorer: 'https://amoy.polygonscan.com', isTestnet: true },
  // ── Arbitrum ──
  { id: 'arb-mainnet', name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', chainId: 42161, symbol: 'ETH', explorer: 'https://arbiscan.io', isTestnet: false },
  { id: 'arb-sepolia', name: 'Arbitrum Sepolia', rpc: 'https://sepolia-rollup.arbitrum.io/rpc', chainId: 421614, symbol: 'ETH', explorer: 'https://sepolia.arbiscan.io', isTestnet: true },
  // ── Optimism ──
  { id: 'op-mainnet', name: 'Optimism', rpc: 'https://mainnet.optimism.io', chainId: 10, symbol: 'ETH', explorer: 'https://optimistic.etherscan.io', isTestnet: false },
  { id: 'op-sepolia', name: 'OP Sepolia', rpc: 'https://sepolia.optimism.io', chainId: 11155420, symbol: 'ETH', explorer: 'https://sepolia-optimistic.etherscan.io', isTestnet: true },
  // ── Base ──
  { id: 'base-mainnet', name: 'Base', rpc: 'https://mainnet.base.org', chainId: 8453, symbol: 'ETH', explorer: 'https://basescan.org', isTestnet: false },
  { id: 'base-sepolia', name: 'Base Sepolia', rpc: 'https://sepolia.base.org', chainId: 84532, symbol: 'ETH', explorer: 'https://sepolia.basescan.org', isTestnet: true },
  // ── Avalanche ──
  { id: 'avax-mainnet', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', chainId: 43114, symbol: 'AVAX', explorer: 'https://snowtrace.io', isTestnet: false },
  { id: 'avax-fuji', name: 'Avalanche Fuji', rpc: 'https://api.avax-test.network/ext/bc/C/rpc', chainId: 43113, symbol: 'AVAX', explorer: 'https://testnet.snowtrace.io', isTestnet: true },
  // ── BNB Chain ──
  { id: 'bsc-mainnet', name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', chainId: 56, symbol: 'BNB', explorer: 'https://bscscan.com', isTestnet: false },
  { id: 'bsc-testnet', name: 'BNB Testnet', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545', chainId: 97, symbol: 'BNB', explorer: 'https://testnet.bscscan.com', isTestnet: true },
  // ── Fantom ──
  { id: 'ftm-mainnet', name: 'Fantom Opera', rpc: 'https://rpc.ftm.tools', chainId: 250, symbol: 'FTM', explorer: 'https://ftmscan.com', isTestnet: false },
  // ── zkSync ──
  { id: 'zksync-mainnet', name: 'zkSync Era', rpc: 'https://mainnet.era.zksync.io', chainId: 324, symbol: 'ETH', explorer: 'https://explorer.zksync.io', isTestnet: false },
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
                  icon={Wallet}
                  label="Wallets"
                  description="Manage your wallets"
                  value={`${MOCK_WALLETS.length} wallets`}
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

          {/* Network section */}
          <div className="space-y-0.5">
            <div className="px-1 mb-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Network
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

  // ── Wallets ───────────────────────────────────────────────────────────────
  if (page === 'wallets') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Header title="Wallets" />
        <div className="px-4 py-3 space-y-3">
          <Card className="glass border-border/50">
            <CardContent className="p-1.5 space-y-0.5">
              {MOCK_WALLETS.map((wallet) => (
                <div
                  key={wallet.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    wallet.isActive
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-accent/30'
                  }`}
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-xs">
                      {wallet.address.slice(2, 4).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{wallet.name}</span>
                      {wallet.isActive && (
                        <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                    </div>
                  </div>
                  {wallet.isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            className="w-full h-11 font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Wallet
          </Button>

          <Card className="glass border-border/50">
            <CardContent className="p-1.5">
              <MenuItem
                icon={Key}
                label="Export Recovery Phrase"
                description="Back up your wallet"
                onClick={() => {}}
              />
              <MenuItem
                icon={Key}
                label="Export Private Key"
                description="For advanced users"
                onClick={() => {}}
              />
              <MenuItem
                icon={Trash2}
                label="Remove Wallet"
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
