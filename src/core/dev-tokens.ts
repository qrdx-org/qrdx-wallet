/**
 * The tokens an account runs (Developer options → Your tokens): the native tokens it deployed
 * or holds an authority over (qrdx-node docs/NATIVE_TOKENS.md), where it minted them before,
 * and the token contracts it deployed in the EVM.
 *
 * A native token's rules are the chain's: only its mint authority mints, within its cap; only
 * its freeze authority freezes; and so on for each authority. An account holds one with either
 * of its addresses (compared by ledger account). Its post-quantum key signs for its 0xPQ
 * address directly, and for its 0x address as that account's controller (submitExchangeOp
 * `actAs`, docs/ACCOUNT_CONTROL.md), which works once the account is bound.
 */

import { sameAccount } from './account-id'
import { fetchIndexedRows, type IndexedTx } from './activity'
import { ethToWei, getEvmProvider } from './ethereum'
import { formatUnitsExact } from './balances'
import { decodeString } from './simulate'
import type { ChainConfig } from './chains'
import type { ExchangeToken } from './exchange-client'

/** An authority a token can have: what TOKEN_SET_AUTHORITY calls it (`authority`). */
export type TokenPower = 'mint' | 'freeze' | 'pause' | 'metadata' | 'fee' | 'withdraw' | 'permanent_delegate'

export const POWERS: Record<TokenPower, { label: string; what: string }> = {
  mint: { label: 'Mint', what: 'Create more of it' },
  freeze: { label: 'Freeze', what: 'Freeze and thaw holders' },
  pause: { label: 'Pause', what: 'Stop and restart every transfer' },
  metadata: { label: 'Metadata', what: 'Change its name, symbol and link' },
  fee: { label: 'Fee', what: 'Change the transfer fee' },
  withdraw: { label: 'Fees', what: 'Withdraw the fees it withheld' },
  permanent_delegate: { label: 'Clawback', what: "Move or burn any holder's balance" },
}

/**
 * Who holds each of a token's authorities: an address, or null when it was renounced or never
 * given. An authority its extensions do not have (a token that cannot pause) is left out.
 */
export function authorities(t: ExchangeToken): Partial<Record<TokenPower, string | null>> {
  const e = t.extensions ?? {}
  return {
    mint: t.mint_authority,
    freeze: t.freeze_authority,
    ...(e.pausable && { pause: e.pausable.pause_authority }),
    ...(e.metadata && { metadata: e.metadata.update_authority }),
    ...(e.transfer_fee && { fee: e.transfer_fee.fee_authority, withdraw: e.transfer_fee.withdraw_authority }),
    ...(e.permanent_delegate !== undefined && { permanent_delegate: e.permanent_delegate || null }),
  }
}

/** The account's two addresses. */
export interface Holder {
  pq: string
  classic: string
}

export type Credential = 'pq' | 'classic'

/** Which of the account's addresses an address is, if either. */
export function whichOf(address: string | null | undefined, me: Holder): Credential | null {
  if (!address) return null
  if (me.pq && sameAccount(address, me.pq)) return 'pq'
  if (me.classic && sameAccount(address, me.classic)) return 'classic'
  return null
}

export interface YourToken {
  token: ExchangeToken
  /** The authorities the account holds, and with which address. */
  powers: Partial<Record<TokenPower, Credential>>
  /** The address it deployed it with, if it did. */
  creator: Credential | null
}

/** The native tokens the account deployed or holds an authority over, newest first. */
export function yourTokens(tokens: ExchangeToken[], me: Holder): YourToken[] {
  const out: YourToken[] = []
  for (const token of tokens) {
    const powers: YourToken['powers'] = {}
    for (const [power, holder] of Object.entries(authorities(token)) as [TokenPower, string | null][]) {
      const by = whichOf(holder, me)
      if (by) powers[power] = by
    }
    const creator = whichOf(token.creator, me)
    if (creator || Object.keys(powers).length) out.push({ token, powers, creator })
  }
  return out.sort((a, b) => (b.token.created_height ?? 0) - (a.token.created_height ?? 0))
}

// ─── Amounts ────────────────────────────────────────────────────────────────

/**
 * Whether `value` is an amount of a token with `decimals` places: positive, and no finer than
 * the token shows (the ledger counts 1e-18 of every token, but dust below its decimals could
 * never be shown or sent through the EVM).
 */
export function isTokenAmount(value: string, decimals: number): boolean {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!m || (m[2]?.length ?? 0) > Math.min(decimals, 18)) return false
  return ethToWei(value.trim(), 18) > 0n
}

/** How much more can be minted under the cap, as a decimal; null when uncapped or not mintable. */
export function mintable(t: ExchangeToken): string | null {
  if (!t.mint_authority || t.max_supply == null) return null
  const left = ethToWei(t.max_supply, 18) - ethToWei(t.total_supply, 18)
  return formatUnitsExact(left > 0n ? left : 0n, 18)
}

/** Whether minting `amount` stays within the token's cap. */
export function withinCap(t: ExchangeToken, amount: string): boolean {
  const left = mintable(t)
  return left === null || ethToWei(amount.trim(), 18) <= ethToWei(left, 18)
}

// ─── Where it minted before ─────────────────────────────────────────────────

export interface PastRecipient {
  address: string
  /** When it last minted there (unix seconds), how often, and how much the last time. */
  at: number
  times: number
  amount: string
}

const paramsOf = (row: IndexedTx) => (row.detail?.params ?? {}) as Record<string, unknown>

/**
 * Where the account minted a token, from its history: each recipient once (by ledger account),
 * the most recent first. A mint with no `to` went to its sender.
 */
export function pastMintRecipients(rows: IndexedTx[], token: string): PastRecipient[] {
  const out: PastRecipient[] = []
  const sorted = [...rows].sort((a, b) => b.block_height - a.block_height)
  for (const row of sorted) {
    if (row.op !== 'TOKEN_MINT' || row.status !== 'success') continue
    const p = paramsOf(row)
    if (String(p.token_address ?? '').toLowerCase() !== token.toLowerCase()) continue
    const to = String(p.to || row.sender || '')
    if (!to) continue
    const seen = out.find((r) => r.address.toLowerCase() === to.toLowerCase() || sameAccount(r.address, to))
    if (seen) seen.times += 1
    else out.push({ address: to, at: row.timestamp ?? 0, times: 1, amount: String(p.amount ?? '') })
  }
  return out
}

/** The account's indexed history on a QRDX network (both addresses); [] when the node keeps none. */
export async function accountRows(chain: ChainConfig, me: Holder): Promise<IndexedTx[]> {
  return (await fetchIndexedRows(chain, [me.pq, me.classic], 500)) ?? []
}

// ─── Token contracts it deployed ────────────────────────────────────────────

export interface ContractToken {
  address: string
  txHash: string
  height: number
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  /** What the account holds of it, both addresses together. */
  balance: bigint
}

/**
 * The token contracts the account created in the EVM: a creation it sent whose new contract
 * moved its own token (an ERC-20 minting its supply in its constructor). Newest first.
 */
export function deployedTokenContracts(rows: IndexedTx[]): { address: string; txHash: string; height: number }[] {
  return rows
    .filter((r) => r.kind === 'evm' && r.op === 'CREATE' && r.status === 'success' && (r.roles ?? []).includes('sender'))
    .flatMap((r) => {
      const created = String((r.detail as { contract_address?: string | null } | null)?.contract_address ?? '').toLowerCase()
      const moved = r.detail?.token_transfers?.some((t) => t.token.toLowerCase() === created)
      return created && moved ? [{ address: created, txHash: r.tx_hash, height: r.block_height }] : []
    })
    .sort((a, b) => b.height - a.height)
}

const word = (address: string) => address.toLowerCase().replace(/^0x/, '').padStart(64, '0')

/** A token contract's name, symbol, decimals, supply and what `holders` hold (by their EVM ids). */
export async function readTokenContract(chain: ChainConfig, c: { address: string; txHash: string; height: number }, holders: string[]): Promise<ContractToken | null> {
  const rpc = getEvmProvider(chain.id)
  const call = (data: string) => rpc.rpc<string>('eth_call', [{ to: c.address, data }, 'latest'])
  try {
    const [name, symbol, decimals, supply, ...balances] = await Promise.all([
      call('0x06fdde03').then(decodeString),
      call('0x95d89b41').then(decodeString),
      call('0x313ce567').then((h) => Number(BigInt(h))),
      call('0x18160ddd').then((h) => BigInt(h)),
      ...holders.map((h) => call(`0x70a08231${word(h)}`).then((x) => BigInt(x)).catch(() => 0n)),
    ])
    return { ...c, name, symbol, decimals, totalSupply: supply, balance: balances.reduce((s, b) => s + b, 0n) }
  } catch {
    return null
  }
}
