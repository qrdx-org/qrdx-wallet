/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Address Parsing & Validation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  QRDX uses two address forms, mirroring `qrdx/crypto/address.py` on the node:
 *
 *    • Traditional (secp256k1) — `0x` + 40 hex chars, EIP-55 checksummed.
 *      The last 20 bytes of keccak256(uncompressed pubkey). Interoperable with
 *      every Ethereum tool.
 *
 *    • Post-quantum (Dilithium) — `0xPQ` + 64 hex chars. The first 32 bytes of
 *      keccak256(Dilithium pubkey), with a QRDX-specific checksum.
 *
 *  The `0xPQ` prefix is deliberately a superset of `0x`, so order matters when
 *  classifying: a PQ address also starts with `0x` and would be misread as a
 *  malformed traditional address if checked in the wrong order.
 *
 *  Checksum validation is treated as advisory rather than fatal: a correctly
 *  formed all-lowercase address is legitimate (many tools emit them), but a
 *  *mixed*-case address whose checksum fails is a corrupted or mistyped
 *  address and must be rejected — that is precisely the case EIP-55 exists to
 *  catch.
 */

import { toChecksumAddress, toPqChecksumAddress } from './crypto'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Which address scheme a string belongs to. */
export type AddressKind = 'eth' | 'pq'

/** Outcome of validating an address string. */
export interface AddressValidation {
  valid: boolean
  /** Detected scheme, when the shape was recognisable. */
  kind: AddressKind | null
  /** Checksummed form, when valid. */
  normalized: string | null
  /** Human-readable reason, when invalid. */
  error: string | null
}

// ─── Shape constants ────────────────────────────────────────────────────────

const PQ_PREFIX = '0xPQ'
const ETH_BODY_LENGTH = 40
const PQ_BODY_LENGTH = 64

const HEX_ONLY = /^[0-9a-fA-F]*$/

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * Identify which scheme an address string looks like, by prefix and length
 * alone. Returns `null` when it matches neither shape.
 *
 * This is a cheap shape check — it does not validate the checksum. Use
 * {@link validateAddress} before trusting an address for a transfer.
 */
export function detectAddressKind(address: string): AddressKind | null {
  const trimmed = address.trim()

  // Check PQ first: '0xPQ...' also satisfies startsWith('0x').
  if (trimmed.toLowerCase().startsWith(PQ_PREFIX.toLowerCase())) {
    return trimmed.length === PQ_PREFIX.length + PQ_BODY_LENGTH ? 'pq' : null
  }
  if (trimmed.toLowerCase().startsWith('0x')) {
    return trimmed.length === 2 + ETH_BODY_LENGTH ? 'eth' : null
  }
  return null
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Fully validate an address: shape, hex alphabet, and — for mixed-case input —
 * the checksum.
 *
 * @returns a result object rather than throwing, so form fields can render the
 *          specific reason without try/catch around every keystroke.
 */
export function validateAddress(address: string): AddressValidation {
  const trimmed = address.trim()

  if (trimmed === '') {
    return { valid: false, kind: null, normalized: null, error: 'Address is required' }
  }

  const kind = detectAddressKind(trimmed)
  if (kind === null) {
    const looksHex = trimmed.toLowerCase().startsWith('0x')
    return {
      valid: false,
      kind: null,
      normalized: null,
      error: looksHex
        ? `Wrong length: expected ${ETH_BODY_LENGTH} hex characters after 0x, ` +
          `or ${PQ_BODY_LENGTH} after 0xPQ`
        : 'Address must start with 0x (or 0xPQ for post-quantum)',
    }
  }

  const body = kind === 'pq' ? trimmed.slice(PQ_PREFIX.length) : trimmed.slice(2)

  if (!HEX_ONLY.test(body)) {
    return {
      valid: false,
      kind,
      normalized: null,
      error: 'Address contains non-hexadecimal characters',
    }
  }

  let checksummed: string
  try {
    checksummed = kind === 'pq' ? toPqChecksumAddress(body) : toChecksumAddress(body)
  } catch (err) {
    return {
      valid: false,
      kind,
      normalized: null,
      error: err instanceof Error ? err.message : 'Could not parse address',
    }
  }

  // An all-lowercase (or all-uppercase) body carries no checksum information,
  // so there is nothing to verify — accept and normalise it. Mixed case is a
  // checksum claim, and a failing one means the address is corrupted.
  const isCaseless = body === body.toLowerCase() || body === body.toUpperCase()
  if (!isCaseless && checksummed !== trimmed) {
    return {
      valid: false,
      kind,
      normalized: null,
      error:
        'Address checksum does not match — it may have been mistyped or truncated',
    }
  }

  return { valid: true, kind, normalized: checksummed, error: null }
}

/** Whether `address` is a valid address of either scheme. */
export function isValidAddress(address: string): boolean {
  return validateAddress(address).valid
}

/** Whether `address` is a valid traditional (secp256k1) address. */
export function isValidEthAddress(address: string): boolean {
  const result = validateAddress(address)
  return result.valid && result.kind === 'eth'
}

/** Whether `address` is a valid post-quantum address. */
export function isValidPqAddress(address: string): boolean {
  const result = validateAddress(address)
  return result.valid && result.kind === 'pq'
}

/**
 * Return the checksummed form of an address.
 *
 * @throws if the address is not valid — use {@link validateAddress} when you
 *         need to report the reason instead.
 */
export function normalizeAddress(address: string): string {
  const result = validateAddress(address)
  if (!result.valid || !result.normalized) {
    throw new Error(result.error ?? 'Invalid address')
  }
  return result.normalized
}

/**
 * Compare two addresses for equality, ignoring checksum casing.
 *
 * Address strings arrive from RPC responses, dApps, and user input with
 * inconsistent casing, so `===` produces false negatives.
 */
export function addressesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Shorten an address for display, keeping the leading and trailing characters.
 *
 * The `0xPQ` prefix is preserved intact so post-quantum addresses stay
 * distinguishable from traditional ones at a glance.
 */
export function shortenAddress(address: string, chars = 4): string {
  const kind = detectAddressKind(address)
  if (kind === null) return address

  const prefix = kind === 'pq' ? PQ_PREFIX : '0x'
  const body = address.slice(prefix.length)
  if (body.length <= chars * 2) return address

  return `${prefix}${body.slice(0, chars)}…${body.slice(-chars)}`
}
