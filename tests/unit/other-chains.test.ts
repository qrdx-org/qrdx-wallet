/**
 * Bitcoin (src/core/bitcoin.ts) and Solana (src/core/solana.ts) keys and transactions.
 * Addresses for the "abandon … about" phrase are BIP-84's own test vectors and the address
 * Phantom shows for it; transaction building is checked offline here and against devnet in CI-less probes.
 */
import { describe, it, expect } from 'vitest'
import { Transaction } from '@scure/btc-signer'
import { base58, base64, hex } from '@scure/base'
import { ed25519 } from '@noble/curves/ed25519.js'
import { btcPayment, btcPrivateKey, isBtcAddress, parseBtc, signBtcPsbt } from '../../src/core/bitcoin'
import {
  associatedTokenAddress,
  compileMessage,
  isSolAddress,
  parseUnits,
  signSolMessage,
  solAddressOf,
  solPrivateKey,
  solTransferInstructions,
  serializeSigned,
} from '../../src/core/solana'
import type { KeyringSecret } from '../../src/core/keyring'

const ABANDON: KeyringSecret = { type: 'hd', mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' }

describe('bitcoin keys', () => {
  it('derives the BIP-84 test vectors', () => {
    expect(btcPayment(btcPrivateKey(ABANDON, 0, 'mainnet'), 'mainnet').address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
    expect(btcPayment(btcPrivateKey(ABANDON, 1, 'mainnet'), 'mainnet').address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g')
    expect(btcPayment(btcPrivateKey(ABANDON, 0, 'testnet'), 'testnet').address).toBe('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl')
  })

  it('uses an imported key as is', () => {
    const key = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
    const secret: KeyringSecret = { type: 'key', ethPrivateKey: key, pqSeed: '00'.repeat(32) }
    expect(hex.encode(btcPrivateKey(secret, 0, 'mainnet'))).toBe(key)
  })

  it('tells networks apart', () => {
    expect(isBtcAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'mainnet')).toBe(true)
    expect(isBtcAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'testnet')).toBe(false)
    expect(isBtcAddress('0x52908400098527886E0F7030069857D2E4169EE7', 'mainnet')).toBe(false)
  })

  it('parses amounts in satoshis', () => {
    expect(parseBtc('0.00012345')).toBe(12_345n)
    expect(parseBtc('1')).toBe(100_000_000n)
    expect(() => parseBtc('0.000000001')).toThrow()
  })

  it('signs only its own inputs', () => {
    const key = btcPrivateKey(ABANDON, 0, 'testnet')
    const own = btcPayment(key, 'testnet')
    const other = btcPayment(btcPrivateKey(ABANDON, 1, 'testnet'), 'testnet')
    const build = (script: Uint8Array) => {
      const tx = new Transaction()
      tx.addInput({ txid: hex.decode('11'.repeat(32)), index: 0, witnessUtxo: { amount: 10_000n, script } })
      tx.addOutputAddress(other.address, 9_000n, { bech32: 'tb', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef })
      return base64.encode(tx.toPSBT())
    }
    const signed = signBtcPsbt(build(own.script), key, 'testnet')
    expect(signed.txid).toMatch(/^[0-9a-f]{64}$/)
    expect(() => signBtcPsbt(build(other.script), key, 'testnet')).toThrow(/not this account/)
  })
})

describe('solana keys and messages', () => {
  it('derives the address Phantom shows for the phrase', () => {
    expect(solAddressOf(solPrivateKey(ABANDON, 0)!)).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')
  })

  it('has no address for an imported key', () => {
    expect(solPrivateKey({ type: 'key', ethPrivateKey: '11'.repeat(32), pqSeed: '00'.repeat(32) }, 0)).toBeNull()
  })

  it('validates addresses', () => {
    expect(isSolAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')).toBe(true)
    expect(isSolAddress('0xabc')).toBe(false)
  })

  it('compiles a transfer the payer signs', () => {
    const key = solPrivateKey(ABANDON, 0)!
    const from = solAddressOf(key)
    const to = solAddressOf(solPrivateKey(ABANDON, 1)!)
    const blockhash = base58.encode(new Uint8Array(32).fill(7))
    const message = compileMessage(from, solTransferInstructions(from, to, 1_000_000n), blockhash)
    // 1 signer, 0 read-only signers, 1 read-only (the system program); 3 accounts; payer first.
    expect([...message.slice(0, 4)]).toEqual([1, 0, 1, 3])
    expect(base58.encode(message.slice(4, 36))).toBe(from)
    const sig = signSolMessage(message, key)
    expect(ed25519.verify(sig, message, base58.decode(from))).toBe(true)
    expect(base64.decode(serializeSigned(message, sig)).length).toBe(1 + 64 + message.length)
    // Another account's message is refused.
    const theirs = compileMessage(to, solTransferInstructions(to, from, 1n), blockhash)
    expect(() => signSolMessage(theirs, key)).toThrow(/not paid for/)
  })

  it('derives associated token accounts', () => {
    // USDC's associated token account for the system program's address, as the ATA program derives it.
    const ata = associatedTokenAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    expect(isSolAddress(ata)).toBe(true)
  })

  it('parses token units', () => {
    expect(parseUnits('1.5', 9)).toBe(1_500_000_000n)
    expect(parseUnits('2', 6)).toBe(2_000_000n)
    expect(() => parseUnits('0.1234567', 6)).toThrow()
  })
})
