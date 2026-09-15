/**
 * Native post-quantum transactions, end to end against the local node.
 *
 * Two things are verified that unit tests cannot establish on their own:
 *
 *  1. The wallet's canonical JSON matches Python's `json.dumps(sort_keys=True)`
 *     byte-for-byte. The signature covers those bytes, so any difference — a
 *     missing space, a different key order — produces a signature the node
 *     rejects. This is checked against Python itself, not against a
 *     reimplementation of it.
 *
 *  2. A transaction built and ML-DSA-signed by the wallet is accepted by the
 *     node and settles the balances exactly, and forged or replayed variants
 *     are refused.
 */

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHAINS } from '../../src/core/chains'
import {
  canonicalJson,
  qrdxToMicro,
  microToQrdx,
  selectUtxos,
  buildNativeTransfer,
  signNativeTransaction,
  submitNativeTransaction,
  fetchUtxos,
  fetchNativeBalance,
  fetchNativeTransaction,
  sendNativeTransfer,
  NativeTxError,
  type Utxo,
} from '../../src/core/native-tx'
import { generatePqKeyPair } from '../../src/core/pq'

const CHAIN = CHAINS['qrdx-local']
const VENV_PY = resolve(process.cwd(), 'ref/qrdx-chain/.venv/bin/python')

const nodeUp = await (async () => {
  try {
    const r = await fetch(CHAIN.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'qrdx_getUTXOs', params: [''] }),
      signal: AbortSignal.timeout(5000),
    })
    return r.ok
  } catch {
    return false
  }
})()

const pythonUp = existsSync(VENV_PY)

if (!nodeUp) console.warn('[integration] no QRDX node — skipping native PQ tests')

/** Ask Python to encode the same value, so the comparison is against the reference. */
function pythonCanonical(value: unknown): string {
  return execFileSync(
    VENV_PY,
    ['-c', 'import json,sys; print(json.dumps(json.load(sys.stdin), sort_keys=True), end="")'],
    { input: JSON.stringify(value), encoding: 'utf8' },
  )
}

/** Prefund a PQ address on the native layer, the way genesis does. */
function prefund(address: string, qrdx: string): void {
  execFileSync(VENV_PY, ['tests/e2e/fund_pq_native.py', address, qrdx], { encoding: 'utf8' })
}

describe.skipIf(!pythonUp)('canonical JSON matches Python', () => {
  it('encodes a transaction payload identically', () => {
    const payload = {
      inputs: [{ tx_hash: 'ab'.repeat(32), index: 0 }],
      outputs: [
        { address: '0xPQ' + 'cd'.repeat(32), amount: 12_000_000 },
        { address: '0xPQ' + 'ef'.repeat(32), amount: 37_990_000 },
      ],
      fee: 10_000,
    }
    expect(canonicalJson(payload)).toBe(pythonCanonical(payload))
  })

  it('sorts keys at every depth, as sort_keys does', () => {
    const value = { z: 1, a: { zz: [3, 2, 1], aa: 'x' }, m: [{ b: 2, a: 1 }] }
    expect(canonicalJson(value)).toBe(pythonCanonical(value))
  })

  it('uses Python’s separators, not JSON.stringify’s', () => {
    const value = { b: 2, a: [1, 2] }
    expect(canonicalJson(value)).toBe('{"a": [1, 2], "b": 2}')
    expect(canonicalJson(value)).not.toBe(JSON.stringify(value))
  })

  it('refuses non-integer numbers rather than risk a format mismatch', () => {
    expect(() => canonicalJson({ amount: 1.5 })).toThrow(NativeTxError)
  })
})

describe('amount conversion', () => {
  it('converts QRDX to microQRDX', () => {
    expect(qrdxToMicro('1')).toBe(1_000_000n)
    expect(qrdxToMicro('0.000001')).toBe(1n)
    expect(qrdxToMicro('12.5')).toBe(12_500_000n)
  })

  it('rejects more precision than the chain supports', () => {
    expect(() => qrdxToMicro('0.0000001')).toThrow(/6 decimal places/)
  })

  it('round-trips', () => {
    expect(microToQrdx(qrdxToMicro('12.5'), 6)).toBe('12.500000')
  })
})

describe('input selection', () => {
  const utxos: Utxo[] = [
    { tx_hash: 'aa'.repeat(32), index: 0, amount: '1000000' },
    { tx_hash: 'bb'.repeat(32), index: 0, amount: '5000000' },
    { tx_hash: 'cc'.repeat(32), index: 0, amount: '2000000' },
  ]

  it('takes the largest inputs first, keeping the signed payload small', () => {
    const { selected } = selectUtxos(utxos, 6_000_000n)
    expect(selected.map(u => u.amount)).toEqual(['5000000', '2000000'])
  })

  it('reports a shortfall in QRDX rather than raw units', () => {
    expect(() => selectUtxos(utxos, 99_000_000n)).toThrow(/Insufficient balance/)
  })

  it('returns change to the sender so nothing is forfeited as fee', () => {
    const { payload, changeMicro } = buildNativeTransfer({
      utxos,
      from: 'SENDER',
      to: 'RECIPIENT',
      amountMicro: 3_000_000n,
      feeMicro: 10_000n,
    })
    expect(changeMicro).toBe(1_990_000n)
    expect(payload.outputs).toHaveLength(2)
    expect(payload.outputs[1]).toEqual({ address: 'SENDER', amount: 1_990_000 })
  })

  it('omits a change output when the inputs match exactly', () => {
    const exact: Utxo[] = [{ tx_hash: 'aa'.repeat(32), index: 0, amount: '1000000' }]
    const { payload } = buildNativeTransfer({
      utxos: exact, from: 'S', to: 'R', amountMicro: 990_000n, feeMicro: 10_000n,
    })
    expect(payload.outputs).toHaveLength(1)
  })
})

describe.skipIf(!nodeUp || !pythonUp)('live node', () => {
  it('sends from a post-quantum address and settles exactly', async () => {
    const alice = await generatePqKeyPair()
    const bob = await generatePqKeyPair()
    prefund(alice.address, '40')

    expect(await fetchNativeBalance(CHAIN, alice.address)).toBe(40_000_000n)

    const result = await sendNativeTransfer({
      chain: CHAIN,
      from: alice.address,
      to: bob.address,
      amountQrdx: '12',
      feeQrdx: '0.01',
      pqSeedHex: alice.privateKey,
    })

    expect(result.txHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.from).toBe(alice.address)

    expect(await fetchNativeBalance(CHAIN, bob.address)).toBe(12_000_000n)
    expect(await fetchNativeBalance(CHAIN, alice.address)).toBe(40_000_000n - 12_000_000n - 10_000n)

    const record = await fetchNativeTransaction(CHAIN, result.txHash)
    expect(record).not.toBeNull()
  })

  it('the node rejects a tampered payload', async () => {
    const alice = await generatePqKeyPair()
    const mallory = await generatePqKeyPair()
    prefund(alice.address, '10')

    const utxos = await fetchUtxos(CHAIN, alice.address)
    const { payload } = buildNativeTransfer({
      utxos, from: alice.address, to: mallory.address,
      amountMicro: 1_000_000n, feeMicro: 0n,
    })
    const signed = await signNativeTransaction(payload, alice.privateKey)

    // Redirect the money after signing.
    const tampered = {
      ...signed,
      outputs: signed.outputs.map(o =>
        o.address === mallory.address ? { ...o, amount: o.amount * 5 } : o,
      ),
    }

    await expect(submitNativeTransaction(CHAIN, tampered)).rejects.toThrow()
  })

  it('the node rejects spending another address’s outputs', async () => {
    const alice = await generatePqKeyPair()
    const mallory = await generatePqKeyPair()
    prefund(alice.address, '10')

    const utxos = await fetchUtxos(CHAIN, alice.address)
    const { payload } = buildNativeTransfer({
      utxos, from: alice.address, to: mallory.address,
      amountMicro: 1_000_000n, feeMicro: 0n,
    })

    // Mallory signs a spend of Alice's inputs with her own key.
    const signed = await signNativeTransaction(payload, mallory.privateKey)

    await expect(submitNativeTransaction(CHAIN, signed)).rejects.toThrow(
      /belongs to|signer/i,
    )
  })

  it('the node rejects a replayed transaction', async () => {
    const alice = await generatePqKeyPair()
    const bob = await generatePqKeyPair()
    prefund(alice.address, '10')

    const utxos = await fetchUtxos(CHAIN, alice.address)
    const { payload } = buildNativeTransfer({
      utxos, from: alice.address, to: bob.address,
      amountMicro: 1_000_000n, feeMicro: 0n,
    })
    const signed = await signNativeTransaction(payload, alice.privateKey)

    await submitNativeTransaction(CHAIN, signed)
    await expect(submitNativeTransaction(CHAIN, signed)).rejects.toThrow()
  })
})
