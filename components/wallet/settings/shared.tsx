'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ErrorBanner, PasswordField, PrimaryButton, Sheet } from '../flow/FlowKit'

export function SettingsPage({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="h-8 w-8 rounded-lg hover:bg-accent/50 flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-bold">{title}</h1>
        </div>
      </div>
      <div className="pb-safe">
        <div className="px-4 py-3 space-y-3">{children}</div>
      </div>
    </div>
  )
}

export function Section({
  title,
  children,
  action,
}: {
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section>
      {(title || action) && (
        <div className="flex items-center justify-between px-1 mb-1.5">
          {title && (
            <h2 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div className="rounded-2xl glass p-1.5 space-y-0.5">{children}</div>
    </section>
  )
}

export function Row({
  icon,
  label,
  description,
  onClick,
  right,
  danger,
}: {
  icon?: ReactNode
  label: string
  description?: string
  onClick?: () => void
  right?: ReactNode
  danger?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left ${onClick ? 'hover:bg-accent/40 transition-colors' : ''}`}
    >
      {icon && (
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${danger ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${danger ? 'text-red-500' : ''}`}>{label}</div>
        {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
      </div>
      {right}
    </Tag>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent/30 text-muted-foreground hover:bg-accent/50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Re-authenticate before a sensitive action. `onSubmit` throws to show an error. */
export function PasswordSheet({
  title,
  description,
  confirmLabel = 'Continue',
  danger,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onSubmit: (password: string) => Promise<void>
  onClose: () => void
  children?: ReactNode
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        {description && (
          <div className="text-xs text-muted-foreground leading-relaxed">{description}</div>
        )}
        {children}
        <PasswordField
          label="Wallet password"
          value={password}
          onChange={setPassword}
          autoFocus
          onEnter={submit}
        />
        <ErrorBanner error={error} />
        <PrimaryButton
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          disabled={!password}
          onClick={submit}
        >
          {confirmLabel}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

/** Save a file: share sheet on iOS (where downloads are awkward), a download elsewhere. */
export async function saveFile(
  name: string,
  contents: string,
  type = 'application/json'
): Promise<void> {
  const blob = new Blob([contents], { type })
  const file = typeof File !== 'undefined' ? new File([blob], name, { type }) : null
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (file && nav.canShare?.({ files: [file] }) && /iPhone|iPad/.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name })
      return
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
