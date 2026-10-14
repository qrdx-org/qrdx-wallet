/**
 * What a dApp's EVM transaction would do, checked before it is signed: the call is run
 * against the latest state with `eth_call` (a revert shows its reason), and the balance
 * changes it carries are listed — the native value and fee, and the token a transfer or
 * approval names, read from the token contract.
 *
 * It is a preview of this call against the current state: a contract can behave differently
 * when the transaction is mined. Exchange operations are not EVM calls and have no dry run on
 * the node; they are described from their parameters instead (exchange-describe.ts).
 */

import { getEvmProvider, weiToEth } from './ethereum'

export interface SimulationInput {
  /** The ledger account that pays (an 0x address or a PQ account id). */
  from: string
  to: string | null
  value: string
  data: string
}

export interface BalanceChange {
  symbol: string
  /** Signed, human units ("-1.5"). */
  amount: string
  /** For token approvals: the allowance set, not a balance change. */
  approval?: { spender: string; unlimited: boolean }
}

export type Simulation =
  | { ok: true; changes: BalanceChange[] }
  | { ok: false; reason: string; changes: BalanceChange[] }

const TRANSFER = '0xa9059cbb'
const TRANSFER_FROM = '0x23b872dd'
const APPROVE = '0x095ea7b3'
const ERROR_STRING = '0x08c379a0'
const PANIC = '0x4e487b71'
const UNLIMITED = 1n << 255n

/** Run the call and work out its balance changes. Never throws: an unreachable node is a reason. */
export async function simulateTransaction(chainId: string, tx: SimulationInput, native: { symbol: string; decimals: number; fee: string }): Promise<Simulation> {
  const changes: BalanceChange[] = []
  const value = BigInt(tx.value || '0')
  const fee = BigInt(native.fee || '0')
  if (value + fee > 0n) changes.push({ symbol: native.symbol, amount: `-${weiToEth(value + fee, native.decimals)}` })
  const token = tx.to ? await tokenEffect(chainId, tx.to, tx.data, tx.from).catch(() => null) : null
  if (token) changes.push(token)

  try {
    await getEvmProvider(chainId).rpc<string>('eth_call', [{ from: tx.from, to: tx.to ?? undefined, value: toHex(value), data: tx.data || '0x' }, 'latest'])
    return { ok: true, changes }
  } catch (e) {
    return { ok: false, reason: revertReason(e), changes }
  }
}

/** The token movement or allowance a standard ERC-20 call makes, in the token's own units. */
async function tokenEffect(chainId: string, token: string, data: string, from: string): Promise<BalanceChange | null> {
  const sel = (data ?? '').slice(0, 10).toLowerCase()
  if (![TRANSFER, TRANSFER_FROM, APPROVE].includes(sel)) return null
  const word = (i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64)
  const { symbol, decimals } = await tokenMeta(chainId, token)
  if (sel === APPROVE) {
    const amount = BigInt('0x' + word(1))
    return { symbol, amount: amount >= UNLIMITED ? 'unlimited' : weiToEth(amount, decimals), approval: { spender: '0x' + word(0).slice(24), unlimited: amount >= UNLIMITED } }
  }
  if (sel === TRANSFER) return { symbol, amount: `-${weiToEth(BigInt('0x' + word(1)), decimals)}` }
  // transferFrom moves the named owner's tokens; it changes this account's balance only when it is the owner.
  const owner = '0x' + word(0).slice(24)
  if (owner.toLowerCase() !== from.toLowerCase()) return null
  return { symbol, amount: `-${weiToEth(BigInt('0x' + word(2)), decimals)}` }
}

const metaCache = new Map<string, Promise<{ symbol: string; decimals: number }>>()

/** A token contract's symbol and decimals (ERC-20 `symbol()` / `decimals()`). */
export function tokenMeta(chainId: string, token: string): Promise<{ symbol: string; decimals: number }> {
  const key = `${chainId}:${token.toLowerCase()}`
  let found = metaCache.get(key)
  if (!found) {
    const rpc = getEvmProvider(chainId)
    const call = (data: string) => rpc.rpc<string>('eth_call', [{ to: token, data }, 'latest'])
    found = Promise.all([call('0x95d89b41').then(decodeString).catch(() => 'tokens'), call('0x313ce567').then((h) => Number(BigInt(h))).catch(() => 18)]).then(([symbol, decimals]) => ({ symbol, decimals }))
    metaCache.set(key, found)
  }
  return found
}

/** An ABI-encoded string (or a bytes32 symbol, as some old tokens return). */
export function decodeString(hex: string): string {
  const body = hex.replace(/^0x/, '')
  if (body.length === 64) return bytesToText(body).replace(/\0+$/, '')
  const len = Number(BigInt('0x' + body.slice(64, 128)))
  return bytesToText(body.slice(128, 128 + len * 2))
}

/** What a failed eth_call says: Error(string), a Panic code, or the node's message. */
export function revertReason(e: unknown): string {
  const err = e as { message?: string; data?: unknown }
  const data = typeof err?.data === 'string' ? err.data : typeof (err?.data as { data?: unknown })?.data === 'string' ? ((err.data as { data: string }).data) : null
  if (data?.startsWith(ERROR_STRING)) {
    try {
      return decodeString('0x' + data.slice(10))
    } catch {
      /* fall through */
    }
  }
  if (data?.startsWith(PANIC)) return `panic 0x${BigInt('0x' + data.slice(10, 74)).toString(16)}`
  const msg = err?.message ?? String(e)
  return msg.replace(/^.*execution reverted:?\s*/i, '') || 'the call reverted'
}

function bytesToText(hex: string): string {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))
  return new TextDecoder().decode(bytes)
}

const toHex = (n: bigint) => '0x' + n.toString(16)
