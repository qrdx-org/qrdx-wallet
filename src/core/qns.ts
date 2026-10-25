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
export function reverseQns(chain: ChainConfig, address: string): Promise<string | null> {
  if (!isQrdxChain(chain) || !address) return Promise.resolve(null)
  const key = `${chain.id}:${address.toLowerCase()}`
  const hit = reverseCache.get(key)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.name
  const name = getEvmProvider(chain.id)
    .rpc<string | null>('qns_reverse', [address])
    .then((n) => n || null)
    .catch(() => null)
  reverseCache.set(key, { at: Date.now(), name })
  return name
}
