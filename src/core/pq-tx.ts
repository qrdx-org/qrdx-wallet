/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Post-quantum transactions (EIP-2718 type 0x51)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Port of `qrdx/transactions/pq_tx.py`. This is how a `0xPQ` account spends:
 *  an ML-DSA-65-signed typed transaction submitted through the ordinary
 *  `eth_sendRawTransaction`, executed by the same EVM against the same account
 *  ledger as a secp256k1 transaction.
 *
 *    wire:         0x51 ‖ rlp([chainId, nonce, gasPrice, gasLimit, to, value,
 *                              data, onBehalfOf, publicKey, signature])
 *    signing hash: keccak256(0x51 ‖ rlp([chainId, nonce, gasPrice, gasLimit,
 *                                        to, value, data, onBehalfOf]))
 *    tx hash:      keccak256(wire)
 *
 *  There is no sender field: the node derives it from the embedded public key,
 *  so a transaction can only ever spend from the account its key derives to.
 *  `to` and `onBehalfOf` are 20-byte **account ids** (see ./account-id.ts) —
 *  a `0xPQ` recipient must be resolved before encoding.
 *
 *  This replaces the old UTXO path (`qrdx_getUTXOs` / `qrdx_sendTransaction`),
 *  which the node no longer serves.
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { rlpEncode, type RlpInput } from './rlp'
import { bytesToHex, hexToBytes } from './crypto'
import { PQ_SIZES, pqKeyPairFromSeed, pqSign } from './pq'
import { toAccountIdBytes } from './account-id'

export const PQ_TX_TYPE = 0x51

// Gas schedule — mirrors pq_tx.py. A transaction below this floor is rejected
// outright by the node rather than reverting.
export const PQ_TX_BASE_GAS = 21_000
export const PQ_TX_VERIFY_GAS = 40_000
export const PQ_TX_CREATE_GAS = 32_000
const GAS_PER_ENVELOPE_BYTE = 16
const GAS_TXDATA_ZERO = 4
const GAS_TXDATA_NONZERO = 16

export interface PqTxFields {
  chainId: bigint | number | string
  nonce: bigint | number | string
  gasPrice: bigint | number | string
  gasLimit: bigint | number | string
  /** Recipient in any address form, or null for contract creation. */
  to: string | null
  /** Wei. */
  value: bigint | number | string
  /** Calldata as hex or bytes. */
  data?: string | Uint8Array
  /** Delegated value source (system wallets), any address form. */
  onBehalfOf?: string | null
}

export interface SignedPqTx {
  rawTransaction: string
  transactionHash: string
  signingHash: string
  /** The canonical 20-byte recipient actually encoded, for display. */
  toAccountId: string | null
}

export class PqTxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PqTxError'
  }
}

function dataBytes(data: string | Uint8Array | undefined): Uint8Array {
  if (!data) return new Uint8Array(0)
  if (data instanceof Uint8Array) return data
  const clean = data.startsWith('0x') ? data.slice(2) : data
  if (clean.length % 2) throw new PqTxError('Calldata hex has odd length')
  return hexToBytes(clean)
}

function nonNegative(name: string, v: bigint | number | string): bigint {
  const b = BigInt(v)
  if (b < 0n) throw new PqTxError(`${name} cannot be negative`)
  return b
}

function unsignedFields(tx: PqTxFields): { fields: RlpInput[]; to: Uint8Array | null } {
  const to = tx.to ? toAccountIdBytes(tx.to) : null
  const onBehalfOf = tx.onBehalfOf ? toAccountIdBytes(tx.onBehalfOf) : new Uint8Array(0)
  return {
    to,
    fields: [
      nonNegative('chainId', tx.chainId),
      nonNegative('nonce', tx.nonce),
      nonNegative('gasPrice', tx.gasPrice),
      nonNegative('gasLimit', tx.gasLimit),
      to ?? new Uint8Array(0),
      nonNegative('value', tx.value),
      dataBytes(tx.data),
      onBehalfOf,
    ],
  }
}

function typed(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + payload.length)
  out[0] = PQ_TX_TYPE
  out.set(payload, 1)
  return out
}

/** The 32-byte digest the ML-DSA-65 key signs. */
export function pqTxSigningHash(tx: PqTxFields): Uint8Array {
  return keccak256(typed(rlpEncode(unsignedFields(tx).fields)))
}

/** Encode a transaction with an existing public key and signature. */
export function encodePqTx(
  tx: PqTxFields,
  publicKey: Uint8Array,
  signature: Uint8Array
): Uint8Array {
  if (publicKey.length !== PQ_SIZES.publicKey) {
    throw new PqTxError(`Public key must be ${PQ_SIZES.publicKey} bytes, got ${publicKey.length}`)
  }
  if (signature.length !== PQ_SIZES.signature) {
    throw new PqTxError(`Signature must be ${PQ_SIZES.signature} bytes, got ${signature.length}`)
  }
  return typed(rlpEncode([...unsignedFields(tx).fields, publicKey, signature]))
}

/**
 * Minimum gas a PQ transaction must supply (`intrinsic_gas_pq`).
 * About 145k for a plain transfer — the 5.3 KB key + signature are priced.
 */
export function pqIntrinsicGas(data?: string | Uint8Array, isCreate = false): bigint {
  let gas = PQ_TX_BASE_GAS + PQ_TX_VERIFY_GAS + (isCreate ? PQ_TX_CREATE_GAS : 0)
  for (const b of dataBytes(data)) gas += b === 0 ? GAS_TXDATA_ZERO : GAS_TXDATA_NONZERO
  gas += (PQ_SIZES.publicKey + PQ_SIZES.signature) * GAS_PER_ENVELOPE_BYTE
  return BigInt(gas)
}

/**
 * Sign a PQ transaction with the account's 32-byte ML-DSA seed.
 *
 * @throws {PqTxError} if gasLimit is below the intrinsic floor — the node would
 *         reject it, and failing here gives the user a reason instead.
 */
export async function signPqTransaction(tx: PqTxFields, pqSeedHex: string): Promise<SignedPqTx> {
  const floor = pqIntrinsicGas(tx.data, tx.to === null)
  if (BigInt(tx.gasLimit) < floor) {
    throw new PqTxError(`Gas limit ${tx.gasLimit} is below the post-quantum minimum of ${floor}`)
  }

  const keyPair = await pqKeyPairFromSeed(hexToBytes(pqSeedHex.replace(/^0x/, '')))
  const { to } = unsignedFields(tx)
  const signingHash = pqTxSigningHash(tx)
  const signature = hexToBytes(await pqSign(signingHash, pqSeedHex))
  const raw = encodePqTx(tx, hexToBytes(keyPair.publicKey), signature)

  return {
    rawTransaction: '0x' + bytesToHex(raw),
    transactionHash: '0x' + bytesToHex(keccak256(raw)),
    signingHash: '0x' + bytesToHex(signingHash),
    toAccountId: to ? '0x' + bytesToHex(to) : null,
  }
}
