/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Platform targets and their feature sets
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  One UI, three shipping targets. Features are switched by what the running
 *  environment *is*, never by a build flag, so the same bundle behaves
 *  correctly whether it is opened in a tab, installed to an iPhone home
 *  screen, or loaded as the extension popup.
 *
 *  The matrix (kept in sync with docs/PLATFORMS.md):
 *
 *                         web          iPhone PWA      extension
 *    dApp provider        –            –               ✓ window.ethereum / window.qrdx / EIP-6963
 *    biometric unlock     passkey PRF  passkey PRF     passkey PRF where the browser supports it
 *    session on reload    locks        locks           survives (chrome.storage.session)
 *    lock when hidden     off          30 s            n/a (popup closes)
 *    auto-lock default    10 min       5 min           15 min
 *    install prompt       browser      Share → Add…    store
 *    storage              localStorage localStorage    chrome.storage.local
 *    eviction risk        yes (ITP)    no (installed)  no
 */

import type { WalletSettings } from '../core/types'

export type PlatformTarget = 'extension' | 'ios-pwa' | 'pwa' | 'web'

export interface PlatformInfo {
  target: PlatformTarget
  label: string
  isIOS: boolean
  /** Running installed (home screen / app window) rather than in a browser tab. */
  standalone: boolean
  /** The extension injects a provider into web pages; nothing else can. */
  dappProvider: boolean
  /** Unlocked sessions survive a reload. */
  persistentSession: boolean
  /** Whether to offer "install to home screen", and how. */
  install: 'browser-prompt' | 'ios-share-sheet' | 'none'
  /** Browser storage may be evicted after inactivity (Safari ITP, not installed). */
  storageEvictionRisk: boolean
  webShare: boolean
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
  )
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  )
}

export function isExtensionContext(): boolean {
  if (typeof location === 'undefined') return false
  return (
    location.protocol === 'chrome-extension:' ||
    location.protocol === 'moz-extension:' ||
    location.protocol === 'safari-web-extension:'
  )
}

export function detectPlatform(): PlatformInfo {
  const ios = isIOSDevice()
  const standalone = isStandalone()
  const ext = isExtensionContext()
  const target: PlatformTarget = ext ? 'extension' : standalone ? (ios ? 'ios-pwa' : 'pwa') : 'web'

  return {
    target,
    label: {
      extension: 'Browser extension',
      'ios-pwa': 'iPhone app',
      pwa: 'Installed app',
      web: 'Web',
    }[target],
    isIOS: ios,
    standalone,
    dappProvider: ext,
    persistentSession: ext,
    install: ext || standalone ? 'none' : ios ? 'ios-share-sheet' : 'browser-prompt',
    storageEvictionRisk: !ext && !standalone,
    webShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !ext,
  }
}

/** Settings a brand-new vault starts with on each target. */
export function platformDefaultSettings(target: PlatformTarget): Partial<WalletSettings> {
  switch (target) {
    case 'extension':
      return { autoLock: true, autoLockTimeout: 15 * 60_000 }
    case 'ios-pwa':
      return { autoLock: true, autoLockTimeout: 5 * 60_000, lockOnHideAfter: 30_000 }
    case 'pwa':
      return { autoLock: true, autoLockTimeout: 5 * 60_000, lockOnHideAfter: 60_000 }
    default:
      return { autoLock: true, autoLockTimeout: 10 * 60_000 }
  }
}
