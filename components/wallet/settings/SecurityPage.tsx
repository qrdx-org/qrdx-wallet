'use client'

/**
 * Security: how and when the wallet locks, biometric unlock, password, and
 * erasing the device. Options shown depend on the platform — e.g. "lock when
 * hidden" only makes sense for an app that can be backgrounded, and storage
 * durability only for the web targets.
 */

import { useEffect, useState } from 'react'
import { Database, Fingerprint, Lock, LockKeyhole, Smartphone, Trash2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import {
  persistenceState,
  requestPersistentStorage,
  type PersistenceState,
} from '@/src/pwa/storage-persistence'
import { InstallHint } from '@/src/pwa/install'
import {
  ErrorBanner,
  NewPasswordFields,
  Notice,
  PasswordField,
  PrimaryButton,
  Sheet,
  TextField,
  newPasswordValid,
} from '../flow/FlowKit'
import { PasswordSheet, Row, Section, Segmented, SettingsPage, Toggle } from './shared'

const AUTO_LOCK = [
  { value: '60000', label: '1m' },
  { value: '300000', label: '5m' },
  { value: '900000', label: '15m' },
  { value: '1800000', label: '30m' },
  { value: 'never', label: 'Never' },
] as const

const HIDE_LOCK = [
  { value: '0', label: 'Instantly' },
  { value: '30000', label: '30s' },
  { value: '60000', label: '1m' },
  { value: '300000', label: '5m' },
  { value: 'off', label: 'Off' },
] as const

export function SecurityPage({ onBack }: { onBack: () => void }) {
  const w = useWallet()
  const settings = w.state?.settings
  const [sheet, setSheet] = useState<null | 'bio-on' | 'password' | 'reset'>(null)
  const [persist, setPersist] = useState<PersistenceState>('unsupported')
  const close = () => setSheet(null)

  useEffect(() => {
    if (w.platform.target !== 'extension') persistenceState().then(setPersist)
  }, [w.platform.target])

  const autoLockValue = !settings?.autoLock ? 'never' : String(settings.autoLockTimeout)
  const hideValue =
    settings?.lockOnHideAfter === undefined ? 'off' : String(settings.lockOnHideAfter)
  const host = typeof location !== 'undefined' ? location.hostname : ''
  const thisDevice = w.state?.passkeys.find((p) => p.rpId === host)
  const others = (w.state?.passkeys ?? []).filter((p) => p.rpId !== host)
  const bioName = w.platform.isIOS ? 'Face ID / Touch ID' : 'Biometric unlock'

  return (
    <SettingsPage title="Security" onBack={onBack}>
      <Section title="Locking">
        <div className="p-3">
          <div className="text-sm font-medium">Auto-lock</div>
          <div className="text-[11px] text-muted-foreground mb-2">
            Lock after this long without activity
          </div>
          <Segmented
            value={AUTO_LOCK.some((o) => o.value === autoLockValue) ? autoLockValue : '900000'}
            options={[...AUTO_LOCK]}
            onChange={(v) =>
              w.updateSettings(
                v === 'never' ? { autoLock: false } : { autoLock: true, autoLockTimeout: Number(v) }
              )
            }
          />
          {autoLockValue === 'never' && (
            <p className="text-[10px] text-amber-500 mt-1.5">
              Anyone with this device can use the wallet while it is unlocked.
            </p>
          )}
        </div>
        {w.platform.target !== 'extension' && (
          <div className="p-3">
            <div className="text-sm font-medium">Lock when hidden</div>
            <div className="text-[11px] text-muted-foreground mb-2">
              {w.platform.standalone
                ? 'When you switch away from the app'
                : 'When you switch tabs or minimise the browser'}
            </div>
            <Segmented
              value={hideValue}
              options={[...HIDE_LOCK]}
              onChange={(v) =>
                w.updateSettings({ lockOnHideAfter: v === 'off' ? undefined : Number(v) })
              }
            />
          </div>
        )}
        <Row icon={<Lock className="h-4 w-4" />} label="Lock now" onClick={() => w.lock()} />
      </Section>

      <Section title="Biometrics">
        {w.biometrics.support === 'unsupported' ? (
          <div className="p-3 text-[11px] text-muted-foreground">
            This {w.platform.target === 'extension' ? 'browser' : 'device'} cannot unlock the wallet
            with a passkey.
            {w.platform.isIOS &&
              !w.platform.standalone &&
              ' Install the app to your home screen on iOS 18 or later to use Face ID.'}
          </div>
        ) : (
          <Row
            icon={<Fingerprint className="h-4 w-4" />}
            label={bioName}
            description={
              thisDevice
                ? `On — ${thisDevice.label}`
                : 'Unlock with a passkey instead of typing your password'
            }
            right={
              <Toggle
                label={bioName}
                checked={!!thisDevice}
                onChange={(on) =>
                  on
                    ? setSheet('bio-on')
                    : thisDevice && w.disableBiometrics(thisDevice.credentialId)
                }
              />
            }
          />
        )}
        {others.map((p) => (
          <Row
            key={p.credentialId}
            icon={<Smartphone className="h-4 w-4" />}
            label={p.label}
            description={`Passkey for ${p.rpId}`}
            right={
              <button
                type="button"
                className="text-[11px] text-red-500"
                onClick={() => w.disableBiometrics(p.credentialId)}
              >
                Remove
              </button>
            }
          />
        ))}
      </Section>

      <Section title="Password">
        <Row
          icon={<LockKeyhole className="h-4 w-4" />}
          label="Change password"
          description="Biometric unlock keeps working"
          onClick={() => setSheet('password')}
        />
      </Section>

      {w.platform.target !== 'extension' && (
        <Section title="Storage on this device">
          <Row
            icon={<Database className="h-4 w-4" />}
            label={
              persist === 'persisted' || w.platform.standalone
                ? 'Protected from clean-up'
                : 'May be cleared by the browser'
            }
            description={
              w.platform.isIOS && w.platform.standalone
                ? 'Installed apps keep their data on iOS.'
                : persist === 'persisted'
                  ? 'The browser agreed to keep wallet data.'
                  : 'Install the app or allow persistent storage. Your recovery phrase is the real backup.'
            }
            right={
              persist !== 'persisted' && persist !== 'unsupported' && !w.platform.isIOS ? (
                <button
                  type="button"
                  className="text-[11px] text-primary font-medium"
                  onClick={() => requestPersistentStorage().then(setPersist)}
                >
                  Allow
                </button>
              ) : undefined
            }
          />
          {w.platform.install !== 'none' && (
            <div className="p-1.5">
              <InstallHint dismissible={false} compact />
            </div>
          )}
        </Section>
      )}

      <Section title="Danger zone">
        <Row
          icon={<Trash2 className="h-4 w-4" />}
          label="Erase wallet from this device"
          description="Recover later with your recovery phrase"
          danger
          onClick={() => setSheet('reset')}
        />
      </Section>

      {sheet === 'bio-on' && (
        <PasswordSheet
          title={`Turn on ${bioName}`}
          description="Confirm your password, then approve the passkey prompt. Your password is not stored."
          confirmLabel="Continue"
          onSubmit={async (pw) => {
            await w.enableBiometrics(pw)
            close()
          }}
          onClose={close}
        />
      )}
      {sheet === 'password' && <ChangePasswordSheet onClose={close} />}
      {sheet === 'reset' && <ResetSheet onClose={close} />}
    </SettingsPage>
  )
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await w.changePassword(current, next)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <Notice tone="success">Password changed. Use it next time you unlock.</Notice>
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        </div>
      ) : (
        <div className="space-y-3">
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoFocus />
          <NewPasswordFields
            password={next}
            confirm={confirm}
            onPassword={setNext}
            onConfirm={setConfirm}
            labels={{ password: 'New password', confirm: 'Confirm new password' }}
          />
          <ErrorBanner error={error} />
          <PrimaryButton
            loading={busy}
            disabled={!current || !newPasswordValid(next, confirm)}
            onClick={submit}
          >
            Change password
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

function ResetSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet()
  const [typed, setTyped] = useState('')
  return (
    <Sheet title="Erase this wallet?" onClose={onClose}>
      <div className="space-y-3">
        <Notice tone="warning">
          Every account, setting and passkey on this device is deleted. Funds stay on-chain and can
          be restored only with your recovery phrase, keystore or private keys.
        </Notice>
        <TextField label='Type "ERASE" to confirm' value={typed} onChange={setTyped} />
        <PrimaryButton
          variant="danger"
          disabled={typed !== 'ERASE'}
          onClick={() => w.resetWallet()}
        >
          Erase everything
        </PrimaryButton>
      </div>
    </Sheet>
  )
}
