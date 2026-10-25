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
 *    tag       "QRDX-EXCHANGE-TX-v1\0" (20 bytes, domain separation)
 *    chain_id  8 bytes, big-endian       ← the network's chain id (its chain spec)
 *    op_type   1 byte
 *    sender    UTF-8
 *    nonce     8 bytes, big-endian       ← the EXCHANGE nonce (exchange_getNonce)
 *    params    json.dumps(params, sort_keys=True, default=str), UTF-8
 *    gas_limit 8 bytes, big-endian
 *    gas_price decimal string of wei, UTF-8
 *
 *  The signature covers those bytes directly (not a digest). The transaction
 *  hash is BLAKE2b-256 of the same bytes, hex without `0x`. The chain id binds
 *  the signature to one network: the same operation signed for testnet does not
 *  verify on mainnet. The envelope carries it as `chain_id`.
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
  TOKEN_UPDATE_METADATA: 33,
  TOKEN_SET_TRANSFER_FEE: 34,
  TOKEN_WITHDRAW_FEES: 35,
  TOKEN_PAUSE: 36,
  TOKEN_RESUME: 37,
  TOKEN_AUTHORIZE_OPERATOR: 38,
  TOKEN_REVOKE_OPERATOR: 39,
  NFT_CREATE_COLLECTION: 40,
  NFT_MINT: 41,
  NFT_TRANSFER: 42,
  NFT_BURN: 43,
  NFT_APPROVE: 44,
  NFT_SET_APPROVAL_FOR_ALL: 45,
  NFT_UPDATE: 46,
  NFT_SET_AUTHORITY: 47,
  GOV_PROPOSE: 48,
  GOV_VOTE: 49,
  GOV_VETO: 50,
  GOV_EXECUTE: 51,
  BRIDGE_WITHDRAW: 52,
  /** Lock QRDX in a validator's delegation pool (docs/STAKING.md). */
  STAKE_DELEGATE: 53,
  /** Redeem pool shares ("all" also refunds what is still warming up). */
  STAKE_UNDELEGATE: 54,
  /** A validator sets its commission on its pool's rewards. */
  STAKE_SET_COMMISSION: 55,
  // Trading features (qrdx-node docs/TRADING_FEATURES.md). Nodes before them answer
  // "Unknown operation type"; see tx-service `nodeFeatures`.
  /** A stop-loss or take-profit on the mark price; `position: true` closes the whole position. */
  PERP_TRIGGER: 56,
  /** Every resting order, trigger and TWAP of the sender (`scope` all | spot | perps, `market`). */
  CANCEL_ALL: 57,
  PERP_MODIFY: 58,
  MODIFY_ORDER: 59,
  /** Up to 20 trading actions, all or nothing, under one nonce. */
  BATCH: 60,
  TWAP_ORDER: 61,
  TWAP_CANCEL: 62,
  /** Let an agent key sign trading operations (never withdrawals) for the account. */
  AGENT_APPROVE: 63,
  AGENT_REVOKE: 64,
  SUBACCOUNT_CREATE: 65,
  SUBACCOUNT_TRANSFER: 66,
  /** A copy-trading vault the sender leads. */
  VAULT_CREATE: 67,
  REFERRAL_REGISTER: 68,
  REFERRAL_JOIN: 69,
  /** Controllers, the own key on or off, the change delay, guardians (docs/ACCOUNT_CONTROL.md). */
  ACCOUNT_POLICY: 70,
  /** QRDX Name Service (docs/QNS.md). */
  QNS_REGISTER: 71,
  QNS_RENEW: 72,
  QNS_SET_RECORD: 73,
  QNS_SET_PRIMARY: 74,
  /** A guardian backs a new controller for a lost account. */
  ACCOUNT_RECOVER: 75,
  PERP_ISOLATED_MARGIN: 76,
  /** The dead man's switch: cancel everything at block time `time` (no `time` clears it). */
  SCHEDULE_CANCEL: 77,
  APPROVE_BUILDER_FEE: 78,
  DEPLOYER_BOND: 79,
  DEPLOYER_UNBOND: 80,
  DEPLOYER_SET_ORACLE: 81,
  DEPLOYER_HALT: 82,
  TICKER_CLAIM: 83,
} as const

export type ExchangeOpName = keyof typeof ExchangeOp
export type ExchangeOpCode = (typeof ExchangeOp)[ExchangeOpName]

/** Parameters each op requires before the node will admit it. */
const REQUIRED_PARAMS: Partial<Record<ExchangeOpCode, string[]>> = {
  [ExchangeOp.ADD_LIQUIDITY]: ['pool_id', 'tick_lower', 'tick_upper', 'amount'],
  [ExchangeOp.REMOVE_LIQUIDITY]: ['pool_id', 'position_id'],
  // (A multi-hop SWAP names a `path` instead of token_in / token_out: checked in buildExchangeTx.)
  [ExchangeOp.SWAP]: ['amount_in'],
  [ExchangeOp.PLACE_ORDER]: ['pair', 'side', 'order_type', 'amount'],
  [ExchangeOp.CANCEL_ORDER]: ['order_id'],
  [ExchangeOp.TOKEN_TRANSFER]: ['token_address', 'to', 'amount'],
  [ExchangeOp.TOKEN_APPROVE]: ['token_address', 'spender', 'amount'],
  [ExchangeOp.TOKEN_TRANSFER_FROM]: ['token_address', 'from', 'to', 'amount'],
  [ExchangeOp.TOKEN_MINT]: ['token_address', 'amount'],
  [ExchangeOp.TOKEN_BURN]: ['token_address', 'amount'],
  [ExchangeOp.TOKEN_DEPLOY]: ['name', 'symbol'],
  [ExchangeOp.STAKE_DEPOSIT]: ['validator_public_key', 'stake_amount'],
  [ExchangeOp.STAKE_DELEGATE]: ['validator', 'amount'],
  [ExchangeOp.NFT_TRANSFER]: ['collection', 'token_id', 'to'],
  [ExchangeOp.NFT_CREATE_COLLECTION]: ['name', 'symbol'],
  [ExchangeOp.NFT_MINT]: ['collection'],
  [ExchangeOp.NFT_BURN]: ['collection', 'token_id'],
  [ExchangeOp.NFT_APPROVE]: ['collection', 'token_id', 'spender'],
  [ExchangeOp.NFT_SET_APPROVAL_FOR_ALL]: ['collection', 'operator'],
  [ExchangeOp.STAKE_UNDELEGATE]: ['validator'],
  [ExchangeOp.STAKE_SET_COMMISSION]: ['commission_bps'],
  [ExchangeOp.PERP_DEPOSIT]: ['amount'],
  [ExchangeOp.CREATE_MARKET]: ['base_token'],
  [ExchangeOp.PERP_WITHDRAW]: ['amount'],
  [ExchangeOp.PERP_SET_LEVERAGE]: ['market_id', 'leverage'],
  [ExchangeOp.PERP_ORDER]: ['market_id', 'side', 'size', 'price'],
  [ExchangeOp.PERP_CANCEL]: ['market_id', 'order_id'],
  [ExchangeOp.VAULT_DEPOSIT]: ['amount'],
  [ExchangeOp.VAULT_WITHDRAW]: ['shares'],
  [ExchangeOp.PERP_TRIGGER]: ['market_id', 'side', 'kind', 'trigger_price'],
  [ExchangeOp.PERP_MODIFY]: ['market_id', 'order_id'],
  [ExchangeOp.MODIFY_ORDER]: ['pair', 'order_id'],
  [ExchangeOp.BATCH]: ['actions'],
  [ExchangeOp.TWAP_ORDER]: ['duration'],
  [ExchangeOp.TWAP_CANCEL]: ['twap_id'],
  [ExchangeOp.AGENT_APPROVE]: ['agent'],
  [ExchangeOp.AGENT_REVOKE]: ['agent'],
  [ExchangeOp.SUBACCOUNT_TRANSFER]: ['subaccount', 'asset', 'amount', 'direction'],
  [ExchangeOp.VAULT_CREATE]: ['amount'],
  [ExchangeOp.REFERRAL_REGISTER]: ['code'],
  [ExchangeOp.REFERRAL_JOIN]: ['code'],
  [ExchangeOp.ACCOUNT_POLICY]: ['action'],
  [ExchangeOp.QNS_REGISTER]: ['name'],
  [ExchangeOp.QNS_RENEW]: ['name'],
  [ExchangeOp.QNS_SET_RECORD]: ['name', 'key'],
  [ExchangeOp.QNS_SET_PRIMARY]: ['name'],
  [ExchangeOp.ACCOUNT_RECOVER]: ['account'],
  [ExchangeOp.PERP_ISOLATED_MARGIN]: ['market_id', 'amount'],
  [ExchangeOp.APPROVE_BUILDER_FEE]: ['builder', 'max_fee_rate'],
  [ExchangeOp.DEPLOYER_BOND]: ['amount'],
  [ExchangeOp.DEPLOYER_SET_ORACLE]: ['market_id', 'price'],
  [ExchangeOp.DEPLOYER_HALT]: ['market_id'],
  [ExchangeOp.TICKER_CLAIM]: ['token_address'],
}

/**
 * What an agent key may sign, and what the free trading lane takes at gas price 0
 * (qrdx-node `AGENT_SCOPE`, docs/TOKENOMICS.md): orders, cancels, modifies, triggers,
 * TWAPs, swaps, leverage; a batch only of those.
 */
export const TRADING_OPS: ReadonlySet<ExchangeOpName> = new Set<ExchangeOpName>([
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'MODIFY_ORDER',
  'SWAP',
  'PERP_SET_LEVERAGE',
  'PERP_ORDER',
  'PERP_CANCEL',
  'PERP_TRIGGER',
  'PERP_MODIFY',
  'CANCEL_ALL',
  'TWAP_ORDER',
  'TWAP_CANCEL',
  'PERP_ISOLATED_MARGIN',
  'SCHEDULE_CANCEL',
  'DEPLOYER_SET_ORACLE',
  'BATCH',
])

/** What a BATCH may hold (qrdx-node `BATCH_ACTIONS`). */
export const BATCH_ACTIONS: ReadonlySet<ExchangeOpName> = new Set<ExchangeOpName>([
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'MODIFY_ORDER',
  'SWAP',
  'PERP_DEPOSIT',
  'PERP_WITHDRAW',
  'PERP_SET_LEVERAGE',
  'PERP_ORDER',
  'PERP_CANCEL',
  'PERP_TRIGGER',
  'PERP_MODIFY',
  'CANCEL_ALL',
  'TWAP_ORDER',
  'TWAP_CANCEL',
])
export const MAX_BATCH_ACTIONS = 20

/** Whether the free lane would take this operation: a trading op, or a batch only of them. */
export function freeLaneOp(op: ExchangeOpName, params: Record<string, JsonValue>): boolean {
  if (!TRADING_OPS.has(op)) return false
  if (op !== 'BATCH') return true
  const actions = params.actions
  return (
    Array.isArray(actions) &&
    actions.length > 0 &&
    actions.every((a) => {
      const name = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, JsonValue>).op : undefined
      return typeof name === 'string' && name !== 'BATCH' && TRADING_OPS.has(name as ExchangeOpName)
    })
  )
}

/**
 * The lowest exchange gas price any QRDX network accepts outside the free lane:
 * `EXCHANGE_MIN_GAS_PRICE_WEI`, 0.1 gwei since the tokenomics of 2026-10 (1 gwei before;
 * the node refuses below its own). Ask `exchange_gasPrice` for the live value.
 */
export const EXCHANGE_MIN_GAS_PRICE_WEI = 100_000_000n
export const DEFAULT_EXCHANGE_GAS_LIMIT = 1_000_000

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface UnsignedExchangeTx {
  op_type: ExchangeOpCode
  /** The network's chain id; part of the signed bytes. */
  chain_id: number
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

/** Domain tag at the start of every exchange transaction's signed bytes. */
const SIGNING_TAG = utf8.encode('QRDX-EXCHANGE-TX-v1\0')

/** The bytes the sender's ML-DSA-65 key signs. */
export function exchangeSigningBytes(tx: UnsignedExchangeTx): Uint8Array {
  if (!/^\d+$/.test(tx.gas_price)) {
    throw new ExchangeTxError('gas_price must be a whole number of wei as a decimal string')
  }
  if (!Number.isSafeInteger(tx.chain_id) || tx.chain_id < 0) {
    throw new ExchangeTxError('chain_id must be a non-negative integer')
  }
  return concat([
    SIGNING_TAG,
    u64be(tx.chain_id),
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
  /** The chain id the node reports (resolveSigningChainId): signatures are bound to it. */
  chainId: number
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
  const required = [...(REQUIRED_PARAMS[op_type] ?? [])]
  if (op_type === ExchangeOp.SWAP && !('path' in params)) required.push('token_in', 'token_out')
  if (op_type === ExchangeOp.BATCH) {
    const actions = params.actions
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_BATCH_ACTIONS) {
      throw new ExchangeTxError(`A batch holds 1 to ${MAX_BATCH_ACTIONS} actions`)
    }
    for (const a of actions) {
      const name = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, JsonValue>).op : undefined
      if (typeof name !== 'string' || !BATCH_ACTIONS.has(name as ExchangeOpName)) {
        throw new ExchangeTxError(`A batch cannot hold ${String(name)}`)
      }
    }
  }
  const missing = required.filter((k) => !(k in params))
  if (missing.length) {
    throw new ExchangeTxError(
      `Missing parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    )
  }
  const gasPrice = BigInt(input.gasPrice ?? EXCHANGE_MIN_GAS_PRICE_WEI)
  const opName = (Object.keys(ExchangeOp) as ExchangeOpName[]).find((k) => ExchangeOp[k] === op_type)!
  // 0 is the free trading lane, open only to trading operations.
  if (gasPrice === 0n ? !freeLaneOp(opName, params) : gasPrice < EXCHANGE_MIN_GAS_PRICE_WEI) {
    throw new ExchangeTxError(
      gasPrice === 0n
        ? 'Only a trading operation can go in the free lane (gas price 0)'
        : `Gas price is below the exchange floor of ${EXCHANGE_MIN_GAS_PRICE_WEI} wei`
    )
  }
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new ExchangeTxError('A chain id is required to sign an exchange transaction')
  }
  return {
    op_type,
    chain_id: input.chainId,
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
