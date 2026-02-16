/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — RLP Encoding (Recursive Length Prefix)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Minimal, zero-dependency RLP encoder/decoder for Ethereum transactions.
 *  Implements the encoding specified in the Ethereum Yellow Paper, Appendix B.
 *
 *  Used for:
 *    • Serializing unsigned transactions for signing
 *    • Serializing signed transactions for broadcast (eth_sendRawTransaction)
 *    • Encoding EIP-2718 typed transaction envelopes (EIP-1559, EIP-2930)
 */

import { hexToBytes, bytesToHex } from './crypto'

// ─── Types ──────────────────────────────────────────────────────────────────

export type RlpInput = Uint8Array | string | bigint | number | RlpInput[] | null | undefined

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Remove leading zero bytes from a Uint8Array */
function stripLeadingZeros(data: Uint8Array): Uint8Array {
  let i = 0
  while (i < data.length - 1 && data[i] === 0) i++
  return i > 0 ? data.slice(i) : data
}

/** Convert a bigint/number to a minimal big-endian byte array */
export function bigIntToBytes(n: bigint | number): Uint8Array {
  const bn = BigInt(n)
  if (bn === 0n) return new Uint8Array(0)
  const hex = bn.toString(16)
  const padded = hex.length % 2 ? '0' + hex : hex
  return hexToBytes(padded)
}

/** Convert a hex string (0x-prefixed or not) to a byte array, handling empty/0x */
function inputToBytes(value: RlpInput): Uint8Array {
  if (value === null || value === undefined) return new Uint8Array(0)
  if (value instanceof Uint8Array) return value
  if (typeof value === 'bigint' || typeof value === 'number') return bigIntToBytes(value)
  if (typeof value === 'string') {
    if (value === '' || value === '0x' || value === '0x0') return new Uint8Array(0)
    const clean = value.startsWith('0x') ? value.slice(2) : value
    if (clean === '' || clean === '0') return new Uint8Array(0)
    const padded = clean.length % 2 ? '0' + clean : clean
    return hexToBytes(padded)
  }
  // Arrays are handled by encode() directly
  throw new Error(`Unsupported RLP input type: ${typeof value}`)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RLP Encode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encode a length prefix for RLP.
 * - For single bytes 0x00-0x7f: no prefix (byte itself is the encoding)
 * - For strings 0-55 bytes: 0x80 + length
 * - For strings >55 bytes: 0xb7 + length-of-length, then length
 * - For lists 0-55 bytes: 0xc0 + total-length
 * - For lists >55 bytes: 0xf7 + length-of-length, then length
 */
function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) {
    return new Uint8Array([offset + len])
  }
  const lenBytes = bigIntToBytes(BigInt(len))
  const prefix = new Uint8Array(1 + lenBytes.length)
  prefix[0] = offset + 55 + lenBytes.length
  prefix.set(lenBytes, 1)
  return prefix
}

/**
 * RLP encode a value.
 * - Uint8Array / string / number / bigint → encoded as a byte string
 * - Array → encoded as a list
 */
export function rlpEncode(input: RlpInput): Uint8Array {
  // Handle arrays (lists)
  if (Array.isArray(input)) {
    const encodedItems = input.map(item => rlpEncode(item))
    const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0)
    const prefix = encodeLength(totalLength, 0xc0)
    const result = new Uint8Array(prefix.length + totalLength)
    result.set(prefix, 0)
    let offset = prefix.length
    for (const item of encodedItems) {
      result.set(item, offset)
      offset += item.length
    }
    return result
  }

  // Convert to bytes
  const bytes = inputToBytes(input)

  // Single byte in range [0x00, 0x7f] — encode as itself
  if (bytes.length === 1 && bytes[0] < 0x80) {
    return bytes
  }

  // Empty byte string
  if (bytes.length === 0) {
    return new Uint8Array([0x80])
  }

  // String with prefix
  const prefix = encodeLength(bytes.length, 0x80)
  const result = new Uint8Array(prefix.length + bytes.length)
  result.set(prefix, 0)
  result.set(bytes, prefix.length)
  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RLP Decode (for completeness — needed for receipt parsing etc.)
// ═══════════════════════════════════════════════════════════════════════════════

export interface RlpDecoded {
  data: Uint8Array | RlpDecoded[]
  remainder: Uint8Array
}

/**
 * Decode an RLP-encoded byte array.
 */
export function rlpDecode(input: Uint8Array): RlpDecoded {
  if (input.length === 0) {
    return { data: new Uint8Array(0), remainder: new Uint8Array(0) }
  }

  const prefix = input[0]

  // Single byte
  if (prefix < 0x80) {
    return {
      data: input.slice(0, 1),
      remainder: input.slice(1),
    }
  }

  // Short string (0-55 bytes)
  if (prefix <= 0xb7) {
    const len = prefix - 0x80
    return {
      data: input.slice(1, 1 + len),
      remainder: input.slice(1 + len),
    }
  }

  // Long string (>55 bytes)
  if (prefix <= 0xbf) {
    const lenOfLen = prefix - 0xb7
    let len = 0
    for (let i = 0; i < lenOfLen; i++) {
      len = len * 256 + input[1 + i]
    }
    const start = 1 + lenOfLen
    return {
      data: input.slice(start, start + len),
      remainder: input.slice(start + len),
    }
  }

  // Short list (0-55 bytes total payload)
  if (prefix <= 0xf7) {
    const totalLen = prefix - 0xc0
    let payload = input.slice(1, 1 + totalLen)
    const items: RlpDecoded[] = []
    while (payload.length > 0) {
      const decoded = rlpDecode(payload)
      items.push(decoded)
      payload = new Uint8Array(decoded.remainder)
    }
    return {
      data: items,
      remainder: input.slice(1 + totalLen),
    }
  }

  // Long list (>55 bytes total payload)
  const lenOfLen = prefix - 0xf7
  let totalLen = 0
  for (let i = 0; i < lenOfLen; i++) {
    totalLen = totalLen * 256 + input[1 + i]
  }
  const start = 1 + lenOfLen
  let payload = input.slice(start, start + totalLen)
  const items: RlpDecoded[] = []
  while (payload.length > 0) {
    const decoded = rlpDecode(payload)
    items.push(decoded)
    payload = new Uint8Array(decoded.remainder)
  }
  return {
    data: items,
    remainder: input.slice(start + totalLen),
  }
}
