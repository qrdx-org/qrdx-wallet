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

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { getEvmProvider, weiToEth } from './ethereum'
import { bytesToHex as bytesToHexString } from './crypto'
import { formatUnitsExact } from './balances'

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
  | { ok: true; changes: BalanceChange[]; action?: string }
  | { ok: false; reason: string; changes: BalanceChange[]; action?: string }

/**
 * The QRDX NFT market (qrdx-trade contracts/QRDXNFTMarket.sol): its calls move tokens through
 * allowances the buyer gave it, so what they spend is named here rather than read from the
 * call's value. Selectors of buy, list and delist.
 */
const MARKET = {
  buy: 'buy(address,uint256,address,uint256)',
  list: 'list(address,uint256,address,uint256)',
  delist: 'delist(address,uint256)',
}

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
  const market = tx.to ? await marketEffect(chainId, tx.data).catch(() => null) : null
  if (market) changes.push(...market.changes)
  const action = market?.action

  const provider = getEvmProvider(chainId)
  try {
    await provider.rpc<string>('eth_call', [{ from: tx.from, to: tx.to ?? undefined, value: toHex(value), data: tx.data || '0x' }, 'latest'])
    return { ok: true, changes, action }
  } catch (e) {
    // QRDX nodes run eth_call without the value (qrdx-node main.py eth_call_handler), so a call
    // that pays can revert there and still succeed. Their gas estimate does carry the value, and
    // answers at the block limit or above for a call that fails at any gas.
    if (value > 0n) {
      const gas = await provider
        .rpc<string>('eth_estimateGas', [{ from: tx.from, ...(tx.to ? { to: tx.to } : {}), value: toHex(value), data: tx.data || '0x' }])
        .then((g) => BigInt(g))
        .catch(() => null)
      if (gas !== null && gas < 1_000_000n) return { ok: true, changes, action }
    }
    return { ok: false, reason: revertReason(e), changes, action }
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

const selectorOf = (signature: string) => '0x' + bytesToHexString(keccak256(new TextEncoder().encode(signature))).slice(0, 8)

/** A call to the NFT market, in words, with what it spends: a buy pays its price in QRDX or a token, and receives the NFT. */
async function marketEffect(chainId: string, data: string): Promise<{ action: string; changes: BalanceChange[] } | null> {
  const sel = (data ?? '').slice(0, 10).toLowerCase()
  const kind = (Object.keys(MARKET) as (keyof typeof MARKET)[]).find((k) => selectorOf(MARKET[k]) === sel)
  if (!kind) return null
  const word = (i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64)
  const collection = '0x' + word(0).slice(24)
  const tokenId = BigInt('0x' + word(1)).toString()
  const name = await getEvmProvider(chainId)
    .rpc<{ name?: string } | null>('exchange_getNftCollection', [collection])
    .then((c) => c?.name ?? null)
    .catch(() => null)
  const nft = `${name ?? collection.slice(0, 10) + '…'} #${tokenId}`
  if (kind === 'delist') return { action: `Cancel the listing of ${nft}`, changes: [] }
  const currency = '0x' + word(2).slice(24)
  const native = /^0x0{40}$/.test(currency)
  const price = BigInt('0x' + word(3))
  const { symbol, decimals } = native ? { symbol: 'QRDX', decimals: 18 } : await tokenMeta(chainId, currency)
  const amount = formatUnitsExact(price, decimals)
  if (kind === 'list') return { action: `List ${nft} for ${amount} ${symbol}`, changes: [] }
  return {
    action: `Buy ${nft} for ${amount} ${symbol}`,
    // A QRDX price travels as the call's value (already counted); a token's through the allowance.
    changes: [...(native ? [] : [{ symbol, amount: `-${amount}` }]), { symbol: nft, amount: '+1 NFT' }],
  }
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
  const data =
    typeof err?.data === 'string'
      ? err.data
      : typeof (err?.data as { data?: unknown })?.data === 'string'
        ? (err.data as { data: string }).data
        : bytesLiteralHex(err?.message ?? '')
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

/** Revert data a QRDX node prints in its message as a Python bytes literal ("Call failed: b'x\\x8aho'"), as hex. */
export function bytesLiteralHex(message: string): string | null {
  const m = /b(['"])((?:\\.|(?!\1).)*)\1/.exec(message)
  if (!m) return null
  const out: number[] = []
  const body = m[2]
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      out.push(body.charCodeAt(i) & 0xff)
      continue
    }
    const n = body[++i]
    if (n === 'x') {
      out.push(parseInt(body.slice(i + 1, i + 3), 16))
      i += 2
    } else out.push({ n: 10, r: 13, t: 9, '0': 0, '\\': 92, "'": 39, '"': 34 }[n] ?? n.charCodeAt(0))
  }
  return '0x' + out.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bytesToText(hex: string): string {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))
  return new TextDecoder().decode(bytes)
}

const toHex = (n: bigint) => '0x' + n.toString(16)
