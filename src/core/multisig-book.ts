/**
 * Multisigs this device knows, and the signing requests it has open (src/core/multisig.ts).
 * Everything here is public: members' public keys, unsigned transactions, signatures. It lives
 * in this browser (localStorage), per device; a member on another device adds the same multisig
 * from the same keys, or from a request.
 */

import { createKeyset, mergeRequests, requestId, type MultisigKeyset, type MultisigRequest } from './multisig'

export interface SavedMultisig extends MultisigKeyset {
  name: string
  createdAt: number
}

const BOOK = 'qrdx_multisigs'
const REQUESTS = 'qrdx_multisig_requests'
/** Requests kept: enough for work in progress, not a history. */
const KEEP_REQUESTS = 50

function read<T>(key: string): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function write(key: string, value: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: it lasts for this page */
  }
}

export function savedMultisigs(): SavedMultisig[] {
  return read<SavedMultisig>(BOOK).flatMap((s) => {
    try {
      // Re-derived, so a damaged entry is dropped rather than signing for the wrong address.
      const k = createKeyset(s.publicKeys, s.m)
      return [{ ...k, name: String(s.name || 'Multisig'), createdAt: Number(s.createdAt) || 0 }]
    } catch {
      return []
    }
  })
}

/** Adds the multisig, or renames it if it is already saved. */
export function saveMultisig(keyset: MultisigKeyset, name: string): SavedMultisig[] {
  const entry: SavedMultisig = { ...keyset, name: name.trim() || 'Multisig', createdAt: Date.now() }
  const list = savedMultisigs()
  const at = list.findIndex((s) => s.address === keyset.address)
  if (at >= 0) list[at] = { ...list[at], name: entry.name }
  else list.push(entry)
  write(BOOK, list)
  return list
}

export function forgetMultisig(address: string): SavedMultisig[] {
  const list = savedMultisigs().filter((s) => s.address !== address)
  write(BOOK, list)
  return list
}

export function openRequests(): MultisigRequest[] {
  return read<MultisigRequest>(REQUESTS)
}

/** Keeps the request, merging its signatures into one already kept for the same transaction. */
export function keepRequest(req: MultisigRequest): MultisigRequest {
  const list = openRequests()
  const id = requestId(req)
  const at = list.findIndex((r) => {
    try {
      return requestId(r) === id
    } catch {
      return false
    }
  })
  const merged = at >= 0 ? mergeRequests(list[at], req) : req
  if (at >= 0) list.splice(at, 1)
  write(REQUESTS, [merged, ...list].slice(0, KEEP_REQUESTS))
  return merged
}

export function dropRequest(id: string): void {
  write(
    REQUESTS,
    openRequests().filter((r) => {
      try {
        return requestId(r) !== id
      } catch {
        return false
      }
    })
  )
}
