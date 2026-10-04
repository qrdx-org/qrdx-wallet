/**
 * Tokens the user (or a dApp via `wallet_watchAsset`, after approval) asked
 * the wallet to track, per chain. Merged with each chain's built-in token list
 * when balances are read.
 *
 * Token symbols are not unique on QRDX (docs/NATIVE_TOKENS.md), so entries are
 * keyed by contract address and the UI always shows it.
 */

import type { IStorage } from './storage'
import type { ChainToken } from './chains'

const KEY = 'qrdx_watched_tokens'
const MAX_PER_CHAIN = 200

export class WatchedTokens {
  constructor(private readonly storage: IStorage) {}

  private async all(): Promise<Record<string, ChainToken[]>> {
    return (await this.storage.get<Record<string, ChainToken[]>>(KEY)) ?? {}
  }

  async list(chainSlug: string): Promise<ChainToken[]> {
    return (await this.all())[chainSlug] ?? []
  }

  async add(chainSlug: string, token: ChainToken): Promise<void> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(token.address))
      throw new Error('Token address must be a 0x contract address')
    if (!token.symbol || token.symbol.length > 16)
      throw new Error('Token symbol must be 1–16 characters')
    if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36)
      throw new Error('Invalid token decimals')
    const all = await this.all()
    const list = (all[chainSlug] ?? []).filter(
      (t) => t.address.toLowerCase() !== token.address.toLowerCase()
    )
    if (list.length >= MAX_PER_CHAIN) throw new Error('Too many tracked tokens on this network')
    all[chainSlug] = [
      ...list,
      {
        address: token.address,
        symbol: token.symbol,
        name: token.name || token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
      },
    ]
    await this.storage.set(KEY, all)
  }

  async remove(chainSlug: string, address: string): Promise<void> {
    const all = await this.all()
    all[chainSlug] = (all[chainSlug] ?? []).filter(
      (t) => t.address.toLowerCase() !== address.toLowerCase()
    )
    await this.storage.set(KEY, all)
  }
}
