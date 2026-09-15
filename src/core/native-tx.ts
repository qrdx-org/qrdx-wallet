/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Native (UTXO) Transactions, including post-quantum senders
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Value held by a `0xPQ` address moves on QRDX's native UTXO layer, not through
 *  the EVM. The EVM path cannot carry it: `eth_sendRawTransaction` takes a
 *  20-byte recipient and recovers a secp256k1 sender, while a PQ address is 32
 *  bytes with an ML-DSA-65 key behind it.
 *
 *  The wire format here is the one `qrdx/cli/wallet.py` already speaks, so the
 *  reference CLI and this wallet produce interchangeable transactions:
 *
 *    qrdx_getUTXOs(address)        → [{ tx_hash, index, amount }]   (microQRDX)
 *    qrdx_sendTransaction(tx_data) → { tx_hash }
 *    qrdx_getTransaction(tx_hash)  → record | null
 *
 *  ── What gets signed ────────────────────────────────────────────────────────
 *
 *  The signature covers `sha256(canonicalJson(payload))`, where `payload` is the
 *  transaction without its `signature` and `public_key` fields. The reference
 *  implementation produces those bytes with Python's
 *  `json.dumps(payload, sort_keys=True)`, so {@link canonicalJson} reproduces
 *  that encoding exactly — including the space after `:` and `,` that Python
 *  emits by default and `JSON.stringify` does not. A single byte of difference
 *  yields a signature the node rejects.
 *
 *  The public key travels with the transaction because, unlike ECDSA, an ML-DSA
 *  signature does not let a verifier recover the signer. The node checks that
 *  the key hashes to the address owning the inputs.
 */

import { PQ_SIZES, pqKeyPairFromSeed, pqSign } from './pq'
import { sha256 } from 'ethereum-cryptography/sha256.js'
import { hexToBytes, bytesToHex } from './crypto'
import type { ChainConfig } from './chains'

// ─── Units ──────────────────────────────────────────────────────────────────

/**
 * Smallest native unit per QRDX (`constants.SMALLEST` on the node).
 *
 * Note this is *not* wei: the native ledger works in microQRDX (10^6), while
 * `eth_getBalance` reports the same holdings scaled to wei (10^18). Mixing the
 * two silently misstates amounts by a factor of a trillion.
 */
export const MICRO_PER_QRDX = 1_000_000n

/** Convert a decimal QRDX string to microQRDX. Throws on excess precision. */
export function qrdxToMicro(amount: string): bigint {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new NativeTxError(`Not a valid amount: ${amount}`)
  }

  const [whole, frac = ''] = trimmed.split('.')
  if (frac.length > 6) {
    throw new NativeTxError(
      `QRDX supports at most 6 decimal places; ${amount} has ${frac.length}`,
    )
  }
  return BigInt(whole) * MICRO_PER_QRDX + BigInt(frac.padEnd(6, '0') || '0')
}

/** Format microQRDX as a decimal QRDX string. */
export function microToQrdx(micro: bigint, decimals = 4): string {
  const whole = micro / MICRO_PER_QRDX
  const frac = (micro % MICRO_PER_QRDX).toString().padStart(6, '0').slice(0, decimals)
  return decimals > 0 ? `${whole}.${frac}` : whole.toString()
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Utxo {
  /** Hash of the transaction that created this output, hex, no 0x. */
  tx_hash: string
  /** Output index within that transaction. */
  index: number
  /** Amount in microQRDX, as a decimal string. */
  amount: string
}

export interface NativeTxInput {
  tx_hash: string
  index: number
}

export interface NativeTxOutput {
  address: string
  /** microQRDX. */
  amount: number
}

/** The signed payload, before signature fields are attached. */
export interface NativeTxPayload {
  inputs: NativeTxInput[]
  outputs: NativeTxOutput[]
  fee: number
}

/** A complete, signed native transaction ready for `qrdx_sendTransaction`. */
export interface SignedNativeTx extends NativeTxPayload {
  public_key: string
  signature: string
}

export interface NativeSendResult {
  txHash: string
  from: string
  fee: string
}

/** Raised for malformed input or an unfundable transaction. */
export class NativeTxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeTxError'
  }
}

// ─── Canonical JSON ─────────────────────────────────────────────────────────

/**
 * Serialise a value the way Python's `json.dumps(value, sort_keys=True)` does.
 *
 * Differences from `JSON.stringify` that matter, all of which change the bytes
 * being signed:
 *
 *   • Python separates items with `", "` and keys from values with `": "`.
 *   • `sort_keys=True` orders object keys lexicographically, at every depth.
 *
 * Only the JSON types this protocol uses are supported — strings, integers,
 * arrays and plain objects. Anything else throws rather than risking a silent
 * encoding difference. Non-integer numbers are rejected for the same reason:
 * Python and JavaScript do not agree on float formatting.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'

  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new NativeTxError(
        `Refusing to serialise the non-integer ${value}: Python and JavaScript ` +
          `format floats differently, which would invalidate the signature`,
      )
    }
    if (!Number.isSafeInteger(value)) {
      throw new NativeTxError(`Integer ${value} exceeds safe precision`)
    }
    return String(value)
  }

  if (typeof value === 'bigint') return value.toString()

  if (typeof value === 'string') {
    // Addresses and hex digests are ASCII, where JSON.stringify's escaping
    // matches Python's default ensure_ascii output.
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(', ')}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}: ${canonicalJson(v)}`)
    return `{${entries.join(', ')}}`
  }

  throw new NativeTxError(`Cannot serialise value of type ${typeof value}`)
}

/** The 32-byte digest a native transaction's signature covers. */
export function nativeTxDigest(payload: NativeTxPayload): Uint8Array {
  return sha256(new TextEncoder().encode(canonicalJson(payload)))
}

// ─── RPC ────────────────────────────────────────────────────────────────────

async function nativeRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  if (!res.ok) {
    throw new NativeTxError(`${method} failed: HTTP ${res.status} ${res.statusText}`)
  }

  const json = (await res.json()) as {
    result?: T
    error?: { code: number; message: string }
  }

  if (json.error) {
    throw new NativeTxError(json.error.message)
  }
  return json.result as T
}

/** Unspent outputs held by an address, largest first. */
export async function fetchUtxos(chain: ChainConfig, address: string): Promise<Utxo[]> {
  return nativeRpc<Utxo[]>(chain.rpcUrl, 'qrdx_getUTXOs', [address])
}

/** Total spendable balance at an address, in microQRDX. */
export async function fetchNativeBalance(
  chain: ChainConfig,
  address: string,
): Promise<bigint> {
  const utxos = await fetchUtxos(chain, address)
  return utxos.reduce((sum, u) => sum + BigInt(u.amount), 0n)
}

/** Look up an applied native transaction. Returns `null` if unknown. */
export async function fetchNativeTransaction(
  chain: ChainConfig,
  txHash: string,
): Promise<Record<string, unknown> | null> {
  return nativeRpc(chain.rpcUrl, 'qrdx_getTransaction', [txHash])
}

// ─── Building ───────────────────────────────────────────────────────────────

/**
 * Choose inputs to cover `needed`, largest first.
 *
 * Largest-first keeps the input count — and therefore the signed payload and
 * the verification cost — small. ML-DSA signatures are 3309 bytes, so a
 * transaction with many inputs is materially more expensive than its ECDSA
 * equivalent.
 *
 * @throws {NativeTxError} when the address cannot cover the amount plus fee.
 */
export function selectUtxos(utxos: Utxo[], needed: bigint): {
  selected: Utxo[]
  total: bigint
} {
  const sorted = [...utxos].sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1))

  const selected: Utxo[] = []
  let total = 0n
  for (const utxo of sorted) {
    selected.push(utxo)
    total += BigInt(utxo.amount)
    if (total >= needed) break
  }

  if (total < needed) {
    throw new NativeTxError(
      `Insufficient balance: have ${microToQrdx(total, 6)} QRDX, need ${microToQrdx(needed, 6)} QRDX`,
    )
  }
  return { selected, total }
}

/**
 * Build the unsigned payload for a native transfer.
 *
 * Any remainder returns to the sender as an explicit change output — the native
 * layer requires inputs to equal outputs plus fee exactly, and anything omitted
 * would be silently forfeited as fee.
 */
export function buildNativeTransfer(options: {
  utxos: Utxo[]
  from: string
  to: string
  amountMicro: bigint
  feeMicro: bigint
}): { payload: NativeTxPayload; changeMicro: bigint } {
  const { utxos, from, to, amountMicro, feeMicro } = options

  if (amountMicro <= 0n) {
    throw new NativeTxError('Amount must be greater than zero')
  }
  if (feeMicro < 0n) {
    throw new NativeTxError('Fee cannot be negative')
  }

  const { selected, total } = selectUtxos(utxos, amountMicro + feeMicro)
  const change = total - amountMicro - feeMicro

  const outputs: NativeTxOutput[] = [{ address: to, amount: Number(amountMicro) }]
  if (change > 0n) {
    outputs.push({ address: from, amount: Number(change) })
  }

  return {
    payload: {
      inputs: selected.map(u => ({ tx_hash: u.tx_hash, index: u.index })),
      outputs,
      fee: Number(feeMicro),
    },
    changeMicro: change,
  }
}

/**
 * Sign a native transaction with an ML-DSA-65 key.
 *
 * `pqSeedHex` is the 32-byte seed the wallet stores; the full secret key is
 * regenerated from it rather than kept at rest.
 */
export async function signNativeTransaction(
  payload: NativeTxPayload,
  pqSeedHex: string,
): Promise<SignedNativeTx> {
  const keyPair = await pqKeyPairFromSeed(hexToBytes(pqSeedHex.replace(/^0x/, '')))
  const signature = await pqSign(nativeTxDigest(payload), pqSeedHex)

  if (hexToBytes(signature).length !== PQ_SIZES.signature) {
    throw new NativeTxError('Produced signature has an unexpected length')
  }

  return { ...payload, public_key: keyPair.publicKey, signature }
}

/** Submit a signed native transaction. */
export async function submitNativeTransaction(
  chain: ChainConfig,
  tx: SignedNativeTx,
): Promise<NativeSendResult> {
  const result = await nativeRpc<{ tx_hash: string; from: string; fee: string }>(
    chain.rpcUrl,
    'qrdx_sendTransaction',
    [tx],
  )
  return { txHash: result.tx_hash, from: result.from, fee: result.fee }
}

/**
 * Fetch inputs, build, sign and broadcast a transfer from a PQ address.
 *
 * @param feeQrdx fee in whole QRDX; the node requires inputs to equal outputs
 *                plus fee exactly, so this is explicit rather than estimated.
 */
export async function sendNativeTransfer(options: {
  chain: ChainConfig
  from: string
  to: string
  amountQrdx: string
  pqSeedHex: string
  feeQrdx?: string
}): Promise<NativeSendResult> {
  const { chain, from, to, amountQrdx, pqSeedHex, feeQrdx = '0' } = options

  const utxos = await fetchUtxos(chain, from)
  if (utxos.length === 0) {
    throw new NativeTxError(`${from} holds no spendable outputs on ${chain.name}`)
  }

  const { payload } = buildNativeTransfer({
    utxos,
    from,
    to,
    amountMicro: qrdxToMicro(amountQrdx),
    feeMicro: qrdxToMicro(feeQrdx),
  })

  const signed = await signNativeTransaction(payload, pqSeedHex)
  return submitNativeTransaction(chain, signed)
}

/** Re-export for callers that need to confirm a key matches an address. */
export { bytesToHex }
