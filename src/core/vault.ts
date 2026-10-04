/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Vault format v2 (envelope encryption)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Every secret (recovery phrases, imported keys) is encrypted with one random
 *  256-bit **data key** (DEK). The DEK itself is stored only *wrapped*:
 *
 *      password ──PBKDF2-SHA256 (600k)──▶ KEK_pw ──AES-GCM──▶ wrap(DEK)
 *      passkey  ──WebAuthn PRF ─HKDF──▶ KEK_pk ──AES-GCM──▶ wrap(DEK)   (optional, per device)
 *
 *  Consequences, all deliberate:
 *    • Changing the password re-wraps 32 bytes; secrets are never re-encrypted,
 *      so no field can be left behind under the old password (the v1 bug that
 *      orphaned the recovery phrase).
 *    • Biometric unlock never stores or reveals the password: the passkey's PRF
 *      output is the key. Removing a passkey deletes only its wrap.
 *    • While unlocked, the session holds the DEK as a non-extractable CryptoKey,
 *      not the password.
 *
 *  Each sealed blob is bound to its slot with AES-GCM additional data, so a
 *  blob copied into another record (or another vault) fails to decrypt rather
 *  than being silently accepted.
 *
 *  Pure WebCrypto: runs unchanged in browsers, extension service workers, and
 *  Node 20+ (tests).
 */

import { bytesToHex, hexToBytes } from './crypto'

export const VAULT_VERSION = 2

/**
 * PBKDF2 iteration count for new vaults (OWASP 2023 guidance for SHA-256).
 * Stored per vault so it can be raised later without breaking old ones.
 */
export const DEFAULT_KDF_ITERATIONS = 600_000

export interface KdfParams {
  name: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  /** 16+ random bytes, hex. */
  salt: string
}

/** AES-256-GCM ciphertext (tag appended), hex. */
export interface Sealed {
  iv: string
  ct: string
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly code: 'BAD_PASSWORD' | 'CORRUPT' | 'LOCKED' | 'UNSUPPORTED' = 'CORRUPT'
  ) {
    super(message)
    this.name = 'VaultError'
  }
}

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto
  if (!c?.subtle) throw new VaultError('WebCrypto is unavailable in this context', 'UNSUPPORTED')
  return c.subtle
}

const enc = new TextEncoder()
const buf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

export function randomId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string }
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  return bytesToHex(randomBytes(16))
}

/** Best-effort zeroing. JS gives no guarantee, but it shortens the window. */
export function wipe(...arrays: (Uint8Array | undefined | null)[]): void {
  for (const a of arrays) a?.fill(0)
}

// ─── Key derivation ─────────────────────────────────────────────────────────

export function newKdfParams(iterations = DEFAULT_KDF_ITERATIONS): KdfParams {
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToHex(randomBytes(16)) }
}

/** Derive the password key-encryption key. Non-extractable. */
export async function deriveKek(password: string, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') {
    throw new VaultError(`Unsupported KDF ${kdf.name}/${kdf.hash}`, 'UNSUPPORTED')
  }
  const base = await subtle().importKey(
    'raw',
    enc.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: buf(hexToBytes(kdf.salt)),
      iterations: kdf.iterations,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Derive a key-encryption key from a WebAuthn PRF output (32 bytes).
 * HKDF separates it from any other use of the same PRF secret.
 */
export async function deriveKekFromPrf(
  prfOutput: Uint8Array,
  credentialId: string
): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', buf(prfOutput), 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: buf(enc.encode('QRDX-vault/passkey-kek/v1')),
      info: buf(enc.encode(credentialId)),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Import raw DEK bytes as an AES-GCM key. Non-extractable unless asked. */
export async function importDek(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  if (raw.length !== 32) throw new VaultError('Data key must be 32 bytes')
  return subtle().importKey('raw', buf(raw), { name: 'AES-GCM' }, extractable, [
    'encrypt',
    'decrypt',
  ])
}

// ─── Sealing ────────────────────────────────────────────────────────────────

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv: buf(iv), additionalData: buf(enc.encode(aad)) },
    key,
    buf(plaintext)
  )
  return { iv: bytesToHex(iv), ct: bytesToHex(new Uint8Array(ct)) }
}

/**
 * @throws {VaultError} `BAD_PASSWORD` when authentication fails — callers that
 *         seal with a password-derived key surface that as a wrong password.
 */
export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: buf(hexToBytes(sealed.iv)), additionalData: buf(enc.encode(aad)) },
      key,
      buf(hexToBytes(sealed.ct))
    )
    return new Uint8Array(pt)
  } catch {
    throw new VaultError('Decryption failed', 'BAD_PASSWORD')
  }
}

export async function sealJson(key: CryptoKey, value: unknown, aad: string): Promise<Sealed> {
  const bytes = enc.encode(JSON.stringify(value))
  try {
    return await seal(key, bytes, aad)
  } finally {
    wipe(bytes)
  }
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed, aad: string): Promise<T> {
  const bytes = await open(key, sealed, aad)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } finally {
    wipe(bytes)
  }
}

// ─── AAD labels (one per slot) ──────────────────────────────────────────────

export const AAD = {
  passwordWrap: 'qrdx-vault/v2/dek/password',
  passkeyWrap: (credentialId: string) => `qrdx-vault/v2/dek/passkey/${credentialId}`,
  keyring: (keyringId: string) => `qrdx-vault/v2/keyring/${keyringId}`,
} as const
