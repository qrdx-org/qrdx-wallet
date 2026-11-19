/**
 * Solana: one ed25519 address per account, at m/44'/501'/i'/0' (SLIP-0010), the
 * path Phantom and Solflare restore from the same recovery phrase. Accounts made
 * from an imported key have no Solana address: there is no phrase to derive it from.
 *
 * Transactions are compiled here as legacy messages (SOL transfers, and SPL
 * transfers that create the recipient's token account when it has none) and the
 * wallet manager signs the message bytes.
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { mnemonicToSeedSync } from 'ethereum-cryptography/bip39/index.js'
import { base58, base64 } from '@scure/base'
import type { KeyringSecret } from './keyring'
import { CHAINS } from './chains'

export type SolNetwork = 'mainnet' | 'devnet'

/**
 * Endpoints, tried in order. Solana's own mainnet endpoint refuses requests from web pages
 * (any Origin header), so mainnet starts with publicnode, which serves everything the wallet
 * uses except `getTokenAccountsByOwner` (see splHoldings).
 */
export const SOL_RPCS: Record<SolNetwork, string[]> = {
  mainnet: ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'],
  devnet: ['https://api.devnet.solana.com'],
}

export const SOL_EXPLORER = (network: SolNetwork, path: string) =>
  `https://explorer.solana.com/${path}${network === 'devnet' ? '?cluster=devnet' : ''}`

export const SYSTEM_PROGRAM = '11111111111111111111111111111111'
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'

/** A new account must hold at least this to exist (rent exemption for 0 bytes). */
export const SOL_RENT_MINIMUM = 890_880n

/** Well-known mints (the Solana network's token list), so a balance reads as "USDC" and not as an address. */
export const KNOWN_MINTS: Record<string, { symbol: string; name: string }> = Object.fromEntries(
  CHAINS.solana.tokens.filter((t) => t.address).map((t) => [t.address, { symbol: t.symbol, name: t.name }])
)

export class SolanaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SolanaError'
  }
}

// ─── Keys ───────────────────────────────────────────────────────────────────

/** SLIP-0010 ed25519 derivation; every level is hardened. */
function slip10(seed: Uint8Array, path: number[]): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  for (const index of path) {
    const data = new Uint8Array(37)
    data.set(I.slice(0, 32), 1)
    new DataView(data.buffer).setUint32(33, (index | 0x80000000) >>> 0)
    I = hmac(sha512, I.slice(32), data)
  }
  return I.slice(0, 32)
}

/** The account's 32-byte ed25519 secret, or null for an imported key. */
export function solPrivateKey(secret: KeyringSecret, index: number): Uint8Array | null {
  if (secret.type !== 'hd') return null
  return slip10(mnemonicToSeedSync(secret.mnemonic.trim().toLowerCase()), [44, 501, index, 0])
}

export function solAddressOf(privateKey: Uint8Array): string {
  return base58.encode(ed25519.getPublicKey(privateKey))
}

export function isSolAddress(address: string): boolean {
  try {
    return base58.decode(address.trim()).length === 32
  } catch {
    return false
  }
}

/**
 * Sign compiled message bytes (legacy or v0), refusing a message whose fee payer is another
 * account. A v0 message starts with 0x80, then the same header.
 */
export function signSolMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const own = ed25519.getPublicKey(privateKey)
  const at = message[0] & 0x80 ? 1 : 0
  // Header (3 bytes), the account count (compact-u16, 1 byte below 128), then the fee payer.
  const payer = message.slice(at + 4, at + 36)
  if (message[at] < 1 || base58.encode(payer) !== base58.encode(own)) {
    throw new SolanaError('This transaction is not paid for by this account')
  }
  return ed25519.sign(message, privateKey)
}

function readCompactU16(bytes: Uint8Array, at: number): { value: number; size: number } {
  let value = 0
  for (let i = 0; i < 3; i++) {
    const b = bytes[at + i]
    value |= (b & 0x7f) << (7 * i)
    if (!(b & 0x80)) return { value, size: i + 1 }
  }
  throw new SolanaError('Malformed transaction')
}

/** A serialized transaction (from an aggregator) as its signature count and message. */
export function splitTransaction(tx: Uint8Array): { signatures: number; message: Uint8Array } {
  const { value, size } = readCompactU16(tx, 0)
  return { signatures: value, message: tx.slice(size + 64 * value) }
}

/** The transaction with `signature` in the fee payer's slot (the first). */
export function withPayerSignature(tx: Uint8Array, signature: Uint8Array): Uint8Array {
  const { size } = readCompactU16(tx, 0)
  const out = tx.slice()
  out.set(signature, size)
  return out
}

// ─── RPC ────────────────────────────────────────────────────────────────────

let rpcId = 0
/** Refusals that mean "not here", so the next endpoint is worth asking. */
const BLOCKED = /access forbidden|request blocked|api key|too many requests/i

export async function solRpc<T>(network: SolNetwork, method: string, params: unknown[] = []): Promise<T> {
  let last: unknown
  for (const url of SOL_RPCS[network]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 429) throw new SolanaError('The Solana network is busy; try again in a moment')
      const body = (await res.json()) as { result?: T; error?: { message: string } }
      if (body.error) {
        last = new SolanaError(body.error.message)
        if (BLOCKED.test(body.error.message)) continue
        throw last
      }
      return body.result as T
    } catch (err) {
      if (err instanceof SolanaError && !BLOCKED.test(err.message)) throw err
      last = err
    }
  }
  throw last instanceof Error ? last : new SolanaError('Could not reach the Solana network')
}

export async function solBalance(network: SolNetwork, address: string): Promise<bigint> {
  const r = await solRpc<{ value: number }>(network, 'getBalance', [address, { commitment: 'confirmed' }])
  return BigInt(r.value)
}

export interface SplHolding {
  mint: string
  symbol: string
  name: string
  decimals: number
  amount: bigint
  /** The token account holding the most of it, and its program. */
  account: string
  program: string
}

interface ParsedTokenAccount {
  pubkey: string
  account: { owner: string; data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } }
}

/**
 * Every token account the owner has. Where the endpoint refuses `getTokenAccountsByOwner`
 * (public mainnet endpoints do), it reads the owner's associated token account for each
 * well-known mint instead: what most wallets hold, though not every token.
 */
export async function splHoldings(network: SolNetwork, owner: string): Promise<SplHolding[]> {
  let lists: ParsedTokenAccount[][]
  try {
    lists = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        solRpc<{ value: ParsedTokenAccount[] }>(network, 'getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).then((r) => r.value)
      )
    )
  } catch {
    const atas = Object.keys(KNOWN_MINTS).map((mint) => associatedTokenAddress(owner, mint))
    const r = await solRpc<{ value: (ParsedTokenAccount['account'] | null)[] }>(network, 'getMultipleAccounts', [atas, { encoding: 'jsonParsed', commitment: 'confirmed' }])
    lists = [r.value.flatMap((account, i) => (account?.data?.parsed ? [{ pubkey: atas[i], account }] : []))]
  }
  const byMint = new Map<string, SplHolding & { best: bigint }>()
  for (const a of lists.flat()) {
    const { mint, tokenAmount } = a.account.data.parsed.info
    const amount = BigInt(tokenAmount.amount)
    const known = KNOWN_MINTS[mint]
    const cur = byMint.get(mint) ?? {
      mint,
      symbol: known?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      name: known?.name ?? 'Unknown token',
      decimals: tokenAmount.decimals,
      amount: 0n,
      account: a.pubkey,
      program: a.account.owner,
      best: -1n,
    }
    cur.amount += amount
    if (amount > cur.best) Object.assign(cur, { best: amount, account: a.pubkey, program: a.account.owner })
    byMint.set(mint, cur)
  }
  return [...byMint.values()].filter((h) => h.amount > 0n).map(({ best: _b, ...h }) => h)
}

export interface SolHistoryItem {
  signature: string
  time?: number
  failed: boolean
  confirmed: boolean
  /** Net change to this address: lamports, or the token's raw units when `mint` is set. */
  delta: bigint
  mint?: string
  decimals?: number
  fee: bigint
  counterparty?: string
  /** The account's SOL balance change, fees included (what the value history replays). */
  lamports: bigint
}

interface TokenBalance {
  owner?: string
  mint: string
  uiTokenAmount: { amount: string; decimals: number }
}

interface ParsedTx {
  meta: {
    err: unknown
    fee: number
    preBalances: number[]
    postBalances: number[]
    preTokenBalances?: TokenBalance[]
    postTokenBalances?: TokenBalance[]
  } | null
  transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[] } }
  blockTime?: number
}

/** The latest transactions touching `address`, with what each moved for it. */
export async function solHistory(network: SolNetwork, address: string, limit = 12): Promise<SolHistoryItem[]> {
  const sigs = await solRpc<{ signature: string; blockTime?: number; err: unknown; confirmationStatus?: string }[]>(network, 'getSignaturesForAddress', [address, { limit }])
  const out: SolHistoryItem[] = []
  // One at a time: the public endpoint rate-limits bursts.
  for (const s of sigs) {
    const base = { signature: s.signature, time: s.blockTime ?? undefined, failed: !!s.err, confirmed: s.confirmationStatus === 'finalized' || s.confirmationStatus === 'confirmed' }
    const tx = await solRpc<ParsedTx | null>(network, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]).catch(() => null)
    if (!tx?.meta) {
      out.push({ ...base, delta: 0n, fee: 0n, lamports: 0n })
      continue
    }
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey)
    const i = keys.indexOf(address)
    const payer = keys[0] === address
    const tokenDelta = (() => {
      const mine = (l?: TokenBalance[]) => (l ?? []).filter((b) => b.owner === address)
      const pre = mine(tx.meta!.preTokenBalances)
      const post = mine(tx.meta!.postTokenBalances)
      for (const p of post.length ? post : pre) {
        const before = BigInt(pre.find((b) => b.mint === p.mint)?.uiTokenAmount.amount ?? '0')
        const after = BigInt(post.find((b) => b.mint === p.mint)?.uiTokenAmount.amount ?? '0')
        if (after !== before) return { mint: p.mint, decimals: p.uiTokenAmount.decimals, delta: after - before }
      }
      return null
    })()
    const fee = BigInt(tx.meta.fee)
    const solDelta = i >= 0 ? BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]) : 0n
    const other = keys.find((k, n) => n > 0 && k !== address && !k.startsWith('1111') && ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM, ATA_PROGRAM].includes(k))
    out.push(
      tokenDelta
        ? { ...base, ...tokenDelta, fee: payer ? fee : 0n, counterparty: other, lamports: solDelta }
        : // What was sent or received, not counting the fee this account paid.
          { ...base, delta: payer ? solDelta + fee : solDelta, fee: payer ? fee : 0n, counterparty: other, lamports: solDelta }
    )
  }
  return out
}

// ─── Building transactions ──────────────────────────────────────────────────

interface Meta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}
interface Instruction {
  programId: string
  keys: Meta[]
  data: Uint8Array
}

function compactU16(n: number): number[] {
  const out: number[] = []
  for (;;) {
    let b = n & 0x7f
    n >>= 7
    if (n) b |= 0x80
    out.push(b)
    if (!n) return out
  }
}

/** Compile a legacy message: signers first, writable before read-only, the payer first of all. */
export function compileMessage(payer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, Meta>()
  const add = (m: Meta) => {
    const cur = metas.get(m.pubkey)
    metas.set(m.pubkey, cur ? { pubkey: m.pubkey, isSigner: cur.isSigner || m.isSigner, isWritable: cur.isWritable || m.isWritable } : m)
  }
  add({ pubkey: payer, isSigner: true, isWritable: true })
  for (const ix of instructions) {
    ix.keys.forEach(add)
    add({ pubkey: ix.programId, isSigner: false, isWritable: false })
  }
  const rank = (m: Meta) => (m.pubkey === payer ? -1 : m.isSigner ? (m.isWritable ? 0 : 1) : m.isWritable ? 2 : 3)
  const ordered = [...metas.values()].sort((a, b) => rank(a) - rank(b))
  const index = new Map(ordered.map((m, i) => [m.pubkey, i]))
  const header = [
    ordered.filter((m) => m.isSigner).length,
    ordered.filter((m) => m.isSigner && !m.isWritable).length,
    ordered.filter((m) => !m.isSigner && !m.isWritable).length,
  ]
  const bytes: number[] = [...header, ...compactU16(ordered.length)]
  for (const m of ordered) bytes.push(...base58.decode(m.pubkey))
  bytes.push(...base58.decode(recentBlockhash))
  bytes.push(...compactU16(instructions.length))
  for (const ix of instructions) {
    bytes.push(index.get(ix.programId)!, ...compactU16(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)!))
    bytes.push(...compactU16(ix.data.length), ...ix.data)
  }
  return new Uint8Array(bytes)
}

/** A signed transaction from a message and its single signature, base64 for sendTransaction. */
export function serializeSigned(message: Uint8Array, signature: Uint8Array): string {
  return base64.encode(new Uint8Array([1, ...signature, ...message]))
}

function u64le(n: bigint): number[] {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, n, true)
  return [...b]
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes)
    return true
  } catch {
    return false
  }
}

/** A program-derived address (findProgramAddress). */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = base58.decode(programId)
  const marker = new TextEncoder().encode('ProgramDerivedAddress')
  for (let bump = 255; bump >= 0; bump--) {
    const h = sha256(new Uint8Array([...seeds.flatMap((s) => [...s]), bump, ...program, ...marker]))
    if (!isOnCurve(h)) return base58.encode(h)
  }
  throw new SolanaError('No program address for these seeds')
}

export function associatedTokenAddress(owner: string, mint: string, tokenProgram = TOKEN_PROGRAM): string {
  return findProgramAddress([base58.decode(owner), base58.decode(tokenProgram), base58.decode(mint)], ATA_PROGRAM)
}

export function solTransferInstructions(from: string, to: string, lamports: bigint): Instruction[] {
  return [
    {
      programId: SYSTEM_PROGRAM,
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: to, isSigner: false, isWritable: true },
      ],
      data: new Uint8Array([2, 0, 0, 0, ...u64le(lamports)]),
    },
  ]
}

/** Create the recipient's token account if it has none, then transferChecked. */
export function splTransferInstructions(input: { from: string; to: string; holding: SplHolding; amount: bigint }): Instruction[] {
  const { from, to, holding, amount } = input
  const destination = associatedTokenAddress(to, holding.mint, holding.program)
  return [
    {
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: to, isSigner: false, isWritable: false },
        { pubkey: holding.mint, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: holding.program, isSigner: false, isWritable: false },
      ],
      // CreateIdempotent: succeeds when the account already exists.
      data: new Uint8Array([1]),
    },
    {
      programId: holding.program,
      keys: [
        { pubkey: holding.account, isSigner: false, isWritable: true },
        { pubkey: holding.mint, isSigner: false, isWritable: false },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: from, isSigner: true, isWritable: false },
      ],
      data: new Uint8Array([12, ...u64le(amount), holding.decimals]),
    },
  ]
}

export interface SolSendPlan {
  /** Compiled message, base64: what the wallet manager signs. */
  message: string
  fee: bigint
  /** Lamports or token units the recipient gets. */
  amount: bigint
}

/**
 * Build a SOL or SPL transfer and price it. `amount: 'max'` (SOL only) sends
 * everything less the fee, closing the account to zero.
 */
export async function planSolSend(input: {
  network: SolNetwork
  from: string
  to: string
  amount: bigint | 'max'
  /** Absent for SOL. */
  holding?: SplHolding
}): Promise<SolSendPlan> {
  const { network, from, to, holding } = input
  if (!isSolAddress(to)) throw new SolanaError('That is not a Solana address')
  if (to === from) throw new SolanaError('That is this account’s own address')
  const [{ value: latest }, balance] = await Promise.all([
    solRpc<{ value: { blockhash: string } }>(network, 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
    solBalance(network, from),
  ])
  const build = (amount: bigint) =>
    compileMessage(from, holding ? splTransferInstructions({ from, to, holding, amount }) : solTransferInstructions(from, to, amount), latest.blockhash)
  const feeOf = async (m: Uint8Array) =>
    BigInt((await solRpc<{ value: number | null }>(network, 'getFeeForMessage', [base64.encode(m), { commitment: 'confirmed' }])).value ?? 5000)

  if (holding) {
    const amount = input.amount === 'max' ? holding.amount : input.amount
    if (amount <= 0n || amount > holding.amount) throw new SolanaError(`Not enough ${holding.symbol}`)
    const message = build(amount)
    const fee = await feeOf(message)
    // Creating the recipient's token account costs its rent, paid by the sender.
    const exists = await solRpc<{ value: unknown }>(network, 'getAccountInfo', [associatedTokenAddress(to, holding.mint, holding.program), { encoding: 'base64' }])
    const rent = exists.value ? 0n : 2_039_280n
    if (balance < fee + rent) throw new SolanaError(`This account needs about ${formatLamports(fee + rent)} SOL for the fee${rent ? ' and the recipient’s token account' : ''}`)
    return { message: base64.encode(message), fee: fee + rent, amount }
  }

  const fee = await feeOf(build(1n))
  const amount = input.amount === 'max' ? balance - fee : input.amount
  if (amount <= 0n || amount + fee > balance) throw new SolanaError('Not enough SOL for this amount and the network fee')
  const left = balance - amount - fee
  if (left > 0n && left < SOL_RENT_MINIMUM) {
    throw new SolanaError(`Leave at least ${formatLamports(SOL_RENT_MINIMUM)} SOL in the account, or send all of it`)
  }
  if (amount < SOL_RENT_MINIMUM) {
    const recipient = await solBalance(network, to)
    if (recipient === 0n) throw new SolanaError(`A new Solana account needs at least ${formatLamports(SOL_RENT_MINIMUM)} SOL`)
  }
  return { message: base64.encode(build(amount)), fee, amount }
}

export async function sendSolTransaction(network: SolNetwork, signedBase64: string): Promise<string> {
  return solRpc<string>(network, 'sendTransaction', [signedBase64, { encoding: 'base64', preflightCommitment: 'confirmed' }])
}

/** Poll until confirmed. Resolves false when it failed, throws on timeout. */
export async function confirmSolTransaction(network: SolNetwork, signature: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await solRpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>(network, 'getSignatureStatuses', [[signature]]).catch(() => null)
    const s = r?.value[0]
    if (s?.err) return false
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true
    await new Promise((res) => setTimeout(res, 2000))
  }
  throw new SolanaError('Not confirmed yet; it may still go through. Check the explorer.')
}

export function formatLamports(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

/** "1.5" → raw units with `decimals` places. */
export function parseUnits(amount: string, decimals: number): bigint {
  const t = amount.trim()
  if (!new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`).test(t) || t === '' || t === '.') {
    throw new SolanaError(`Enter an amount with at most ${decimals} decimals`)
  }
  const [whole, frac = ''] = t.split('.')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
}
