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
  /** Changes to who may sign for the account: a waiting change, a recovery, a new controller. */
  security: boolean
  alerts: PriceAlert[]
}

const KEY = 'qrdx_notify'
// Security alerts are on unless turned off: they are what a stolen key looks like. They still
// need the system's permission, asked for when any notification is first turned on.
const DEFAULTS: NotifyPrefs = { transactions: false, priceAlerts: false, security: true, alerts: [] }

export function readNotifyPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotifyPrefs> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
    const alerts = Array.isArray(raw.alerts)
      ? raw.alerts.filter((a): a is PriceAlert => !!a && typeof a.symbol === 'string' && (a.direction === 'above' || a.direction === 'below') && typeof a.price === 'number' && Number.isFinite(a.price))
      : []
    return { transactions: raw.transactions === true, priceAlerts: raw.priceAlerts === true, security: raw.security !== false, alerts }
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

/** What the wallet last saw of an account's authority: enough to tell what is new. */
export interface AuthoritySnapshot {
  controllers: string[]
  pending: string[]
  ownKey: boolean
}

export interface SecurityEvent {
  /** Stable, so a notification is never repeated for the same thing. */
  tag: string
  title: string
  body: string
}

/**
 * What changed between two looks at an account's authority, said for a person. `label` names the
 * account ("Main account", "Main account's classic address").
 */
export function securityEvents(
  label: string,
  before: AuthoritySnapshot,
  now: { controllers: { address: string }[]; own_key: boolean; pending_changes: { change_id: string; action: string; value: unknown; due: string }[] }
): SecurityEvent[] {
  const out: SecurityEvent[] = []
  const short = (a: unknown) => (typeof a === 'string' && a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : String(a ?? ''))
  const when = (due: string) => new Date(Number(due) * 1000).toLocaleString()
  for (const c of now.pending_changes) {
    if (before.pending.includes(c.change_id)) continue
    out.push(
      c.action === 'recover'
        ? { tag: `recover:${c.change_id}`, title: `Recovery started: ${label}`, body: `Your guardians are handing it to ${short(c.value)} on ${when(c.due)}. Cancel it in Account control if you did not ask for this.` }
        : { tag: `change:${c.change_id}`, title: `Waiting change: ${label}`, body: `${c.action.replace(/_/g, ' ')}${typeof c.value === 'string' ? ` ${short(c.value)}` : ''} applies ${when(c.due)}. Cancel it in Account control if it was not you.` }
    )
  }
  for (const c of now.controllers) {
    if (before.controllers.includes(c.address.toLowerCase())) continue
    out.push({ tag: `controller:${c.address.toLowerCase()}`, title: `New controller: ${label}`, body: `${short(c.address)} can now sign anything for it.` })
  }
  if (before.ownKey && !now.own_key) out.push({ tag: `own-key-off:${label}`, title: `Key turned off: ${label}`, body: 'Its own key no longer signs; only its controllers do.' })
  return out
}

export function snapshotOf(auth: { controllers: { address: string }[]; own_key: boolean; pending_changes: { change_id: string }[] }): AuthoritySnapshot {
  return { controllers: auth.controllers.map((c) => c.address.toLowerCase()), pending: auth.pending_changes.map((c) => c.change_id), ownKey: auth.own_key }
}

/** The alerts a price crosses: `above` fires at or over its price, `below` at or under. */
export function crossedAlerts(alerts: PriceAlert[], prices: Map<string, { usd: number }>): PriceAlert[] {
  return alerts.filter((a) => {
    const p = prices.get(a.symbol.toUpperCase())?.usd
    if (p == null || !Number.isFinite(p)) return false
    return a.direction === 'above' ? p >= a.price : p <= a.price
  })
}
