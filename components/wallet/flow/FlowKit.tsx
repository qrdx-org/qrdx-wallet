'use client'

/**
 * Building blocks for every wallet flow — onboarding, unlock, add/import
 * account, export. One implementation each, so the same screen behaves the
 * same in the web app, the iPhone PWA and the extension popup.
 *
 * All components are module-level (never defined inside another component's
 * render), so inputs keep focus while typing — the previous Setup screen
 * re-created its password fields on every keystroke.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { wordlist } from 'ethereum-cryptography/bip39/wordlists/english.js'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isValidMnemonic } from '@/src/core/crypto'

// ─── Layout ─────────────────────────────────────────────────────────────────

export function FlowScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>
      {/* Safe-area insets on a wrapper so they add to the screen's own padding. */}
      <div className="flex-1 flex flex-col relative z-10 pt-safe pb-safe">
        <div className={cn('flex-1 flex flex-col px-5 py-6', className)}>{children}</div>
      </div>
    </div>
  )
}

export function StepHeader({
  title,
  subtitle,
  onBack,
  step,
  totalSteps,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  step?: number
  totalSteps?: number
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="h-9 w-9 rounded-lg bg-muted/80 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {step != null && totalSteps != null && (
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={step + 1}
        >
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-muted'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 animate-slide-up mt-3"
    >
      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-red-500">{error}</p>
    </div>
  )
}

export function Notice({
  icon,
  children,
  tone = 'info',
}: {
  icon?: ReactNode
  children: ReactNode
  tone?: 'info' | 'warning' | 'success'
}) {
  const tones = {
    info: 'border-primary/20 bg-primary/5',
    warning: 'border-amber-500/30 bg-amber-500/10',
    success: 'border-green-500/30 bg-green-500/10',
  }
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border p-3', tones[tone])}>
      {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
      <div className="text-[11px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
}

export function PrimaryButton({
  children,
  loading,
  disabled,
  onClick,
  type = 'button',
  variant = 'primary',
}: {
  children: ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'outline' | 'danger'
}) {
  const styles = {
    primary:
      'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 text-white',
    outline: 'glass border hover:bg-accent/50 hover:border-primary/30',
    danger: 'bg-red-600 hover:bg-red-600/90 text-white',
  }
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      variant={variant === 'outline' ? 'outline' : 'default'}
      className={cn(
        'w-full h-12 text-base font-semibold transition-all disabled:opacity-50',
        styles[variant]
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
      {children}
    </Button>
  )
}

const inputClass =
  'w-full h-11 px-3 rounded-xl bg-background border border-border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all'

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
      />
    </div>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete = 'current-password',
  invalid,
  onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  autoComplete?: 'current-password' | 'new-password' | 'off'
  invalid?: boolean
  onEnter?: () => void
}) {
  const [show, setShow] = useState(false)
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          className={cn(inputClass, 'pr-10', invalid && 'border-red-500 focus:border-red-500')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── Password creation ──────────────────────────────────────────────────────

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length >= 16) score = Math.min(4, score + 1)
  if (pw.length < 8) score = Math.min(score, 1)
  const s = score as 0 | 1 | 2 | 3 | 4
  return { score: s, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][s] }
}

export const MIN_PASSWORD_LENGTH = 8

/** New password + confirmation. Reports validity to the parent. */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  labels = { password: 'Password', confirm: 'Confirm password' },
}: {
  password: string
  confirm: string
  onPassword: (v: string) => void
  onConfirm: (v: string) => void
  labels?: { password: string; confirm: string }
}) {
  const strength = passwordStrength(password)
  const mismatch = confirm.length > 0 && confirm !== password
  const color =
    strength.score >= 3 ? 'bg-green-500' : strength.score >= 2 ? 'bg-yellow-500' : 'bg-red-500'
  const text =
    strength.score >= 3
      ? 'text-green-500'
      : strength.score >= 2
        ? 'text-yellow-500'
        : 'text-red-500'
  return (
    <div className="space-y-3">
      <div>
        <PasswordField
          label={labels.password}
          value={password}
          onChange={onPassword}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
        />
        {password.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-all',
                    i <= strength.score ? color : 'bg-muted'
                  )}
                />
              ))}
            </div>
            <span className={cn('text-[10px] font-medium', text)}>{strength.label}</span>
          </div>
        )}
      </div>
      <div>
        <PasswordField
          label={labels.confirm}
          value={confirm}
          onChange={onConfirm}
          placeholder="Re-enter password"
          autoComplete="new-password"
          invalid={mismatch}
        />
        {mismatch && (
          <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Passwords do not match
          </p>
        )}
        {confirm.length > 0 && !mismatch && (
          <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1">
            <Check className="h-3 w-3" /> Passwords match
          </p>
        )}
      </div>
    </div>
  )
}

export function newPasswordValid(password: string, confirm: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password === confirm
}

// ─── Secrets: copy with clipboard clearing ──────────────────────────────────

const CLIPBOARD_CLEAR_MS = 60_000

/** Copy a secret and overwrite the clipboard a minute later. */
export async function copySecret(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => undefined)
  }, CLIPBOARD_CLEAR_MS)
}

export function CopyButton({
  text,
  secret,
  label = 'Copy',
}: {
  text: string
  secret?: boolean
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      if (secret) await copySecret(text)
      else await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* clipboard can be blocked; the text is still on screen */
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? (secret ? 'Copied — clears in 60 s' : 'Copied') : label}
    </button>
  )
}

// ─── Recovery phrase display & verification ─────────────────────────────────

export function PhraseGrid({
  words,
  revealed,
  onReveal,
}: {
  words: string[]
  revealed: boolean
  onReveal?: () => void
}) {
  return (
    <div className="relative">
      <ol
        className={cn('grid grid-cols-3 gap-2 transition-all', !revealed && 'blur-md select-none')}
        aria-hidden={!revealed}
      >
        {words.map((w, i) => (
          <li
            key={i}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2 py-2"
          >
            <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
            <span className="text-sm font-mono font-medium">{revealed ? w : '•••••'}</span>
          </li>
        ))}
      </ol>
      {!revealed && onReveal && (
        <button
          type="button"
          onClick={onReveal}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl text-sm font-semibold"
        >
          <Eye className="h-6 w-6 text-primary" />
          Tap to reveal — make sure no one is watching
        </button>
      )}
    </div>
  )
}

function randomInt(max: number): number {
  // Rejection sampling: no modulo bias.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Pick the right word for 3 random positions — no typing on a phone keyboard. */
export function PhraseVerifier({
  words,
  onVerified,
}: {
  words: string[]
  onVerified: (ok: boolean) => void
}) {
  const challenge = useMemo(() => {
    const positions = shuffled(words.map((_, i) => i))
      .slice(0, 3)
      .sort((a, b) => a - b)
    return positions.map((pos) => {
      const decoys = new Set<string>()
      while (decoys.size < 3) {
        const w = wordlist[randomInt(wordlist.length)]
        if (!words.includes(w)) decoys.add(w)
      }
      return { pos, options: shuffled([...decoys, words[pos]]) }
    })
  }, [words])

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const done = challenge.every((c) => answers[c.pos])
  const correct = done && challenge.every((c) => answers[c.pos] === words[c.pos])

  useEffect(() => {
    onVerified(correct)
  }, [correct]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {challenge.map((c) => (
        <fieldset key={c.pos}>
          <legend className="text-xs font-medium text-muted-foreground mb-2">
            Word #{c.pos + 1}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {c.options.map((o) => {
              const picked = answers[c.pos] === o
              const wrong = picked && o !== words[c.pos]
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [c.pos]: o }))}
                  className={cn(
                    'h-11 rounded-xl border text-sm font-mono transition-all',
                    picked
                      ? wrong
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  {o}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      {done && !correct && (
        <ErrorBanner error="That doesn’t match your recovery phrase. Go back and check the words you wrote down." />
      )}
    </div>
  )
}

// ─── Secret inputs (imports) ────────────────────────────────────────────────

const WORDS = new Set(wordlist)

export function PhraseInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const unknown = words.filter((w) => !WORDS.has(w))
  const countOk = [12, 15, 18, 21, 24].includes(words.length)
  const valid = countOk && unknown.length === 0 && isValidMnemonic(words.join(' '))
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        Recovery phrase
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Paste or type your 12 or 24 words, separated by spaces"
        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-base sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
      />
      <div className="mt-1.5 text-[11px]" aria-live="polite">
        {words.length === 0 ? (
          <span className="text-muted-foreground">Your phrase never leaves this device.</span>
        ) : unknown.length > 0 ? (
          <span className="text-red-500">
            Not in the word list: {unknown.slice(0, 3).join(', ')}
            {unknown.length > 3 ? '…' : ''}
          </span>
        ) : !countOk ? (
          <span className="text-muted-foreground">
            {words.length} words — a phrase has 12 or 24
          </span>
        ) : valid ? (
          <span className="text-green-500 inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> Valid {words.length}-word phrase
          </span>
        ) : (
          <span className="text-red-500">
            The words are valid but the checksum fails — check their order.
          </span>
        )}
      </div>
    </div>
  )
}

export function phraseInputValid(value: string): boolean {
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return [12, 15, 18, 21, 24].includes(words.length) && isValidMnemonic(words.join(' '))
}

export function privateKeyValid(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim())
}

export function PrivateKeyInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const ok = privateKeyValid(value)
  return (
    <div>
      <PasswordField
        label="Private key"
        value={value}
        onChange={onChange}
        placeholder="64 hex characters, with or without 0x"
        autoComplete="off"
        invalid={value.length > 0 && !ok}
      />
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        The post-quantum key for an imported private key is derived from it, so it is only as strong
        as the classic key. For full quantum safety, use a recovery phrase.
      </p>
    </div>
  )
}

export function KeystorePicker({
  fileName,
  onLoaded,
  onError,
}: {
  fileName: string
  onLoaded: (json: unknown, name: string) => void
  onError: (msg: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 64 * 1024) return onError('That file is too large to be a keystore')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        onLoaded(JSON.parse(String(ev.target?.result)), file.name)
      } catch {
        onError('That file is not valid JSON')
      }
    }
    reader.readAsText(file)
  }
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/40 p-5 flex flex-col items-center gap-2 transition-colors"
      >
        {fileName ? (
          <FileJson className="h-6 w-6 text-primary" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{fileName || 'Choose keystore file'}</span>
        <span className="text-[11px] text-muted-foreground">
          JSON keystore from QRDX Wallet, MetaMask, geth or any V3 exporter
        </span>
      </button>
    </div>
  )
}

// ─── Choice list ────────────────────────────────────────────────────────────

export function ChoiceButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3.5 text-left hover:border-primary/40 hover:bg-accent/30 transition-all"
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
    </button>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background border border-border pb-safe animate-slide-up">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
