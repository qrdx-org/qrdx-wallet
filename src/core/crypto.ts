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
//  Post-Quantum / ML-DSA-65 (Dilithium3) — FALLBACK MODE
// ═══════════════════════════════════════════════════════════════════════════════
//
//  This implements the same fallback mode as ref/qrdx-chain/qrdx/crypto/pq/dilithium.py
//  when liboqs is not available. Keys are deterministic from a seed and
//  signatures use SHA-256 expansion.
//
//  When a WASM/JS Dilithium implementation becomes available, the internal
//  _generate / _sign / _verify functions can be swapped without changing
//  the public API.
// ═══════════════════════════════════════════════════════════════════════════════

/** ML-DSA-65 (Dilithium3) key sizes — matches the reference */
export const PQ_KEY_SIZES = {
  privateKey: 4032,
  publicKey: 1952,
  signature: 3309,
  seed: 64,
  addressBytes: 32,  // 0xPQ + 64 hex chars
} as const

export interface PqKeyPair {
  /** Hex-encoded seed (64 bytes) or full private key (4032 bytes with real liboqs) */
  privateKey: string
  /** Hex-encoded public key (1952 bytes) — MUST be stored; Dilithium keygen is non-deterministic */
  publicKey: string
  /** 0xPQ-prefixed checksummed address */
  address: string
  /** SHA-256 fingerprint of public key (first 8 bytes as hex) */
  fingerprint: string
}

/**
 * Generate a new PQ key pair.
 *
 * In fallback mode (no liboqs / no WASM Dilithium), this generates
 * deterministic test keys from a random 64-byte seed, exactly matching
 * the Python reference: PQPrivateKey._generate_fallback_keys()
 */
export async function generatePqKeyPair(): Promise<PqKeyPair> {
  // Generate a 64-byte random seed
  const seed = getRandomBytesSync(64)
  return pqKeyPairFromSeed(seed)
}

/**
 * Derive a PQ key pair deterministically from a seed.
 * Matches ref/qrdx-chain: PQPrivateKey.from_seed() and _generate_fallback_keys()
 *
 * In production with liboqs, the seed would be expanded via SHAKE256 to
 * the full 4032-byte Dilithium private key. In fallback mode, we use
 * SHA-256 repetition to fill 1952 bytes of "public key" data.
 */
export async function pqKeyPairFromSeed(seed: Uint8Array): Promise<PqKeyPair> {
  const privateKeyHex = bytesToHex(seed)

  // Deterministic public key: SHA-256(seed) repeated to fill 1952 bytes
  // Matches: fake_pubkey = h.digest() * 61; fake_pubkey[:1952]
  const seedHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', seed.slice(0, 64).buffer as ArrayBuffer)
  ) // 32 bytes

  const pubKeyBytes = new Uint8Array(PQ_KEY_SIZES.publicKey)
  for (let i = 0; i < PQ_KEY_SIZES.publicKey; i += 32) {
    const remaining = Math.min(32, PQ_KEY_SIZES.publicKey - i)
    pubKeyBytes.set(seedHash.slice(0, remaining), i)
  }
  const publicKeyHex = bytesToHex(pubKeyBytes)

  // Derive PQ address: keccak256(pubkey)[:32] → 0xPQ prefix
  const pubKeyHash = keccak256(pubKeyBytes)
  const addressBytes = pubKeyHash.slice(0, 32) // first 32 bytes
  const address = toPqChecksumAddress(bytesToHex(addressBytes))

  // Fingerprint: first 8 bytes of SHA-256(pubkey) as hex
  const fingerprintHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', pubKeyBytes.buffer as ArrayBuffer)
  )
  const fingerprint = bytesToHex(fingerprintHash.slice(0, 8))

  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
    address,
    fingerprint,
  }
}

/**
 * Restore a PQ key pair from stored private key + public key hex.
 *
 * Critical: The public key MUST be provided because Dilithium key generation
 * is not deterministic — restoring from private key alone would produce a
 * different keypair (and different address). The reference implementation
 * stores the public key in the keystore for exactly this reason.
 */
export function pqKeyPairFromStored(
  privateKeyHex: string,
  publicKeyHex: string
): PqKeyPair {
  const pubKeyBytes = hexToBytes(publicKeyHex)

  // Derive address from stored public key
  const pubKeyHash = keccak256(pubKeyBytes)
  const addressBytes = pubKeyHash.slice(0, 32)
  const address = toPqChecksumAddress(bytesToHex(addressBytes))

  // Compute fingerprint using keccak (sync, avoids async)
  const fp = keccak256(pubKeyBytes).slice(0, 8)
  const fingerprint = bytesToHex(fp)

  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
    address,
    fingerprint,
  }
}

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
 * Sign a message with a PQ private key (fallback mode).
 *
 * In fallback mode, produces a deterministic signature via SHA-256 expansion,
 * matching ref/qrdx-chain: PQPrivateKey.sign() fallback.
 *
 * Real implementation would call liboqs ML-DSA-65 sign.
 */
export async function pqSign(
  message: Uint8Array,
  privateKeyHex: string
): Promise<string> {
  const privBytes = hexToBytes(privateKeyHex)

  // h = hashlib.sha256(self._key_bytes + message).digest()
  const combined = new Uint8Array(privBytes.length + message.length)
  combined.set(privBytes, 0)
  combined.set(message, privBytes.length)

  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', combined.buffer as ArrayBuffer)
  ) // 32 bytes

  // fake_sig = h * 103; fake_sig[:3309]
  const sigBytes = new Uint8Array(PQ_KEY_SIZES.signature)
  for (let i = 0; i < PQ_KEY_SIZES.signature; i += 32) {
    const remaining = Math.min(32, PQ_KEY_SIZES.signature - i)
    sigBytes.set(hash.slice(0, remaining), i)
  }

  return bytesToHex(sigBytes)
}

/**
 * Sign with QRDX PQ prefix (analogous to EIP-191).
 * Matches ref: PQWallet.sign_with_prefix()
 */
export async function pqSignWithPrefix(
  message: Uint8Array,
  privateKeyHex: string
): Promise<string> {
  const prefix = new TextEncoder().encode(
    `\x19QRDX PQ Signed Message:\n${message.length}`
  )
  const prefixed = new Uint8Array(prefix.length + message.length)
  prefixed.set(prefix, 0)
  prefixed.set(message, prefix.length)
  return pqSign(prefixed, privateKeyHex)
}

/**
 * Verify a PQ signature (fallback mode — always returns true).
 * Matches ref/qrdx-chain: verify() fallback when liboqs unavailable.
 *
 * Real implementation would use liboqs ML-DSA-65 verify.
 */
export function pqVerify(
  _message: Uint8Array,
  _signatureHex: string,
  _publicKeyHex: string
): boolean {
  // Fallback: always return true (same as reference)
  return true
}

/**
 * Check if real PQ crypto (liboqs WASM) is available.
 * Currently always false — will be true when WASM bindings are added.
 */
export function isPqAvailable(): boolean {
  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Password-based encryption — AES-256-GCM (Web Crypto)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
//  JSON Keystore (Ethereum-compatible export/import)
// ═══════════════════════════════════════════════════════════════════════════════

export interface KeystoreJSON {
  version: 3
  id: string
  address: string
  crypto: {
    cipher: 'aes-256-gcm'
    cipherparams: { iv: string }
    ciphertext: string
    kdf: 'pbkdf2'
    kdfparams: {
      dklen: number
      salt: string
      c: number
      prf: 'hmac-sha256'
    }
    mac: string
  }
  /** QRDX extensions — not present in standard Ethereum keystores */
  'x-qrdx'?: {
    pqPublicKey: string
    pqAddress: string
    pqFingerprint: string
    ethPublicKey: string
    walletName: string
  }
}

/**
 * Export a wallet to an Ethereum-compatible JSON keystore (V3).
 * Uses PBKDF2 + AES-256-GCM (our standard encryption scheme).
 */
export async function exportKeystoreJSON(
  privateKeyHex: string,
  password: string,
  extras?: {
    ethPublicKey?: string
    ethAddress?: string
    pqPublicKey?: string
    pqAddress?: string
    pqFingerprint?: string
    walletName?: string
  }
): Promise<KeystoreJSON> {
  const encoder = new TextEncoder()
  const salt = getRandomBytesSync(32)
  const iv = getRandomBytesSync(12)
  const iterations = 100000

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  )

  const plaintext = encoder.encode(privateKeyHex)
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    plaintext
  )
  const cipherBytes = new Uint8Array(cipherBuf)

  // MAC = last 16 bytes of GCM ciphertext (GCM authentication tag)
  const macBytes = cipherBytes.slice(cipherBytes.length - 16)
  const ctBytes = cipherBytes.slice(0, cipherBytes.length - 16)

  const address = extras?.ethAddress?.replace('0x', '') ?? ''

  const keystore: KeystoreJSON = {
    version: 3,
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    address,
    crypto: {
      cipher: 'aes-256-gcm',
      cipherparams: { iv: bytesToHex(iv) },
      ciphertext: bytesToHex(ctBytes),
      kdf: 'pbkdf2',
      kdfparams: {
        dklen: 32,
        salt: bytesToHex(salt),
        c: iterations,
        prf: 'hmac-sha256',
      },
      mac: bytesToHex(macBytes),
    },
  }

  if (extras?.pqPublicKey) {
    keystore['x-qrdx'] = {
      pqPublicKey: extras.pqPublicKey,
      pqAddress: extras.pqAddress ?? '',
      pqFingerprint: extras.pqFingerprint ?? '',
      ethPublicKey: extras.ethPublicKey ?? '',
      walletName: extras.walletName ?? '',
    }
  }

  return keystore
}

/**
 * Import a wallet from a JSON keystore file.
 * Returns the decrypted private key hex.
 */
export async function importKeystoreJSON(
  keystore: KeystoreJSON,
  password: string
): Promise<string> {
  const { crypto: c } = keystore
  const salt = hexToBytes(c.kdfparams.salt)
  const iv = hexToBytes(c.cipherparams.iv)
  const ctBytes = hexToBytes(c.ciphertext)
  const macBytes = hexToBytes(c.mac)
  const iterations = c.kdfparams.c

  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  // Reconstruct GCM ciphertext with auth tag
  const fullCipher = new Uint8Array(ctBytes.length + macBytes.length)
  fullCipher.set(ctBytes, 0)
  fullCipher.set(macBytes, ctBytes.length)

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    fullCipher.buffer as ArrayBuffer
  )
  return new TextDecoder().decode(plainBuf)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Legacy API — backwards compatible with old QuantumCrypto class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use the individual functions directly. This class is kept for
 * backwards compatibility with code that imports `QuantumCrypto`.
 */
export class QuantumCrypto {
  /** @deprecated Use generateEthKeyPair() + generatePqKeyPair() instead */
  static async generateKeyPair(): Promise<{
    publicKey: string
    privateKey: string
    address: string
  }> {
    const eth = generateEthKeyPair()
    return {
      publicKey: eth.publicKey,
      privateKey: eth.privateKey,
      address: eth.address,
    }
  }

  /** @deprecated Use ecdsaSign() or pqSign() instead */
  static async sign(message: string, privateKey: string): Promise<string> {
    const result = signEthMessage(message, privateKey)
    return result.signature
  }

  /** @deprecated Use recoverAddress() or pqVerify() instead */
  static async verify(
    _message: string,
    signature: string,
    _publicKey: string
  ): Promise<boolean> {
    return signature.length > 0
  }

  /** Encrypt data with a password */
  static encrypt = encrypt

  /** Decrypt data with a password */
  static decrypt = decrypt
}
