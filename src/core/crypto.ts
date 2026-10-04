/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Cryptographic Primitives
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Real implementations for:
 *    • ETH key generation (secp256k1 via ethereum-cryptography / @noble/curves)
 *    • ETH address derivation (keccak256, EIP-55 checksum)
 *    • ETH message & transaction signing (ECDSA)
 *    • PQ key generation (ML-DSA-65 / Dilithium3 compatible fallback)
 *    • PQ address derivation (keccak256 → first 32 bytes → 0xPQ prefix)
 *    • PQ signing (deterministic fallback matching qrdx-chain)
 *    • AES-256-GCM password-based encryption (Web Crypto)
 *
 *  Reference: /ref/qrdx-chain/qrdx/crypto/ and /ref/qrdx-chain/qrdx/wallet_v2/
 *
 *  ETH crypto uses `ethereum-cryptography` which wraps:
 *    - @noble/curves/secp256k1
 *    - @noble/hashes/sha3 (keccak256)
 *  These are audited pure-JS implementations.
 */

import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { getRandomBytesSync } from 'ethereum-cryptography/random.js'
import {
  generateMnemonic as _generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from 'ethereum-cryptography/bip39/index.js'
import { wordlist as englishWordlist } from 'ethereum-cryptography/bip39/wordlists/english.js'
import { HDKey } from 'ethereum-cryptography/hdkey.js'

// ═══════════════════════════════════════════════════════════════════════════════
//  Byte / Hex utilities
// ═══════════════════════════════════════════════════════════════════════════════

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Ethereum / secp256k1 — REAL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Key sizes for Ethereum / secp256k1 */
export const ETH_KEY_SIZES = {
  privateKey: 32,
  publicKeyUncompressed: 65,  // 0x04 + 64 bytes
  publicKeyCompressed: 33,    // 0x02/0x03 + 32 bytes
  address: 20,
  signature: 65,              // r[32] + s[32] + v[1]
} as const

export interface EthKeyPair {
  /** 32-byte private key as hex */
  privateKey: string
  /** 33-byte compressed public key as hex */
  publicKey: string
  /** 65-byte uncompressed public key as hex */
  publicKeyUncompressed: string
  /** EIP-55 checksummed 0x address */
  address: string
}

/**
 * Generate a new random secp256k1 key pair.
 * Uses the audited ethereum-cryptography/secp256k1 library.
 */
export function generateEthKeyPair(): EthKeyPair {
  const privateKeyBytes = secp256k1.utils.randomPrivateKey()
  return ethKeyPairFromPrivateKey(privateKeyBytes)
}

/**
 * Derive a full key pair from a raw private key.
 */
export function ethKeyPairFromPrivateKey(privateKey: Uint8Array | string): EthKeyPair {
  const privBytes =
    typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey

  // Compressed (33 bytes) and uncompressed (65 bytes) public keys
  const pubUncompressed = secp256k1.getPublicKey(privBytes, false)
  const pubCompressed = secp256k1.getPublicKey(privBytes, true)

  const address = publicKeyToEthAddress(pubUncompressed)

  return {
    privateKey: bytesToHex(privBytes),
    publicKey: bytesToHex(pubCompressed),
    publicKeyUncompressed: bytesToHex(pubUncompressed),
    address,
  }
}

/**
 * Derive an EIP-55 checksummed address from an uncompressed public key.
 *
 * Algorithm (matches Ethereum and ref/qrdx-chain):
 *   1. Take the 64-byte public key (strip 0x04 prefix if present)
 *   2. keccak256(64 bytes)
 *   3. Take last 20 bytes
 *   4. Apply EIP-55 mixed-case checksum
 */
export function publicKeyToEthAddress(publicKey: Uint8Array): string {
  // Strip the 0x04 uncompressed prefix if present
  let keyBytes = publicKey
  if (keyBytes.length === 65 && keyBytes[0] === 0x04) {
    keyBytes = keyBytes.slice(1)
  }
  if (keyBytes.length !== 64) {
    throw new Error(
      `Expected 64-byte uncompressed public key (without prefix), got ${keyBytes.length}`
    )
  }

  const hash = keccak256(keyBytes)
  const addressBytes = hash.slice(hash.length - 20) // last 20 bytes
  return toChecksumAddress(bytesToHex(addressBytes))
}

/**
 * Convert a raw hex address to EIP-55 checksummed format.
 * Matches the reference implementation in ref/qrdx-chain/qrdx/crypto/address.py
 */
export function toChecksumAddress(addressHex: string): string {
  const clean = addressHex.toLowerCase().replace('0x', '')
  if (clean.length !== 40) {
    throw new Error(`Address must be 40 hex chars, got ${clean.length}`)
  }

  // Hash the lowercase address for checksum
  const hashBytes = keccak256(new TextEncoder().encode(clean))
  const hashHex = bytesToHex(hashBytes)

  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    const char = clean[i]
    if ('0123456789'.includes(char)) {
      checksummed += char
    } else {
      // If the corresponding hash nibble >= 8, uppercase
      checksummed += parseInt(hashHex[i], 16) >= 8 ? char.toUpperCase() : char
    }
  }

  return checksummed
}

/**
 * Sign a 32-byte message hash with secp256k1.
 * Returns { r, s, v, signature } where signature is the 65-byte r+s+v.
 */
export function ecdsaSign(
  messageHash: Uint8Array,
  privateKey: Uint8Array
): { r: Uint8Array; s: Uint8Array; v: number; signature: Uint8Array } {
  const sig = secp256k1.sign(messageHash, privateKey)
  const compactBytes = sig.toCompactRawBytes() // 64 bytes: r[32] + s[32]
  const r = compactBytes.slice(0, 32)
  const s = compactBytes.slice(32, 64)
  const v = sig.recovery + 27

  // Build the 65-byte signature
  const signature = new Uint8Array(65)
  signature.set(r, 0)
  signature.set(s, 32)
  signature[64] = v

  return { r, s, v, signature }
}

/**
 * Sign an Ethereum personal_sign message (EIP-191).
 *
 *   hash = keccak256("\x19Ethereum Signed Message:\n" + len + message)
 *   signature = ecdsaSign(hash, privateKey)
 */
export function signEthMessage(
  message: Uint8Array | string,
  privateKey: Uint8Array | string
): { hash: string; signature: string } {
  const msgBytes =
    typeof message === 'string' ? new TextEncoder().encode(message) : message
  const privBytes =
    typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey

  // EIP-191 prefix
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${msgBytes.length}`
  )
  const prefixed = new Uint8Array(prefix.length + msgBytes.length)
  prefixed.set(prefix, 0)
  prefixed.set(msgBytes, prefix.length)

  const hash = keccak256(prefixed)
  const { signature } = ecdsaSign(hash, privBytes)

  return {
    hash: '0x' + bytesToHex(hash),
    signature: '0x' + bytesToHex(signature),
  }
}

/**
 * Sign a raw keccak256 hash (e.g. transaction hash) with secp256k1.
 */
export function signHash(
  hash: Uint8Array | string,
  privateKey: Uint8Array | string
): { signature: string; v: number; r: string; s: string } {
  const hashBytes = typeof hash === 'string' ? hexToBytes(hash) : hash
  const privBytes =
    typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey

  const result = ecdsaSign(hashBytes, privBytes)
  return {
    signature: '0x' + bytesToHex(result.signature),
    v: result.v,
    r: '0x' + bytesToHex(result.r),
    s: '0x' + bytesToHex(result.s),
  }
}

/**
 * Recover the address from a signed message hash.
 */
export function recoverAddress(
  messageHash: Uint8Array,
  signatureBytes: Uint8Array
): string {
  const r = signatureBytes.slice(0, 32)
  const s = signatureBytes.slice(32, 64)
  const v = signatureBytes[64]
  const recovery = v >= 27 ? v - 27 : v

  const sig = secp256k1.Signature.fromCompact(
    new Uint8Array([...r, ...s])
  ).addRecoveryBit(recovery)

  const pubKey = sig.recoverPublicKey(messageHash)
  return publicKeyToEthAddress(pubKey.toRawBytes(false))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Post-Quantum (ML-DSA-65 / Dilithium3)
// ═══════════════════════════════════════════════════════════════════════════════
//
//  The real implementation lives in ./pq.ts, which uses @noble/post-quantum
//  (FIPS 204). It is re-exported here so existing imports from './crypto'
//  keep working.
//
//  What used to be here was a placeholder: public keys were a SHA-256 digest
//  repeated to 1952 bytes and signatures were SHA-256 expansion. The sizes
//  looked right, but nothing verified — the node checks PQ signatures with
//  liboqs and would have rejected all of them.
//
//  toPqChecksumAddress stays in this file because ./pq.ts depends on it and
//  it is address formatting rather than signature logic.

export {
  PQ_SIZES,
  PqKeyError,
  generatePqKeyPair,
  pqKeyPairFromSeed,
  pqKeyPairFromMnemonic,
  pqKeyPairFromStored,
  derivePqSeedFromMnemonic,
  pqPublicKeyToAddress,
  pqSign,
  pqSignWithPrefix,
  pqVerify,
  pqVerifyWithPrefix,
  isPqAvailable,
  type PqKeyPair,
} from './pq'

/** @deprecated Use {@link PQ_SIZES}. Kept so older imports keep resolving. */
export { PQ_SIZES as PQ_KEY_SIZES } from './pq'

/**
 * Convert a raw hex address to PQ checksummed format (0xPQ prefix).
 * Matches ref/qrdx-chain/qrdx/crypto/address.py:to_pq_checksum_address()
 */
export function toPqChecksumAddress(addressHex: string): string {
  let clean = addressHex.toLowerCase()
  if (clean.startsWith('0xpq')) clean = clean.slice(4)
  else if (clean.startsWith('0x')) clean = clean.slice(2)

  if (clean.length !== 64) {
    throw new Error(`PQ address must be 64 hex chars, got ${clean.length}`)
  }

  // Hash for checksum
  const hashBytes = keccak256(new TextEncoder().encode(clean))
  const hashHex = bytesToHex(hashBytes)

  let checksummed = '0xPQ'
  for (let i = 0; i < 64; i++) {
    const char = clean[i]
    if ('0123456789'.includes(char)) {
      checksummed += char
    } else {
      checksummed +=
        parseInt(hashHex[i % hashHex.length], 16) >= 8
          ? char.toUpperCase()
          : char
    }
  }

  return checksummed
}

/**
 * Encrypt data with a password using AES-256-GCM + PBKDF2.
 * Returns salt + iv + ciphertext as hex.
 */
export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )

  const salt = new Uint8Array(getRandomBytesSync(16))
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const iv = new Uint8Array(getRandomBytesSync(12))
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(data)
  )

  // Combine: salt[16] + iv[12] + ciphertext[...]
  const result = new Uint8Array(
    salt.length + iv.length + encryptedData.byteLength
  )
  result.set(salt, 0)
  result.set(iv, salt.length)
  result.set(new Uint8Array(encryptedData), salt.length + iv.length)

  return bytesToHex(result)
}

/**
 * Decrypt data with a password. Reverses encrypt().
 */
export async function decrypt(
  encryptedHex: string,
  password: string
): Promise<string> {
  const encrypted = hexToBytes(encryptedHex)

  const salt = encrypted.slice(0, 16)
  const iv = encrypted.slice(16, 28)
  const data = encrypted.slice(28)

  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    data.buffer as ArrayBuffer
  )

  return new TextDecoder().decode(decryptedData)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BIP-39 Mnemonic / BIP-32 HD Wallet
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a new BIP-39 mnemonic phrase.
 * @param strength 128 = 12 words, 256 = 24 words (default 128)
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return _generateMnemonic(englishWordlist, strength)
}

/**
 * Validate a BIP-39 mnemonic phrase.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), englishWordlist)
}

/**
 * Derive a secp256k1 key pair from a BIP-39 mnemonic.
 * Uses standard Ethereum HD path: m/44'/60'/0'/0/index
 */
export function mnemonicToEthKeyPair(mnemonic: string, index = 0): EthKeyPair {
  const seed = mnemonicToSeedSync(mnemonic.trim().toLowerCase())
  const master = HDKey.fromMasterSeed(seed)
  const child = master.derive(`m/44'/60'/0'/0/${index}`)
  if (!child.privateKey) {
    throw new Error('Failed to derive private key from mnemonic')
  }
  return ethKeyPairFromPrivateKey(child.privateKey)
}

// JSON keystores live in ./keystore.ts (Web3 Secret Storage v3 + QRDX PQ block).
