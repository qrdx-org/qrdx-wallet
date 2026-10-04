/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Exchange transactions (swap, liquidity, orders, staking, tokens)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Port of the envelope in `qrdx/exchange/transactions.py`. Every native
 *  exchange operation — swaps, liquidity, spot and perp orders, validator
 *  staking, native-token admin — is a JSON object signed by the sender's
 *  **post-quantum** key and submitted with `exchange_sendTransaction`.
 *  A classic `0x` key cannot sign one.
 *
 *  Signing bytes (concatenated):
 *    op_type   1 byte
 *    sender    UTF-8
 *    nonce     8 bytes, big-endian       ← the EXCHANGE nonce (exchange_getNonce)
 *    params    json.dumps(params, sort_keys=True, default=str), UTF-8
 *    gas_limit 8 bytes, big-endian
 *    gas_price decimal string of wei, UTF-8
 *
 *  The signature covers those bytes directly (not a digest). The transaction
 *  hash is BLAKE2b-256 of the same bytes, hex without `0x`.
 *
 *  `json.dumps` defaults matter: `", "` and `": "` separators, sorted keys at
 *  every depth, and `ensure_ascii=True` (non-ASCII becomes `\uXXXX`). See
 *  {@link pythonJson}. tests/unit/conformance.test.ts checks this against
 *  vectors the node itself produced.
 */

import { blake2b } from '@noble/hashes/blake2.js'
import { bytesToHex, hexToBytes } from './crypto'
import { pqKeyPairFromSeed, pqSign } from './pq'

// ─── Operation types (consensus-critical values) ────────────────────────────

export const ExchangeOp = {
  CREATE_POOL: 1,
  ADD_LIQUIDITY: 2,
  REMOVE_LIQUIDITY: 3,
  SWAP: 4,
  PLACE_ORDER: 5,
  CANCEL_ORDER: 6,
  CREATE_MARKET: 12,
  TOKEN_DEPLOY: 13,
  TOKEN_TRANSFER: 14,
  STAKE_DEPOSIT: 15,
  STAKE_EXIT: 16,
  REMOVE_POOL: 17,
  PERP_DEPOSIT: 18,
  PERP_WITHDRAW: 19,
  PERP_SET_LEVERAGE: 20,
  PERP_ORDER: 21,
  PERP_CANCEL: 22,
  VAULT_DEPOSIT: 23,
  VAULT_WITHDRAW: 24,
  TOKEN_MINT: 26,
  TOKEN_BURN: 27,
  TOKEN_APPROVE: 28,
  TOKEN_TRANSFER_FROM: 29,
  TOKEN_SET_AUTHORITY: 30,
  TOKEN_FREEZE: 31,
  TOKEN_THAW: 32,
} as const

export type ExchangeOpName = keyof typeof ExchangeOp
export type ExchangeOpCode = (typeof ExchangeOp)[ExchangeOpName]

/** Parameters each op requires before the node will admit it. */
const REQUIRED_PARAMS: Partial<Record<ExchangeOpCode, string[]>> = {
  [ExchangeOp.ADD_LIQUIDITY]: ['pool_id', 'tick_lower', 'tick_upper', 'amount'],
  [ExchangeOp.REMOVE_LIQUIDITY]: ['pool_id', 'position_id'],
  [ExchangeOp.SWAP]: ['token_in', 'token_out', 'amount_in'],
  [ExchangeOp.PLACE_ORDER]: ['pair', 'side', 'order_type', 'amount'],
  [ExchangeOp.CANCEL_ORDER]: ['order_id'],
  [ExchangeOp.TOKEN_TRANSFER]: ['token_address', 'to', 'amount'],
  [ExchangeOp.TOKEN_APPROVE]: ['token_address', 'spender', 'amount'],
  [ExchangeOp.TOKEN_TRANSFER_FROM]: ['token_address', 'from', 'to', 'amount'],
  [ExchangeOp.TOKEN_MINT]: ['token_address', 'amount'],
  [ExchangeOp.TOKEN_BURN]: ['token_address', 'amount'],
  [ExchangeOp.TOKEN_DEPLOY]: ['name', 'symbol'],
  [ExchangeOp.STAKE_DEPOSIT]: ['validator_public_key', 'stake_amount'],
  [ExchangeOp.PERP_DEPOSIT]: ['amount'],
  [ExchangeOp.PERP_WITHDRAW]: ['amount'],
  [ExchangeOp.PERP_SET_LEVERAGE]: ['market_id', 'leverage'],
  [ExchangeOp.PERP_ORDER]: ['market_id', 'side', 'size', 'price'],
  [ExchangeOp.PERP_CANCEL]: ['market_id', 'order_id'],
  [ExchangeOp.VAULT_DEPOSIT]: ['amount'],
  [ExchangeOp.VAULT_WITHDRAW]: ['shares'],
}

/** Node floor: `constants.EXCHANGE_MIN_GAS_PRICE_WEI` (1 gwei). Ask `exchange_gasPrice` for the live value. */
export const EXCHANGE_MIN_GAS_PRICE_WEI = 1_000_000_000n
export const DEFAULT_EXCHANGE_GAS_LIMIT = 1_000_000

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface UnsignedExchangeTx {
  op_type: ExchangeOpCode
  /** The signer's `0xPQ` address. */
  sender: string
  nonce: number
  params: Record<string, JsonValue>
  gas_limit: number
  /** Wei per gas, as a decimal string. */
  gas_price: string
}

export interface SignedExchangeTx extends UnsignedExchangeTx {
  public_key: string
  signature: string
}

export class ExchangeTxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExchangeTxError'
  }
}

// ─── Python-compatible JSON ─────────────────────────────────────────────────

function pyString(s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const ch = s[i]
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\f') out += '\\f'
    else if (c < 0x20 || c > 0x7e) {
      // ensure_ascii: every non-ASCII UTF-16 unit as \uXXXX (lowercase hex);
      // astral characters therefore come out as their surrogate pair, as Python does.
      // 0x7f (DEL) is ASCII and Python leaves it unescaped.
      if (c === 0x7f) out += ch
      else out += '\\u' + c.toString(16).padStart(4, '0')
    } else out += ch
  }
  return out + '"'
}

/**
 * Serialise exactly as Python's `json.dumps(value, sort_keys=True, default=str)`.
 *
 * Only integers are accepted as numbers: Python and JavaScript format floats
 * differently, so amounts must be passed as decimal strings (which is what the
 * node expects anyway).
 */
export function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ExchangeTxError(
        `Pass ${value} as a decimal string: non-integer or unsafe numbers do not sign reproducibly`
      )
    }
    return String(value)
  }
  if (typeof value === 'string') return pyString(value)
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${keys.map((k) => `${pyString(k)}: ${pythonJson((value as Record<string, unknown>)[k])}`).join(', ')}}`
  }
  throw new ExchangeTxError(`Cannot serialise ${typeof value}`)
}

// ─── Encoding ───────────────────────────────────────────────────────────────

function u64be(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n < 0) throw new ExchangeTxError(`Invalid 64-bit integer ${n}`)
  const out = new Uint8Array(8)
  let v = BigInt(n)
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const utf8 = new TextEncoder()

/** The bytes the sender's ML-DSA-65 key signs. */
export function exchangeSigningBytes(tx: UnsignedExchangeTx): Uint8Array {
  if (!/^\d+$/.test(tx.gas_price)) {
    throw new ExchangeTxError('gas_price must be a whole number of wei as a decimal string')
  }
  return concat([
    new Uint8Array([tx.op_type]),
    utf8.encode(tx.sender),
    u64be(tx.nonce),
    utf8.encode(pythonJson(tx.params)),
    u64be(tx.gas_limit),
    utf8.encode(BigInt(tx.gas_price).toString()),
  ])
}

/** BLAKE2b-256 transaction hash, hex without 0x (the node's format). */
export function exchangeTxHash(tx: UnsignedExchangeTx): string {
  return bytesToHex(blake2b(exchangeSigningBytes(tx), { dkLen: 32 }))
}

/** Assemble and validate an unsigned exchange transaction. */
export function buildExchangeTx(input: {
  op: ExchangeOpName | ExchangeOpCode
  sender: string
  nonce: number
  params?: Record<string, JsonValue>
  gasLimit?: number
  gasPrice?: bigint | string
}): UnsignedExchangeTx {
  const op_type = (typeof input.op === 'number' ? input.op : ExchangeOp[input.op]) as ExchangeOpCode
  if (!Object.values(ExchangeOp).includes(op_type)) {
    throw new ExchangeTxError(`Unknown exchange operation ${input.op}`)
  }
  if (!/^0xPQ[0-9a-fA-F]{64}$/.test(input.sender)) {
    throw new ExchangeTxError('Exchange transactions must be sent from a 0xPQ address')
  }
  const params = input.params ?? {}
  const missing = (REQUIRED_PARAMS[op_type] ?? []).filter((k) => !(k in params))
  if (missing.length) {
    throw new ExchangeTxError(
      `Missing parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    )
  }
  const gasPrice = BigInt(input.gasPrice ?? EXCHANGE_MIN_GAS_PRICE_WEI)
  if (gasPrice < EXCHANGE_MIN_GAS_PRICE_WEI) {
    throw new ExchangeTxError(
      `Gas price is below the exchange floor of ${EXCHANGE_MIN_GAS_PRICE_WEI} wei`
    )
  }
  return {
    op_type,
    sender: input.sender,
    nonce: input.nonce,
    params,
    gas_limit: input.gasLimit ?? DEFAULT_EXCHANGE_GAS_LIMIT,
    gas_price: gasPrice.toString(),
  }
}

/**
 * Sign with the account's ML-DSA seed. The public key must derive to `sender`
 * or the node rejects it; this is checked here so the error is attributable.
 */
export async function signExchangeTx(
  tx: UnsignedExchangeTx,
  pqSeedHex: string
): Promise<SignedExchangeTx & { tx_hash: string }> {
  const pair = await pqKeyPairFromSeed(hexToBytes(pqSeedHex.replace(/^0x/, '')))
  if (pair.address.toLowerCase() !== tx.sender.toLowerCase()) {
    throw new ExchangeTxError('This key does not control the sender address')
  }
  const signature = await pqSign(exchangeSigningBytes(tx), pqSeedHex)
  return { ...tx, public_key: pair.publicKey, signature, tx_hash: exchangeTxHash(tx) }
}
