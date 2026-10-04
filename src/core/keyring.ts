/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Keyrings: from a stored secret to an account's key pair
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Two keyring kinds, both stored encrypted in the vault:
 *
 *    hd   — one BIP-39 recovery phrase, many accounts. Account i is
 *           secp256k1 at m/44'/60'/0'/0/i and ML-DSA-65 from the phrase's
 *           seed under the versioned domain tag at index i (./pq.ts). Backing
 *           up the phrase once backs up every account derived from it.
 *
 *    key  — one imported secp256k1 key plus its PQ seed. For a raw key import
 *           the PQ seed is derived from the secp256k1 key (reproducible, but
 *           only classically secure — the UI says so). A keystore exported by
 *           this wallet carries the real PQ seed, which is stored as-is.
 *
 *  Nothing here touches storage; the wallet manager decrypts the secret and
 *  calls in, then drops the result.
 */

import {
  ethKeyPairFromPrivateKey,
  generateMnemonic,
  isValidMnemonic,
  mnemonicToEthKeyPair,
  hexToBytes,
  type EthKeyPair,
} from './crypto'
import { pqKeyPairFromMnemonic, pqKeyPairFromSeed, type PqKeyPair } from './pq'
import { toAccountId } from './account-id'

export type KeyringType = 'hd' | 'key'

export type KeyringSecret =
  { type: 'hd'; mnemonic: string } | { type: 'key'; ethPrivateKey: string; pqSeed: string }

/** Everything about an account that is safe to store unencrypted. */
export interface DerivedAccountPublic {
  ethAddress: string
  ethPublicKey: string
  pqAddress: string
  pqPublicKey: string
  pqFingerprint: string
  /** Ledger key of the PQ credential — what `eth_getBalance` and contracts see. */
  pqAccountId: string
}

export interface DerivedAccountKeys extends DerivedAccountPublic {
  ethPrivateKey: string
  /** 32-byte ML-DSA seed, hex. */
  pqSeed: string
}

export class KeyringError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyringError'
  }
}

/** Normalise a phrase the way BIP-39 compares it. */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ')
}

export function newMnemonic(words: 12 | 24 = 12): string {
  return generateMnemonic(words === 24 ? 256 : 128)
}

/** Validate and normalise a 32-byte hex private key. */
export function normalizePrivateKey(input: string): string {
  const clean = input.trim().replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new KeyringError(
      'A private key is 64 hexadecimal characters (optionally prefixed with 0x)'
    )
  }
  try {
    ethKeyPairFromPrivateKey(clean)
  } catch {
    throw new KeyringError('This is not a valid secp256k1 private key')
  }
  return clean
}

function describe(eth: EthKeyPair, pq: PqKeyPair): DerivedAccountKeys {
  return {
    ethAddress: eth.address,
    ethPublicKey: eth.publicKey,
    ethPrivateKey: eth.privateKey,
    pqAddress: pq.address,
    pqPublicKey: pq.publicKey,
    pqFingerprint: pq.fingerprint,
    pqSeed: pq.privateKey,
    pqAccountId: toAccountId(pq.address),
  }
}

/** Derive account `index` of an HD keyring. */
export async function deriveHdAccount(
  mnemonic: string,
  index: number
): Promise<DerivedAccountKeys> {
  const phrase = normalizeMnemonic(mnemonic)
  if (!isValidMnemonic(phrase)) throw new KeyringError('Invalid recovery phrase')
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31)
    throw new KeyringError('Invalid account index')
  return describe(mnemonicToEthKeyPair(phrase, index), await pqKeyPairFromMnemonic(phrase, index))
}

/** PQ seed for a raw imported key: deterministic, domain-separated, classically secure only. */
export async function pqSeedForImportedKey(ethPrivateKey: string): Promise<string> {
  return (await pqKeyPairFromSeed(hexToBytes(ethPrivateKey))).privateKey
}

/** Keys for a `key` keyring. */
export async function deriveKeyAccount(
  ethPrivateKey: string,
  pqSeed: string
): Promise<DerivedAccountKeys> {
  return describe(
    ethKeyPairFromPrivateKey(ethPrivateKey),
    await pqKeyPairFromSeed(hexToBytes(pqSeed))
  )
}

/** Derive any account from its keyring secret. */
export async function deriveAccount(secret: KeyringSecret, index = 0): Promise<DerivedAccountKeys> {
  return secret.type === 'hd'
    ? deriveHdAccount(secret.mnemonic, index)
    : deriveKeyAccount(secret.ethPrivateKey, secret.pqSeed)
}

/** Strip private material. */
export function publicPart(keys: DerivedAccountKeys): DerivedAccountPublic {
  const { ethPrivateKey: _e, pqSeed: _p, ...pub } = keys
  return pub
}
