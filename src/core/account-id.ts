/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Canonical account identity
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Port of `qrdx/crypto/account_id.py`. The node keeps a single ledger keyed by
 *  a 20-byte **account id**; every address form is a credential that maps onto
 *  one of those ids by a pure function — no registry, no lookup:
 *
 *    traditional  0x + 40 hex    → itself, lowercased
 *    post-quantum 0xPQ + 64 hex  → keccak(D ‖ ":pq:"     ‖ raw32)[-20:]
 *    multisig     0xPQMS + hex   → keccak(D ‖ ":ms:"     ‖ raw  )[-20:]
 *    legacy       Q…/R… base58   → keccak(D ‖ ":legacy:" ‖ ascii)[-20:]
 *    protocol     0xPOOL/0xCLOB/0xPERP + 36 hex
 *                                → keccak(D ‖ ":internal:POOL:" ‖ ascii)[-20:]
 *
 *  where D = "QRDX-ACCOUNT-ID-v1".
 *
 *  This is the value that goes in a transaction's 20-byte `to` field, the
 *  argument `eth_getBalance` keys on, and what a contract sees as `msg.sender`
 *  for a PQ account. Encoding a `0xPQ` address any other way sends funds to an
 *  account nobody controls.
 *
 *  Conformance: tests/conformance/vectors.json is generated from the node's
 *  own module and checked by tests/unit/conformance.test.ts.
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { bytesToHex, hexToBytes } from './crypto'

export const ACCOUNT_ID_DOMAIN = 'QRDX-ACCOUNT-ID-v1'
export const ACCOUNT_ID_LENGTH = 20

/** Protocol-owned holders. No key can sign for these; users must never pay them directly. */
export const SYNTHETIC_HOLDER_PREFIXES = ['0xPOOL', '0xCLOB', '0xPERP'] as const
const SYNTHETIC_HOLDER_BODY_LENGTH = 36

export type AddressForm = 'traditional' | 'post-quantum' | 'multisig' | 'legacy' | 'protocol'

export class AccountIdError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountIdError'
  }
}

const HEX = /^[0-9a-fA-F]*$/
const utf8 = new TextEncoder()

function derive(tag: string, payload: Uint8Array): string {
  const prefix = utf8.encode(`${ACCOUNT_ID_DOMAIN}:${tag}:`)
  const buf = new Uint8Array(prefix.length + payload.length)
  buf.set(prefix, 0)
  buf.set(payload, prefix.length)
  return '0x' + bytesToHex(keccak256(buf).slice(-ACCOUNT_ID_LENGTH))
}

function hexBody(body: string, what: string, input: string): Uint8Array {
  if (body.length % 2 !== 0 || !HEX.test(body)) {
    throw new AccountIdError(`Malformed ${what} address: ${input}`)
  }
  return hexToBytes(body.toLowerCase())
}

/** Classify an address string without deriving anything. Returns null if unrecognised. */
export function addressForm(address: string): AddressForm | null {
  const a = address.trim()
  const lower = a.toLowerCase()
  if (lower.startsWith('0xpqms')) return 'multisig'
  if (lower.startsWith('0xpq')) return 'post-quantum'
  if (
    SYNTHETIC_HOLDER_PREFIXES.some((p) => a.slice(0, p.length).toUpperCase() === p.toUpperCase())
  ) {
    return 'protocol'
  }
  if (lower.startsWith('0x')) return 'traditional'
  if (a.length === 40 && HEX.test(a)) return 'traditional'
  if (a[0] === 'Q' || a[0] === 'R') return 'legacy'
  return null
}

/**
 * Resolve any QRDX address form to its canonical lowercase `0x` account id.
 *
 * @throws {AccountIdError} for anything the node would also reject.
 */
export function toAccountId(address: string): string {
  const addr = address.trim()
  if (!addr) throw new AccountIdError('Empty address')

  // Multisig first: "0xPQMS…" also starts with "0xPQ".
  if (addr.startsWith('0xPQMS') || addr.startsWith('0xpqms')) {
    return derive('ms', hexBody(addr.slice(6), 'multisig', addr))
  }

  if (addr.startsWith('0xPQ') || addr.startsWith('0xpq')) {
    const body = addr.slice(4)
    if (body.length !== 64) {
      throw new AccountIdError(
        `PQ address must have 64 hex characters after 0xPQ, got ${body.length}`
      )
    }
    return derive('pq', hexBody(body, 'post-quantum', addr))
  }

  for (const prefix of SYNTHETIC_HOLDER_PREFIXES) {
    if (addr.slice(0, prefix.length).toUpperCase() === prefix.toUpperCase()) {
      const body = addr.slice(prefix.length).toLowerCase()
      if (body.length !== SYNTHETIC_HOLDER_BODY_LENGTH || !HEX.test(body)) {
        throw new AccountIdError(`Malformed ${prefix} holder: ${addr}`)
      }
      return derive(`internal:${prefix.slice(2)}`, utf8.encode(body))
    }
  }

  if (addr.startsWith('0x') || addr.startsWith('0X')) {
    const body = addr.slice(2)
    if (body.length !== 2 * ACCOUNT_ID_LENGTH) {
      throw new AccountIdError(`Address must have 40 hex characters after 0x, got ${body.length}`)
    }
    hexBody(body, 'traditional', addr)
    return '0x' + body.toLowerCase()
  }

  if (addr.length === 2 * ACCOUNT_ID_LENGTH && HEX.test(addr)) {
    return '0x' + addr.toLowerCase()
  }

  if (addr[0] === 'Q' || addr[0] === 'R') {
    for (let i = 0; i < addr.length; i++) {
      if (addr.charCodeAt(i) > 0x7f) throw new AccountIdError(`Malformed legacy address: ${addr}`)
    }
    return derive('legacy', utf8.encode(addr))
  }

  throw new AccountIdError(`Unrecognised address form: ${addr}`)
}

/** {@link toAccountId} as raw 20 bytes — the form RLP `to` fields take. */
export function toAccountIdBytes(address: string): Uint8Array {
  return hexToBytes(toAccountId(address).slice(2))
}

/** Whether two address strings name the same ledger account. */
export function sameAccount(a: string, b: string): boolean {
  try {
    return toAccountId(a) === toAccountId(b)
  } catch {
    return false
  }
}

/** Whether a recipient is a protocol-owned holder that users must not pay directly. */
export function isProtocolHolder(address: string): boolean {
  return addressForm(address) === 'protocol'
}
