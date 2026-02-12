'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker and handles PWA lifecycle events.
 * Drop this inside any layout that should behave as a PWA.
 */
export function PWAProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service worker registered', reg.scope)
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration failed', err)
      })
  }, [])

  return <>{children}</>
}
