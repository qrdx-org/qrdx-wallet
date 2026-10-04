'use client'

/**
 * "Install the app" for each platform.
 *
 *   Chromium (desktop/Android): capture `beforeinstallprompt` and show our own button.
 *   iPhone/iPad Safari:         there is no prompt API; show Share → Add to Home Screen.
 *   Installed / extension:      nothing to offer.
 *
 * On iOS installing is not cosmetic: installed web apps are exempt from
 * Safari's seven-day storage eviction, which would otherwise delete the vault
 * of a user who does not open the site for a week.
 */

import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, X } from 'lucide-react'
import { detectPlatform } from '@/src/shared/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  const platform = detectPlatform()
  return {
    mode: platform.install,
    canPrompt: platform.install === 'browser-prompt' && deferred !== null,
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      return outcome === 'accepted'
    },
  }
}

const DISMISS_KEY = 'qrdx_install_hint_dismissed'

/** Compact install card; renders nothing where installing isn't possible. */
export function InstallHint({
  compact = false,
  dismissible = true,
}: {
  compact?: boolean
  dismissible?: boolean
}) {
  const { mode, canPrompt, prompt } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return dismissible && localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed || mode === 'none' || (mode === 'browser-prompt' && !canPrompt)) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-3">
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {mode === 'ios-share-sheet' ? (
        <div className="pr-6">
          <div className="text-xs font-semibold mb-1">Install QRDX Wallet on your iPhone</div>
          {!compact && (
            <p className="text-[11px] text-muted-foreground mb-2">
              Installed, the wallet opens full-screen, can use Face ID, and Safari will not clear
              its storage.
            </p>
          )}
          <ol className="text-[11px] text-muted-foreground space-y-1">
            <li className="flex items-center gap-1.5">
              1. Tap <Share className="h-3.5 w-3.5 inline text-primary" aria-label="Share" /> in
              Safari’s toolbar
            </li>
            <li className="flex items-center gap-1.5">
              2. Choose <PlusSquare className="h-3.5 w-3.5 inline text-primary" />{' '}
              <strong>Add to Home Screen</strong>
            </li>
            <li>3. Open QRDX Wallet from your home screen</li>
          </ol>
        </div>
      ) : (
        <div className="flex items-center gap-3 pr-6">
          <Download className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Install the app</span> for a full-screen
            wallet that keeps its data.
          </div>
          <button
            type="button"
            onClick={() => prompt()}
            className="text-xs font-semibold text-primary"
          >
            Install
          </button>
        </div>
      )}
    </div>
  )
}
