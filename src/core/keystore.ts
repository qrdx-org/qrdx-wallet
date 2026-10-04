/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — JSON keystores (Web3 Secret Storage v3 + QRDX extension)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Export writes a **standard** v3 keystore — AES-128-CTR, PBKDF2-HMAC-SHA256,
 *  keccak MAC — so MetaMask, geth, ethers and web3 import the classic key from
 *  it unchanged.
 *
 *  The post-quantum seed travels in an `x-qrdx` block encrypted the same way
 *  with the same derived key (fresh IV, own MAC). Standard tools ignore it; the
 *  QRDX wallet restores the *same* `0xPQ` address from it. Before this, an
 *  export carried only the secp256k1 key and a re-import derived a different PQ
 *  key — funds at the original PQ address were unreachable from the file.
 *
 *  Import accepts:
 *    • v3 with `pbkdf2` or `scrypt` (any tool's export)
 *    • v3 + `x-qrdx` (this wallet's export)
 *    • the legacy QRDX format (`cipher: aes-256-gcm`) earlier builds wrote
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex, hexToBytes, ethKeyPairFromPrivateKey } from './crypto'
import { randomBytes, randomId, wipe } from './vault'

export interface KdfPbkdf2 {
  c: number
  dklen: number
  prf: 'hmac-sha256'
  salt: string
}
export interface KdfScrypt {
  n: number
  r: number
  p: number
  dklen: number
  salt: string
}

export interface V3CryptoBlock {
  cipher: 'aes-128-ctr'
  cipherparams: { iv: string }
  ciphertext: string
  kdf: 'pbkdf2' | 'scrypt'
  kdfparams: KdfPbkdf2 | KdfScrypt
  mac: string
}

export interface KeystoreV3 {
  version: 3
  id: string
  address: string
  crypto: V3CryptoBlock
  'x-qrdx'?: {
    version: 1
    /** PQ ML-DSA-65 seed, encrypted with the same derived key (fresh IV). */
    pq?: { cipherparams: { iv: string }; ciphertext: string; mac: string }
    pqAddress?: string
    pqPublicKey?: string
    name?: string
  }
}

/** Shape written by wallet builds before v2 (AES-256-GCM, not interoperable). */
interface LegacyQrdxKeystore {
  version: 3
  crypto: {
    cipher: 'aes-256-gcm'
    cipherparams: { iv: string }
    ciphertext: string
    kdf: 'pbkdf2'
    kdfparams: { salt: string; c: number }
    mac: string
  }
  'x-qrdx'?: { walletName?: string; pqAddress?: string }
}

export interface DecryptedKeystore {
  ethPrivateKey: string
  /** Present when the file carried the PQ seed. */
  pqSeed?: string
  name?: string
  address: string
}

export class KeystoreError extends Error {
  constructor(
    message: string,
    readonly code: 'BAD_PASSWORD' | 'FORMAT' = 'FORMAT'
  ) {
    super(message)
    this.name = 'KeystoreError'
  }
}

const subtle = () => globalThis.crypto.subtle
const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer
const enc = new TextEncoder()

/** Export iterations. 262144 is the geth/ethers pbkdf2 default. */
export const KEYSTORE_PBKDF2_ITERATIONS = 262_144

async function deriveKey(
  password: string,
  kdf: 'pbkdf2' | 'scrypt',
  params: KdfPbkdf2 | KdfScrypt
): Promise<Uint8Array> {
  const pw = enc.encode(password.normalize('NFKC'))
  const salt = hexToBytes(params.salt)
  if (kdf === 'pbkdf2') {
    const p = params as KdfPbkdf2
    if (p.prf !== 'hmac-sha256') throw new KeystoreError(`Unsupported PRF ${p.prf}`)
    const base = await subtle().importKey('raw', ab(pw), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle().deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: ab(salt), iterations: p.c },
      base,
      p.dklen * 8
    )
    return new Uint8Array(bits)
  }
  const p = params as KdfScrypt
  return scryptAsync(pw, salt, { N: p.n, r: p.r, p: p.p, dkLen: p.dklen })
}

async function aes128ctr(key16: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', ab(key16), { name: 'AES-CTR' }, false, ['encrypt'])
  const out = await subtle().encrypt(
    { name: 'AES-CTR', counter: ab(iv), length: 128 },
    key,
    ab(data)
  )
  return new Uint8Array(out)
}

function mac(derived: Uint8Array, ciphertext: Uint8Array): string {
  const m = new Uint8Array(16 + ciphertext.length)
  m.set(derived.slice(16, 32), 0)
  m.set(ciphertext, 16)
  return bytesToHex(keccak256(m))
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

/** Write a standard v3 keystore, with the PQ seed in `x-qrdx` when given. */
export async function encryptKeystore(
  secret: {
    ethPrivateKey: string
    pqSeed?: string
    pqAddress?: string
    pqPublicKey?: string
    name?: string
  },
  password: string,
  iterations = KEYSTORE_PBKDF2_ITERATIONS
): Promise<KeystoreV3> {
  const kdfparams: KdfPbkdf2 = {
    c: iterations,
    dklen: 32,
    prf: 'hmac-sha256',
    salt: bytesToHex(randomBytes(32)),
  }
  const derived = await deriveKey(password, 'pbkdf2', kdfparams)
  try {
    const key = hexToBytes(secret.ethPrivateKey.replace(/^0x/, ''))
    const iv = randomBytes(16)
    const ct = await aes128ctr(derived.slice(0, 16), iv, key)
    const address = ethKeyPairFromPrivateKey(key).address.slice(2).toLowerCase()
    wipe(key)

    const ks: KeystoreV3 = {
      version: 3,
      id: randomId(),
      address,
      crypto: {
        cipher: 'aes-128-ctr',
        cipherparams: { iv: bytesToHex(iv) },
        ciphertext: bytesToHex(ct),
        kdf: 'pbkdf2',
        kdfparams,
        mac: mac(derived, ct),
      },
    }

    if (secret.pqSeed) {
      const seed = hexToBytes(secret.pqSeed.replace(/^0x/, ''))
      const pqIv = randomBytes(16)
      const pqCt = await aes128ctr(derived.slice(0, 16), pqIv, seed)
      wipe(seed)
      ks['x-qrdx'] = {
        version: 1,
        pq: {
          cipherparams: { iv: bytesToHex(pqIv) },
          ciphertext: bytesToHex(pqCt),
          mac: mac(derived, pqCt),
        },
        pqAddress: secret.pqAddress,
        pqPublicKey: secret.pqPublicKey,
        name: secret.name,
      }
    }
    return ks
  } finally {
    wipe(derived)
  }
}

function isLegacy(ks: unknown): ks is LegacyQrdxKeystore {
  return (ks as LegacyQrdxKeystore)?.crypto?.cipher === 'aes-256-gcm'
}

async function decryptLegacy(ks: LegacyQrdxKeystore, password: string): Promise<DecryptedKeystore> {
  const base = await subtle().importKey('raw', ab(enc.encode(password)), 'PBKDF2', false, [
    'deriveKey',
  ])
  const key = await subtle().deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: ab(hexToBytes(ks.crypto.kdfparams.salt)),
      iterations: ks.crypto.kdfparams.c,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const ct = hexToBytes(ks.crypto.ciphertext)
  const tag = hexToBytes(ks.crypto.mac)
  const full = new Uint8Array(ct.length + tag.length)
  full.set(ct, 0)
  full.set(tag, ct.length)
  let plain: ArrayBuffer
  try {
    plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: ab(hexToBytes(ks.crypto.cipherparams.iv)) },
      key,
      ab(full)
    )
  } catch {
    throw new KeystoreError('Wrong keystore password', 'BAD_PASSWORD')
  }
  const ethPrivateKey = new TextDecoder().decode(plain).replace(/^0x/, '')
  return {
    ethPrivateKey,
    name: ks['x-qrdx']?.walletName,
    address: ethKeyPairFromPrivateKey(ethPrivateKey).address,
  }
}

/** Parse and decrypt any supported keystore. */
export async function decryptKeystore(
  input: unknown,
  password: string
): Promise<DecryptedKeystore> {
  const ks = typeof input === 'string' ? safeParse(input) : input
  if (isLegacy(ks)) return decryptLegacy(ks, password)

  const v3 = ks as KeystoreV3
  // Some tools write `Crypto` (capitalised).
  const c = (v3?.crypto ?? (v3 as unknown as { Crypto?: V3CryptoBlock })?.Crypto) as
    V3CryptoBlock | undefined
  if (v3?.version !== 3 || !c) throw new KeystoreError('Not a version 3 keystore file')
  if (c.cipher !== 'aes-128-ctr') throw new KeystoreError(`Unsupported cipher ${c.cipher}`)
  if (c.kdf !== 'pbkdf2' && c.kdf !== 'scrypt') throw new KeystoreError(`Unsupported KDF ${c.kdf}`)

  const derived = await deriveKey(password, c.kdf, c.kdfparams)
  try {
    const ct = hexToBytes(c.ciphertext)
    if (!constantTimeEqualHex(mac(derived, ct), c.mac)) {
      throw new KeystoreError('Wrong keystore password', 'BAD_PASSWORD')
    }
    const key = await aes128ctr(derived.slice(0, 16), hexToBytes(c.cipherparams.iv), ct)
    const ethPrivateKey = bytesToHex(key)
    wipe(key)
    const address = ethKeyPairFromPrivateKey(ethPrivateKey).address
    if (
      v3.address &&
      v3.address.replace(/^0x/, '').toLowerCase() !== address.slice(2).toLowerCase()
    ) {
      throw new KeystoreError('Keystore address does not match its key — the file is corrupted')
    }

    let pqSeed: string | undefined
    const pq = v3['x-qrdx']?.pq
    if (pq) {
      const pqCt = hexToBytes(pq.ciphertext)
      if (!constantTimeEqualHex(mac(derived, pqCt), pq.mac)) {
        throw new KeystoreError('The post-quantum section of this keystore is corrupted')
      }
      const seed = await aes128ctr(derived.slice(0, 16), hexToBytes(pq.cipherparams.iv), pqCt)
      pqSeed = bytesToHex(seed)
      wipe(seed)
    }
    return { ethPrivateKey, pqSeed, name: v3['x-qrdx']?.name, address }
  } finally {
    wipe(derived)
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    throw new KeystoreError('The file is not valid JSON')
  }
}
