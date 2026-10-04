/**
 * Cross-implementation check: the wallet's ML-DSA-65 against the node's liboqs.
 *
 * This is the test that actually matters for PQ. `qrdx/crypto/pq/dilithium.py`
 * says it requires liboqs and has no fallback, so a signature this wallet
 * produces is only useful if liboqs accepts it. Verifying the wallet's
 * signatures with the wallet's own verifier would prove nothing about that.
 *
 * Both directions are exercised, against the same liboqs build the node
 * imports. Skips when the chain virtualenv is absent so a checkout without the
 * Python toolchain still runs green.
 */

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  generatePqKeyPair,
  pqKeyPairFromMnemonic,
  pqSign,
  pqVerify,
} from '../../src/core/pq'
import { hexToBytes } from '../../src/core/crypto'

import { NODE_PYTHON } from '../node-ref'
const VENV_PY = NODE_PYTHON ?? resolve(process.cwd(), 'ref/qrdx-chain/.venv/bin/python')
const BRIDGE = resolve(process.cwd(), 'tests/integration/pq_liboqs_bridge.py')

const available = (() => {
  if (!existsSync(VENV_PY) || !existsSync(BRIDGE)) return false
  try {
    execFileSync(VENV_PY, ['-c', 'import oqs'], { stdio: 'ignore', timeout: 30_000 })
    return true
  } catch {
    return false
  }
})()

if (!available) {
  console.warn(
    '[integration] liboqs not available via ref/qrdx-chain/.venv — skipping PQ cross-checks',
  )
}

/** Run the liboqs bridge with a JSON request and parse its JSON reply. */
function liboqs(request: Record<string, unknown>): Record<string, any> {
  const out = execFileSync(VENV_PY, [BRIDGE], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: 60_000,
  })
  return JSON.parse(out)
}

const toHex = (b: Uint8Array) =>
  Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

describe.skipIf(!available)('wallet ML-DSA-65 vs node liboqs', () => {
  it('uses the algorithm the node uses', () => {
    const info = liboqs({ op: 'info' })
    expect(info.algorithm).toBe('ML-DSA-65')
    expect(info.public_key_length).toBe(1952)
    expect(info.signature_length).toBe(3309)
  })

  it('liboqs verifies a signature made by the wallet', async () => {
    const kp = await generatePqKeyPair()
    const message = new TextEncoder().encode('qrdx wallet → liboqs')
    const signature = await pqSign(message, kp.privateKey)

    const result = liboqs({
      op: 'verify',
      public_key: kp.publicKey,
      message: toHex(message),
      signature,
    })
    expect(result.valid).toBe(true)
  })

  it('liboqs rejects a wallet signature over a different message', async () => {
    const kp = await generatePqKeyPair()
    const signature = await pqSign(new TextEncoder().encode('original'), kp.privateKey)

    const result = liboqs({
      op: 'verify',
      public_key: kp.publicKey,
      message: toHex(new TextEncoder().encode('substituted')),
      signature,
    })
    expect(result.valid).toBe(false)
  })

  it('the wallet verifies a signature made by liboqs', async () => {
    const message = 'liboqs → qrdx wallet'
    const signed = liboqs({
      op: 'sign',
      message: toHex(new TextEncoder().encode(message)),
    })

    expect(
      pqVerify(new TextEncoder().encode(message), signed.signature, signed.public_key),
    ).toBe(true)
  })

  it('the wallet rejects a liboqs signature over a different message', async () => {
    const signed = liboqs({
      op: 'sign',
      message: toHex(new TextEncoder().encode('original')),
    })

    expect(
      pqVerify(new TextEncoder().encode('substituted'), signed.signature, signed.public_key),
    ).toBe(false)
  })

  it('derives the same PQ address the node would for a given public key', async () => {
    // The node computes keccak256(pubkey)[:32] with a 0xPQ prefix. If the two
    // disagree, funds sent to an address shown by the wallet are unreachable.
    const kp = await pqKeyPairFromMnemonic(
      'test test test test test test test test test test test junk',
    )
    const result = liboqs({ op: 'address', public_key: kp.publicKey })

    expect(result.address.toLowerCase()).toBe(kp.address.toLowerCase())
  })

  it('agrees with the node on the public key fingerprint', async () => {
    const kp = await generatePqKeyPair()
    const result = liboqs({ op: 'address', public_key: kp.publicKey })

    expect(result.fingerprint).toBe(kp.fingerprint)
  })

  it('produces key material liboqs accepts as well-formed', async () => {
    const kp = await generatePqKeyPair()
    expect(hexToBytes(kp.publicKey)).toHaveLength(1952)

    const result = liboqs({ op: 'check_public_key', public_key: kp.publicKey })
    expect(result.ok).toBe(true)
  })
})
