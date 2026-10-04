/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — EIP-712 typed structured data (eth_signTypedData_v4)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  digest = keccak256(0x19 ‖ 0x01 ‖ hashStruct(EIP712Domain, domain) ‖ hashStruct(primaryType, message))
 *
 *  v4 semantics: arrays (including arrays of structs) are supported and hashed
 *  as keccak256 of the concatenated element encodings; nested structs are
 *  hashed recursively. Test vectors: tests/unit/eip712.test.ts (the "Mail"
 *  example from the EIP).
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { hexToBytes } from './crypto'

export interface TypedDataField {
  name: string
  type: string
}

export interface TypedData {
  types: Record<string, TypedDataField[]>
  primaryType: string
  domain: Record<string, unknown>
  message: Record<string, unknown>
}

export class TypedDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TypedDataError'
  }
}

const utf8 = new TextEncoder()

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function word(n: bigint): Uint8Array {
  const out = new Uint8Array(32)
  let v = n
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new TypedDataError(`Non-integer value ${v}`)
    return BigInt(v)
  }
  if (typeof v === 'string' && v.trim() !== '') return BigInt(v.trim())
  throw new TypedDataError(`Expected an integer, got ${String(v)}`)
}

function bytesOf(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (typeof v === 'string' && /^0x([0-9a-fA-F]{2})*$/.test(v)) return hexToBytes(v.slice(2))
  throw new TypedDataError(`Expected hex bytes, got ${String(v)}`)
}

function baseType(t: string): string {
  return t.replace(/\[\d*\]$/, '')
}

function dependencies(
  types: TypedData['types'],
  primary: string,
  found = new Set<string>()
): Set<string> {
  const t = baseType(primary)
  if (found.has(t) || !types[t]) return found
  found.add(t)
  for (const field of types[t]) dependencies(types, field.type, found)
  return found
}

export function encodeType(types: TypedData['types'], primary: string): string {
  const deps = [...dependencies(types, primary)].filter((d) => d !== primary).sort()
  return [primary, ...deps]
    .map((t) => `${t}(${types[t].map((f) => `${f.type} ${f.name}`).join(',')})`)
    .join('')
}

export function typeHash(types: TypedData['types'], primary: string): Uint8Array {
  return keccak256(utf8.encode(encodeType(types, primary)))
}

function encodeValue(types: TypedData['types'], type: string, value: unknown): Uint8Array {
  if (types[type]) return hashStruct(types, type, value as Record<string, unknown>)

  const array = type.match(/^(.*)\[(\d*)\]$/)
  if (array) {
    if (!Array.isArray(value)) throw new TypedDataError(`Expected an array for ${type}`)
    if (array[2] && value.length !== Number(array[2])) {
      throw new TypedDataError(`${type} expects ${array[2]} items, got ${value.length}`)
    }
    return keccak256(concat(value.map((v) => encodeValue(types, array[1], v))))
  }

  if (type === 'string') return keccak256(utf8.encode(String(value)))
  if (type === 'bytes') return keccak256(bytesOf(value))
  if (type === 'bool') return word(value === true || value === 'true' ? 1n : 0n)
  if (type === 'address') {
    const b = bytesOf(value)
    if (b.length !== 20) throw new TypedDataError(`Invalid address ${String(value)}`)
    const out = new Uint8Array(32)
    out.set(b, 12)
    return out
  }

  const bytesN = type.match(/^bytes(\d+)$/)
  if (bytesN) {
    const n = Number(bytesN[1])
    const b = bytesOf(value)
    if (n < 1 || n > 32 || b.length > n) throw new TypedDataError(`Invalid ${type} value`)
    const out = new Uint8Array(32)
    out.set(b, 0)
    return out
  }

  const int = type.match(/^(u?)int(\d*)$/)
  if (int) {
    const bits = Number(int[2] || 256)
    const v = toBigInt(value)
    if (int[1] === 'u') {
      if (v < 0n || v >= 1n << BigInt(bits))
        throw new TypedDataError(`${String(value)} out of range for ${type}`)
      return word(v)
    }
    const limit = 1n << BigInt(bits - 1)
    if (v < -limit || v >= limit)
      throw new TypedDataError(`${String(value)} out of range for ${type}`)
    return word(v < 0n ? (1n << 256n) + v : v)
  }

  throw new TypedDataError(`Unsupported type ${type}`)
}

export function hashStruct(
  types: TypedData['types'],
  primary: string,
  data: Record<string, unknown>
): Uint8Array {
  const fields = types[primary]
  if (!fields) throw new TypedDataError(`Unknown type ${primary}`)
  return keccak256(
    concat([
      typeHash(types, primary),
      ...fields.map((f) => encodeValue(types, f.type, data?.[f.name])),
    ])
  )
}

/** Parse the `eth_signTypedData_v4` payload (object or JSON string). */
export function parseTypedData(input: unknown): TypedData {
  const data = (typeof input === 'string' ? JSON.parse(input) : input) as TypedData
  if (!data?.types || !data.primaryType || !data.message) {
    throw new TypedDataError('Typed data must include types, primaryType and message')
  }
  if (!data.types.EIP712Domain) data.types = { ...data.types, EIP712Domain: [] }
  return data
}

/** The 32-byte digest to sign. */
export function typedDataDigest(input: unknown): Uint8Array {
  const data = parseTypedData(input)
  const parts = [
    new Uint8Array([0x19, 0x01]),
    hashStruct(data.types, 'EIP712Domain', data.domain ?? {}),
  ]
  if (data.primaryType !== 'EIP712Domain')
    parts.push(hashStruct(data.types, data.primaryType, data.message))
  return keccak256(concat(parts))
}

/** Domain chainId as a number, when present — used to check against the active chain. */
export function typedDataChainId(input: unknown): number | undefined {
  const id = parseTypedData(input).domain?.chainId
  return id === undefined ? undefined : Number(toBigInt(id))
}
