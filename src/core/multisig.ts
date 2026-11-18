/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Multisig (0xPQMS…) keysets, signatures and signing requests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Port of qrdx-node `qrdx/crypto/threshold_dilithium.py` and `multisig_wire.py`
 *  (docs/ACCOUNT_CONTROL.md §4). An m-of-n multisig is its members' ML-DSA-65
 *  public keys and a threshold; its address is derived from them:
 *
 *    keys     sorted by raw bytes, no duplicates
 *    address  "0xPQMS" + hex(BLAKE3(DOMAIN ‖ m:u16be ‖ n:u16be ‖ key₀ ‖ … ‖ keyₙ₋₁))[:38]
 *
 *  Each member signs the domain-tagged message, never the transaction bytes
 *  directly, so a partial signature cannot be replayed as a single-key one:
 *
 *    tagged   BLAKE3(DOMAIN ‖ utf8(address) ‖ message)
 *
 *  A transaction signed by a multisig carries, as hex, where a single-key one
 *  carries its public key and signature:
 *
 *    public_key  {"m","n","public_keys"}                                  compact, sorted JSON
 *    signature   {"keyset_address","m","n","partials","signer_mask"}      compact, sorted JSON
 *
 *  There is no server: a signing request (an unsigned exchange transaction and
 *  the partial signatures so far) travels between members as text or a file.
 */

import { blake3 } from '@noble/hashes/blake3.js'
import { b64url, fromB64url } from './connect/crypto'
import { bytesToHex, hexToBytes } from './crypto'
import { exchangeSigningBytes, exchangeTxHash, type ExchangeOpCode, type JsonValue, type UnsignedExchangeTx } from './exchange-tx'
import { PQ_SIZES, pqPublicKeyToAddress, pqVerify } from './pq'

export const MULTISIG_DOMAIN = 'QRDX-THRESHOLD-DILITHIUM-v1'
/** The most keys a keyset that signs transactions may hold (multisig_wire.MAX_KEYS). */
export const MAX_SIGNING_KEYS = 20
/** Exchange gas each partial signature costs (MULTISIG_GAS_PER_SIGNATURE). */
export const MULTISIG_GAS_PER_SIGNATURE = 20_000

export const MULTISIG_ADDRESS = /^0xPQMS[0-9a-fA-F]{38}$/

export class MultisigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MultisigError'
  }
}

export interface MultisigKeyset {
  m: number
  n: number
  /** ML-DSA-65 public keys, hex without 0x, lowercase, sorted. */
  publicKeys: string[]
  /** `0xPQMS…`, as the node derives it. */
  address: string
}

export interface PartialSignature {
  /** The member's position in the sorted keyset. */
  signer_index: number
  public_key: string
  /** Its ML-DSA-65 signature over the tagged message, hex. */
  signature: string
}

const utf8 = new TextEncoder()
const DOMAIN = utf8.encode(MULTISIG_DOMAIN)

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const u16be = (n: number) => new Uint8Array([(n >> 8) & 0xff, n & 0xff])

/** A public key as the keyset holds it: hex, lowercase, the right length. */
export function normalizePublicKey(input: string): string {
  const hex = input.trim().replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(hex) || hex.length !== PQ_SIZES.publicKey * 2) {
    throw new MultisigError(`A member key is ${PQ_SIZES.publicKey} bytes (${PQ_SIZES.publicKey * 2} hex characters)`)
  }
  return hex
}

/** The keyset of these members and threshold. Throws on anything the node would refuse. */
export function createKeyset(publicKeys: string[], m: number): MultisigKeyset {
  const keys = publicKeys.map(normalizePublicKey)
  if (new Set(keys).size !== keys.length) throw new MultisigError('The same key is listed twice')
  const n = keys.length
  if (n < 1) throw new MultisigError('A multisig needs at least one member')
  if (n > MAX_SIGNING_KEYS) throw new MultisigError(`A multisig that signs transactions has at most ${MAX_SIGNING_KEYS} members`)
  if (!Number.isInteger(m) || m < 1 || m > n) throw new MultisigError(`The threshold is 1 to ${n}`)
  // Equal-length lowercase hex sorts as its bytes do.
  keys.sort()
  const digest = blake3(concat([DOMAIN, u16be(m), u16be(n), ...keys.map((k) => hexToBytes(k))]))
  return { m, n, publicKeys: keys, address: '0xPQMS' + bytesToHex(digest).slice(0, 38) }
}

/** The 32 bytes each member signs for `message` (_domain_tag_message). */
export function multisigTaggedMessage(address: string, message: Uint8Array): Uint8Array {
  return blake3(concat([DOMAIN, utf8.encode(address), message]))
}

/** Each member's 0xPQ address, in keyset order. */
export function memberAddresses(keyset: MultisigKeyset): string[] {
  return keyset.publicKeys.map((k) => pqPublicKeyToAddress(k))
}

/** Python's json.dumps(sort_keys=True, separators=(",", ":")) for the ASCII values used here. */
function compactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compactJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${compactJson((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new MultisigError('Only whole numbers go into a multisig signature')
  return JSON.stringify(value)
}

/** Whether `partial` is a valid signature by a member of `keyset` over `message`. */
export function verifyPartial(keyset: MultisigKeyset, message: Uint8Array, partial: PartialSignature): boolean {
  const key = partial.public_key.toLowerCase()
  if (keyset.publicKeys[partial.signer_index] !== key) return false
  return pqVerify(multisigTaggedMessage(keyset.address, message), partial.signature, key)
}

/**
 * The transaction's `public_key` and `signature` fields (hex) from at least m valid partials.
 * Partials that do not verify are dropped; fewer than m left is an error.
 */
export function aggregateSignature(keyset: MultisigKeyset, message: Uint8Array, partials: PartialSignature[]): { public_key: string; signature: string } {
  const valid = new Map<number, PartialSignature>()
  for (const p of partials) if (!valid.has(p.signer_index) && verifyPartial(keyset, message, p)) valid.set(p.signer_index, p)
  if (valid.size < keyset.m) throw new MultisigError(`${keyset.m} signatures are needed; ${valid.size} ${valid.size === 1 ? 'is' : 'are'} valid`)
  const sorted = [...valid.values()].sort((a, b) => a.signer_index - b.signer_index)
  const keysetJson = compactJson({ m: keyset.m, n: keyset.n, public_keys: keyset.publicKeys })
  const signatureJson = compactJson({
    keyset_address: keyset.address,
    m: keyset.m,
    n: keyset.n,
    signer_mask: sorted.reduce((mask, p) => mask + 2 ** p.signer_index, 0),
    partials: sorted.map((p) => ({ signer_index: p.signer_index, public_key: p.public_key.toLowerCase(), signature: p.signature.toLowerCase() })),
  })
  return { public_key: bytesToHex(utf8.encode(keysetJson)), signature: bytesToHex(utf8.encode(signatureJson)) }
}

// ─── Signing requests ───────────────────────────────────────────────────────

/** An exchange transaction the multisig signs (as its sender, or as the signer for an account it controls), and the signatures so far. */
export interface MultisigRequest {
  v: 1
  /** The wallet's network id (e.g. "qrdx-testnet"), so a member's wallet signs on the right network. */
  network: string
  label: string
  keyset: { m: number; public_keys: string[] }
  tx: UnsignedExchangeTx
  partials: PartialSignature[]
  createdAt: number
}

const REQUEST_PREFIX = 'qrdx-multisig:v1:'

/** The multisig this transaction is signed by: its signer, or its sender when it signs for itself. */
export function requestSigner(tx: UnsignedExchangeTx): string {
  return tx.signer ?? tx.sender
}

export function requestKeyset(req: MultisigRequest): MultisigKeyset {
  const keyset = createKeyset(req.keyset.public_keys, req.keyset.m)
  if (keyset.address.toLowerCase() !== requestSigner(req.tx).toLowerCase()) {
    throw new MultisigError('The request names a multisig its members do not make up')
  }
  return keyset
}

/** The request's id: its transaction's hash. */
export function requestId(req: MultisigRequest): string {
  return exchangeTxHash(req.tx)
}

/** The partials that verify, one per member. */
export function validPartials(req: MultisigRequest): PartialSignature[] {
  const keyset = requestKeyset(req)
  const message = exchangeSigningBytes(req.tx)
  const seen = new Set<number>()
  return req.partials.filter((p) => !seen.has(p.signer_index) && verifyPartial(keyset, message, p) && seen.add(p.signer_index))
}

/** Text a member pastes or opens: the request, base64url-encoded behind a prefix. */
export function encodeRequest(req: MultisigRequest): string {
  return REQUEST_PREFIX + b64url(utf8.encode(JSON.stringify(req)))
}

/** Reads a request from its text (or a wallet link carrying it). Throws a readable error. */
export function decodeRequest(input: string): MultisigRequest {
  let text = input.trim()
  if (/^https?:\/\//i.test(text)) text = new URL(text).searchParams.get('multisig') ?? ''
  if (!text.startsWith(REQUEST_PREFIX)) throw new MultisigError('This is not a QRDX multisig request')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(fromB64url(text.slice(REQUEST_PREFIX.length))))
  } catch {
    throw new MultisigError('This multisig request is damaged; ask for it again')
  }
  const r = raw as Partial<MultisigRequest>
  const tx = r.tx as Partial<UnsignedExchangeTx> | undefined
  if (
    r.v !== 1 ||
    typeof r.network !== 'string' ||
    !r.keyset ||
    !Array.isArray(r.keyset.public_keys) ||
    typeof r.keyset.m !== 'number' ||
    !tx ||
    typeof tx.op_type !== 'number' ||
    typeof tx.sender !== 'string' ||
    typeof tx.nonce !== 'number' ||
    typeof tx.chain_id !== 'number' ||
    typeof tx.gas_limit !== 'number' ||
    typeof tx.gas_price !== 'string' ||
    !tx.params ||
    typeof tx.params !== 'object' ||
    !Array.isArray(r.partials)
  ) {
    throw new MultisigError('This multisig request is incomplete; ask for it again')
  }
  const req: MultisigRequest = {
    v: 1,
    network: r.network,
    label: typeof r.label === 'string' ? r.label.slice(0, 200) : '',
    keyset: { m: r.keyset.m, public_keys: r.keyset.public_keys.map(String) },
    tx: {
      op_type: tx.op_type as ExchangeOpCode,
      chain_id: tx.chain_id,
      sender: tx.sender,
      ...(typeof tx.signer === 'string' && tx.signer ? { signer: tx.signer } : {}),
      nonce: tx.nonce,
      params: tx.params as Record<string, JsonValue>,
      gas_limit: tx.gas_limit,
      gas_price: tx.gas_price,
    },
    partials: r.partials
      .filter((p): p is PartialSignature => !!p && typeof p.signer_index === 'number' && typeof p.public_key === 'string' && typeof p.signature === 'string')
      .map((p) => ({ signer_index: p.signer_index, public_key: p.public_key, signature: p.signature })),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  }
  requestKeyset(req) // the keyset must make up the multisig named
  exchangeSigningBytes(req.tx) // and the transaction must encode
  return req
}

/** Both requests' signatures, when they are for the same transaction. */
export function mergeRequests(a: MultisigRequest, b: MultisigRequest): MultisigRequest {
  if (requestId(a) !== requestId(b)) throw new MultisigError('These requests are for different transactions')
  const byIndex = new Map<number, PartialSignature>()
  for (const p of [...a.partials, ...b.partials]) if (!byIndex.has(p.signer_index)) byIndex.set(p.signer_index, p)
  return { ...a, partials: [...byIndex.values()].sort((x, y) => x.signer_index - y.signer_index) }
}

/** The gas limit a multisig-signed transaction needs on top of the operation's own. */
export function multisigGasLimit(base: number, m: number): number {
  return base + m * MULTISIG_GAS_PER_SIGNATURE
}
