/**
 * Wallet notifications: system notifications (the Notifications API, through the service
 * worker where there is one, so the iPhone home-screen app and the extension show them too)
 * for the account's transactions and for price alerts the user sets. They are checked while
 * the wallet is open; there is no server that could push them otherwise.
 *
 * Preferences live in this browser (localStorage), per device.
 */

export interface PriceAlert {
  id: string
  /** Token symbol, as the wallet prices it ("QRDX", "ETH"). */
  symbol: string
  direction: 'above' | 'below'
  /** USD. */
  price: number
  createdAt: number
}

export interface NotifyPrefs {
  transactions: boolean
  priceAlerts: boolean
  alerts: PriceAlert[]
}

const KEY = 'qrdx_notify'
const DEFAULTS: NotifyPrefs = { transactions: false, priceAlerts: false, alerts: [] }

export function readNotifyPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotifyPrefs> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
    const alerts = Array.isArray(raw.alerts)
      ? raw.alerts.filter((a): a is PriceAlert => !!a && typeof a.symbol === 'string' && (a.direction === 'above' || a.direction === 'below') && typeof a.price === 'number' && Number.isFinite(a.price))
      : []
    return { transactions: raw.transactions === true, priceAlerts: raw.priceAlerts === true, alerts }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeNotifyPrefs(prefs: NotifyPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable: preferences last for this page */
  }
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function notificationPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Show a system notification, if the user allowed them. */
export async function notify(title: string, body: string, tag?: string): Promise<void> {
  if (notificationPermission() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' })
      return
    }
  } catch {
    /* fall back to a page notification */
  }
  try {
    new Notification(title, { body, tag, icon: '/icon-192.png' })
  } catch {
    /* not allowed in this context */
  }
}

/** The alerts a price crosses: `above` fires at or over its price, `below` at or under. */
export function crossedAlerts(alerts: PriceAlert[], prices: Map<string, { usd: number }>): PriceAlert[] {
  return alerts.filter((a) => {
    const p = prices.get(a.symbol.toUpperCase())?.usd
    if (p == null || !Number.isFinite(p)) return false
    return a.direction === 'above' ? p >= a.price : p <= a.price
  })
}
