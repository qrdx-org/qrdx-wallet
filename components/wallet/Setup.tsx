'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import {
  Shield, Zap, Key, ChevronRight, ChevronLeft, Plus, Download,
  Loader2, Eye, EyeOff, AlertCircle, Copy, Check, FileJson, Upload,
  Lock, ShieldCheck, Fingerprint, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// ═══════════════════════════════════════════════════════════════════════════════
//  Setup Step Types
// ═══════════════════════════════════════════════════════════════════════════════

type SetupFlow = 'none' | 'create' | 'import'
type CreateStep = 'password' | 'mnemonic-display' | 'mnemonic-confirm' | 'success'
type ImportMode = 'mnemonic' | 'private-key' | 'json-keystore'

// ═══════════════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════════════

export function Setup() {
  const {
    initialize,
    createWalletFromMnemonic,
    importWallet,
    importFromKeystoreJSON,
    generateMnemonic,
  } = useWallet()

  // ── Top-level flow ──────────────────────────────────────────────────────
  const [flow, setFlow] = useState<SetupFlow>('none')
  const [createStep, setCreateStep] = useState<CreateStep>('password')
  const [importMode, setImportMode] = useState<ImportMode>('mnemonic')

  // ── Password state ──────────────────────────────────────────────────────
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [walletName, setWalletName] = useState('')

  // ── Mnemonic state ──────────────────────────────────────────────────────
  const [mnemonic, setMnemonic] = useState('')
  const [mnemonicCopied, setMnemonicCopied] = useState(false)
  const [mnemonicRevealed, setMnemonicRevealed] = useState(false)
  const [confirmWords, setConfirmWords] = useState<Record<number, string>>({})
  const [confirmIndices, setConfirmIndices] = useState<number[]>([])

  // ── Import state ────────────────────────────────────────────────────────
  const [importMnemonic, setImportMnemonic] = useState('')
  const [importPrivateKey, setImportPrivateKey] = useState('')
  const [importKeystoreFile, setImportKeystoreFile] = useState<any>(null)
  const [importKeystoreFileName, setImportKeystoreFileName] = useState('')
  const [importKeystorePassword, setImportKeystorePassword] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── UI state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────
  const passwordStrength = getPasswordStrength(password)
  const passwordsMatch = password === confirmPassword
  const canSetPassword = password.length >= 8 && passwordsMatch && walletName.trim().length > 0

  const mnemonicWords = useMemo(() => mnemonic.split(' ').filter(Boolean), [mnemonic])

  // ── Generate mnemonic when entering create flow ─────────────────────────
  const startCreateFlow = useCallback(() => {
    setFlow('create')
    setCreateStep('password')
    setMnemonic(generateMnemonic())
    setMnemonicRevealed(false)
    setMnemonicCopied(false)
    setConfirmWords({})
    setFormError(null)
  }, [generateMnemonic])

  // Pick 4 random indices for mnemonic confirmation
  useEffect(() => {
    if (mnemonicWords.length === 12 && confirmIndices.length === 0) {
      const indices: number[] = []
      while (indices.length < 4) {
        const i = Math.floor(Math.random() * 12)
        if (!indices.includes(i)) indices.push(i)
      }
      setConfirmIndices(indices.sort((a, b) => a - b))
    }
  }, [mnemonicWords.length, confirmIndices.length])

  const allConfirmWordsCorrect = useMemo(() => {
    return confirmIndices.every(
      (idx) => confirmWords[idx]?.trim().toLowerCase() === mnemonicWords[idx]
    )
  }, [confirmIndices, confirmWords, mnemonicWords])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handlePasswordNext = () => {
    if (!canSetPassword) return
    setCreateStep('mnemonic-display')
    setFormError(null)
  }

  const handleMnemonicNext = () => {
    if (!mnemonicRevealed) return
    setCreateStep('mnemonic-confirm')
    setFormError(null)
  }

  const handleConfirmAndCreate = async () => {
    if (!allConfirmWordsCorrect) {
      setFormError('One or more words are incorrect. Please check your recovery phrase.')
      return
    }
    setLoading(true)
    setFormError(null)
    try {
      await initialize(password)
      await createWalletFromMnemonic(walletName.trim() || 'My Wallet', mnemonic, password)
      setCreateStep('success')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create wallet')
    } finally {
      setLoading(false)
    }
  }

  const handleImportByMnemonic = async () => {
    if (!canSetPassword || !importMnemonic.trim()) return
    setLoading(true)
    setFormError(null)
    try {
      await initialize(password)
      await createWalletFromMnemonic(walletName.trim() || 'Imported Wallet', importMnemonic.trim(), password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid mnemonic or creation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleImportByPrivateKey = async () => {
    if (!canSetPassword || !importPrivateKey.trim()) return
    setLoading(true)
    setFormError(null)
    try {
      await initialize(password)
      await importWallet(walletName.trim() || 'Imported Wallet', importPrivateKey.trim(), password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid private key')
    } finally {
      setLoading(false)
    }
  }

  const handleImportByKeystore = async () => {
    if (!importKeystoreFile || !importKeystorePassword || !canSetPassword) return
    setLoading(true)
    setFormError(null)
    try {
      await initialize(password)
      await importFromKeystoreJSON(
        importKeystoreFile,
        importKeystorePassword,
        password,
        walletName.trim() || undefined
      )
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to decrypt keystore')
    } finally {
      setLoading(false)
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
        setFormError(null)
      } catch {
        setFormError('Invalid JSON file')
        setImportKeystoreFile(null)
      }
    }
    reader.readAsText(file)
  }

  const handleCopyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic)
    setMnemonicCopied(true)
    setTimeout(() => setMnemonicCopied(false), 3000)
  }

  const resetFlow = () => {
    setFlow('none')
    setCreateStep('password')
    setPassword('')
    setConfirmPassword('')
    setWalletName('')
    setMnemonic('')
    setMnemonicRevealed(false)
    setMnemonicCopied(false)
    setConfirmWords({})
    setConfirmIndices([])
    setImportMnemonic('')
    setImportPrivateKey('')
    setImportKeystoreFile(null)
    setImportKeystoreFileName('')
    setImportKeystorePassword('')
    setFormError(null)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shared UI Components
  // ═══════════════════════════════════════════════════════════════════════════

  const StepHeader = ({ title, subtitle, onBack, step, totalSteps }: {
    title: string; subtitle: string; onBack: () => void; step?: number; totalSteps?: number
  }) => (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={onBack}
          className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {step != null && totalSteps != null && (
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${
                i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )

  const ErrorBanner = () =>
    formError ? (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 animate-slide-up mt-3">
        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        <p className="text-xs text-red-500">{formError}</p>
      </div>
    ) : null

  const PasswordFields = () => (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Wallet Name
        </label>
        <input
          type="text"
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          placeholder="e.g. Main Wallet"
          className="w-full h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="w-full h-10 px-3 pr-10 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {password.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    i <= passwordStrength.score
                      ? passwordStrength.score >= 3 ? 'bg-green-500' : passwordStrength.score >= 2 ? 'bg-yellow-500' : 'bg-red-500'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className={`text-[10px] font-medium ${
              passwordStrength.score >= 3 ? 'text-green-500' : passwordStrength.score >= 2 ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {passwordStrength.label}
            </span>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Confirm Password
        </label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          className={`w-full h-10 px-3 rounded-xl bg-background border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
            confirmPassword.length > 0 && !passwordsMatch
              ? 'border-red-500 focus:border-red-500'
              : 'border-border focus:border-primary'
          }`}
        />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Passwords do not match
          </p>
        )}
        {confirmPassword.length > 0 && passwordsMatch && (
          <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1">
            <Check className="h-3 w-3" /> Passwords match
          </p>
        )}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  //  Welcome Screen
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'none') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col justify-center relative z-10 px-5 py-6">
          <div className="text-center mb-6 animate-slide-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4 shadow-lg shadow-primary/25">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold gradient-text mb-1.5">QRDX Wallet</h1>
            <p className="text-sm text-muted-foreground">Quantum-resistant digital asset security</p>
          </div>

          <div className="flex gap-2 mb-6">
            {[
              { icon: Shield, title: 'Quantum-Safe', desc: 'Post-quantum cryptographic protection', gradient: 'from-primary to-primary/60' },
              { icon: Zap, title: 'Lightning Fast', desc: 'Instant transactions & confirmations', gradient: 'from-yellow-500 to-orange-500' },
              { icon: Key, title: 'Self-Custody', desc: 'Your keys, your crypto, always', gradient: 'from-green-500 to-emerald-500' },
            ].map((f) => (
              <Card key={f.title} className="flex-1 p-2.5 glass hover:border-primary/30 transition-all">
                <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-2`}>
                  <f.icon className="h-4 w-4 text-white" />
                </div>
                <div className="text-xs font-semibold mb-0.5">{f.title}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{f.desc}</div>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            <Button
              onClick={startCreateFlow}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create New Wallet
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>

            <Button
              variant="outline"
              onClick={() => { setFlow('import'); setFormError(null) }}
              className="w-full h-12 text-base font-semibold glass hover:bg-accent/50 hover:border-primary/30 transition-all"
            >
              <Download className="h-5 w-5 mr-2" />
              Import Existing Wallet
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-4 px-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREATE FLOW — Step 1: Password
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'create' && createStep === 'password') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col relative z-10 px-5 py-6">
          <StepHeader
            title="Create New Wallet"
            subtitle="Set a strong password to protect your wallet"
            onBack={resetFlow}
            step={0}
            totalSteps={4}
          />

          <Card className="glass p-3 mb-4 border-primary/20">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                This password encrypts your private keys locally with <span className="font-semibold text-foreground">AES-256-GCM</span>.
                Use a strong, unique password. If you lose it, you can restore from your recovery phrase.
              </div>
            </div>
          </Card>

          <PasswordFields />
          <ErrorBanner />

          <div className="mt-auto pt-6">
            <Button
              onClick={handlePasswordNext}
              disabled={!canSetPassword}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
            >
              Continue
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREATE FLOW — Step 2: Mnemonic Display
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'create' && createStep === 'mnemonic-display') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col relative z-10 px-5 py-6">
          <StepHeader
            title="Recovery Phrase"
            subtitle="Write down these 12 words in order"
            onBack={() => setCreateStep('password')}
            step={1}
            totalSteps={4}
          />

          {/* Warning banner */}
          <Card className="glass p-3 mb-4 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Never share your recovery phrase.</span>{' '}
                Anyone with these words can access your wallet. Store them offline in a safe place.
                QRDX will never ask for your recovery phrase.
              </div>
            </div>
          </Card>

          {/* Mnemonic grid */}
          <Card className="glass border-border/50 mb-3">
            <CardContent className="p-3">
              {!mnemonicRevealed ? (
                <button
                  onClick={() => setMnemonicRevealed(true)}
                  className="w-full py-10 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
                    <Eye className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-medium">Tap to reveal recovery phrase</span>
                  <span className="text-[10px] text-muted-foreground/60">Make sure no one is watching your screen</span>
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mnemonicWords.map((word, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-background/60 border border-border/50"
                    >
                      <span className="text-[10px] text-muted-foreground/60 font-mono w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium font-mono">{word}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {mnemonicRevealed && (
            <button
              onClick={handleCopyMnemonic}
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              {mnemonicCopied ? (
                <><Check className="h-3.5 w-3.5 text-green-500" /><span className="text-green-500">Copied!</span></>
              ) : (
                <><Copy className="h-3.5 w-3.5" />Copy to clipboard</>
              )}
            </button>
          )}

          <div className="mt-auto pt-4">
            <Button
              onClick={handleMnemonicNext}
              disabled={!mnemonicRevealed}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
            >
              I&apos;ve Written It Down
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREATE FLOW — Step 3: Mnemonic Confirm
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'create' && createStep === 'mnemonic-confirm') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col relative z-10 px-5 py-6">
          <StepHeader
            title="Confirm Recovery Phrase"
            subtitle="Enter the requested words to verify your backup"
            onBack={() => setCreateStep('mnemonic-display')}
            step={2}
            totalSteps={4}
          />

          <Card className="glass p-3 mb-4 border-primary/20">
            <div className="flex items-start gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Enter the correct word for each numbered position.
                This confirms you&apos;ve saved your recovery phrase.
              </div>
            </div>
          </Card>

          <div className="space-y-3 mb-4">
            {confirmIndices.map((idx) => {
              const isCorrect = confirmWords[idx]?.trim().toLowerCase() === mnemonicWords[idx]
              const hasValue = (confirmWords[idx]?.trim().length ?? 0) > 0
              return (
                <div key={idx}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
                    Word #{idx + 1}
                    {hasValue && (
                      isCorrect
                        ? <Check className="h-3 w-3 text-green-500" />
                        : <AlertCircle className="h-3 w-3 text-red-500" />
                    )}
                  </label>
                  <input
                    type="text"
                    value={confirmWords[idx] ?? ''}
                    onChange={(e) =>
                      setConfirmWords((prev) => ({ ...prev, [idx]: e.target.value }))
                    }
                    placeholder={`Enter word #${idx + 1}`}
                    autoComplete="off"
                    className={`w-full h-10 px-3 rounded-xl bg-background border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                      hasValue
                        ? isCorrect
                          ? 'border-green-500/50 focus:border-green-500'
                          : 'border-red-500/50 focus:border-red-500'
                        : 'border-border focus:border-primary'
                    }`}
                  />
                </div>
              )
            })}
          </div>

          <ErrorBanner />

          <div className="mt-auto pt-4">
            <Button
              onClick={handleConfirmAndCreate}
              disabled={loading || !allConfirmWordsCorrect}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />Creating Wallet...</>
              ) : (
                <><Shield className="h-5 w-5 mr-2" />Create Wallet</>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREATE FLOW — Step 4: Success
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'create' && createStep === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-5 py-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center animate-slide-up">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-5 shadow-lg shadow-green-500/25">
            <Check className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Wallet Created!</h2>
          <p className="text-sm text-muted-foreground mb-1 max-w-[280px]">
            Your quantum-resistant wallet is ready.
          </p>
          <p className="text-xs text-muted-foreground mb-6 max-w-[280px]">
            Both your secp256k1 (ETH) and ML-DSA-65 (PQ) key pairs have been generated
            and encrypted.
          </p>

          <div className="flex gap-2 mb-6">
            {[
              { icon: Lock, label: 'AES-256-GCM', sub: 'Encrypted' },
              { icon: Fingerprint, label: 'secp256k1', sub: 'ETH Keys' },
              { icon: Shield, label: 'ML-DSA-65', sub: 'PQ Keys' },
            ].map(({ icon: Icon, label, sub }) => (
              <Card key={label} className="glass flex-1 p-2.5">
                <div className="flex flex-col items-center gap-1">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-semibold">{label}</span>
                  <span className="text-[9px] text-muted-foreground">{sub}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* The WalletHome component will automatically show Dashboard now */}
          <p className="text-[10px] text-muted-foreground animate-pulse">
            Loading your dashboard...
          </p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  IMPORT FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  if (flow === 'import') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col relative z-10 px-5 py-6 overflow-y-auto">
          <StepHeader
            title="Import Wallet"
            subtitle="Restore from a backup"
            onBack={resetFlow}
          />

          {/* Import Mode Tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-4">
            {([
              { key: 'mnemonic' as const, label: 'Phrase', icon: Key },
              { key: 'private-key' as const, label: 'Key', icon: Lock },
              { key: 'json-keystore' as const, label: 'JSON', icon: FileJson },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setImportMode(key); setFormError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all ${
                  importMode === key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Import by Mnemonic ────────────────────────────────────────── */}
          {importMode === 'mnemonic' && (
            <div className="space-y-3">
              <Card className="glass p-3 border-primary/20">
                <div className="flex items-start gap-2.5">
                  <Key className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Enter your 12 or 24-word BIP-39 recovery phrase, separated by spaces.
                  </div>
                </div>
              </Card>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Recovery Phrase
                </label>
                <textarea
                  value={importMnemonic}
                  onChange={(e) => setImportMnemonic(e.target.value)}
                  placeholder="word1 word2 word3 ... word12"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                />
                {importMnemonic.trim() && (
                  <p className="text-[10px] mt-1 flex items-center gap-1">
                    {importMnemonic.trim().split(/\s+/).length === 12 || importMnemonic.trim().split(/\s+/).length === 24 ? (
                      <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">{importMnemonic.trim().split(/\s+/).length} words</span></>
                    ) : (
                      <><AlertCircle className="h-3 w-3 text-amber-500" /><span className="text-amber-500">{importMnemonic.trim().split(/\s+/).length} words — need 12 or 24</span></>
                    )}
                  </p>
                )}
              </div>

              <PasswordFields />
              <ErrorBanner />

              <div className="pt-4">
                <Button
                  onClick={handleImportByMnemonic}
                  disabled={loading || !canSetPassword || !importMnemonic.trim()}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Importing...</>
                  ) : (
                    <><Download className="h-5 w-5 mr-2" />Import Wallet</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Import by Private Key ─────────────────────────────────────── */}
          {importMode === 'private-key' && (
            <div className="space-y-3">
              <Card className="glass p-3 border-amber-500/20 bg-amber-500/5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Importing by private key provides <span className="font-semibold text-foreground">no recovery phrase backup</span>.
                    Only use this if you don&apos;t have a mnemonic.
                  </div>
                </div>
              </Card>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Private Key
                </label>
                <textarea
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  placeholder="Enter hex private key (with or without 0x prefix)"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                />
              </div>

              <PasswordFields />
              <ErrorBanner />

              <div className="pt-4">
                <Button
                  onClick={handleImportByPrivateKey}
                  disabled={loading || !canSetPassword || !importPrivateKey.trim()}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Importing...</>
                  ) : (
                    <><Download className="h-5 w-5 mr-2" />Import Wallet</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Import by JSON Keystore ───────────────────────────────────── */}
          {importMode === 'json-keystore' && (
            <div className="space-y-3">
              <Card className="glass p-3 border-primary/20">
                <div className="flex items-start gap-2.5">
                  <FileJson className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Import an Ethereum V3 keystore JSON file. You&apos;ll need the password used to create the keystore.
                  </div>
                </div>
              </Card>

              {/* File upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Keystore File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleKeystoreFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-background/30 flex flex-col items-center justify-center gap-2 transition-all"
                >
                  {importKeystoreFile ? (
                    <>
                      <FileJson className="h-6 w-6 text-green-500" />
                      <span className="text-xs font-medium text-green-500">{importKeystoreFileName}</span>
                      <span className="text-[10px] text-muted-foreground">Click to choose a different file</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Click to select keystore JSON</span>
                    </>
                  )}
                </button>
              </div>

              {importKeystoreFile && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Keystore Password
                  </label>
                  <input
                    type="password"
                    value={importKeystorePassword}
                    onChange={(e) => setImportKeystorePassword(e.target.value)}
                    placeholder="Password used to encrypt the keystore"
                    className="w-full h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  />
                </div>
              )}

              <div className="pt-1">
                <div className="px-1 mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    New Wallet Password
                  </span>
                </div>
                <PasswordFields />
              </div>

              <ErrorBanner />

              <div className="pt-4">
                <Button
                  onClick={handleImportByKeystore}
                  disabled={loading || !canSetPassword || !importKeystoreFile || !importKeystorePassword}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Importing...</>
                  ) : (
                    <><FileJson className="h-5 w-5 mr-2" />Import from Keystore</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getPasswordStrength(password: string): { score: number; label: string } {
  if (password.length === 0) return { score: 0, label: '' }
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++

  const labels = ['Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[Math.min(score, labels.length) - 1] || 'Weak' }
}
