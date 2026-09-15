/**
 * Wallet-level post-quantum behaviour.
 *
 * Covers the promises the wallet makes about PQ accounts: that the recovery
 * phrase restores them, that a signature verifies against the address the UI
 * displays, and that records written by the old placeholder implementation are
 * repaired rather than left signing for an address they do not own.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WalletManager } from '../../src/core/wallet-manager'
import { WalletStorage, type IStorage } from '../../src/core/storage'
import { pqVerify, pqKeyPairFromMnemonic } from '../../src/core/pq'
import { encrypt } from '../../src/core/crypto'
import { validateAddress } from '../../src/core/address'

class MemoryStorage implements IStorage {
  data = new Map<string, string>()
  async get<T>(k: string): Promise<T | null> {
    const v = this.data.get(k)
    return v === undefined ? null : (JSON.parse(v) as T)
  }
  async set<T>(k: string, v: T) { this.data.set(k, JSON.stringify(v)) }
  async remove(k: string) { this.data.delete(k) }
  async clear() { this.data.clear() }
}

const PASSWORD = 'correct horse battery staple'
const MNEMONIC = 'test test test test test test test test test test test junk'

let storage: MemoryStorage
let manager: WalletManager

beforeEach(async () => {
  storage = new MemoryStorage()
  manager = new WalletManager(new WalletStorage(storage))
  await manager.initialize(PASSWORD)
})

describe('PQ accounts from a mnemonic', () => {
  it('gives the wallet a valid post-quantum address', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)
    const result = validateAddress(w.pqAddress)

    expect(result.valid).toBe(true)
    expect(result.kind).toBe('pq')
  })

  it('derives the PQ address from the phrase, so recovery restores it', async () => {
    const original = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)

    // Simulate restoring on a fresh install.
    const restored = new WalletManager(new WalletStorage(new MemoryStorage()))
    await restored.initialize(PASSWORD)
    const recovered = await restored.createWalletFromMnemonic('Restored', MNEMONIC, PASSWORD)

    expect(recovered.pqAddress).toBe(original.pqAddress)
    expect(recovered.pqPublicKey).toBe(original.pqPublicKey)
  })

  it('matches the standalone derivation helper', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)
    const direct = await pqKeyPairFromMnemonic(MNEMONIC, 0)

    expect(w.pqAddress).toBe(direct.address)
  })

  it('gives a different phrase a different PQ address', async () => {
    const a = await manager.createWalletFromMnemonic('A', MNEMONIC, PASSWORD)

    const other = new WalletManager(new WalletStorage(new MemoryStorage()))
    await other.initialize(PASSWORD)
    const b = await other.createWalletFromMnemonic(
      'B',
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
      PASSWORD,
    )

    expect(a.pqAddress).not.toBe(b.pqAddress)
  })
})

describe('PQ message signing', () => {
  it('produces a signature that verifies under the wallet’s public key', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)
    const signature = await manager.signMessagePQ('authorise withdrawal')

    expect(
      pqVerify(new TextEncoder().encode('authorise withdrawal'), signature, w.pqPublicKey),
    ).toBe(true)
  })

  it('does not verify for a different message', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)
    const signature = await manager.signMessagePQ('authorise withdrawal')

    expect(
      pqVerify(new TextEncoder().encode('authorise everything'), signature, w.pqPublicKey),
    ).toBe(false)
  })

  it('refuses to sign while locked', async () => {
    await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)
    await manager.lock()

    await expect(manager.signMessagePQ('anything')).rejects.toThrow(/locked/i)
  })
})

describe('imported private keys', () => {
  const PRIVATE_KEY =
    '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'

  it('derives a reproducible PQ address', async () => {
    const a = await manager.importWallet('Imported', PRIVATE_KEY, PASSWORD)

    const other = new WalletManager(new WalletStorage(new MemoryStorage()))
    await other.initialize(PASSWORD)
    const b = await other.importWallet('Imported', PRIVATE_KEY, PASSWORD)

    expect(a.pqAddress).toBe(b.pqAddress)
  })

  it('can sign with the imported account’s PQ key', async () => {
    const w = await manager.importWallet('Imported', PRIVATE_KEY, PASSWORD)
    const sig = await manager.signMessagePQ('hello')

    expect(pqVerify(new TextEncoder().encode('hello'), sig, w.pqPublicKey)).toBe(true)
  })
})

describe('upgrading placeholder PQ records', () => {
  it('repairs a wallet whose stored PQ material is not a real key pair', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)

    // Rewrite the record the way the old placeholder implementation left it:
    // a fabricated public key and a random seed unrelated to the phrase.
    const state = await manager.getState()
    const stored = state!.wallets.find(x => x.id === w.id)!
    stored.pqPublicKey = 'ab'.repeat(1952)
    stored.pqAddress = '0xPQ' + 'cd'.repeat(32)
    stored.pqFingerprint = 'deadbeefdeadbeef'
    stored.encryptedPrivateKey = await encrypt(
      `${'11'.repeat(32)}:${'22'.repeat(32)}`,
      PASSWORD,
    )
    await new WalletStorage(storage).setState(state!)

    await manager.lock()
    expect(await manager.unlock(PASSWORD)).toBe(true)

    const repaired = (await manager.getState())!.wallets.find(x => x.id === w.id)!
    expect(repaired.pqPublicKey).not.toBe('ab'.repeat(1952))
    expect(validateAddress(repaired.pqAddress).valid).toBe(true)

    // And the repaired record can actually sign for its own address.
    const sig = await manager.signMessagePQ('after repair')
    expect(
      pqVerify(new TextEncoder().encode('after repair'), sig, repaired.pqPublicKey),
    ).toBe(true)
  })

  it('leaves an already-correct wallet unchanged', async () => {
    const w = await manager.createWalletFromMnemonic('Main', MNEMONIC, PASSWORD)

    await manager.lock()
    await manager.unlock(PASSWORD)

    const after = (await manager.getState())!.wallets.find(x => x.id === w.id)!
    expect(after.pqAddress).toBe(w.pqAddress)
    expect(after.pqPublicKey).toBe(w.pqPublicKey)
  })
})
