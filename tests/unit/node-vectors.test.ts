/**
 * The wallet's signing bytes against the node's own vectors (qrdx-node
 * sdk/typescript/test/vectors.json, node 3.0.0): what the node's SDK signs, the wallet signs.
 */
import { describe, it, expect } from 'vitest'
import { bytesToHex } from '@noble/hashes/utils.js'
import vectors from '../fixtures/node-vectors.json'
import { exchangeSigningBytes, exchangeTxHash, pythonJson, type ExchangeOpCode, type JsonValue } from '../../src/core/exchange-tx'
import { pqIntrinsicGas, pqTxSigningHash } from '../../src/core/pq-tx'

describe('node 3.0.0 signing vectors', () => {
  it('serializes params as the node does', () => {
    for (const v of vectors.pyjson) expect(pythonJson(v.value)).toBe(v.text)
  })

  it('builds the same exchange signing bytes and hash', () => {
    for (const v of vectors.exchange) {
      const f = v.fields
      const tx = {
        op_type: f.op_type as ExchangeOpCode,
        chain_id: Number(f.chain_id),
        sender: f.sender,
        ...(f.signer ? { signer: f.signer } : {}),
        nonce: Number(f.nonce),
        params: f.params as Record<string, JsonValue>,
        gas_limit: Number(f.gas_limit),
        gas_price: f.gas_price,
      }
      expect(bytesToHex(exchangeSigningBytes(tx))).toBe(v.canonical)
      expect(exchangeTxHash(tx)).toBe(v.tx_hash)
    }
  })

  it('builds the same type-0x51 signing hash and intrinsic gas', () => {
    for (const v of vectors.pq_tx) {
      const f = v.fields as { chain_id: string; nonce: string; gas_price: string; gas_limit: string; to: string | null; value: string; data: string; on_behalf_of?: string | null }
      const hash = pqTxSigningHash({ chainId: f.chain_id, nonce: f.nonce, gasPrice: f.gas_price, gasLimit: f.gas_limit, to: f.to, value: f.value, data: f.data, onBehalfOf: f.on_behalf_of ?? null })
      expect(bytesToHex(hash)).toBe(v.signing_hash)
      expect(pqIntrinsicGas(f.data, f.to === null).toString()).toBe(String(v.intrinsic_gas))
    }
  })
})
