/**
 * Wallet manager (vault v2) behaviour.
 *
 * Each block corresponds to a promise the wallet makes to its user; several
 * are regression tests for defects in the v1 manager (named inline).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { WalletManager, STORAGE_KEYS, type SessionStore } from '../../src/core/wallet-manager'
import { MemoryStorage } from '../../src/core/storage'
import { pqVerifyWithPrefix, pqKeyPairFromMnemonic } from '../../src/core/pq'
import { encrypt, recoverAddress, hexToBytes, signEthMessage } from '../../src/core/crypto'
import { validateAddress } from '../../src/core/address'
import { toAccountId } from '../../src/core/account-id'
import { typedDataDigest } from '../../src/core/eip712'
import { decryptKeystore } from '../../src/core/keystore'

const PASSWORD = 'correct horse battery staple'
const MNEMONIC = 'test test test test test test test test test test test junk'
// Hardhat account #0 and #1 for MNEMONIC.
const ADDR0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ADDR1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const PRIVATE_KEY = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'

let storage: MemoryStorage
let clock: number
let manager: WalletManager

const make = (opts: { sessionStore?: SessionStore } = {}) =>
  new WalletManager(storage, { kdfIterations: 1000, now: () => clock, ...opts })

beforeEach(() => {
  storage = new MemoryStorage()
  clock = 1_000_000
  manager = make()
})

describe('creating a wallet', () => {
  it('derives the standard first account from a phrase and opens a session', async () => {
    const a = await manager.createVaultFromMnemonic({
      password: PASSWORD,
      mnemonic: MNEMONIC,
      backedUp: true,
    })
    expect(a.ethAddress).toBe(ADDR0)
    expect(a.pqAccountId).toBe(toAccountId(a.pqAddress))
    expect(a.pqAddress).toBe((await pqKeyPairFromMnemonic(MNEMONIC, 0)).address)
    const s = await manager.getState()
    expect(s?.locked).toBe(false)
    expect(s?.currentWalletId).toBe(a.id)
  })

  it('stores no secret in plaintext', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const raw = JSON.stringify(await storage.get(STORAGE_KEYS.vault))
    expect(raw).not.toContain('junk')
    expect(raw).not.toContain(PASSWORD)
  })

  it('refuses to overwrite an existing wallet', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await expect(
      manager.createVaultFromPrivateKey({ password: PASSWORD, privateKey: PRIVATE_KEY })
    ).rejects.toThrow(/already exists/)
  })

  it('rejects short passwords and invalid phrases', async () => {
    await expect(
      manager.createVaultFromMnemonic({ password: 'short', mnemonic: MNEMONIC })
    ).rejects.toThrow(/8 characters/)
    await expect(
      manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: 'not a phrase' })
    ).rejects.toThrow(/not valid/)
  })
})

describe('accounts from one recovery phrase', () => {
  it('adds the next HD index instead of generating a new phrase (v1 made a new phrase per account)', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const b = await manager.addHdAccount({ name: 'Second' })
    expect(b.ethAddress).toBe(ADDR1)
    expect(b.hdIndex).toBe(1)
    const s = await manager.getState()
    expect(s?.keyrings).toHaveLength(1)
    expect(s?.keyrings[0].accountCount).toBe(2)
  })

  it('previews and adds discovered indices', async () => {
    const a = await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const preview = await manager.previewHdAccounts(a.keyringId, 0, 3)
    expect(preview.map((p) => p.ethAddress)).toEqual([ADDR0, ADDR1, expect.any(String)])
    const added = await manager.addHdAccountsAt(a.keyringId, [0, 2])
    expect(added.map((x) => x.hdIndex)).toEqual([2])
  })

  it('refuses to import the same phrase or key twice', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await expect(manager.importMnemonic({ mnemonic: MNEMONIC.toUpperCase() })).rejects.toThrow(
      /already in the wallet/
    )
    await manager.importPrivateKey({ privateKey: PRIVATE_KEY })
    await expect(manager.importPrivateKey({ privateKey: PRIVATE_KEY })).rejects.toThrow(
      /already in this wallet/
    )
  })

  it('removes an account and its now-unused keyring, but never the last account', async () => {
    const a = await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const k = await manager.importPrivateKey({ privateKey: PRIVATE_KEY })
    await expect(manager.removeAccount(k.id, 'wrong password!')).rejects.toThrow(/Incorrect/)
    await manager.removeAccount(k.id, PASSWORD)
    const s = await manager.getState()
    expect(s?.wallets.map((w) => w.id)).toEqual([a.id])
    expect(s?.keyrings).toHaveLength(1)
    await expect(manager.removeAccount(a.id, PASSWORD)).rejects.toThrow(/only account/)
  })
})

describe('unlocking', () => {
  beforeEach(async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await manager.lock()
  })

  it('locks and unlocks with the password', async () => {
    expect((await manager.getState())?.locked).toBe(true)
    await expect(manager.signPersonalMessage('x')).rejects.toThrow(/locked/)
    expect(await manager.unlock(PASSWORD)).toEqual({ ok: true })
    expect((await manager.getState())?.locked).toBe(false)
  })

  it('throttles repeated wrong passwords, persisting across restarts', async () => {
    for (let i = 0; i < 4; i++)
      expect(await manager.unlock('nope nope nope')).toMatchObject({
        ok: false,
        reason: 'bad-password',
      })
    const fifth = await manager.unlock('nope nope nope')
    expect(fifth).toMatchObject({ ok: false, reason: 'bad-password', retryAt: clock + 30_000 })

    const restarted = make()
    expect(await restarted.unlock(PASSWORD)).toMatchObject({ ok: false, reason: 'throttled' })
    clock += 30_001
    expect(await restarted.unlock(PASSWORD)).toEqual({ ok: true })
    expect(await restarted.unlockRetryAt()).toBe(0)
  })

  it('auto-locks after the configured inactivity, and activity extends it', async () => {
    await manager.unlock(PASSWORD)
    await manager.updateSettings({ autoLock: true, autoLockTimeout: 60_000 })
    clock += 50_000
    await manager.touch()
    clock += 50_000
    expect(await manager.isUnlocked()).toBe(true)
    clock += 11_000
    expect(await manager.isUnlocked()).toBe(false)
  })

  it('restores a session from the session store (extension service-worker restart)', async () => {
    let saved: { dek: string; expiresAt: number } | null = null
    const store: SessionStore = {
      get: async () => saved,
      set: async (v) => void (saved = v),
      clear: async () => void (saved = null),
    }
    const bg = make({ sessionStore: store })
    expect(await bg.unlock(PASSWORD)).toEqual({ ok: true })
    expect(saved).not.toBeNull()

    const restarted = make({ sessionStore: store })
    expect(await restarted.isUnlocked()).toBe(true)
    await restarted.lock()
    expect(saved).toBeNull()
  })
})

describe('password change (v1 left the recovery phrase under the old password)', () => {
  it('keeps every secret readable under the new password', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await manager.importPrivateKey({ privateKey: PRIVATE_KEY })
    await manager.changePassword(PASSWORD, 'a brand new password')

    expect(
      await manager.exportMnemonic(
        'a brand new password',
        (await manager.getState())!.keyrings[0].id
      )
    ).toBe(MNEMONIC)
    await expect(manager.exportMnemonic(PASSWORD)).rejects.toThrow(/Incorrect/)
    await manager.lock()
    expect(await manager.unlock('a brand new password')).toEqual({ ok: true })
  })
})

describe('passkey (biometric) unlock', () => {
  const PRF = 'ab'.repeat(32)

  it('unlocks with the enrolled PRF output and nothing else', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await manager.enrollPasskey(PASSWORD, {
      credentialId: 'cred-1',
      rpId: 'wallet.qrdx.org',
      label: 'iPhone',
      prfOutput: PRF,
      prfSalt: '00'.repeat(32),
    })
    await manager.lock()

    expect(await manager.unlockWithPasskey('cred-1', 'cd'.repeat(32))).toMatchObject({ ok: false })
    expect(await manager.unlockWithPasskey('cred-2', PRF)).toMatchObject({
      ok: false,
      reason: 'unknown-passkey',
    })
    expect(await manager.unlockWithPasskey('cred-1', PRF)).toEqual({ ok: true })
  })

  it('survives a password change, and removal revokes it', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await manager.enrollPasskey(PASSWORD, {
      credentialId: 'cred-1',
      rpId: 'x',
      label: 'x',
      prfOutput: PRF,
      prfSalt: '00',
    })
    await manager.changePassword(PASSWORD, 'another password')
    await manager.lock()
    expect(await manager.unlockWithPasskey('cred-1', PRF)).toEqual({ ok: true })
    await manager.removePasskey('cred-1')
    await manager.lock()
    expect(await manager.unlockWithPasskey('cred-1', PRF)).toMatchObject({ ok: false })
  })

  it('requires the password to enroll', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await expect(
      manager.enrollPasskey('wrong password', {
        credentialId: 'c',
        rpId: 'x',
        label: 'x',
        prfOutput: PRF,
        prfSalt: '00',
      })
    ).rejects.toThrow(/Incorrect/)
  })
})

describe('keystores (v1 export dropped the PQ key of phrase wallets)', () => {
  it('round-trips both credentials, so the 0xPQ address survives export → import', async () => {
    const a = await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const ks = await manager.exportKeystore(PASSWORD, 'keystore password')
    expect(ks.crypto.cipher).toBe('aes-128-ctr')
    expect(ks.address).toBe(ADDR0.slice(2).toLowerCase())

    clock += 1
    const other = new WalletManager(new MemoryStorage(), { kdfIterations: 1000 })
    const b = await other.createVaultFromKeystore({
      password: PASSWORD,
      keystore: JSON.stringify(ks),
      keystorePassword: 'keystore password',
    })
    expect(b.ethAddress).toBe(a.ethAddress)
    expect(b.pqAddress).toBe(a.pqAddress)
  })

  it('reports a wrong keystore password distinctly', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    const ks = await manager.exportKeystore(PASSWORD, 'keystore password')
    await expect(decryptKeystore(ks, 'wrong')).rejects.toThrow(/Wrong keystore password/)
  })
})

describe('signing', () => {
  beforeEach(async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
  })

  it('personal_sign recovers to the account (utf8 and hex payloads)', async () => {
    const sig = await manager.signPersonalMessage('hello')
    expect(sig).toBe(
      signEthMessage('hello', 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
        .signature
    )
    const hexSig = await manager.signPersonalMessage('0x68656c6c6f', { encoding: 'hex' })
    expect(hexSig).toBe(sig)
  })

  it('signs EIP-712 typed data that recovers to the account', async () => {
    const typed = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
        ],
        Ping: [{ name: 'n', type: 'uint256' }],
      },
      primaryType: 'Ping',
      domain: { name: 'Test', chainId: 9999 },
      message: { n: 7 },
    }
    const sig = await manager.signTypedData(typed)
    expect(recoverAddress(typedDataDigest(typed), hexToBytes(sig.slice(2)))).toBe(ADDR0)
  })

  it('PQ message signatures verify against the account’s PQ key', async () => {
    const r = await manager.signPqMessage('authorise withdrawal ✓')
    const s = await manager.getState()
    expect(r.address).toBe(s!.wallets[0].pqAddress)
    expect(
      pqVerifyWithPrefix('authorise withdrawal ✓', r.signature, s!.wallets[0].pqPublicKey)
    ).toBe(true)
  })

  it('refuses to sign a transaction from another address', async () => {
    await expect(
      manager.signEvmTransaction({
        from: ADDR1,
        to: ADDR1,
        value: '0x1',
        nonce: '0x0',
        gas: '0x5208',
        gasPrice: '0x1',
        chainId: '0x1',
      })
    ).rejects.toThrow(/not from this account/)
  })
})

describe('upgrading a v1 store', () => {
  it('migrates on first unlock, groups phrase accounts, repairs placeholder PQ data, keeps ids', async () => {
    const legacy = {
      version: '1.0.0',
      initialized: true,
      locked: true,
      currentWalletId: 'wallet_2',
      wallets: [
        {
          id: 'wallet_1',
          name: 'Main',
          hdIndex: 0,
          createdAt: 1,
          encryptedPrivateKey: await encrypt(`${'11'.repeat(32)}:${'22'.repeat(32)}`, PASSWORD),
          encryptedMnemonic: await encrypt(MNEMONIC, PASSWORD),
          // placeholder-era values that never matched a real key pair
          pqAddress: '0xPQ' + 'cd'.repeat(32),
          pqPublicKey: 'ab'.repeat(1952),
        },
        {
          id: 'wallet_2',
          name: 'Second',
          hdIndex: 1,
          createdAt: 2,
          encryptedPrivateKey: await encrypt(`${'33'.repeat(32)}:x`, PASSWORD),
          encryptedMnemonic: await encrypt(MNEMONIC, PASSWORD),
        },
        {
          id: 'wallet_3',
          name: 'Imported',
          createdAt: 3,
          encryptedPrivateKey: await encrypt(`${PRIVATE_KEY.slice(2)}:x`, PASSWORD),
        },
      ],
      settings: { currency: 'EUR' },
    }
    await storage.set(STORAGE_KEYS.vault, legacy)

    expect((await manager.getState())?.locked).toBe(true)
    expect(await manager.unlock('wrong password')).toMatchObject({
      ok: false,
      reason: 'bad-password',
    })
    expect(await manager.unlock(PASSWORD)).toEqual({ ok: true })

    const s = (await manager.getState())!
    expect(s.version).toBe(2)
    expect(s.wallets.map((w) => [w.id, w.name, w.ethAddress])).toEqual([
      ['wallet_1', 'Main', ADDR0],
      ['wallet_2', 'Second', ADDR1],
      ['wallet_3', 'Imported', expect.any(String)],
    ])
    expect(s.keyrings.map((k) => [k.type, k.accountCount])).toEqual([
      ['hd', 2],
      ['key', 1],
    ])
    expect(s.currentWalletId).toBe('wallet_2')
    expect(s.settings.currency).toBe('EUR')
    expect(validateAddress(s.wallets[0].pqAddress).valid).toBe(true)
    expect(s.wallets[0].pqAddress).toBe((await pqKeyPairFromMnemonic(MNEMONIC, 0)).address)
    expect(await storage.get(STORAGE_KEYS.legacyBackup)).toBeNull()

    // The next account continues after the highest migrated index.
    expect((await manager.addHdAccount()).hdIndex).toBe(2)
  })
})

describe('reset', () => {
  it('erases the vault and throttle state', async () => {
    await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
    await manager.reset()
    expect(await manager.getState()).toBeNull()
    expect(await manager.isUnlocked()).toBe(false)
  })
})
