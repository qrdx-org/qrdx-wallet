/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Wallet manager (vault v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  The one place secrets are created, stored, unlocked and used. Every UI
 *  (web, iPhone PWA, extension popup) and the extension's dApp provider go
 *  through this class — in the extension it runs in the background service
 *  worker and the popup reaches it over messaging (see src/shared/backend).
 *
 *  Design rules:
 *    • Every public method takes and returns JSON-serialisable values only, so
 *      it can be called across the extension message boundary unchanged.
 *    • Secrets never leave except through the explicit export methods, which
 *      always require the password again.
 *    • While unlocked, only the data key (a non-extractable CryptoKey) is held
 *      in memory — never the password.
 *
 *  Vault layout and crypto: ./vault.ts. Key derivation: ./keyring.ts.
 */

import {
  AAD,
  DEFAULT_KDF_ITERATIONS,
  VAULT_VERSION,
  VaultError,
  deriveKek,
  deriveKekFromPrf,
  importDek,
  newKdfParams,
  open,
  openJson,
  randomBytes,
  randomId,
  seal,
  sealJson,
  wipe,
  type KdfParams,
  type Sealed,
} from './vault'
import {
  deriveAccount,
  newMnemonic,
  normalizeMnemonic,
  normalizePrivateKey,
  pqSeedForImportedKey,
  publicPart,
  KeyringError,
  type DerivedAccountKeys,
  type KeyringSecret,
  type KeyringType,
} from './keyring'
import {
  isValidMnemonic,
  signEthMessage,
  signHash,
  bytesToHex,
  hexToBytes,
  decrypt,
} from './crypto'
import { pqSignWithPrefix } from './pq'
import { decryptKeystore, encryptKeystore, type KeystoreV3 } from './keystore'
import { signTransaction, type SignedTransaction } from './transaction'
import { signPqTransaction, type PqTxFields, type SignedPqTx } from './pq-tx'
import { signExchangeTx, type UnsignedExchangeTx, type SignedExchangeTx } from './exchange-tx'
import { typedDataDigest } from './eip712'
import type { EthTransactionRequest } from './ethereum'
import type { IStorage } from './storage'
import type {
  AccountSource,
  KeyringSummary,
  PasskeySummary,
  WalletAccount,
  WalletSettings,
  WalletState,
} from './types'

// ─── Stored records ─────────────────────────────────────────────────────────

interface KeyringRecord {
  id: string
  type: KeyringType
  label: string
  sealed: Sealed
  /** Next unused HD index (hd only). */
  nextIndex: number
  createdAt: number
  backedUp: boolean
}

interface PasskeyRecord extends PasskeySummary {
  /** Salt fed to the PRF extension, hex. */
  prfSalt: string
  /** DEK wrapped under the PRF-derived key. */
  wrap: Sealed
}

type AccountRecord = Omit<WalletAccount, 'address' | 'publicKey' | 'keyringType'>

interface VaultRecord {
  version: 2
  kdf: KdfParams
  passwordWrap: Sealed
  passkeys: PasskeyRecord[]
  keyrings: KeyringRecord[]
  accounts: AccountRecord[]
  selectedAccountId?: string
  settings: WalletSettings
  createdAt: number
}

/** Pre-v2 layout, read only for migration. */
interface LegacyState {
  version: string
  initialized: boolean
  currentWalletId?: string
  wallets: {
    id: string
    name: string
    encryptedPrivateKey: string
    encryptedMnemonic?: string
    hdIndex?: number
    createdAt: number
  }[]
  settings?: Partial<WalletSettings>
}

// ─── Options and results ────────────────────────────────────────────────────

/**
 * Keeps an unlocked session alive across process restarts. Used by the
 * extension (MV3 service workers are killed when idle) with
 * `chrome.storage.session`, which is memory-only and never written to disk.
 * Web and PWA builds pass nothing: a reload locks the wallet.
 */
export interface SessionStore {
  get(): Promise<{ dek: string; expiresAt: number } | null>
  set(value: { dek: string; expiresAt: number }): Promise<void>
  clear(): Promise<void>
}

export interface WalletManagerOptions {
  /** Settings for a brand-new vault; platform code supplies its own defaults. */
  defaultSettings?: Partial<WalletSettings>
  sessionStore?: SessionStore
  /** PBKDF2 iterations for new vaults (tests lower this). */
  kdfIterations?: number
  /** Injectable clock (tests). */
  now?: () => number
}

export type UnlockResult =
  | { ok: true }
  | {
      ok: false
      reason: 'bad-password' | 'throttled' | 'no-vault' | 'unknown-passkey'
      retryAt?: number
    }

export interface CreateVaultInput {
  password: string
  accountName?: string
  /** True when the user verified a phrase this wallet generated. */
  backedUp?: boolean
}

export interface PasskeyEnrollment {
  credentialId: string
  rpId: string
  label: string
  /** 32-byte PRF output for `prfSalt`, hex. */
  prfOutput: string
  prfSalt: string
}

export type WalletEvent = { type: 'locked' } | { type: 'unlocked' } | { type: 'changed' }

export const STORAGE_KEYS = {
  vault: 'qrdx_wallet_state',
  legacyBackup: 'qrdx_wallet_state_v1_backup',
  unlockGuard: 'qrdx_unlock_guard',
} as const

export const MAX_ACCOUNTS = 100

export const DEFAULT_SETTINGS: WalletSettings = {
  theme: 'auto',
  currency: 'USD',
  language: 'en',
  autoLock: true,
  autoLockTimeout: 15 * 60 * 1000,
}

/** Failed attempts allowed before backoff starts. */
const FREE_ATTEMPTS = 5
const BACKOFF_BASE_MS = 30_000
const BACKOFF_MAX_MS = 60 * 60 * 1000

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'LOCKED'
      | 'NOT_INITIALIZED'
      | 'ALREADY_INITIALIZED'
      | 'NOT_FOUND'
      | 'BAD_PASSWORD'
      | 'INVALID'
      | 'LIMIT'
      | 'DUPLICATE' = 'INVALID'
  ) {
    super(message)
    this.name = 'WalletError'
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

export class WalletManager {
  private readonly storage: IStorage
  private readonly opts: Required<Pick<WalletManagerOptions, 'kdfIterations' | 'now'>> &
    WalletManagerOptions
  private dek: CryptoKey | null = null
  private sessionExpiresAt = 0
  private lockTimer: ReturnType<typeof setTimeout> | null = null
  private lastSessionWrite = 0
  private listeners = new Set<(e: WalletEvent) => void>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(storage: IStorage | { storage: IStorage }, options: WalletManagerOptions = {}) {
    // Accept the old `new WalletManager(new WalletStorage(s))` call shape.
    this.storage =
      'storage' in storage && !('get' in storage) ? storage.storage : (storage as IStorage)
    this.opts = { kdfIterations: DEFAULT_KDF_ITERATIONS, now: () => Date.now(), ...options }
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  subscribe(listener: (e: WalletEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(e: WalletEvent) {
    for (const l of this.listeners) {
      try {
        l(e)
      } catch {
        /* a listener must not break the wallet */
      }
    }
  }

  /** Serialise read-modify-write cycles on the vault. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  // ─── Storage ────────────────────────────────────────────────────────────

  private async readRaw(): Promise<VaultRecord | LegacyState | null> {
    return this.storage.get<VaultRecord | LegacyState>(STORAGE_KEYS.vault)
  }

  private async readVault(): Promise<VaultRecord> {
    const raw = await this.readRaw()
    if (!raw) throw new WalletError('No wallet has been created yet', 'NOT_INITIALIZED')
    if (!isV2(raw))
      throw new WalletError(
        'This wallet needs to be unlocked once to upgrade its storage',
        'LOCKED'
      )
    return raw
  }

  private async writeVault(vault: VaultRecord): Promise<void> {
    await this.storage.set(STORAGE_KEYS.vault, vault)
    this.emit({ type: 'changed' })
  }

  // ─── Session ────────────────────────────────────────────────────────────

  private async session(): Promise<CryptoKey> {
    if (this.dek && this.opts.now() < this.sessionExpiresAt) return this.dek
    if (this.dek) {
      await this.lock()
      throw new WalletError('The wallet locked after inactivity', 'LOCKED')
    }
    const restored = await this.restoreSession()
    if (restored) return restored
    throw new WalletError('The wallet is locked', 'LOCKED')
  }

  private async restoreSession(): Promise<CryptoKey | null> {
    const store = this.opts.sessionStore
    if (!store) return null
    const saved = await store.get().catch(() => null)
    if (!saved || this.opts.now() >= saved.expiresAt) {
      if (saved) await store.clear().catch(() => undefined)
      return null
    }
    const raw = hexToBytes(saved.dek)
    try {
      this.dek = await importDek(raw)
    } finally {
      wipe(raw)
    }
    this.sessionExpiresAt = saved.expiresAt
    this.scheduleLock()
    return this.dek
  }

  private async autoLockMs(): Promise<number> {
    const raw = await this.readRaw()
    const s = raw && isV2(raw) ? raw.settings : DEFAULT_SETTINGS
    return s.autoLock && s.autoLockTimeout > 0 ? s.autoLockTimeout : Number.POSITIVE_INFINITY
  }

  private async startSession(rawDek: Uint8Array): Promise<void> {
    this.dek = await importDek(rawDek)
    const ms = await this.autoLockMs()
    this.sessionExpiresAt = Number.isFinite(ms) ? this.opts.now() + ms : Number.MAX_SAFE_INTEGER
    if (this.opts.sessionStore) {
      await this.opts.sessionStore.set({
        dek: bytesToHex(rawDek),
        expiresAt: this.sessionExpiresAt,
      })
      this.lastSessionWrite = this.opts.now()
    }
    this.scheduleLock()
    this.emit({ type: 'unlocked' })
  }

  private scheduleLock() {
    if (this.lockTimer) clearTimeout(this.lockTimer)
    this.lockTimer = null
    const remaining = this.sessionExpiresAt - this.opts.now()
    if (!Number.isFinite(remaining) || remaining > 2 ** 31 - 1) return
    this.lockTimer = setTimeout(() => void this.lock(), Math.max(0, remaining))
  }

  /**
   * Record user activity: pushes the auto-lock deadline back. Cheap enough to
   * call on every interaction; persists the new deadline at most every 30 s.
   */
  async touch(): Promise<void> {
    if (!this.dek) return
    const ms = await this.autoLockMs()
    if (!Number.isFinite(ms)) return
    this.sessionExpiresAt = this.opts.now() + ms
    this.scheduleLock()
    const store = this.opts.sessionStore
    if (store && this.opts.now() - this.lastSessionWrite > 30_000) {
      const saved = await store.get().catch(() => null)
      if (saved) await store.set({ dek: saved.dek, expiresAt: this.sessionExpiresAt })
      this.lastSessionWrite = this.opts.now()
    }
  }

  async isUnlocked(): Promise<boolean> {
    try {
      await this.session()
      return true
    } catch {
      return false
    }
  }

  async lock(): Promise<void> {
    const wasUnlocked = this.dek !== null
    this.dek = null
    this.sessionExpiresAt = 0
    if (this.lockTimer) clearTimeout(this.lockTimer)
    this.lockTimer = null
    await this.opts.sessionStore?.clear().catch(() => undefined)
    if (wasUnlocked) this.emit({ type: 'locked' })
  }

  // ─── State (public view) ────────────────────────────────────────────────

  async getState(): Promise<WalletState | null> {
    const raw = await this.readRaw()
    if (!raw) return null
    const locked = !(await this.isUnlocked())

    if (!isV2(raw)) {
      // A v1 vault is readable only after the first unlock migrates it.
      return {
        version: 1,
        initialized: raw.initialized,
        locked: true,
        wallets: [],
        keyrings: [],
        passkeys: [],
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      }
    }

    return {
      version: raw.version,
      initialized: true,
      locked,
      currentWalletId: raw.selectedAccountId,
      wallets: raw.accounts.map((a) => toView(a, raw)),
      keyrings: raw.keyrings.map((k) => summarizeKeyring(k, raw)),
      passkeys: raw.passkeys.map(({ credentialId, label, rpId, createdAt }) => ({
        credentialId,
        label,
        rpId,
        createdAt,
      })),
      settings: raw.settings,
    }
  }

  async isInitialized(): Promise<boolean> {
    return (await this.readRaw()) !== null
  }

  // ─── Creating a vault ───────────────────────────────────────────────────

  /** A fresh recovery phrase for the UI to show. Nothing is stored. */
  generateMnemonic(words: 12 | 24 = 12): string {
    return newMnemonic(words)
  }

  private async newVault(
    password: string,
    secret: KeyringSecret,
    source: AccountSource,
    input: CreateVaultInput
  ): Promise<WalletAccount> {
    assertPassword(password)
    return this.exclusive(async () => {
      if (await this.readRaw())
        throw new WalletError('A wallet already exists on this device', 'ALREADY_INITIALIZED')

      const rawDek = randomBytes(32)
      try {
        const kdf = newKdfParams(this.opts.kdfIterations)
        const kek = await deriveKek(password, kdf)
        const dek = await importDek(rawDek)
        const keyring = await this.makeKeyring(dek, secret, input.backedUp ?? false)
        const account = await this.makeAccount(
          secret,
          keyring,
          input.accountName || 'Account 1',
          source
        )

        const vault: VaultRecord = {
          version: VAULT_VERSION,
          kdf,
          passwordWrap: await seal(kek, rawDek, AAD.passwordWrap),
          passkeys: [],
          keyrings: [keyring],
          accounts: [account],
          selectedAccountId: account.id,
          settings: { ...DEFAULT_SETTINGS, ...this.opts.defaultSettings },
          createdAt: this.opts.now(),
        }
        await this.writeVault(vault)
        await this.clearThrottle()
        await this.startSession(rawDek)
        return toView(account, vault)
      } finally {
        wipe(rawDek)
      }
    })
  }

  /** Create a wallet from a phrase — generated by this wallet or typed in by the user. */
  async createVaultFromMnemonic(
    input: CreateVaultInput & { mnemonic: string; imported?: boolean }
  ): Promise<WalletAccount> {
    const mnemonic = normalizeMnemonic(input.mnemonic)
    if (!isValidMnemonic(mnemonic))
      throw new WalletError('That recovery phrase is not valid. Check the words and their order.')
    return this.newVault(
      input.password,
      { type: 'hd', mnemonic },
      input.imported ? 'imported-phrase' : 'created',
      {
        ...input,
        backedUp: input.imported ? true : input.backedUp,
      }
    )
  }

  async createVaultFromPrivateKey(
    input: CreateVaultInput & { privateKey: string }
  ): Promise<WalletAccount> {
    const ethPrivateKey = normalizeKey(input.privateKey)
    const pqSeed = await pqSeedForImportedKey(ethPrivateKey)
    return this.newVault(input.password, { type: 'key', ethPrivateKey, pqSeed }, 'imported-key', {
      ...input,
      backedUp: true,
    })
  }

  async createVaultFromKeystore(
    input: CreateVaultInput & { keystore: unknown; keystorePassword: string }
  ): Promise<WalletAccount> {
    const ks = await decryptKeystore(input.keystore, input.keystorePassword)
    const pqSeed = ks.pqSeed ?? (await pqSeedForImportedKey(ks.ethPrivateKey))
    return this.newVault(
      input.password,
      { type: 'key', ethPrivateKey: ks.ethPrivateKey, pqSeed },
      'imported-keystore',
      {
        ...input,
        accountName: input.accountName || ks.name,
        backedUp: true,
      }
    )
  }

  // ─── Unlocking ──────────────────────────────────────────────────────────

  private async readThrottle(): Promise<{ failures: number; retryAt: number }> {
    return (
      (await this.storage.get<{ failures: number; retryAt: number }>(STORAGE_KEYS.unlockGuard)) ?? {
        failures: 0,
        retryAt: 0,
      }
    )
  }

  private async recordFailure(): Promise<number> {
    const g = await this.readThrottle()
    const failures = g.failures + 1
    const delay =
      failures < FREE_ATTEMPTS
        ? 0
        : Math.min(BACKOFF_BASE_MS * 2 ** (failures - FREE_ATTEMPTS), BACKOFF_MAX_MS)
    const retryAt = delay ? this.opts.now() + delay : 0
    await this.storage.set(STORAGE_KEYS.unlockGuard, { failures, retryAt })
    return retryAt
  }

  private async clearThrottle(): Promise<void> {
    await this.storage.remove(STORAGE_KEYS.unlockGuard)
  }

  /** When the next unlock attempt is allowed (0 = now). */
  async unlockRetryAt(): Promise<number> {
    const { retryAt } = await this.readThrottle()
    return retryAt > this.opts.now() ? retryAt : 0
  }

  async unlock(password: string): Promise<UnlockResult> {
    const raw = await this.readRaw()
    if (!raw) return { ok: false, reason: 'no-vault' }

    const retryAt = await this.unlockRetryAt()
    if (retryAt) return { ok: false, reason: 'throttled', retryAt }

    if (!isV2(raw)) {
      if (!raw.wallets?.length) {
        // v1 wrote `initialized` before any account existed; there is nothing to unlock.
        await this.storage.remove(STORAGE_KEYS.vault)
        this.emit({ type: 'changed' })
        return { ok: false, reason: 'no-vault' }
      }
      const ok = await this.migrateV1(raw, password)
      if (!ok) {
        const next = await this.recordFailure()
        return { ok: false, reason: 'bad-password', retryAt: next || undefined }
      }
      await this.clearThrottle()
      return { ok: true }
    }

    let rawDek: Uint8Array | null = null
    try {
      const kek = await deriveKek(password, raw.kdf)
      rawDek = await open(kek, raw.passwordWrap, AAD.passwordWrap)
    } catch (err) {
      if (err instanceof VaultError && err.code === 'BAD_PASSWORD') {
        const next = await this.recordFailure()
        return { ok: false, reason: 'bad-password', retryAt: next || undefined }
      }
      throw err
    }
    try {
      await this.clearThrottle()
      await this.startSession(rawDek)
      return { ok: true }
    } finally {
      wipe(rawDek)
    }
  }

  /** Unlock with a passkey's PRF output (biometrics). The UI performs the WebAuthn ceremony. */
  async unlockWithPasskey(credentialId: string, prfOutputHex: string): Promise<UnlockResult> {
    const vault = await this.readVault().catch(() => null)
    if (!vault) return { ok: false, reason: 'no-vault' }
    const record = vault.passkeys.find((p) => p.credentialId === credentialId)
    if (!record) return { ok: false, reason: 'unknown-passkey' }

    const prf = hexToBytes(prfOutputHex)
    let rawDek: Uint8Array | null = null
    try {
      const kek = await deriveKekFromPrf(prf, credentialId)
      rawDek = await open(kek, record.wrap, AAD.passkeyWrap(credentialId))
    } catch {
      // A passkey either produces the right PRF output or it doesn't — no throttling needed,
      // but report it so the UI can fall back to the password.
      return { ok: false, reason: 'unknown-passkey' }
    } finally {
      wipe(prf)
    }
    try {
      await this.startSession(rawDek)
      return { ok: true }
    } finally {
      wipe(rawDek)
    }
  }

  /** Verify a password without changing lock state. Used to re-authenticate sensitive actions. */
  async verifyPassword(password: string): Promise<boolean> {
    const vault = await this.readVault()
    const raw = await this.unwrapWithPassword(vault, password).catch(() => null)
    if (!raw) return false
    wipe(raw)
    return true
  }

  private async unwrapWithPassword(vault: VaultRecord, password: string): Promise<Uint8Array> {
    const retryAt = await this.unlockRetryAt()
    if (retryAt)
      throw new WalletError(
        `Too many attempts. Try again at ${new Date(retryAt).toLocaleTimeString()}.`,
        'BAD_PASSWORD'
      )
    try {
      const raw = await open(
        await deriveKek(password, vault.kdf),
        vault.passwordWrap,
        AAD.passwordWrap
      )
      await this.clearThrottle()
      return raw
    } catch {
      await this.recordFailure()
      throw new WalletError('Incorrect password', 'BAD_PASSWORD')
    }
  }

  // ─── Passkeys (biometric unlock) ────────────────────────────────────────

  async enrollPasskey(password: string, enrollment: PasskeyEnrollment): Promise<PasskeySummary> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const rawDek = await this.unwrapWithPassword(vault, password)
      const prf = hexToBytes(enrollment.prfOutput)
      try {
        if (prf.length < 32) throw new WalletError('The passkey did not return a usable secret')
        const kek = await deriveKekFromPrf(prf, enrollment.credentialId)
        const record: PasskeyRecord = {
          credentialId: enrollment.credentialId,
          label: enrollment.label,
          rpId: enrollment.rpId,
          createdAt: this.opts.now(),
          prfSalt: enrollment.prfSalt,
          wrap: await seal(kek, rawDek, AAD.passkeyWrap(enrollment.credentialId)),
        }
        vault.passkeys = [
          ...vault.passkeys.filter((p) => p.credentialId !== record.credentialId),
          record,
        ]
        await this.writeVault(vault)
        const { credentialId, label, rpId, createdAt } = record
        return { credentialId, label, rpId, createdAt }
      } finally {
        wipe(rawDek, prf)
      }
    })
  }

  async removePasskey(credentialId: string): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      vault.passkeys = vault.passkeys.filter((p) => p.credentialId !== credentialId)
      await this.writeVault(vault)
    })
  }

  /** What the UI needs to run the WebAuthn assertion for unlock. */
  async passkeyChallenges(): Promise<{ credentialId: string; prfSalt: string; rpId: string }[]> {
    const raw = await this.readRaw()
    if (!raw || !isV2(raw)) return []
    return raw.passkeys.map(({ credentialId, prfSalt, rpId }) => ({ credentialId, prfSalt, rpId }))
  }

  // ─── Accounts ───────────────────────────────────────────────────────────

  private async makeKeyring(
    dek: CryptoKey,
    secret: KeyringSecret,
    backedUp: boolean
  ): Promise<KeyringRecord> {
    const id = randomId()
    return {
      id,
      type: secret.type,
      label: secret.type === 'hd' ? 'Recovery phrase' : 'Imported key',
      sealed: await sealJson(dek, secret, AAD.keyring(id)),
      nextIndex: secret.type === 'hd' ? 1 : 0,
      createdAt: this.opts.now(),
      backedUp,
    }
  }

  private async makeAccount(
    secret: KeyringSecret,
    keyring: KeyringRecord,
    name: string,
    source: AccountSource,
    index = 0
  ): Promise<AccountRecord> {
    const keys = await deriveAccount(secret, index)
    return {
      id: randomId(),
      name: name.trim().slice(0, 40) || `Account ${index + 1}`,
      keyringId: keyring.id,
      hdIndex: secret.type === 'hd' ? index : undefined,
      source,
      createdAt: this.opts.now(),
      ...publicPart(keys),
    }
  }

  private async openKeyring(vault: VaultRecord, keyringId: string): Promise<KeyringSecret> {
    const dek = await this.session()
    const k = vault.keyrings.find((r) => r.id === keyringId)
    if (!k) throw new WalletError('Keyring not found', 'NOT_FOUND')
    return openJson<KeyringSecret>(dek, k.sealed, AAD.keyring(k.id))
  }

  private ensureCapacity(vault: VaultRecord) {
    if (vault.accounts.length >= MAX_ACCOUNTS)
      throw new WalletError(`A wallet can hold up to ${MAX_ACCOUNTS} accounts`, 'LIMIT')
  }

  private async assertNotDuplicate(vault: VaultRecord, ethAddress: string) {
    if (vault.accounts.some((a) => a.ethAddress.toLowerCase() === ethAddress.toLowerCase())) {
      throw new WalletError('That account is already in this wallet', 'DUPLICATE')
    }
  }

  /**
   * Add the next account from an existing recovery phrase. No new phrase is
   * created — it is already backed up by the one the user saved.
   */
  async addHdAccount(input: { name?: string; keyringId?: string } = {}): Promise<WalletAccount> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      this.ensureCapacity(vault)
      const keyring = input.keyringId
        ? vault.keyrings.find((k) => k.id === input.keyringId)
        : vault.keyrings.find((k) => k.type === 'hd')
      if (!keyring || keyring.type !== 'hd') {
        throw new WalletError(
          'This wallet has no recovery phrase to derive accounts from. Create or import one first.',
          'NOT_FOUND'
        )
      }
      const secret = await this.openKeyring(vault, keyring.id)
      const index = keyring.nextIndex
      const account = await this.makeAccount(
        secret,
        keyring,
        input.name || `Account ${vault.accounts.length + 1}`,
        'created',
        index
      )
      keyring.nextIndex = index + 1
      vault.accounts.push(account)
      vault.selectedAccountId = account.id
      await this.writeVault(vault)
      return toView(account, vault)
    })
  }

  /**
   * Addresses at HD indices — used by the UI to discover funded accounts after
   * importing a phrase. Read-only; nothing is stored.
   */
  async previewHdAccounts(
    keyringId: string,
    start: number,
    count: number
  ): Promise<{ index: number; ethAddress: string; pqAddress: string; pqAccountId: string }[]> {
    const vault = await this.readVault()
    const secret = await this.openKeyring(vault, keyringId)
    if (secret.type !== 'hd')
      throw new WalletError('Only recovery-phrase keyrings have more accounts')
    const out = []
    for (let i = start; i < start + Math.min(count, 20); i++) {
      const k = await deriveAccount(secret, i)
      out.push({
        index: i,
        ethAddress: k.ethAddress,
        pqAddress: k.pqAddress,
        pqAccountId: k.pqAccountId,
      })
    }
    return out
  }

  /** Add specific HD indices (from discovery). Skips ones already present. */
  async addHdAccountsAt(keyringId: string, indices: number[]): Promise<WalletAccount[]> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const keyring = vault.keyrings.find((k) => k.id === keyringId)
      if (!keyring || keyring.type !== 'hd') throw new WalletError('Keyring not found', 'NOT_FOUND')
      const secret = await this.openKeyring(vault, keyringId)
      const added: AccountRecord[] = []
      for (const i of [...new Set(indices)].sort((a, b) => a - b)) {
        if (vault.accounts.some((a) => a.keyringId === keyringId && a.hdIndex === i)) continue
        this.ensureCapacity(vault)
        const acc = await this.makeAccount(
          secret,
          keyring,
          `Account ${vault.accounts.length + 1}`,
          'imported-phrase',
          i
        )
        vault.accounts.push(acc)
        added.push(acc)
        keyring.nextIndex = Math.max(keyring.nextIndex, i + 1)
      }
      await this.writeVault(vault)
      return added.map((a) => toView(a, vault))
    })
  }

  async importMnemonic(input: { mnemonic: string; name?: string }): Promise<WalletAccount> {
    const mnemonic = normalizeMnemonic(input.mnemonic)
    if (!isValidMnemonic(mnemonic))
      throw new WalletError('That recovery phrase is not valid. Check the words and their order.')
    return this.exclusive(async () => {
      const vault = await this.readVault()
      this.ensureCapacity(vault)
      for (const k of vault.keyrings.filter((k) => k.type === 'hd')) {
        const s = await this.openKeyring(vault, k.id)
        if (s.type === 'hd' && s.mnemonic === mnemonic) {
          throw new WalletError(
            'This recovery phrase is already in the wallet. Use “Add account” to derive more accounts from it.',
            'DUPLICATE'
          )
        }
      }
      const secret: KeyringSecret = { type: 'hd', mnemonic }
      const keyring = await this.makeKeyring(await this.session(), secret, true)
      keyring.label = `Recovery phrase ${vault.keyrings.filter((k) => k.type === 'hd').length + 1}`
      const account = await this.makeAccount(
        secret,
        keyring,
        input.name || `Account ${vault.accounts.length + 1}`,
        'imported-phrase'
      )
      await this.assertNotDuplicate(vault, account.ethAddress)
      vault.keyrings.push(keyring)
      vault.accounts.push(account)
      vault.selectedAccountId = account.id
      await this.writeVault(vault)
      return toView(account, vault)
    })
  }

  private async importKeySecret(
    secret: KeyringSecret & { type: 'key' },
    name: string | undefined,
    source: AccountSource
  ): Promise<WalletAccount> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      this.ensureCapacity(vault)
      const keyring = await this.makeKeyring(await this.session(), secret, true)
      const account = await this.makeAccount(
        secret,
        keyring,
        name || `Imported ${vault.accounts.length + 1}`,
        source
      )
      await this.assertNotDuplicate(vault, account.ethAddress)
      vault.keyrings.push(keyring)
      vault.accounts.push(account)
      vault.selectedAccountId = account.id
      await this.writeVault(vault)
      return toView(account, vault)
    })
  }

  async importPrivateKey(input: { privateKey: string; name?: string }): Promise<WalletAccount> {
    const ethPrivateKey = normalizeKey(input.privateKey)
    return this.importKeySecret(
      { type: 'key', ethPrivateKey, pqSeed: await pqSeedForImportedKey(ethPrivateKey) },
      input.name,
      'imported-key'
    )
  }

  async importKeystore(input: {
    keystore: unknown
    keystorePassword: string
    name?: string
  }): Promise<WalletAccount> {
    const ks = await decryptKeystore(input.keystore, input.keystorePassword)
    const pqSeed = ks.pqSeed ?? (await pqSeedForImportedKey(ks.ethPrivateKey))
    return this.importKeySecret(
      { type: 'key', ethPrivateKey: ks.ethPrivateKey, pqSeed },
      input.name || ks.name,
      'imported-keystore'
    )
  }

  async selectAccount(accountId: string): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      if (!vault.accounts.some((a) => a.id === accountId))
        throw new WalletError('Account not found', 'NOT_FOUND')
      vault.selectedAccountId = accountId
      await this.writeVault(vault)
    })
  }

  async renameAccount(accountId: string, name: string): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const a = vault.accounts.find((x) => x.id === accountId)
      if (!a) throw new WalletError('Account not found', 'NOT_FOUND')
      const trimmed = name.trim().slice(0, 40)
      if (!trimmed) throw new WalletError('Account name cannot be empty')
      a.name = trimmed
      await this.writeVault(vault)
    })
  }

  async setAccountHidden(accountId: string, hidden: boolean): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const a = vault.accounts.find((x) => x.id === accountId)
      if (!a) throw new WalletError('Account not found', 'NOT_FOUND')
      a.hidden = hidden || undefined
      await this.writeVault(vault)
    })
  }

  /** Remove an account. Its keyring goes too once no account uses it. Requires the password. */
  async removeAccount(accountId: string, password: string): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const raw = await this.unwrapWithPassword(vault, password)
      wipe(raw)
      const target = vault.accounts.find((a) => a.id === accountId)
      if (!target) throw new WalletError('Account not found', 'NOT_FOUND')
      if (vault.accounts.length === 1) {
        throw new WalletError(
          'You cannot remove the only account. Reset the wallet instead.',
          'INVALID'
        )
      }
      vault.accounts = vault.accounts.filter((a) => a.id !== accountId)
      if (!vault.accounts.some((a) => a.keyringId === target.keyringId)) {
        vault.keyrings = vault.keyrings.filter((k) => k.id !== target.keyringId)
      }
      if (vault.selectedAccountId === accountId) vault.selectedAccountId = vault.accounts[0]?.id
      await this.writeVault(vault)
    })
  }

  async markBackedUp(keyringId: string): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const k = vault.keyrings.find((r) => r.id === keyringId)
      if (!k) throw new WalletError('Keyring not found', 'NOT_FOUND')
      k.backedUp = true
      await this.writeVault(vault)
    })
  }

  // ─── Exports (always re-authenticated) ──────────────────────────────────

  private async secretWithPassword(
    password: string,
    keyringId: string
  ): Promise<{ vault: VaultRecord; secret: KeyringSecret }> {
    const vault = await this.readVault()
    const raw = await this.unwrapWithPassword(vault, password)
    try {
      const dek = await importDek(raw)
      const k = vault.keyrings.find((r) => r.id === keyringId)
      if (!k) throw new WalletError('Keyring not found', 'NOT_FOUND')
      return { vault, secret: await openJson<KeyringSecret>(dek, k.sealed, AAD.keyring(k.id)) }
    } finally {
      wipe(raw)
    }
  }

  private async accountOrSelected(vault: VaultRecord, accountId?: string): Promise<AccountRecord> {
    const id = accountId ?? vault.selectedAccountId
    const acc = vault.accounts.find((a) => a.id === id)
    if (!acc) throw new WalletError('No account selected', 'NOT_FOUND')
    return acc
  }

  async exportMnemonic(password: string, keyringId?: string): Promise<string> {
    const vault = await this.readVault()
    const id = keyringId ?? (await this.accountOrSelected(vault)).keyringId
    const { secret } = await this.secretWithPassword(password, id)
    if (secret.type !== 'hd')
      throw new WalletError(
        'This account was imported from a key and has no recovery phrase',
        'NOT_FOUND'
      )
    return secret.mnemonic
  }

  async exportPrivateKey(
    password: string,
    accountId?: string
  ): Promise<{ ethPrivateKey: string; pqSeed: string }> {
    const vault = await this.readVault()
    const acc = await this.accountOrSelected(vault, accountId)
    const { secret } = await this.secretWithPassword(password, acc.keyringId)
    const keys = await deriveAccount(secret, acc.hdIndex ?? 0)
    return { ethPrivateKey: keys.ethPrivateKey, pqSeed: keys.pqSeed }
  }

  /** A v3 keystore that also carries the PQ seed, so re-import restores the same 0xPQ address. */
  async exportKeystore(
    password: string,
    keystorePassword: string,
    accountId?: string
  ): Promise<KeystoreV3> {
    assertPassword(keystorePassword)
    const vault = await this.readVault()
    const acc = await this.accountOrSelected(vault, accountId)
    const { secret } = await this.secretWithPassword(password, acc.keyringId)
    const keys = await deriveAccount(secret, acc.hdIndex ?? 0)
    return encryptKeystore(
      {
        ethPrivateKey: keys.ethPrivateKey,
        pqSeed: keys.pqSeed,
        pqAddress: keys.pqAddress,
        pqPublicKey: keys.pqPublicKey,
        name: acc.name,
      },
      keystorePassword
    )
  }

  // ─── Password, settings, reset ──────────────────────────────────────────

  /** Re-wrap the data key under a new password. Secrets and passkeys are untouched. */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    assertPassword(newPassword)
    return this.exclusive(async () => {
      const vault = await this.readVault()
      const raw = await this.unwrapWithPassword(vault, oldPassword)
      try {
        vault.kdf = newKdfParams(Math.max(this.opts.kdfIterations, vault.kdf.iterations))
        vault.passwordWrap = await seal(
          await deriveKek(newPassword, vault.kdf),
          raw,
          AAD.passwordWrap
        )
        await this.writeVault(vault)
      } finally {
        wipe(raw)
      }
    })
  }

  async updateSettings(partial: Partial<WalletSettings>): Promise<void> {
    return this.exclusive(async () => {
      const vault = await this.readVault()
      vault.settings = { ...vault.settings, ...partial }
      await this.writeVault(vault)
      if ('autoLock' in partial || 'autoLockTimeout' in partial) await this.touch()
    })
  }

  /** Erase everything on this device. */
  async reset(): Promise<void> {
    await this.lock()
    await this.storage.remove(STORAGE_KEYS.vault)
    await this.storage.remove(STORAGE_KEYS.legacyBackup)
    await this.storage.remove(STORAGE_KEYS.unlockGuard)
    await this.storage.clear()
    this.emit({ type: 'changed' })
  }

  // ─── Signing ────────────────────────────────────────────────────────────

  private async keysFor(
    accountId?: string
  ): Promise<{ account: AccountRecord; keys: DerivedAccountKeys }> {
    const vault = await this.readVault()
    const account = await this.accountOrSelected(vault, accountId)
    const secret = await this.openKeyring(vault, account.keyringId)
    await this.touch()
    return { account, keys: await deriveAccount(secret, account.hdIndex ?? 0) }
  }

  /** EIP-191 personal_sign. `encoding: 'hex'` treats the message as hex bytes (what dApps send). */
  async signPersonalMessage(
    message: string,
    opts: { accountId?: string; encoding?: 'utf8' | 'hex' } = {}
  ): Promise<string> {
    const { keys } = await this.keysFor(opts.accountId)
    const payload = opts.encoding === 'hex' ? hexToBytes(message.replace(/^0x/, '')) : message
    return signEthMessage(payload, keys.ethPrivateKey).signature
  }

  /** eth_signTypedData_v4. */
  async signTypedData(typedData: unknown, accountId?: string): Promise<string> {
    const { keys } = await this.keysFor(accountId)
    const digest = typedDataDigest(typedData)
    const { r, s, v } = signHash(digest, keys.ethPrivateKey)
    return r + s.slice(2) + v.toString(16).padStart(2, '0')
  }

  /** ML-DSA-65 signature over the QRDX-prefixed message. */
  async signPqMessage(
    message: string,
    accountId?: string
  ): Promise<{ signature: string; publicKey: string; address: string }> {
    const { keys } = await this.keysFor(accountId)
    return {
      signature: await pqSignWithPrefix(message, keys.pqSeed),
      publicKey: keys.pqPublicKey,
      address: keys.pqAddress,
    }
  }

  /** Sign a classic (secp256k1) transaction. `tx.from` must be the account's 0x address. */
  async signEvmTransaction(
    tx: EthTransactionRequest,
    accountId?: string
  ): Promise<SignedTransaction> {
    const { keys } = await this.keysFor(accountId)
    if (tx.from && tx.from.toLowerCase() !== keys.ethAddress.toLowerCase()) {
      throw new WalletError('The transaction is not from this account')
    }
    return signTransaction(tx, keys.ethPrivateKey)
  }

  /** Sign a type-0x51 post-quantum transaction from the account's 0xPQ credential. */
  async signPqTransaction(fields: PqTxFields, accountId?: string): Promise<SignedPqTx> {
    const { keys } = await this.keysFor(accountId)
    return signPqTransaction(fields, keys.pqSeed)
  }

  /** Sign a native exchange operation (swap, stake, token op…). */
  async signExchangeTransaction(
    tx: UnsignedExchangeTx,
    accountId?: string
  ): Promise<SignedExchangeTx & { tx_hash: string }> {
    const { keys } = await this.keysFor(accountId)
    return signExchangeTx(tx, keys.pqSeed)
  }

  // ─── v1 → v2 migration ──────────────────────────────────────────────────

  /**
   * Upgrade a v1 store on its first successful unlock. v1 encrypted each
   * secret directly under the password, so the password is required.
   *
   * Phrase wallets sharing a phrase become one HD keyring with their indices
   * preserved; key wallets become key keyrings (PQ seed re-derived from the
   * secp256k1 key, matching what v1 did on unlock). Account ids and names are
   * kept. The v1 blob is retained under a backup key until the v2 vault has
   * been written and read back.
   */
  private async migrateV1(legacy: LegacyState, password: string): Promise<boolean> {
    return this.exclusive(async () => {
      const decrypted: { w: LegacyState['wallets'][number]; eth: string; mnemonic?: string }[] = []
      try {
        for (const w of legacy.wallets) {
          const combined = await decrypt(w.encryptedPrivateKey, password)
          const mnemonic = w.encryptedMnemonic
            ? normalizeMnemonic(await decrypt(w.encryptedMnemonic, password))
            : undefined
          decrypted.push({ w, eth: combined.split(':')[0], mnemonic })
        }
      } catch {
        return false
      }

      const rawDek = randomBytes(32)
      try {
        const dek = await importDek(rawDek)
        const kdf = newKdfParams(this.opts.kdfIterations)
        const vault: VaultRecord = {
          version: VAULT_VERSION,
          kdf,
          passwordWrap: await seal(await deriveKek(password, kdf), rawDek, AAD.passwordWrap),
          passkeys: [],
          keyrings: [],
          accounts: [],
          settings: {
            ...DEFAULT_SETTINGS,
            ...this.opts.defaultSettings,
            ...(legacy.settings ?? {}),
          },
          createdAt: this.opts.now(),
        }
        const hdByPhrase = new Map<string, KeyringRecord>()

        for (const { w, eth, mnemonic } of decrypted) {
          let secret: KeyringSecret
          let keyring: KeyringRecord
          if (mnemonic) {
            secret = { type: 'hd', mnemonic }
            keyring = hdByPhrase.get(mnemonic) ?? (await this.makeKeyring(dek, secret, true))
            if (!hdByPhrase.has(mnemonic)) {
              hdByPhrase.set(mnemonic, keyring)
              vault.keyrings.push(keyring)
            }
          } else {
            secret = { type: 'key', ethPrivateKey: eth, pqSeed: await pqSeedForImportedKey(eth) }
            keyring = await this.makeKeyring(dek, secret, true)
            vault.keyrings.push(keyring)
          }
          const index = w.hdIndex ?? 0
          const account = await this.makeAccount(
            secret,
            keyring,
            w.name,
            mnemonic ? 'created' : 'imported-key',
            index
          )
          account.id = w.id
          account.createdAt = w.createdAt
          if (mnemonic) keyring.nextIndex = Math.max(keyring.nextIndex, index + 1)
          vault.accounts.push(account)
        }
        vault.selectedAccountId = vault.accounts.some((a) => a.id === legacy.currentWalletId)
          ? legacy.currentWalletId
          : vault.accounts[0]?.id

        await this.storage.set(STORAGE_KEYS.legacyBackup, legacy)
        await this.writeVault(vault)
        const check = await this.readRaw()
        if (!check || !isV2(check) || check.accounts.length !== vault.accounts.length) {
          await this.storage.set(STORAGE_KEYS.vault, legacy)
          throw new WalletError(
            'Storage upgrade could not be verified; your wallet was left unchanged'
          )
        }
        await this.storage.remove(STORAGE_KEYS.legacyBackup)
        await this.startSession(rawDek)
        return true
      } finally {
        wipe(rawDek)
      }
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isV2(raw: VaultRecord | LegacyState): raw is VaultRecord {
  return (raw as VaultRecord).version === 2
}

function assertPassword(password: string) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new WalletError('Password must be at least 8 characters')
  }
}

function normalizeKey(input: string): string {
  try {
    return normalizePrivateKey(input)
  } catch (err) {
    throw new WalletError(err instanceof KeyringError ? err.message : 'Invalid private key')
  }
}

function toView(a: AccountRecord, vault: VaultRecord): WalletAccount {
  const keyring = vault.keyrings.find((k) => k.id === a.keyringId)
  return {
    ...a,
    keyringType: keyring?.type ?? 'key',
    address: a.ethAddress,
    publicKey: a.ethPublicKey,
  }
}

function summarizeKeyring(k: KeyringRecord, vault: VaultRecord): KeyringSummary {
  return {
    id: k.id,
    type: k.type,
    label: k.label,
    accountCount: vault.accounts.filter((a) => a.keyringId === k.id).length,
    createdAt: k.createdAt,
    backedUp: k.backedUp,
  }
}
