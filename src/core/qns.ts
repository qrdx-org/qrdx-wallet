/**
 * QNS, the QRDX Name Service (qrdx-node docs/QNS.md): `label.qrdx` names that resolve to an
 * address, and an account's primary name (its reverse record). A name is a native NFT, so
 * whoever holds it decides where it points: a name is shown beside the address it resolved
 * to, never instead of it.
 */

import { getEvmProvider } from './ethereum'
import { isQrdxChain, type ChainConfig } from './chains'
import { isMethodMissing } from './tx-service'

/** label.qrdx: 3–59 of a-z, 0-9 and "-", not starting or ending with "-". */
export const QNS_NAME = /^[a-z0-9](?:[a-z0-9-]{1,57}[a-z0-9])\.qrdx$/

export function isQnsName(input: string): boolean {
  return QNS_NAME.test(input.trim().toLowerCase())
}

export type QnsResolution =
  | { state: 'resolved'; name: string; address: string }
  | { state: 'unregistered'; name: string }
  | { state: 'unsupported'; name: string }

/** Where a name points now (null: unregistered, expired, or no address record). */
export async function resolveQnsName(chain: ChainConfig, input: string): Promise<QnsResolution> {
  const name = input.trim().toLowerCase()
  if (!isQrdxChain(chain)) return { state: 'unsupported', name }
  try {
    const address = await getEvmProvider(chain.id).rpc<string | null>('qns_resolve', [name])
    return address ? { state: 'resolved', name, address } : { state: 'unregistered', name }
  } catch (e) {
    if (isMethodMissing(e)) return { state: 'unsupported', name }
    throw e
  }
}

const reverseCache = new Map<string, { at: number; name: Promise<string | null> }>()

/** An address's primary name while it is valid; null without one (or on a node without QNS). */
export function reverseQns(chain: ChainConfig, address: string, fresh = false): Promise<string | null> {
  if (!isQrdxChain(chain) || !address) return Promise.resolve(null)
  const key = `${chain.id}:${address.toLowerCase()}`
  const hit = reverseCache.get(key)
  if (!fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.name
  const name = getEvmProvider(chain.id)
    .rpc<string | null>('qns_reverse', [address])
    .then((n) => n || null)
    .catch(() => null)
  reverseCache.set(key, { at: Date.now(), name })
  return name
}

/** Price factor for short labels (qrdx-node qns.price_factor): 128× for 3 characters, 32× for 4. */
export function qnsLengthFactor(name: string): number {
  const label = name.toLowerCase().replace(/\.qrdx$/, '')
  return label.length <= 3 ? 128 : label.length === 4 ? 32 : 1
}

/** qns_getName (qrdx-node qrdx/exchange/qns.py `summary`). */
export interface QnsNameInfo {
  name: string
  /** Who holds the name's NFT. */
  owner: string
  token_id: string
  /** Block time it expires; `expired` once it has (it resolves to nothing then). */
  expires: string
  expired: boolean
  /** When anyone else may register it, after the grace period. */
  available_from: string
  /** Its address record (where it points), or null. */
  address: string | null
  /** What it resolves to now: `address` while unexpired, else null. */
  resolves_to: string | null
  /** Text records. */
  texts: Record<string, string>
}

async function qnsRead<T>(chain: ChainConfig, method: string, params: unknown[]): Promise<T | null> {
  if (!isQrdxChain(chain)) return null
  try {
    return await getEvmProvider(chain.id).rpc<T>(method, params)
  } catch (e) {
    if (isMethodMissing(e)) return null
    throw e
  }
}

/** A name's owner, expiry and records; null when unregistered (or the node has no QNS). */
export const qnsGetName = (chain: ChainConfig, name: string) => qnsRead<QnsNameInfo | null>(chain, 'qns_getName', [name.trim().toLowerCase()])
export const qnsNamesOf = (chain: ChainConfig, address: string) => qnsRead<string[]>(chain, 'qns_namesOf', [address])
/** QRDX for `years` of a 5+ character name (multiply by qnsLengthFactor for shorter ones). */
export const qnsPrice = (chain: ChainConfig, years: number) => qnsRead<string>(chain, 'qns_price', [years])

/** account_getAuthority (qrdx-node docs/ACCOUNT_CONTROL.md): everyone who may sign for an address. */
export interface Authority {
  address: string
  controllers: { address: string; members: { threshold: number; members: string[] } | null }[]
  own_key: boolean
  delay: number
  guardians?: { addresses: string[]; threshold: number; recovery_delay: number }
  pending_changes: { change_id: string; action: string; value: unknown; due: string }[]
  agents: { agent: string; name: string; valid_until: string; max_notional_per_day?: string; placed_today?: string }[]
  subaccount_of?: string
  multisig?: { threshold: number; members: string[] }
}

export const accountAuthority = (chain: ChainConfig, address: string) => qnsRead<Authority>(chain, 'account_getAuthority', [address])
