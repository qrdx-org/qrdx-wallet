/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Ethereum Transaction Signing & Serialization
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Implements:
 *    • Legacy (pre-EIP-155) transaction serialization
 *    • EIP-155 replay-protected transaction serialization
 *    • EIP-1559 (Type 2) transaction serialization
 *    • Transaction signing with secp256k1
 *    • Raw signed transaction encoding for eth_sendRawTransaction
 *
 *  Uses:
 *    • ./rlp.ts for RLP encoding
 *    • ./crypto.ts for ECDSA signing (secp256k1 via ethereum-cryptography)
 */

import { rlpEncode, bigIntToBytes, type RlpInput } from './rlp'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { ecdsaSign, hexToBytes, bytesToHex } from './crypto'
import type { EthTransactionRequest } from './ethereum'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SignedTransaction {
  /** The raw signed transaction as a 0x-prefixed hex string */
  rawTransaction: string
  /** The transaction hash */
  transactionHash: string
  /** Signature components */
  v: number
  r: string
  s: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a hex string to a bigint, handling empty/null values */
function hexToBigInt(hex: string | undefined): bigint {
  if (!hex || hex === '0x' || hex === '0x0' || hex === '') return 0n
  return BigInt(hex)
}

/** Convert a hex value to RLP-safe bytes (strip leading zeros for integers) */
function hexToRlpBytes(hex: string | undefined): Uint8Array {
  if (!hex || hex === '0x' || hex === '0x0' || hex === '') return new Uint8Array(0)
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean === '' || clean === '0') return new Uint8Array(0)
  // Remove leading zeros for integer values
  let stripped = clean.replace(/^0+/, '')
  if (stripped === '') return new Uint8Array(0)
  if (stripped.length % 2) stripped = '0' + stripped
  return hexToBytes(stripped)
}

/** Convert an address to 20 bytes */
function addressToBytes(addr: string): Uint8Array {
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr
  return hexToBytes(clean.padStart(40, '0'))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EIP-155 Legacy Transaction Signing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sign a legacy (Type 0) transaction with EIP-155 replay protection.
 *
 * Unsigned tx for signing: RLP([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0])
 * Signed tx: RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
 *   where v = chainId * 2 + 35 + recovery
 */
export function signLegacyTransaction(
  tx: EthTransactionRequest,
  privateKey: Uint8Array | string
): SignedTransaction {
  const privBytes = typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey
  const chainId = hexToBigInt(tx.chainId)

  // Build the unsigned transaction fields for EIP-155 signing
  const unsignedFields: RlpInput[] = [
    hexToRlpBytes(tx.nonce),
    hexToRlpBytes(tx.gasPrice),
    hexToRlpBytes(tx.gas),
    tx.to ? addressToBytes(tx.to) : new Uint8Array(0),
    hexToRlpBytes(tx.value),
    tx.data ? hexToBytes(tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data) : new Uint8Array(0),
    // EIP-155: chainId, 0, 0
    bigIntToBytes(chainId),
    new Uint8Array(0),
    new Uint8Array(0),
  ]

  const unsignedRlp = rlpEncode(unsignedFields)
  const msgHash = keccak256(unsignedRlp)

  // Sign
  const { r, s, v: recoveryV } = ecdsaSign(msgHash, privBytes)
  const recovery = recoveryV - 27

  // EIP-155 v value: chainId * 2 + 35 + recovery
  const v155 = chainId * 2n + 35n + BigInt(recovery)

  // Build the signed transaction
  const signedFields: RlpInput[] = [
    hexToRlpBytes(tx.nonce),
    hexToRlpBytes(tx.gasPrice),
    hexToRlpBytes(tx.gas),
    tx.to ? addressToBytes(tx.to) : new Uint8Array(0),
    hexToRlpBytes(tx.value),
    tx.data ? hexToBytes(tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data) : new Uint8Array(0),
    bigIntToBytes(v155),
    r,
    s,
  ]

  const signedRlp = rlpEncode(signedFields)
  const txHash = keccak256(signedRlp)

  return {
    rawTransaction: '0x' + bytesToHex(signedRlp),
    transactionHash: '0x' + bytesToHex(txHash),
    v: Number(v155),
    r: '0x' + bytesToHex(r),
    s: '0x' + bytesToHex(s),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EIP-1559 (Type 2) Transaction Signing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sign an EIP-1559 (Type 2) transaction.
 *
 * Unsigned payload: 0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList])
 * Signed payload:   0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, v, r, s])
 *   where v = recovery (0 or 1)
 */
export function signEip1559Transaction(
  tx: EthTransactionRequest,
  privateKey: Uint8Array | string
): SignedTransaction {
  const privBytes = typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey

  // Build unsigned fields
  const unsignedFields: RlpInput[] = [
    hexToRlpBytes(tx.chainId),
    hexToRlpBytes(tx.nonce),
    hexToRlpBytes(tx.maxPriorityFeePerGas),
    hexToRlpBytes(tx.maxFeePerGas),
    hexToRlpBytes(tx.gas),
    tx.to ? addressToBytes(tx.to) : new Uint8Array(0),
    hexToRlpBytes(tx.value),
    tx.data ? hexToBytes(tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data) : new Uint8Array(0),
    [], // accessList (empty for now)
  ]

  // Type 2 prefix: 0x02 || RLP(fields)
  const unsignedRlp = rlpEncode(unsignedFields)
  const typePrefix = new Uint8Array([0x02])
  const unsignedPayload = new Uint8Array(1 + unsignedRlp.length)
  unsignedPayload[0] = 0x02
  unsignedPayload.set(unsignedRlp, 1)

  const msgHash = keccak256(unsignedPayload)

  // Sign
  const { r, s, v: recoveryV } = ecdsaSign(msgHash, privBytes)
  const recovery = recoveryV - 27 // 0 or 1 for EIP-1559

  // Build signed fields
  const signedFields: RlpInput[] = [
    hexToRlpBytes(tx.chainId),
    hexToRlpBytes(tx.nonce),
    hexToRlpBytes(tx.maxPriorityFeePerGas),
    hexToRlpBytes(tx.maxFeePerGas),
    hexToRlpBytes(tx.gas),
    tx.to ? addressToBytes(tx.to) : new Uint8Array(0),
    hexToRlpBytes(tx.value),
    tx.data ? hexToBytes(tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data) : new Uint8Array(0),
    [], // accessList
    bigIntToBytes(BigInt(recovery)),
    r,
    s,
  ]

  const signedRlp = rlpEncode(signedFields)
  const signedPayload = new Uint8Array(1 + signedRlp.length)
  signedPayload[0] = 0x02
  signedPayload.set(signedRlp, 1)

  const txHash = keccak256(signedPayload)

  return {
    rawTransaction: '0x' + bytesToHex(signedPayload),
    transactionHash: '0x' + bytesToHex(txHash),
    v: recovery,
    r: '0x' + bytesToHex(r),
    s: '0x' + bytesToHex(s),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Auto-detecting sign function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sign a transaction, automatically choosing EIP-1559 or legacy encoding.
 *
 * If the transaction has maxFeePerGas, it's treated as EIP-1559 (Type 2).
 * Otherwise, it's treated as legacy (Type 0) with EIP-155 replay protection.
 */
export function signTransaction(
  tx: EthTransactionRequest,
  privateKey: Uint8Array | string
): SignedTransaction {
  if (tx.maxFeePerGas) {
    return signEip1559Transaction(tx, privateKey)
  }
  return signLegacyTransaction(tx, privateKey)
}
