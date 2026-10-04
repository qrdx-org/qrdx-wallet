'use client'

import { useEffect, useState } from 'react'
import { Fingerprint, Shield, AlertTriangle } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import {
  ErrorBanner,
  FlowScreen,
  PasswordField,
  PrimaryButton,
  Sheet,
  TextField,
} from './flow/FlowKit'

function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= now) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until, now])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

export function Unlock() {
  const { unlock, unlockWithBiometrics, biometrics, platform, backend, resetWallet } = useWallet()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [showReset, setShowReset] = useState(false)
  const [resetConfirm, setResetConfirm] = useState('')
  const wait = useCountdown(retryAt)

  useEffect(() => {
    backend
      .unlockRetryAt()
      .then(setRetryAt)
      .catch(() => undefined)
  }, [backend])

  const submit = async () => {
    if (!password || busy || wait > 0) return
    setBusy(true)
    setError(null)
    try {
      const r = await unlock(password)
      if (!r.ok) {
        if (r.retryAt) setRetryAt(r.retryAt)
        setError(r.reason === 'throttled' ? 'Too many attempts.' : 'Incorrect password')
        setPassword('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  const bio = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await unlockWithBiometrics()
      if (!r.ok) setError('That passkey could not unlock this wallet. Use your password.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!/cancel/i.test(msg)) setError(msg || 'Biometric unlock failed')
    } finally {
      setBusy(false)
    }
  }

  const bioLabel = platform.isIOS ? 'Unlock with Face ID' : 'Unlock with biometrics'

  return (
    <FlowScreen className="justify-center">
      <div className="text-center mb-8 animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 mb-4 shadow-lg shadow-primary/25">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-1.5">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Unlock your QRDX Wallet</p>
      </div>

      <div className="space-y-4">
        {biometrics.enrolled && (
          <>
            <PrimaryButton onClick={bio} loading={busy}>
              <Fingerprint className="h-5 w-5 mr-2" /> {bioLabel}
            </PrimaryButton>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or use your password{' '}
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-3"
        >
          <PasswordField
            label="Password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setError(null)
            }}
            autoFocus={!biometrics.enrolled}
            onEnter={submit}
          />
          {wait > 0 ? (
            <p className="text-xs text-amber-500" role="status">
              Too many attempts. Try again in {wait}s.
            </p>
          ) : (
            <ErrorBanner error={error} />
          )}
          <PrimaryButton
            type="submit"
            variant={biometrics.enrolled ? 'outline' : 'primary'}
            loading={busy && !biometrics.enrolled}
            disabled={!password || wait > 0}
          >
            Unlock
          </PrimaryButton>
        </form>
      </div>

      <button
        type="button"
        onClick={() => setShowReset(true)}
        className="text-xs text-muted-foreground hover:text-primary text-center mt-6"
      >
        Forgot password?
      </button>

      {showReset && (
        <Sheet
          title="Forgot your password?"
          onClose={() => {
            setShowReset(false)
            setResetConfirm('')
          }}
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs leading-relaxed">
              Your password cannot be recovered — it never leaves this device. To regain access,
              erase this wallet and restore it from your <strong>recovery phrase</strong> (or
              keystore / private key).
            </p>
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-500">
                Without your recovery phrase, erasing makes the funds in this wallet permanently
                inaccessible.
              </p>
            </div>
            <TextField
              label='Type "ERASE" to confirm'
              value={resetConfirm}
              onChange={setResetConfirm}
            />
            <PrimaryButton
              variant="danger"
              disabled={resetConfirm !== 'ERASE'}
              onClick={() => resetWallet()}
            >
              Erase and restore
            </PrimaryButton>
          </div>
        </Sheet>
      )}
    </FlowScreen>
  )
}
