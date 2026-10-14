/**
 * Who the send form suggests as a recipient: the people this account sent to recently, the
 * wallet's other accounts, and the address book. Typing filters all three by name or address,
 * so a recipient is picked rather than pasted, which is where irreversible mistakes come from.
 */

import { sameAccount } from './account-id'

export type RecipientKind = 'recent' | 'account' | 'contact'

export interface RecipientSuggestion {
  kind: RecipientKind
  address: string
  /** Contact or account name; recent recipients without one have none. */
  label?: string
  /** Recent recipients: when this account last sent to the address (unix seconds), and how often. */
  lastSentAt?: number
  sends?: number
}

export interface RecipientSources {
  contacts: { name: string; address: string; addressType: string; isFavorite?: boolean }[]
  accounts: { id: string; name: string; ethAddress?: string; address?: string; pqAddress?: string; hidden?: boolean }[]
  transactions: { type: string; to: string; timestamp: number; status: string }[]
  /** The sending account; it is never suggested. */
  self: { id?: string; addresses: string[] }
  /** Post-quantum (0xPQ) addresses only exist on QRDX networks. */
  qrdx: boolean
}

const RECENT = 5
const isPq = (a: string) => /^0xPQ/i.test(a)

/** Everything the form can suggest, before any query: recent first, then accounts, then contacts. */
export function recipientSuggestions(src: RecipientSources): RecipientSuggestion[] {
  const own = (a: string) => src.self.addresses.some((s) => s && (a.toLowerCase() === s.toLowerCase() || sameAccount(a, s)))
  const usable = (a: string) => !!a && (src.qrdx || !isPq(a)) && !own(a)
  const named = new Map<string, string>()
  for (const c of src.contacts) named.set(c.address.toLowerCase(), c.name)

  const recent = new Map<string, RecipientSuggestion>()
  for (const t of [...src.transactions].sort((a, b) => b.timestamp - a.timestamp)) {
    if (t.type !== 'send' || t.status === 'failed' || !usable(t.to)) continue
    const key = t.to.toLowerCase()
    const seen = recent.get(key)
    if (seen) seen.sends = (seen.sends ?? 1) + 1
    else recent.set(key, { kind: 'recent', address: t.to, label: named.get(key), lastSentAt: t.timestamp, sends: 1 })
  }

  const accounts: RecipientSuggestion[] = []
  for (const a of src.accounts) {
    if (a.hidden || a.id === src.self.id) continue
    for (const address of [a.ethAddress ?? a.address, a.pqAddress]) {
      if (address && usable(address)) accounts.push({ kind: 'account', address, label: isPq(address) ? `${a.name} · PQ` : a.name })
    }
  }

  const contacts = src.contacts
    .filter((c) => usable(c.address))
    .sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite) || a.name.localeCompare(b.name))
    .map((c): RecipientSuggestion => ({ kind: 'contact', address: c.address, label: c.name }))

  return [...[...recent.values()].slice(0, RECENT), ...accounts, ...contacts]
}

/** The suggestions a query matches: a name containing it, or an address starting with or containing it. */
export function matchRecipients(all: RecipientSuggestion[], query: string): RecipientSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return all
  const hits = all.filter((s) => s.label?.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
  // An address appearing under several kinds is shown once, as its most specific kind.
  const out = new Map<string, RecipientSuggestion>()
  for (const s of hits) {
    const key = s.address.toLowerCase()
    if (!out.has(key)) out.set(key, s)
  }
  // The address already typed in full needs no suggestion.
  return [...out.values()].filter((s) => s.address.toLowerCase() !== q)
}
