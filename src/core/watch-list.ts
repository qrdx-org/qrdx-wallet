/**
 * Watched addresses: any address's portfolio, followed read-only. Nothing here can sign; a
 * watched address is not an account and has no key in the vault.
 *
 * The kind of address decides the networks read: a 0x address on every EVM network and QRDX
 * (as a classic address), a 0xPQ address on QRDX, a Bitcoin address on its own network, a
 * Solana address on Solana. Kept per browser, like trusted tokens.
 */

import { chainFamily, isQrdxChain, type ChainConfig } from './chains'
import { isValidEthAddress, isValidPqAddress } from './address'
import { toAccountId } from './account-id'
import { isBtcAddress } from './bitcoin'
import { isSolAddress } from './solana'
import type { ChainAddresses } from './other-chains'
import type { WalletAccount } from './types'

export interface WatchedAddress {
  address: string
  label: string
  addedAt: number
}

export type WatchKind = 'evm' | 'pq' | 'bitcoin' | 'bitcoin-testnet' | 'solana'

const KEY = 'qrdx_watched_addresses'
const listeners = new Set<() => void>()
let cache: WatchedAddress[] | null = null

/** What kind of address this is, or null when the wallet cannot follow it. */
export function watchKind(address: string): WatchKind | null {
  const a = address.trim()
  if (isValidPqAddress(a)) return 'pq'
  if (isValidEthAddress(a)) return 'evm'
  if (isBtcAddress(a, 'mainnet')) return 'bitcoin'
  if (isBtcAddress(a, 'testnet')) return 'bitcoin-testnet'
  if (isSolAddress(a)) return 'solana'
  return null
}

export function watchedAddresses(): WatchedAddress[] {
  if (!cache) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      cache = Array.isArray(raw) ? raw.filter((w) => w && typeof w.address === 'string' && watchKind(w.address)) : []
    } catch {
      cache = []
    }
  }
  return cache
}

function save(list: WatchedAddress[]): void {
  cache = list
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* watched for this page only */
  }
  listeners.forEach((l) => l())
}

const same = (a: string, b: string) => (watchKind(a) === 'solana' || watchKind(a)?.startsWith('bitcoin') ? a === b : a.toLowerCase() === b.toLowerCase())

export function addWatched(address: string, label: string): WatchedAddress {
  const a = address.trim()
  if (!watchKind(a)) throw new Error('Not an address the wallet can follow')
  const entry = { address: a, label: label.trim() || `${a.slice(0, 6)}…${a.slice(-4)}`, addedAt: Date.now() }
  save([...watchedAddresses().filter((w) => !same(w.address, a)), entry])
  return entry
}

export function removeWatched(address: string): void {
  save(watchedAddresses().filter((w) => !same(w.address, address)))
}

export function renameWatched(address: string, label: string): void {
  save(watchedAddresses().map((w) => (same(w.address, address) ? { ...w, label: label.trim() || w.label } : w)))
}

export function onWatchChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The networks a watched address is read on. */
export function watchChains(address: string, networks: ChainConfig[]): ChainConfig[] {
  const kind = watchKind(address)
  return networks.filter((c) => {
    const family = chainFamily(c)
    if (kind === 'evm') return family === 'evm'
    if (kind === 'pq') return isQrdxChain(c)
    if (kind === 'bitcoin') return family === 'bitcoin' && !c.isTestnet
    if (kind === 'bitcoin-testnet') return family === 'bitcoin' && !!c.isTestnet
    if (kind === 'solana') return family === 'solana'
    return false
  })
}

/**
 * A stand-in account for reading balances and history (portfolio.ts, portfolio-history.ts):
 * the watched address in its slot, every other slot empty. It holds no key.
 */
export function watchAccount(address: string): { account: WalletAccount; addresses: ChainAddresses | null } {
  const a = address.trim()
  const kind = watchKind(a)
  const eth = kind === 'evm' ? a : ''
  const pq = kind === 'pq' ? a : ''
  const account = {
    id: `watch:${a}`,
    name: a,
    keyringId: '',
    keyringType: 'hd',
    source: 'imported-key',
    createdAt: 0,
    ethAddress: eth,
    ethPublicKey: '',
    pqAddress: pq,
    pqPublicKey: '',
    pqFingerprint: '',
    pqAccountId: pq ? toAccountId(pq) : '',
    address: eth,
    publicKey: '',
  } as WalletAccount
  const addresses: ChainAddresses | null =
    kind === 'bitcoin' || kind === 'bitcoin-testnet' || kind === 'solana'
      ? { bitcoin: { mainnet: kind === 'bitcoin' ? a : '', testnet: kind === 'bitcoin-testnet' ? a : '' }, solana: kind === 'solana' ? a : null }
      : null
  return { account, addresses }
}
