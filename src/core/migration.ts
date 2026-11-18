/**
 * Quantum migration on QRDX (qrdx-node docs/QUANTUM_MIGRATION.md, docs.qrdx.org guides/quantum-migration).
 *
 * Each wallet account has a classic `0x` address (ECDSA) and a post-quantum `0xPQ` address from
 * the same recovery phrase. The classic one is protected by binding the post-quantum one as its
 * **successor**: an ACCOUNT_POLICY `add_controller`, sent from the classic key through the
 * exchange write precompile (exchange_evm.py: `sendAction(string)` at 0x…0401). It runs at the
 * start of the next block. From then on the successor signs for the classic address (exchange
 * transactions with `sender` the 0x address and `signer` the 0xPQ one), and keeps doing so after
 * the Doomsday Protocol stops ECDSA.
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { bytesToHex } from './crypto'
import type { ChainConfig } from './chains'
import { getEvmProvider } from './ethereum'
import type { Authority } from './qns'

export const EXCHANGE_WRITE_ADDRESS = '0x0000000000000000000000000000000000000401'
/**
 * Gas for the precompile call when the node cannot estimate it: the transaction's 21,000 and
 * calldata, the write's 25,000, and the action's exchange gas (40,000) at one EVM gas per 10.
 */
export const SEND_ACTION_FALLBACK_GAS = 60_000n

const utf8 = new TextEncoder()
const SEND_ACTION = bytesToHex(keccak256(utf8.encode('sendAction(string)')).slice(0, 4))

const word = (n: number) => n.toString(16).padStart(64, '0')

/** Calldata for `sendAction(actionJson)`: the selector, then the ABI-encoded string. */
export function encodeSendAction(action: { op: string; params: Record<string, unknown> }): string {
  const body = utf8.encode(JSON.stringify(action))
  const padded = new Uint8Array(Math.ceil(body.length / 32) * 32)
  padded.set(body)
  return '0x' + SEND_ACTION.replace(/^0x/, '') + word(32) + word(body.length) + bytesToHex(padded).replace(/^0x/, '')
}

/** Calldata binding `successor` as the classic account's controller. */
export function bindSuccessorCall(successor: string): string {
  return encodeSendAction({ op: 'ACCOUNT_POLICY', params: { action: 'add_controller', controller: successor } })
}

export type MigrationState =
  /** The successor is a controller: the classic address is protected. */
  | { kind: 'protected'; ownKey: boolean; via: 'qrdx' | 'registry' }
  /** The binding waits out the classic account's delay. */
  | { kind: 'waiting'; due: number }
  | { kind: 'unprotected' }

/** Where the classic account stands, from its authority. */
export function migrationState(auth: Authority, successor: string): MigrationState {
  const same = (a: unknown) => typeof a === 'string' && a.toLowerCase() === successor.toLowerCase()
  if (auth.controllers.some((c) => same(c.address))) {
    return { kind: 'protected', ownKey: auth.own_key, via: auth.migration && same(auth.migration.successor) ? 'registry' : 'qrdx' }
  }
  const pending = auth.pending_changes.find((c) => c.action === 'add_controller' && same(c.value))
  if (pending) return { kind: 'waiting', due: Number(pending.due) }
  return { kind: 'unprotected' }
}

export interface DoomsdayStatus {
  /** Null until the protocol triggers; then when, and how. */
  triggered: { time?: number; height?: number; reason?: string } | null
  canaries: Record<string, unknown>
}

/** bridge_getDoomsday: whether ECDSA still signs on this network. Null if the node has no such method. */
export async function doomsdayStatus(chain: ChainConfig): Promise<DoomsdayStatus | null> {
  return getEvmProvider(chain.id)
    .rpc<DoomsdayStatus>('bridge_getDoomsday', [])
    .catch(() => null)
}
