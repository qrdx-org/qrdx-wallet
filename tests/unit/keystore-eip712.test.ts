/**
 * Interop vectors from the specifications themselves, not from this code.
 */
import { describe, it, expect } from 'vitest'
import { decryptKeystore, encryptKeystore } from '../../src/core/keystore'
import { typedDataDigest, encodeType } from '../../src/core/eip712'
import { bytesToHex } from '../../src/core/crypto'

describe('Web3 Secret Storage v3', () => {
  // The PBKDF2 test vector from the Web3 Secret Storage Definition.
  const SPEC_PBKDF2 = {
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: { iv: '6087dab2f9fdbbfaddc31a909735c1e6' },
      ciphertext: '5318b4d5bcd28de64ee5559e671353e16f075ecae9f99c7a79a38af5f869aa46',
      kdf: 'pbkdf2',
      kdfparams: {
        c: 262144,
        dklen: 32,
        prf: 'hmac-sha256',
        salt: 'ae3cd4e7013836a3df6bd7241b12db061dbe2c6785853cce422d148a624ce0bd',
      },
      mac: '517ead924a9d0dc3124507e3393d175ce3ff7c1e96529c6c555ce9e51205e9b2',
    },
    id: '3198bc9c-6672-5ab3-d995-4942343ae5b6',
    version: 3,
  }

  it('decrypts the spec vector', async () => {
    const r = await decryptKeystore(SPEC_PBKDF2, 'testpassword')
    expect(r.ethPrivateKey).toBe('7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d')
    expect(r.pqSeed).toBeUndefined()
  })

  it('rejects a wrong password via the MAC', async () => {
    await expect(decryptKeystore(SPEC_PBKDF2, 'nope')).rejects.toThrow(/Wrong keystore password/)
  })

  it('round-trips its own export, including the PQ seed', async () => {
    const ks = await encryptKeystore(
      {
        ethPrivateKey: '7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d',
        pqSeed: '44'.repeat(32),
      },
      'pw',
      1000
    )
    const r = await decryptKeystore(ks, 'pw')
    expect(r.ethPrivateKey).toBe('7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d')
    expect(r.pqSeed).toBe('44'.repeat(32))
  })
})

describe('EIP-712', () => {
  // The "Mail" example from the EIP-712 specification.
  const MAIL = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: 1,
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    message: {
      from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  }

  it('encodes types as the spec shows', () => {
    expect(encodeType(MAIL.types, 'Mail')).toBe(
      'Mail(Person from,Person to,string contents)Person(string name,address wallet)'
    )
  })

  it('produces the spec digest', () => {
    expect(bytesToHex(typedDataDigest(MAIL))).toBe(
      'be609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2'
    )
  })
})
