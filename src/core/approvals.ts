/**
 * Token approvals: what sites and contracts may spend from the account's 0x address, and
 * revoking them.
 *
 * Found from the account's own transactions on the network's keyless explorer
 * (history.ts): every `approve`, `increaseAllowance` and `setApprovalForAll` it sent. Each
 * token and spender pair is then read back from the chain (`allowance`, `isApprovedForAll`),
 * so what is listed is what the spender can take now. Explorers that serve Blockscout's v2
 * API also give the token's and the spender's names and flag known scams.
 *
 * Not covered: approvals given by signature (EIP-2612 permits, Permit2's own allowances),
 * which leave no transaction from the account; networks with no keyless explorer; QRDX,
 * whose exchange spends from the account's balances without approvals.
 */

import { isQrdxChain, type ChainConfig } from './chains'
import { getEvmProvider } from './ethereum'
import { explorerApiFor } from './history'
import { encodeErc20Approve, erc20Allowance } from './tx-service'

export interface Approval {
  chain: ChainConfig
  /** The token contract (lower case). */
  token: string
  tokenSymbol?: string
  tokenName?: string
  decimals?: number
  /** 'amount': an ERC-20 allowance. 'all': every NFT in a collection (setApprovalForAll). */
  kind: 'amount' | 'all'
  spender: string
  spenderName?: string
  /** The explorer marks the spender as a scam. */
  spenderScam?: boolean
  /** What the spender can still take (kind 'amount'). */
  amount?: bigint
  /** Unix seconds of the latest approval the account sent for this pair. */
  approvedAt: number
}

const APPROVE = '0x095ea7b3'
const INCREASE_ALLOWANCE = '0x39509351'
const SET_APPROVAL_FOR_ALL = '0xa22cb465'
const IS_APPROVED_FOR_ALL = '0xe985e9c5'
const SYMBOL = '0x95d89b41'
const DECIMALS = '0x313ce567'

/** At or above this an allowance is shown as unlimited: max uint160 (Permit2's) and max uint256 both are. */
export const UNLIMITED = (1n << 160n) - 1n
/** Pages of 1,000 transactions read per network, newest first. */
const MAX_PAGES = 5
const PARALLEL_READS = 6

/** Whether the wallet can list approvals on this network. */
export function approvalsSupported(chain: ChainConfig): boolean {
  return chain.family !== 'bitcoin' && chain.family !== 'solana' && !isQrdxChain(chain) && !!explorerApiFor(chain.id)
}

const pad = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0')
const word = (input: string, i: number) => input.slice(10 + i * 64, 10 + (i + 1) * 64)
const addressAt = (input: string, i: number) => `0x${word(input, i).slice(24)}`

interface ExplorerTx {
  from: string
  to: string
  input: string
  isError?: string
  txreceipt_status?: string
  timeStamp: string
}

/** The (token, spender, kind) pairs the account approved, with when it last did. */
export function approvalPairs(txs: ExplorerTx[], owner: string): Map<string, { token: string; spender: string; kind: Approval['kind']; at: number }> {
  const me = owner.toLowerCase()
  const pairs = new Map<string, { token: string; spender: string; kind: Approval['kind']; at: number }>()
  for (const tx of txs) {
    if (tx.from?.toLowerCase() !== me || !tx.to || tx.isError === '1' || tx.txreceipt_status === '0') continue
    const selector = tx.input?.slice(0, 10)
    const kind = selector === SET_APPROVAL_FOR_ALL ? 'all' : selector === APPROVE || selector === INCREASE_ALLOWANCE ? 'amount' : null
    if (!kind || tx.input.length < 10 + 64 * 2) continue
    const token = tx.to.toLowerCase()
    const spender = addressAt(tx.input, 0)
    const key = `${token}:${spender}:${kind}`
    const at = Number(tx.timeStamp) || 0
    if ((pairs.get(key)?.at ?? -1) < at) pairs.set(key, { token, spender, kind, at })
  }
  return pairs
}

async function accountTransactions(api: string, owner: string): Promise<ExplorerTx[]> {
  const out: ExplorerTx[] = []
  const url = (page: number) => `${api}?module=account&action=txlist&address=${owner}&startblock=0&endblock=99999999&page=${page}&offset=1000&sort=desc`
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res = await fetch(url(page), { signal: AbortSignal.timeout(30_000) })
    // Keyless explorers limit requests per second: wait and ask again.
    for (let retry = 0; res.status === 429 && retry < 3; retry++) {
      await new Promise((r) => setTimeout(r, 1500 * (retry + 1)))
      res = await fetch(url(page), { signal: AbortSignal.timeout(30_000) })
    }
    if (!res.ok) throw new Error(`Explorer error (HTTP ${res.status})`)
    const body = (await res.json()) as { status: string; message?: string; result: ExplorerTx[] | string }
    if (!Array.isArray(body.result)) {
      if (body.message?.startsWith('No transactions')) break
      throw new Error(typeof body.result === 'string' ? body.result : 'Explorer error')
    }
    out.push(...body.result)
    if (body.result.length < 1000) break
  }
  return out
}

/** Blockscout's v2 API beside its Etherscan-compatible one; null for other explorers. */
function blockscoutV2(api: string): string | null {
  return /blockscout\.com\/api$|explorer\.optimism\.io\/api$/.test(api) ? `${api}/v2` : null
}

async function v2<T>(base: string | null, path: string): Promise<T | null> {
  if (!base) return null
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(15_000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

function decodeString(hex: string | null): string | undefined {
  if (!hex || hex === '0x') return undefined
  const body = hex.slice(2)
  try {
    // ABI string (offset, length, bytes), or a bytes32 (older tokens such as MKR).
    const bytes = body.length >= 192 ? body.slice(128, 128 + Number(BigInt(`0x${body.slice(64, 128)}`)) * 2) : body
    const text = new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) ?? [], (b) => parseInt(b, 16))).replace(/\0+$/, '')
    return text && /^[\x20-\x7e]+$/.test(text) ? text : undefined
  } catch {
    return undefined
  }
}

async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await run(items[i])
      }
    })
  )
  return out
}

/**
 * The approvals still open on a network, newest first. Null when the wallet cannot list them
 * there (approvalsSupported); throws when the explorer cannot be read.
 */
export async function fetchApprovals(chain: ChainConfig, owner: string): Promise<Approval[] | null> {
  const api = approvalsSupported(chain) ? explorerApiFor(chain.id)! : null
  if (!api) return null
  const pairs = [...approvalPairs(await accountTransactions(api, owner), owner).values()]
  const provider = getEvmProvider(chain.id)
  const call = (to: string, data: string) => provider.rpc<string>('eth_call', [{ to, data }, 'latest']).catch(() => null)

  // What each spender can take now. An ERC-721 approve(to, tokenId) shares approve's selector;
  // its allowance() call fails, and a single-NFT approval ends when the NFT moves anyway.
  const live = await pool(pairs, PARALLEL_READS, async (p) => {
    if (p.kind === 'all') {
      const out = await call(p.token, `${IS_APPROVED_FOR_ALL}${pad(owner)}${pad(p.spender)}`)
      return out && out !== '0x' && BigInt(out) !== 0n ? { ...p } : null
    }
    const amount = await erc20Allowance(chain, p.token, owner, p.spender).catch(() => 0n)
    return amount > 0n ? { ...p, amount } : null
  })
  const open = live.filter((p): p is NonNullable<typeof p> => !!p)

  const base = blockscoutV2(api)
  const tokens = new Map<string, { symbol?: string; name?: string; decimals?: number }>()
  const spenders = new Map<string, { name?: string; scam?: boolean }>()
  await Promise.all([
    pool([...new Set(open.map((p) => p.token))], PARALLEL_READS, async (token) => {
      const listed = chain.tokens.find((t) => t.address.toLowerCase() === token)
      if (listed) return tokens.set(token, { symbol: listed.symbol, name: listed.name, decimals: listed.decimals })
      const info = await v2<{ symbol?: string | null; name?: string | null; decimals?: string | null }>(base, `/tokens/${token}`)
      if (info?.symbol) return tokens.set(token, { symbol: info.symbol, name: info.name ?? undefined, decimals: info.decimals ? Number(info.decimals) : undefined })
      const [symbol, decimals] = await Promise.all([call(token, SYMBOL), call(token, DECIMALS)])
      tokens.set(token, { symbol: decodeString(symbol), decimals: decimals && decimals !== '0x' ? Number(BigInt(decimals)) : undefined })
    }),
    pool([...new Set(open.map((p) => p.spender))], PARALLEL_READS, async (spender) => {
      const info = await v2<{ name?: string | null; is_scam?: boolean; ens_domain_name?: string | null }>(base, `/addresses/${spender}`)
      spenders.set(spender, { name: info?.name ?? info?.ens_domain_name ?? undefined, scam: info?.is_scam || undefined })
    }),
  ])

  return open
    .map((p) => ({
      chain,
      token: p.token,
      tokenSymbol: tokens.get(p.token)?.symbol,
      tokenName: tokens.get(p.token)?.name,
      decimals: tokens.get(p.token)?.decimals,
      kind: p.kind,
      spender: p.spender,
      spenderName: spenders.get(p.spender)?.name,
      spenderScam: spenders.get(p.spender)?.scam,
      amount: 'amount' in p ? p.amount : undefined,
      approvedAt: p.at,
    }))
    .sort((a, b) => Number(!!b.spenderScam) - Number(!!a.spenderScam) || b.approvedAt - a.approvedAt)
}

/** The transaction that ends an approval: approve(spender, 0), or setApprovalForAll(operator, false). */
export function revokeCall(a: Pick<Approval, 'token' | 'spender' | 'kind'>): { to: string; data: string } {
  return { to: a.token, data: a.kind === 'all' ? `${SET_APPROVAL_FOR_ALL}${pad(a.spender)}${pad('0x0')}` : encodeErc20Approve(a.spender, 0n) }
}
