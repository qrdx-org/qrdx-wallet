/**
 * Multisig keysets, signatures and requests (src/core/multisig.ts), and the member signing in the
 * wallet manager. The fixed-seed address below is the node's own: test.qrdx.org (node 3.0.0)
 * authenticated a 2-of-3 signature by these keys for it, then refused it only because the
 * multisig was not a controller of the account it acted for.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  aggregateSignature,
  createKeyset,
  decodeRequest,
  encodeRequest,
  memberAddresses,
  mergeRequests,
  multisigTaggedMessage,
  requestId,
  validPartials,
  verifyPartial,
  type MultisigRequest,
} from '../../src/core/multisig'
import { buildExchangeTx, exchangeSigningBytes, type UnsignedExchangeTx } from '../../src/core/exchange-tx'
import { pqKeyPairFromSeed, pqSign, type PqKeyPair } from '../../src/core/pq'
import { WalletManager } from '../../src/core/wallet-manager'
import { MemoryStorage } from '../../src/core/storage'

const seeded = (i: number) => pqKeyPairFromSeed(new Uint8Array(32).fill(i))

let keys: PqKeyPair[]
beforeEach(async () => {
  keys = await Promise.all([1, 2, 3].map(seeded))
})

const txFor = (sender: string, signer?: string): UnsignedExchangeTx =>
  buildExchangeTx({ op: 'TOKEN_TRANSFER', chainId: 7, sender, signer, nonce: 0, params: { token_address: 'QRDX', to: keys[0].address, amount: '1' }, gasLimit: 1_040_000 })

async function partial(keyset: ReturnType<typeof createKeyset>, tx: UnsignedExchangeTx, key: PqKeyPair) {
  const index = keyset.publicKeys.indexOf(key.publicKey.toLowerCase())
  return { signer_index: index, public_key: keyset.publicKeys[index], signature: await pqSign(multisigTaggedMessage(keyset.address, exchangeSigningBytes(tx)), key.privateKey) }
}

describe('keysets', () => {
  it('derives the address the node derives', () => {
    expect(createKeyset(keys.map((k) => k.publicKey), 2).address).toBe('0xPQMSe7547653fd573e409988bc707b8c495d4e0242')
  })

  it('does not depend on the order members are listed in, but on the threshold', () => {
    const a = createKeyset(keys.map((k) => k.publicKey), 2)
    const b = createKeyset([keys[2].publicKey, keys[0].publicKey, '0x' + keys[1].publicKey.toUpperCase()], 2)
    expect(b.address).toBe(a.address)
    expect(createKeyset(keys.map((k) => k.publicKey), 3).address).not.toBe(a.address)
    expect(memberAddresses(a).sort()).toEqual(keys.map((k) => k.address).sort())
  })

  it('refuses what the node refuses', () => {
    const pks = keys.map((k) => k.publicKey)
    expect(() => createKeyset([pks[0], pks[0]], 1)).toThrow(/twice/)
    expect(() => createKeyset(pks, 0)).toThrow(/threshold/)
    expect(() => createKeyset(pks, 4)).toThrow(/threshold/)
    expect(() => createKeyset(['abcd'], 1)).toThrow(/1952 bytes/)
    expect(() => createKeyset(Array(21).fill(pks[0]), 1)).toThrow()
  })
})

describe('signatures', () => {
  it('verifies members and aggregates the wire form', async () => {
    const ks = createKeyset(keys.map((k) => k.publicKey), 2)
    const tx = txFor(ks.address)
    const msg = exchangeSigningBytes(tx)
    const p0 = await partial(ks, tx, keys[0])
    const p2 = await partial(ks, tx, keys[2])
    expect(verifyPartial(ks, msg, p0)).toBe(true)
    // A partial claiming another member's slot, or over another message, does not verify.
    expect(verifyPartial(ks, msg, { ...p0, signer_index: (p0.signer_index + 1) % 3, public_key: ks.publicKeys[(p0.signer_index + 1) % 3] })).toBe(false)
    expect(verifyPartial(ks, exchangeSigningBytes({ ...tx, nonce: 1 }), p0)).toBe(false)

    const wire = aggregateSignature(ks, msg, [p2, p0, p0])
    const keyset = JSON.parse(Buffer.from(wire.public_key, 'hex').toString())
    const sig = JSON.parse(Buffer.from(wire.signature, 'hex').toString())
    expect(Buffer.from(wire.public_key, 'hex').toString()).toMatch(/^\{"m":2,"n":3,"public_keys":\["/)
    expect(keyset.public_keys).toEqual(ks.publicKeys)
    expect(Object.keys(sig)).toEqual(['keyset_address', 'm', 'n', 'partials', 'signer_mask'])
    expect(sig.keyset_address).toBe(ks.address)
    expect(sig.partials.map((p: { signer_index: number }) => p.signer_index)).toEqual([p0.signer_index, p2.signer_index].sort())
    expect(sig.signer_mask).toBe(2 ** p0.signer_index + 2 ** p2.signer_index)
  })

  it('needs m valid partials', async () => {
    const ks = createKeyset(keys.map((k) => k.publicKey), 2)
    const tx = txFor(ks.address)
    const p0 = await partial(ks, tx, keys[0])
    const forged = { ...(await partial(ks, tx, keys[1])), signature: p0.signature }
    expect(() => aggregateSignature(ks, exchangeSigningBytes(tx), [p0, forged])).toThrow(/2 signatures are needed; 1 is valid/)
  })

  it('lets a multisig sign as the sender or as a controller', () => {
    const ms = createKeyset(keys.map((k) => k.publicKey), 2).address
    expect(txFor(ms).sender).toBe(ms)
    expect(txFor(keys[0].address, ms).signer).toBe(ms)
    expect(() => txFor(keys[0].address, '0xPQMS123')).toThrow(/signer/)
  })
})

describe('requests', () => {
  const request = (tx: UnsignedExchangeTx, partials: MultisigRequest['partials'] = []): MultisigRequest => ({
    v: 1,
    network: 'qrdx-testnet',
    label: 'Send 1 QRDX',
    keyset: { m: 2, public_keys: keys.map((k) => k.publicKey) },
    tx,
    partials,
    createdAt: 1,
  })

  it('round-trips as text and merges copies', async () => {
    const ks = createKeyset(keys.map((k) => k.publicKey), 2)
    const tx = txFor(ks.address)
    const a = request(tx, [await partial(ks, tx, keys[0])])
    const b = request(tx, [await partial(ks, tx, keys[1])])
    const decoded = decodeRequest(encodeRequest(a))
    expect(requestId(decoded)).toBe(requestId(a))
    expect(validPartials(decoded)).toHaveLength(1)
    const merged = mergeRequests(decoded, decodeRequest(`https://wallet.qrdx.org/wallet?multisig=${encodeURIComponent(encodeRequest(b))}`))
    expect(validPartials(merged)).toHaveLength(2)
    expect(() => aggregateSignature(ks, exchangeSigningBytes(merged.tx), merged.partials)).not.toThrow()
    expect(() => mergeRequests(a, request({ ...tx, nonce: 1 }))).toThrow(/different transactions/)
  })

  it('refuses a request whose members do not make up the multisig it names', () => {
    const tx = txFor(createKeyset(keys.map((k) => k.publicKey), 3).address)
    expect(() => decodeRequest(encodeRequest(request(tx)))).toThrow(/do not make up/)
    expect(() => decodeRequest('hello')).toThrow(/not a QRDX multisig request/)
    expect(() => decodeRequest('qrdx-multisig:v1:not-json')).toThrow(/damaged/)
  })
})

describe('signing as a member in the wallet', () => {
  it('signs only a transaction of a multisig the account belongs to', async () => {
    const manager = new WalletManager(new MemoryStorage(), { kdfIterations: 1000, now: () => 1_000_000 })
    const me = await manager.createVaultFromMnemonic({ password: 'correct horse battery staple', mnemonic: 'test test test test test test test test test test test junk' })
    const members = [me.pqPublicKey, keys[0].publicKey, keys[1].publicKey]
    const ks = createKeyset(members, 2)
    const tx = txFor(ks.address)

    const p = await manager.signMultisigPartial({ m: 2, publicKeys: members }, tx)
    expect(ks.publicKeys[p.signer_index]).toBe(me.pqPublicKey.toLowerCase())
    expect(verifyPartial(ks, exchangeSigningBytes(tx), p)).toBe(true)

    // Not for another multisig's transaction, nor one the account is not a member of.
    await expect(manager.signMultisigPartial({ m: 1, publicKeys: members }, tx)).rejects.toThrow(/not signed by that multisig/)
    const others = keys.map((k) => k.publicKey)
    await expect(manager.signMultisigPartial({ m: 2, publicKeys: others }, txFor(createKeyset(others, 2).address))).rejects.toThrow(/not a member/)
  })
})
