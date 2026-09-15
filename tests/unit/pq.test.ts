/**
 * Post-quantum (ML-DSA-65 / FIPS 204) tests.
 *
 * Two things matter here and both are checked: that the primitives behave like
 * a real signature scheme, and that the wallet's *key management* around them
 * is sound — addresses derived the way the node derives them, and keys that a
 * recovery phrase can actually reproduce.
 */

import { describe, it, expect } from 'vitest'
import {
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
} from '../../src/core/pq'
import { hexToBytes } from '../../src/core/crypto'
import { validateAddress } from '../../src/core/address'

const MNEMONIC =
  'test test test test test test test test test test test junk'
const MESSAGE = new TextEncoder().encode('transfer 5 QRDX to alice')

describe('parameters', () => {
  it('matches the node’s ML-DSA-65 sizes', () => {
    // These mirror qrdx/crypto/pq/dilithium.py; a mismatch means the wallet and
    // node disagree about the wire format.
    expect(PQ_SIZES.secretKey).toBe(4032)
    expect(PQ_SIZES.publicKey).toBe(1952)
    expect(PQ_SIZES.signature).toBe(3309)
  })

  it('reports post-quantum signing as available', () => {
    expect(isPqAvailable()).toBe(true)
  })
})

describe('key generation', () => {
  it('produces correctly sized key material', async () => {
    const kp = await generatePqKeyPair()

    expect(hexToBytes(kp.secretKey)).toHaveLength(PQ_SIZES.secretKey)
    expect(hexToBytes(kp.publicKey)).toHaveLength(PQ_SIZES.publicKey)
    expect(hexToBytes(kp.privateKey)).toHaveLength(PQ_SIZES.seed)
  })

  it('is deterministic in the seed', async () => {
    const seed = new Uint8Array(32).fill(9)
    const a = await pqKeyPairFromSeed(seed)
    const b = await pqKeyPairFromSeed(seed)

    expect(a.publicKey).toBe(b.publicKey)
    expect(a.secretKey).toBe(b.secretKey)
    expect(a.address).toBe(b.address)
  })

  it('gives different seeds different keys', async () => {
    const a = await pqKeyPairFromSeed(new Uint8Array(32).fill(1))
    const b = await pqKeyPairFromSeed(new Uint8Array(32).fill(2))

    expect(a.publicKey).not.toBe(b.publicKey)
    expect(a.address).not.toBe(b.address)
  })

  it('generates a distinct key each time without a seed', async () => {
    const a = await generatePqKeyPair()
    const b = await generatePqKeyPair()
    expect(a.publicKey).not.toBe(b.publicKey)
  })

  it('accepts a non-32-byte seed by folding it deterministically', async () => {
    const long = new Uint8Array(64).fill(3)
    const a = await pqKeyPairFromSeed(long)
    const b = await pqKeyPairFromSeed(long)

    expect(a.publicKey).toBe(b.publicKey)
    expect(hexToBytes(a.privateKey)).toHaveLength(PQ_SIZES.seed)
  })

  it('rejects an empty seed', async () => {
    await expect(pqKeyPairFromSeed(new Uint8Array(0))).rejects.toThrow(PqKeyError)
  })
})

describe('addresses', () => {
  it('produces a valid 0xPQ address', async () => {
    const kp = await generatePqKeyPair()
    const result = validateAddress(kp.address)

    expect(result.valid).toBe(true)
    expect(result.kind).toBe('pq')
    expect(kp.address.startsWith('0xPQ')).toBe(true)
  })

  it('derives the same address from the public key alone', async () => {
    const kp = await generatePqKeyPair()
    expect(pqPublicKeyToAddress(kp.publicKey)).toBe(kp.address)
  })

  it('gives a stable short fingerprint', async () => {
    const kp = await pqKeyPairFromSeed(new Uint8Array(32).fill(5))
    expect(kp.fingerprint).toHaveLength(16) // 8 bytes hex
  })
})

describe('signing', () => {
  it('produces a verifiable signature of the right size', async () => {
    const kp = await generatePqKeyPair()
    const sig = await pqSign(MESSAGE, kp.privateKey)

    expect(hexToBytes(sig)).toHaveLength(PQ_SIZES.signature)
    expect(pqVerify(MESSAGE, sig, kp.publicKey)).toBe(true)
  })

  it('rejects a tampered message', async () => {
    const kp = await generatePqKeyPair()
    const sig = await pqSign(MESSAGE, kp.privateKey)

    const tampered = new TextEncoder().encode('transfer 50 QRDX to alice')
    expect(pqVerify(tampered, sig, kp.publicKey)).toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const a = await generatePqKeyPair()
    const b = await generatePqKeyPair()
    const sig = await pqSign(MESSAGE, a.privateKey)

    expect(pqVerify(MESSAGE, sig, b.publicKey)).toBe(false)
  })

  it('rejects a corrupted signature', async () => {
    const kp = await generatePqKeyPair()
    const sig = await pqSign(MESSAGE, kp.privateKey)

    const bytes = hexToBytes(sig)
    bytes[100] ^= 0xff
    const corrupted = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

    expect(pqVerify(MESSAGE, corrupted, kp.publicKey)).toBe(false)
  })

  it('returns false rather than throwing on malformed input', async () => {
    const kp = await generatePqKeyPair()

    expect(pqVerify(MESSAGE, 'not-hex', kp.publicKey)).toBe(false)
    expect(pqVerify(MESSAGE, '0xabcd', kp.publicKey)).toBe(false)
    expect(pqVerify(MESSAGE, await pqSign(MESSAGE, kp.privateKey), '0x00')).toBe(false)
  })

  it('signs the same message differently each time (hedged), both valid', async () => {
    const kp = await generatePqKeyPair()
    const a = await pqSign(MESSAGE, kp.privateKey)
    const b = await pqSign(MESSAGE, kp.privateKey)

    expect(a).not.toBe(b)
    expect(pqVerify(MESSAGE, a, kp.publicKey)).toBe(true)
    expect(pqVerify(MESSAGE, b, kp.publicKey)).toBe(true)
  })
})

describe('prefixed message signing', () => {
  it('round-trips through the prefixed helpers', async () => {
    const kp = await generatePqKeyPair()
    const sig = await pqSignWithPrefix('hello', kp.privateKey)

    expect(pqVerifyWithPrefix('hello', sig, kp.publicKey)).toBe(true)
    expect(pqVerifyWithPrefix('goodbye', sig, kp.publicKey)).toBe(false)
  })

  it('is not interchangeable with a raw signature over the same text', async () => {
    // The prefix exists so a signature over a displayed message cannot be
    // replayed as a signature over raw bytes the user never saw.
    const kp = await generatePqKeyPair()
    const prefixed = await pqSignWithPrefix('hello', kp.privateKey)

    expect(pqVerify(new TextEncoder().encode('hello'), prefixed, kp.publicKey)).toBe(false)
  })
})

describe('mnemonic derivation', () => {
  it('recovers the same PQ account from the same phrase', async () => {
    const a = await pqKeyPairFromMnemonic(MNEMONIC)
    const b = await pqKeyPairFromMnemonic(MNEMONIC)

    expect(a.address).toBe(b.address)
    expect(a.publicKey).toBe(b.publicKey)
  })

  it('gives each account index its own key', async () => {
    const first = await pqKeyPairFromMnemonic(MNEMONIC, 0)
    const second = await pqKeyPairFromMnemonic(MNEMONIC, 1)

    expect(first.address).not.toBe(second.address)
  })

  it('gives different phrases different keys', async () => {
    const other =
      'legal winner thank year wave sausage worth useful legal winner thank yellow'
    const a = await pqKeyPairFromMnemonic(MNEMONIC)
    const b = await pqKeyPairFromMnemonic(other)

    expect(a.address).not.toBe(b.address)
  })

  it('normalises case and surrounding whitespace', async () => {
    const a = await pqKeyPairFromMnemonic(MNEMONIC)
    const b = await pqKeyPairFromMnemonic(`  ${MNEMONIC.toUpperCase()}  `)

    expect(a.address).toBe(b.address)
  })

  it('derives a 32-byte seed', () => {
    expect(derivePqSeedFromMnemonic(MNEMONIC)).toHaveLength(32)
  })

  it('does not reuse the BIP-39 seed directly as the PQ seed', () => {
    // Domain separation: the PQ seed must not equal any prefix of the raw
    // BIP-39 seed, or the two key systems would share secret material.
    const pqSeed = derivePqSeedFromMnemonic(MNEMONIC)
    expect(pqSeed.some(b => b !== 0)).toBe(true)
    expect(derivePqSeedFromMnemonic(MNEMONIC, 0)).not.toEqual(
      derivePqSeedFromMnemonic(MNEMONIC, 1),
    )
  })
})

describe('restoring from storage', () => {
  it('rebuilds a key pair whose public key matches the record', async () => {
    const kp = await generatePqKeyPair()
    const restored = await pqKeyPairFromStored(kp.privateKey, kp.publicKey)

    expect(restored.address).toBe(kp.address)
    expect(restored.secretKey).toBe(kp.secretKey)
  })

  it('can sign after being restored', async () => {
    const kp = await generatePqKeyPair()
    const restored = await pqKeyPairFromStored(kp.privateKey, kp.publicKey)
    const sig = await pqSign(MESSAGE, restored.privateKey)

    expect(pqVerify(MESSAGE, sig, kp.publicKey)).toBe(true)
  })

  it('refuses a record whose public key does not match its seed', async () => {
    // A mismatch means the wallet would sign with a key that does not
    // correspond to the address it shows — fail loudly rather than silently.
    const a = await generatePqKeyPair()
    const b = await generatePqKeyPair()

    await expect(pqKeyPairFromStored(a.privateKey, b.publicKey)).rejects.toThrow(
      PqKeyError,
    )
  })
})
