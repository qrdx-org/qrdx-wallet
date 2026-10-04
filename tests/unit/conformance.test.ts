/**
 * Wallet ↔ node byte-level conformance.
 *
 * Every expected value here was produced by the node's own Python modules
 * (tests/conformance/generate_vectors.py loads them from ../qrdx-node), not by
 * a re-implementation, so a pass means the wallet encodes exactly what the
 * node decodes and verifies.
 *
 * Regenerate after a node protocol change:
 *   python3 tests/conformance/generate_vectors.py ../qrdx-node > tests/conformance/vectors.json
 */
import { describe, it, expect } from 'vitest'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import vectors from '../conformance/vectors.json'
import { toAccountId } from '../../src/core/account-id'
import {
  encodePqTx,
  pqTxSigningHash,
  pqIntrinsicGas,
  signPqTransaction,
} from '../../src/core/pq-tx'
import {
  exchangeSigningBytes,
  exchangeTxHash,
  signExchangeTx,
  buildExchangeTx,
} from '../../src/core/exchange-tx'
import { pqPrefixedMessage, pqVerify, pqKeyPairFromSeed } from '../../src/core/pq'
import { bytesToHex, hexToBytes } from '../../src/core/crypto'
import { rlpDecode } from '../../src/core/rlp'

const PUB = Uint8Array.from({ length: 1952 }, (_, i) => (i * 7 + 3) % 256)
const SIG = Uint8Array.from({ length: 3309 }, (_, i) => (i * 13 + 5) % 256)
const hex = (b: Uint8Array) => '0x' + bytesToHex(b)

describe('account ids match qrdx/crypto/account_id.py', () => {
  for (const v of vectors.accountIds) {
    it(v.address, () => {
      expect(toAccountId(v.address)).toBe(v.accountId)
    })
  }

  it('rejects malformed addresses the node rejects', () => {
    expect(() => toAccountId('0xPQ1234')).toThrow()
    expect(() => toAccountId('0x1234')).toThrow()
    expect(() => toAccountId('hello')).toThrow()
  })
})

describe('type-0x51 transactions match qrdx/transactions/pq_tx.py', () => {
  for (const [i, v] of vectors.pqTransactions.entries()) {
    const fields = {
      chainId: v.chainId,
      nonce: v.nonce,
      gasPrice: BigInt(v.gasPrice),
      gasLimit: v.gasLimit,
      to: v.to,
      value: BigInt(v.value),
      data: v.data,
      onBehalfOf: v.onBehalfOf,
    }

    it(`vector ${i}: signing hash, encoding and tx hash`, () => {
      expect(hex(pqTxSigningHash(fields))).toBe(v.signingHash)
      const raw = encodePqTx(fields, PUB, SIG)
      expect(raw.length).toBe(v.rawLength)
      expect(hex(raw.slice(0, 64))).toBe(v.rawPrefix)
      expect(hex(keccak256(raw))).toBe(v.txHash)
    })

    it(`vector ${i}: intrinsic gas`, () => {
      expect(pqIntrinsicGas(v.data, v.to === null)).toBe(BigInt(v.intrinsicGas))
    })
  }

  it('produces a real ML-DSA-65 signature over the signing hash', async () => {
    const seed = '11'.repeat(32)
    const pair = await pqKeyPairFromSeed(hexToBytes(seed))
    const signed = await signPqTransaction(
      {
        chainId: 9999,
        nonce: 0,
        gasPrice: 1_000_000_000n,
        gasLimit: 200_000,
        to: pair.address,
        value: 1n,
      },
      seed
    )
    const raw = hexToBytes(signed.rawTransaction.slice(2))
    expect(raw[0]).toBe(0x51)
    const fields = rlpDecode(raw.slice(1)).data as { data: Uint8Array }[]
    expect(fields).toHaveLength(10)
    expect(bytesToHex(fields[8].data)).toBe(pair.publicKey)
    expect(
      pqVerify(hexToBytes(signed.signingHash.slice(2)), bytesToHex(fields[9].data), pair.publicKey)
    ).toBe(true)
    // Recipient was resolved to the account id, not truncated from the 0xPQ string.
    expect(signed.toAccountId).toBe(toAccountId(pair.address))
  })

  it('refuses a gas limit below the PQ floor', async () => {
    await expect(
      signPqTransaction(
        {
          chainId: 1,
          nonce: 0,
          gasPrice: 1,
          gasLimit: 21_000,
          to: '0x' + '11'.repeat(20),
          value: 1,
        },
        '11'.repeat(32)
      )
    ).rejects.toThrow(/below the post-quantum minimum/)
  })
})

describe('exchange transactions match qrdx/exchange/transactions.py', () => {
  for (const [i, v] of vectors.exchangeTransactions.entries()) {
    const tx = {
      op_type: v.opType as never,
      sender: v.sender,
      nonce: v.nonce,
      params: v.params as never,
      gas_limit: v.gasLimit,
      gas_price: v.gasPrice,
    }
    it(`vector ${i} (op ${v.opType}): signing bytes and blake2b hash`, () => {
      expect(hex(exchangeSigningBytes(tx))).toBe(v.signingBytes)
      expect(exchangeTxHash(tx)).toBe(v.txHash)
    })
  }

  it('signs with the key that derives to the sender, and refuses any other', async () => {
    const seed = '22'.repeat(32)
    const pair = await pqKeyPairFromSeed(hexToBytes(seed))
    const tx = buildExchangeTx({ op: 'STAKE_EXIT', sender: pair.address, nonce: 0 })
    const signed = await signExchangeTx(tx, seed)
    expect(pqVerify(exchangeSigningBytes(tx), signed.signature, pair.publicKey)).toBe(true)

    const other = buildExchangeTx({ op: 'STAKE_EXIT', sender: '0xPQ' + 'ab'.repeat(32), nonce: 0 })
    await expect(signExchangeTx(other, seed)).rejects.toThrow(/does not control/)
  })

  it('rejects missing params and classic senders before signing', () => {
    expect(() =>
      buildExchangeTx({ op: 'SWAP', sender: '0xPQ' + 'ab'.repeat(32), nonce: 0, params: {} })
    ).toThrow(/Missing/)
    expect(() =>
      buildExchangeTx({ op: 'STAKE_EXIT', sender: '0x' + 'ab'.repeat(20), nonce: 0 })
    ).toThrow(/0xPQ/)
  })
})

describe('PQ prefixed messages match qrdx/wallet_v2/pq_wallet.py', () => {
  for (const v of vectors.pqMessages) {
    it(JSON.stringify(v.message), () => {
      expect(hex(pqPrefixedMessage(v.message))).toBe(v.prefixed)
    })
  }
})
