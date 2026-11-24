'use client'

import { Wordmark } from '@/components/QrdxMark'
import { DRAW, RISE } from '@/components/motion/cascade'
import { motion, useReducedMotion } from 'framer-motion'
import { Fragment, useEffect, useState } from 'react'
import { Fingerprint, AlertTriangle } from 'lucide-react'
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

const HEADLINE = ['Welcome', 'back.']

/**
 * Welcome back: the same composition as the first screen (onboarding/Welcome.tsx), the name at
 * the top clear of the orb and the way in at the bottom, where the thumb is.
 */
export function Unlock() {
  const reduce = useReducedMotion()
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
    <FlowScreen>
      <motion.div className="flex flex-1 flex-col" initial={reduce ? false : 'hidden'} animate="shown">
        <motion.div variants={RISE} custom={0}>
          <Wordmark />
        </motion.div>

        <div className="min-h-16 flex-1" />

        <h1 className="text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em]">
          {/* Each word on its own line, with a real space between them for readers and search. */}
          {HEADLINE.map((word, i) => (
            <Fragment key={word}>
              {i > 0 && ' '}
              <motion.span variants={RISE} custom={1 + i} className="block">
                {word}
              </motion.span>
            </Fragment>
          ))}
        </h1>
        <motion.p variants={RISE} custom={3} className="mt-3 text-sm text-muted-foreground">
          Unlock your wallet to continue.
        </motion.p>

        <div className="relative mt-7 pt-6">
          <motion.span variants={DRAW} custom={4} className="absolute inset-x-0 top-0 h-px origin-left bg-foreground/15" />
          <motion.div variants={RISE} custom={4} className="space-y-4">
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
          </motion.div>
        </div>

        <motion.button
          variants={RISE}
          custom={5}
          type="button"
          onClick={() => setShowReset(true)}
          className="mt-5 self-start text-xs text-muted-foreground underline decoration-foreground/20 underline-offset-4 hover:text-foreground"
        >
          Forgot password?
        </motion.button>
      </motion.div>

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
