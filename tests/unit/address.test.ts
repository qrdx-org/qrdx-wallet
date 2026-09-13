/**
 * Address parsing tests.
 *
 * The fixtures are real addresses taken from the running local testnet's
 * genesis state and from the reference key used in the signing tests, so a
 * change in checksum behaviour shows up against values the chain itself uses.
 */

import { describe, it, expect } from 'vitest'
import {
  detectAddressKind,
  validateAddress,
  isValidAddress,
  isValidEthAddress,
  isValidPqAddress,
  normalizeAddress,
  addressesEqual,
  shortenAddress,
} from '../../src/core/address'

/** Genesis faucet account on the local testnet (private key 1). */
const ETH_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
/** A QRDX system wallet (Developer Fund). */
const ETH_SYSTEM = '0x0000000000000000000000000000000000000003'
/** Validator 0's post-quantum address from the local testnet genesis. */
const PQ_ADDRESS =
  '0xPQ8d30632d776eC1b311f674aE80ECd06d04df27f4bb0f6BEE32693cAFb5AC59D6'

describe('detectAddressKind', () => {
  it('classifies a traditional address', () => {
    expect(detectAddressKind(ETH_ADDRESS)).toBe('eth')
  })

  it('classifies a post-quantum address', () => {
    expect(detectAddressKind(PQ_ADDRESS)).toBe('pq')
  })

  it('does not mistake a PQ address for a traditional one', () => {
    // 0xPQ... also starts with 0x, so prefix order matters.
    expect(detectAddressKind(PQ_ADDRESS)).not.toBe('eth')
  })

  it('rejects wrong lengths and non-0x strings', () => {
    expect(detectAddressKind('0x1234')).toBeNull()
    expect(detectAddressKind(ETH_ADDRESS + 'ab')).toBeNull()
    expect(detectAddressKind('not-an-address')).toBeNull()
    expect(detectAddressKind('')).toBeNull()
  })
})

describe('validateAddress', () => {
  it('accepts a correctly checksummed traditional address', () => {
    const result = validateAddress(ETH_ADDRESS)
    expect(result.valid).toBe(true)
    expect(result.kind).toBe('eth')
    expect(result.normalized).toBe(ETH_ADDRESS)
  })

  it('accepts a correctly checksummed post-quantum address', () => {
    const result = validateAddress(PQ_ADDRESS)
    expect(result.valid).toBe(true)
    expect(result.kind).toBe('pq')
  })

  it('accepts an all-lowercase address and normalises it', () => {
    const result = validateAddress(ETH_ADDRESS.toLowerCase())
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe(ETH_ADDRESS)
  })

  it('accepts an all-numeric address with no case information', () => {
    expect(validateAddress(ETH_SYSTEM).valid).toBe(true)
  })

  it('rejects a mixed-case address whose checksum fails', () => {
    // Flip one letter's case — a realistic transcription error that EIP-55
    // exists to catch.
    const corrupted = ETH_ADDRESS.replace('7E5F', '7e5F')
    const result = validateAddress(corrupted)

    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/checksum/i)
  })

  it('rejects non-hex characters', () => {
    const result = validateAddress('0x' + 'z'.repeat(40))
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/hexadecimal/i)
  })

  it('explains a wrong-length address', () => {
    const result = validateAddress('0xdeadbeef')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/length/i)
  })

  it('explains a missing 0x prefix', () => {
    const result = validateAddress('7E5F4552091A69125d5DfCb7b8C2659029395Bdf')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/0x/)
  })

  it('requires a non-empty value', () => {
    expect(validateAddress('   ').error).toMatch(/required/i)
  })

  it('tolerates surrounding whitespace from paste', () => {
    expect(validateAddress(`  ${ETH_ADDRESS}\n`).valid).toBe(true)
  })
})

describe('kind-specific guards', () => {
  it('separates eth and pq addresses', () => {
    expect(isValidEthAddress(ETH_ADDRESS)).toBe(true)
    expect(isValidEthAddress(PQ_ADDRESS)).toBe(false)

    expect(isValidPqAddress(PQ_ADDRESS)).toBe(true)
    expect(isValidPqAddress(ETH_ADDRESS)).toBe(false)

    expect(isValidAddress(ETH_ADDRESS)).toBe(true)
    expect(isValidAddress(PQ_ADDRESS)).toBe(true)
  })
})

describe('normalizeAddress', () => {
  it('returns the checksummed form', () => {
    expect(normalizeAddress(ETH_ADDRESS.toLowerCase())).toBe(ETH_ADDRESS)
  })

  it('throws with the reason for an invalid address', () => {
    expect(() => normalizeAddress('0xnope')).toThrow(/length|hexadecimal/i)
  })
})

describe('addressesEqual', () => {
  it('ignores checksum casing, which varies by source', () => {
    expect(addressesEqual(ETH_ADDRESS, ETH_ADDRESS.toLowerCase())).toBe(true)
    expect(addressesEqual(` ${ETH_ADDRESS} `, ETH_ADDRESS)).toBe(true)
    expect(addressesEqual(ETH_ADDRESS, ETH_SYSTEM)).toBe(false)
  })
})

describe('shortenAddress', () => {
  it('keeps the 0x prefix', () => {
    expect(shortenAddress(ETH_ADDRESS)).toBe('0x7E5F…5Bdf')
  })

  it('keeps the 0xPQ prefix so the scheme stays visible', () => {
    expect(shortenAddress(PQ_ADDRESS).startsWith('0xPQ')).toBe(true)
  })

  it('leaves unrecognised strings untouched', () => {
    expect(shortenAddress('unknown')).toBe('unknown')
  })
})
