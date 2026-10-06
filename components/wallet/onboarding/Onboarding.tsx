'use client'

/**
 * First-run flow: create a wallet or bring one in.
 *
 *   Create:  password → recovery phrase → verify 3 words → [vault created] → secure → done
 *   Import:  method (phrase | private key | keystore) → secret → password → [vault created] → secure → done
 *
 * "Secure" adapts to the platform: biometric unlock where passkey PRF exists,
 * an install hint on the web (and the iOS Share-sheet steps on iPhone), and a
 * request for persistent storage. Nothing is written to storage until the
 * vault is created, so backing out at any step leaves no trace.
 */

import { QrdxMark } from '@/components/QrdxMark'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileJson,
  Fingerprint,
  Key,
  KeyRound,
  Lock,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { InstallHint } from '@/src/pwa/install'
import { requestPersistentStorage } from '@/src/pwa/storage-persistence'
import {
  ChoiceButton,
  CopyButton,
  ErrorBanner,
  FlowScreen,
  KeystorePicker,
  NewPasswordFields,
  Notice,
  PasswordField,
  PhraseGrid,
  PhraseInput,
  PhraseVerifier,
  PrimaryButton,
  PrivateKeyInput,
  StepHeader,
  TextField,
  newPasswordValid,
  phraseInputValid,
  privateKeyValid,
} from '../flow/FlowKit'

type ImportMethod = 'phrase' | 'key' | 'keystore'
type Step =
  | 'welcome'
  | 'create-password'
  | 'create-phrase'
  | 'create-verify'
  | 'import-method'
  | 'import-secret'
  | 'import-password'
  | 'secure'
  | 'done'

export function Onboarding({ onDone, onCommit }: { onDone: () => void; onCommit?: () => void }) {
  const wallet = useWallet()
  const { platform, biometrics } = wallet

  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [wordCount, setWordCount] = useState<12 | 24>(12)
  const [mnemonic, setMnemonic] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [verified, setVerified] = useState(false)
  const [method, setMethod] = useState<ImportMethod>('phrase')
  const [phraseInput, setPhraseInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [keystore, setKeystore] = useState<unknown>(null)
  const [keystoreName, setKeystoreName] = useState('')
  const [keystorePassword, setKeystorePassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bioState, setBioState] = useState<'idle' | 'enabled' | 'skipped'>('idle')

  const words = useMemo(() => mnemonic.split(' ').filter(Boolean), [mnemonic])
  const passwordOk = newPasswordValid(password, confirm)
  const go = (s: Step) => {
    setError(null)
    setStep(s)
  }

  const startCreate = (count: 12 | 24 = wordCount) => {
    setMnemonic(wallet.generateMnemonic(count))
    setRevealed(false)
    setVerified(false)
    go('create-password')
  }

  const afterVaultCreated = async () => {
    // Best effort; installed iOS PWAs are already exempt from eviction.
    if (platform.target !== 'extension') requestPersistentStorage().catch(() => undefined)
    setMnemonic('')
    setPhraseInput('')
    setKeyInput('')
    setKeystorePassword('')
    go('secure')
  }

  const create = async () => {
    onCommit?.()
    setBusy(true)
    setError(null)
    try {
      await wallet.createWallet({
        password,
        mnemonic,
        accountName: name || undefined,
        backedUp: true,
      })
      await afterVaultCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the wallet')
    } finally {
      setBusy(false)
    }
  }

  const importWallet = async () => {
    onCommit?.()
    setBusy(true)
    setError(null)
    try {
      const accountName = name || undefined
      if (method === 'phrase')
        await wallet.createWallet({ password, mnemonic: phraseInput, accountName, imported: true })
      else if (method === 'key')
        await wallet.createWalletFromPrivateKey({ password, privateKey: keyInput, accountName })
      else
        await wallet.createWalletFromKeystore({ password, keystore, keystorePassword, accountName })
      await afterVaultCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the wallet')
    } finally {
      setBusy(false)
    }
  }

  const enableBiometrics = async () => {
    setBusy(true)
    setError(null)
    try {
      await wallet.enableBiometrics(password)
      setBioState('enabled')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Biometric unlock could not be set up')
    } finally {
      setBusy(false)
    }
  }

  const finish = () => {
    setPassword('')
    setConfirm('')
    onDone()
  }

  // ── Welcome ───────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <FlowScreen className="justify-center">
        <div className="text-center mb-6 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4 shadow-lg shadow-primary/25">
            <QrdxMark className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-1.5">QRDX Wallet</h1>
          <p className="text-sm text-muted-foreground">Quantum-resistant self-custody</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { icon: Shield, title: 'Quantum-safe', desc: 'ML-DSA-65 keys alongside classic ones' },
            { icon: Zap, title: 'Multi-chain', desc: 'QRDX, Ethereum and EVM networks' },
            { icon: Key, title: 'Self-custody', desc: 'Keys never leave this device' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl glass p-2.5">
              <f.icon className="h-4 w-4 text-primary mb-1.5" />
              <div className="text-xs font-semibold mb-0.5">{f.title}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <PrimaryButton onClick={() => startCreate()}>
            <Plus className="h-5 w-5 mr-2" /> Create a new wallet{' '}
            <ChevronRight className="h-4 w-4 ml-auto" />
          </PrimaryButton>
          <PrimaryButton variant="outline" onClick={() => go('import-method')}>
            <Download className="h-5 w-5 mr-2" /> I already have a wallet{' '}
            <ChevronRight className="h-4 w-4 ml-auto" />
          </PrimaryButton>
        </div>

        {platform.install !== 'none' && (
          <div className="mt-5">
            <InstallHint compact />
          </div>
        )}
      </FlowScreen>
    )
  }

  // ── Create: password ──────────────────────────────────────────────────────
  if (step === 'create-password' || step === 'import-password') {
    const creating = step === 'create-password'
    return (
      <FlowScreen>
        <StepHeader
          title={creating ? 'Create a password' : 'Protect your wallet'}
          subtitle="Unlocks the wallet on this device"
          onBack={() => go(creating ? 'welcome' : 'import-secret')}
          step={creating ? 0 : 2}
          totalSteps={creating ? 4 : 4}
        />
        <div className="space-y-3">
          <Notice icon={<Lock className="h-4 w-4 text-primary" />}>
            Your keys are encrypted on this device with this password. It cannot be recovered —{' '}
            {creating
              ? 'your recovery phrase is the backup.'
              : 'keep your recovery phrase or key safe as the backup.'}
          </Notice>
          <TextField
            label="Account name (optional)"
            value={name}
            onChange={setName}
            placeholder="Main account"
            maxLength={40}
          />
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
          />
          <ErrorBanner error={error} />
        </div>
        <div className="mt-auto pt-6">
          <PrimaryButton
            disabled={!passwordOk}
            loading={busy}
            onClick={() => (creating ? go('create-phrase') : importWallet())}
          >
            {creating ? 'Continue' : 'Import wallet'} <ArrowRight className="h-5 w-5 ml-2" />
          </PrimaryButton>
          {!creating && busy && (
            <p className="text-center text-[11px] text-muted-foreground mt-2">
              Encrypting your keys…
            </p>
          )}
        </div>
      </FlowScreen>
    )
  }

  // ── Create: phrase ────────────────────────────────────────────────────────
  if (step === 'create-phrase') {
    return (
      <FlowScreen>
        <StepHeader
          title="Your recovery phrase"
          subtitle="The only way to restore this wallet"
          onBack={() => go('create-password')}
          step={1}
          totalSteps={4}
        />
        <div className="space-y-4">
          <Notice tone="warning" icon={<KeyRound className="h-4 w-4 text-amber-500" />}>
            Write these {words.length} words down in order and keep them offline. Anyone with them
            controls your funds — both the classic and the quantum-safe account. QRDX will never ask
            for them.
          </Notice>
          <PhraseGrid words={words} revealed={revealed} onReveal={() => setRevealed(true)} />
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              {([12, 24] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setWordCount(n)
                    setMnemonic(wallet.generateMnemonic(n))
                    setRevealed(false)
                  }}
                  className={`px-2.5 py-1 rounded-md ${wordCount === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {n} words
                </button>
              ))}
            </div>
            {revealed && <CopyButton text={mnemonic} secret />}
          </div>
        </div>
        <div className="mt-auto pt-6">
          <PrimaryButton disabled={!revealed} onClick={() => go('create-verify')}>
            I’ve written it down <ArrowRight className="h-5 w-5 ml-2" />
          </PrimaryButton>
        </div>
      </FlowScreen>
    )
  }

  // ── Create: verify ────────────────────────────────────────────────────────
  if (step === 'create-verify') {
    return (
      <FlowScreen>
        <StepHeader
          title="Check your backup"
          subtitle="Pick the matching word for each position"
          onBack={() => go('create-phrase')}
          step={2}
          totalSteps={4}
        />
        <PhraseVerifier words={words} onVerified={setVerified} />
        <ErrorBanner error={error} />
        <div className="mt-auto pt-6">
          <PrimaryButton disabled={!verified} loading={busy} onClick={create}>
            Create wallet <ArrowRight className="h-5 w-5 ml-2" />
          </PrimaryButton>
          {busy && (
            <p className="text-center text-[11px] text-muted-foreground mt-2">
              Deriving and encrypting your keys…
            </p>
          )}
        </div>
      </FlowScreen>
    )
  }

  // ── Import: method ────────────────────────────────────────────────────────
  if (step === 'import-method') {
    const pick = (m: ImportMethod) => {
      setMethod(m)
      go('import-secret')
    }
    return (
      <FlowScreen>
        <StepHeader
          title="Import a wallet"
          subtitle="What do you have?"
          onBack={() => go('welcome')}
          step={0}
          totalSteps={4}
        />
        <div className="space-y-2.5">
          <ChoiceButton
            icon={<KeyRound className="h-5 w-5 text-primary" />}
            title="Recovery phrase"
            description="12 or 24 words — restores every account and its quantum-safe key"
            onClick={() => pick('phrase')}
          />
          <ChoiceButton
            icon={<Key className="h-5 w-5 text-primary" />}
            title="Private key"
            description="A single account from a 64-character key"
            onClick={() => pick('key')}
          />
          <ChoiceButton
            icon={<FileJson className="h-5 w-5 text-primary" />}
            title="Keystore file"
            description="Encrypted JSON from QRDX Wallet, MetaMask or geth"
            onClick={() => pick('keystore')}
          />
        </div>
      </FlowScreen>
    )
  }

  // ── Import: secret ────────────────────────────────────────────────────────
  if (step === 'import-secret') {
    const ready =
      method === 'phrase'
        ? phraseInputValid(phraseInput)
        : method === 'key'
          ? privateKeyValid(keyInput)
          : keystore !== null && keystorePassword.length > 0
    const titles = {
      phrase: 'Enter your recovery phrase',
      key: 'Enter your private key',
      keystore: 'Choose your keystore',
    }
    return (
      <FlowScreen>
        <StepHeader
          title={titles[method]}
          subtitle="Stays on this device"
          onBack={() => go('import-method')}
          step={1}
          totalSteps={4}
        />
        <div className="space-y-3">
          {method === 'phrase' && <PhraseInput value={phraseInput} onChange={setPhraseInput} />}
          {method === 'key' && <PrivateKeyInput value={keyInput} onChange={setKeyInput} />}
          {method === 'keystore' && (
            <>
              <KeystorePicker
                fileName={keystoreName}
                onLoaded={(json, n) => {
                  setKeystore(json)
                  setKeystoreName(n)
                  setError(null)
                }}
                onError={setError}
              />
              <PasswordField
                label="Keystore password"
                value={keystorePassword}
                onChange={setKeystorePassword}
                autoComplete="off"
              />
            </>
          )}
          <ErrorBanner error={error} />
        </div>
        <div className="mt-auto pt-6">
          <PrimaryButton disabled={!ready} onClick={() => go('import-password')}>
            Continue <ArrowRight className="h-5 w-5 ml-2" />
          </PrimaryButton>
        </div>
      </FlowScreen>
    )
  }

  // ── Secure ────────────────────────────────────────────────────────────────
  if (step === 'secure') {
    const canOfferBio = biometrics.support !== 'unsupported'
    return (
      <FlowScreen>
        <StepHeader
          title="Secure this device"
          subtitle="Optional, and you can change these later in Settings"
          step={3}
          totalSteps={4}
        />
        <div className="space-y-3">
          {canOfferBio && (
            <div className="rounded-xl glass p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Fingerprint className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {platform.isIOS ? 'Unlock with Face ID' : 'Unlock with biometrics'}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Uses a passkey on this device. Your password is never stored; the passkey itself
                    unlocks the wallet.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {bioState === 'enabled' ? (
                  <p className="text-xs text-green-500 inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> Biometric unlock is on
                  </p>
                ) : (
                  <PrimaryButton variant="outline" loading={busy} onClick={enableBiometrics}>
                    Turn on
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}
          {platform.install !== 'none' && <InstallHint dismissible={false} />}
          {platform.storageEvictionRisk && platform.install === 'none' && (
            <Notice tone="warning" icon={<ShieldCheck className="h-4 w-4 text-amber-500" />}>
              Browsers can clear website storage. Keep your recovery phrase safe — it is what
              restores this wallet.
            </Notice>
          )}
          <ErrorBanner error={error} />
        </div>
        <div className="mt-auto pt-6">
          <PrimaryButton onClick={() => go('done')}>
            Continue <ArrowRight className="h-5 w-5 ml-2" />
          </PrimaryButton>
        </div>
      </FlowScreen>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  return (
    <FlowScreen className="justify-center items-center text-center">
      <div className="h-16 w-16 rounded-2xl bg-green-500/15 flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 text-green-500" />
      </div>
      <h2 className="text-xl font-bold mb-1">Your wallet is ready</h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs">
        Each account has a classic address and a quantum-safe{' '}
        <span className="font-mono">0xPQ</span> address. Move funds to the quantum-safe one for
        long-term protection.
      </p>
      <div className="w-full">
        <PrimaryButton onClick={finish}>
          Open wallet <ArrowRight className="h-5 w-5 ml-2" />
        </PrimaryButton>
      </div>
    </FlowScreen>
  )
}
