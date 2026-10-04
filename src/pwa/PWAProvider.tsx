'use client'

/**
 * Service-worker lifecycle for the web app and installed PWA.
 *
 * Skipped entirely inside the extension (extension pages cannot and need not
 * register one). When a new version has been downloaded it waits; the banner
 * lets the user apply it, so an update never reloads the page mid-transaction.
 */

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { isExtensionContext } from '@/src/shared/platform'

/** Set when the user taps Update; the only time a controller change may reload the page. */
let updateRequested = false

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isExtensionContext())
      return
    if (
      process.env.NODE_ENV !== 'production' &&
      location.hostname === 'localhost' &&
      !location.search.includes('sw=1')
    )
      return

    // Reload only when the user asked for an update. On a first visit the new
    // worker's clients.claim() also fires `controllerchange`; reloading then
    // would throw a new user back to the start of onboarding.
    let reloading = false
    const onController = () => {
      if (reloading || !updateRequested) return
      reloading = true
      location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onController)

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw)
          })
        })
        // Installed apps can stay open for days; look for updates when brought back.
        const check = () =>
          document.visibilityState === 'visible' && reg.update().catch(() => undefined)
        document.addEventListener('visibilitychange', check)
      })
      .catch((err) => console.warn('[PWA] Service worker registration failed', err))

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onController)
  }, [])

  return (
    <>
      {children}
      {waiting && (
        <div className="fixed inset-x-0 bottom-0 z-50 pb-safe flex justify-center pointer-events-none">
          <div className="p-3 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-xl glass-strong border border-primary/30 px-4 py-2.5 shadow-lg">
              <RefreshCw className="h-4 w-4 text-primary" />
              <span className="text-xs">A new version of QRDX Wallet is ready.</span>
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => {
                  updateRequested = true
                  waiting.postMessage({ type: 'SKIP_WAITING' })
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
