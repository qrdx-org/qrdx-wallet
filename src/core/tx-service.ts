/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Transaction service: build → sign → broadcast
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Every send in the app (and every dApp transaction in the extension) goes
 *  through here. It picks the envelope from the **source credential**:
 *
 *    classic (0x, secp256k1)  → EIP-155 legacy on QRDX, EIP-1559 elsewhere
 *    post-quantum (0xPQ)      → type-0x51 PQ transaction (QRDX chains only)
 *
 *  On QRDX either envelope can pay either kind of recipient, because every
 *  recipient is resolved to its canonical 20-byte account id first (a `0xPQ`
 *  recipient can never be encoded directly into a 20-byte `to`).
 *
 *  Signing is delegated to a {@link Signer} — the wallet manager locally, or a
 *  proxy to the extension background — so keys never pass through here.
 */

import {
  getEvmProvider,
  ethToWei,
  toHex,
  fromHex,
  weiToEth,
  type EthTransactionRequest,
  type TokenBalance,
} from './ethereum'
import { isQrdxChain, getChain, type ChainConfig, type ChainToken } from './chains'
import { resolveSigningChainId } from './chain-identity'
import { toAccountId, isProtocolHolder, addressForm } from './account-id'
import { pqGasFromEvmEstimate, pqIntrinsicGas, type PqTxFields, type SignedPqTx } from './pq-tx'
import {
  buildExchangeTx,
  freeLaneOp,
  type ExchangeOpName,
  type JsonValue,
  type SignedExchangeTx,
  type UnsignedExchangeTx,
} from './exchange-tx'
import { ExchangeNonceTracker, isNonceConflict } from './exchange-nonce'
import { dropPendingTransaction, recordPendingTransaction } from './history'
import type { SignedTransaction } from './transaction'
import type { WalletAccount } from './types'

export type Credential = 'classic' | 'pq'

export interface Signer {
  signEvmTransaction(tx: EthTransactionRequest, accountId?: string): Promise<SignedTransaction>
  signPqTransaction(fields: PqTxFields, accountId?: string): Promise<SignedPqTx>
  signExchangeTransaction(
    tx: UnsignedExchangeTx,
    accountId?: string
  ): Promise<SignedExchangeTx & { tx_hash: string }>
}

export class TxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TxError'
  }
}

const ERC20_TRANSFER = '0xa9059cbb'

export function encodeErc20Transfer(toAccount: string, amount: bigint): string {
  return (
    ERC20_TRANSFER +
    toAccount.slice(2).toLowerCase().padStart(64, '0') +
    amount.toString(16).padStart(64, '0')
  )
}

function chainOf(chain: ChainConfig | string): ChainConfig {
  const c = typeof chain === 'string' ? getChain(chain) : chain
  if (!c) throw new TxError(`Unknown network ${String(chain)}`)
  return c
}

/**
 * Validate a recipient for a chain and return the 20-byte value to encode.
 * Non-QRDX chains accept only plain `0x` addresses.
 */
export function resolveRecipient(
  chain: ChainConfig,
  to: string
): { accountId: string; form: string; resolved: boolean } {
  const form = addressForm(to)
  if (!form) throw new TxError('That is not a valid address')
  if (isProtocolHolder(to))
    throw new TxError('That is a protocol-owned address. Funds sent there cannot be recovered.')
  if (!isQrdxChain(chain) && form !== 'traditional') {
    throw new TxError(
      `${chain.name} only accepts 0x addresses. Post-quantum addresses exist only on QRDX.`
    )
  }
  let accountId: string
  try {
    accountId = toAccountId(to)
  } catch (err) {
    throw new TxError(err instanceof Error ? err.message : 'Invalid address')
  }
  return { accountId, form, resolved: accountId !== to.trim().toLowerCase() }
}

/** The address a credential spends from and is keyed by on the ledger. */
export function sourceAddress(
  account: WalletAccount,
  credential: Credential
): { display: string; accountId: string } {
  return credential === 'pq'
    ? { display: account.pqAddress, accountId: account.pqAccountId }
    : { display: account.ethAddress, accountId: account.ethAddress.toLowerCase() }
}

// ─── Balances ───────────────────────────────────────────────────────────────

/** Native + configured token balances for one credential of an account. */
export async function fetchBalances(
  chain: ChainConfig | string,
  account: WalletAccount,
  credential: Credential,
  extraTokens: ChainToken[] = []
): Promise<TokenBalance[]> {
  const c = chainOf(chain)
  if (credential === 'pq' && !isQrdxChain(c)) return []
  return getEvmProvider(c.id).getAllBalances(
    sourceAddress(account, credential).accountId,
    extraTokens
  )
}

// ─── Fees ───────────────────────────────────────────────────────────────────

export interface SendQuote {
  credential: Credential
  gasLimit: string
  gasPrice: string
  /** Wei. */
  fee: string
  feeFormatted: string
  toAccountId: string
}

export interface SendRequest {
  chain: ChainConfig | string
  account: WalletAccount
  credential: Credential
  to: string
  /** Decimal amount in token units. */
  amount: string
  /** ERC-20 / native-token address; omit for the native coin. */
  token?: { address: string; decimals: number; symbol?: string }
}

function buildCall(req: SendRequest, toAccountId: string, nativeDecimals: number) {
  if (req.token?.address) {
    const raw = ethToWei(req.amount, req.token.decimals)
    if (raw <= 0n) throw new TxError('Enter an amount greater than zero')
    return { to: req.token.address, value: 0n, data: encodeErc20Transfer(toAccountId, raw) }
  }
  const value = ethToWei(req.amount, nativeDecimals)
  if (value <= 0n) throw new TxError('Enter an amount greater than zero')
  return { to: toAccountId, value, data: '0x' }
}

/** Estimate gas and fee for a send without signing anything. */
export async function quoteSend(req: SendRequest): Promise<SendQuote> {
  const chain = chainOf(req.chain)
  if (req.credential === 'pq' && !isQrdxChain(chain))
    throw new TxError('Post-quantum sends are only available on QRDX networks')
  const { accountId: toAccountId } = resolveRecipient(chain, req.to)
  const provider = getEvmProvider(chain.id)
  const from = sourceAddress(req.account, req.credential)
  const call = buildCall(req, toAccountId, chain.nativeCurrency.decimals)

  const gasPrice = await provider.getGasPrice()
  let gasLimit: bigint
  if (req.credential === 'pq') {
    const floor = pqIntrinsicGas(call.data)
    // The node's estimate for type 0x51 is the envelope floor alone; estimate the call as an
    // ordinary EVM transaction and add the envelope (pq-tx.ts pqGasFromEvmEstimate).
    gasLimit = await provider
      .rpc<string>('eth_estimateGas', [
        {
          from: from.accountId,
          to: call.to,
          value: toHex(call.value),
          data: call.data,
        },
      ])
      .then((g) => pqGasFromEvmEstimate(fromHex(g), call.data))
      .catch(() => ((floor + 30_000n) * 110n) / 100n)
  } else {
    gasLimit = await provider.estimateGas({
      from: from.accountId,
      to: call.to,
      value: toHex(call.value),
      data: call.data,
    })
    gasLimit = (gasLimit * 110n) / 100n
  }
  const fee = gasLimit * gasPrice
  return {
    credential: req.credential,
    gasLimit: gasLimit.toString(),
    gasPrice: gasPrice.toString(),
    fee: fee.toString(),
    feeFormatted: weiToEth(fee, chain.nativeCurrency.decimals),
    toAccountId,
  }
}

export interface SendResult {
  hash: string
  from: string
  toAccountId: string
  credential: Credential
}

/** Build, sign and broadcast a send. Uses `quote` when given so the user pays what they confirmed. */
export async function send(
  signer: Signer,
  req: SendRequest,
  quote?: SendQuote
): Promise<SendResult> {
  const chain = chainOf(req.chain)
  const q = quote ?? (await quoteSend(req))
  const provider = getEvmProvider(chain.id)
  const from = sourceAddress(req.account, req.credential)
  const call = buildCall(req, q.toAccountId, chain.nativeCurrency.decimals)
  const [nonce, chainId] = await Promise.all([
    provider.getTransactionCount(from.accountId),
    resolveSigningChainId(chain),
  ])

  let raw: string
  if (req.credential === 'pq') {
    const signed = await signer.signPqTransaction(
      {
        chainId,
        nonce: nonce.toString(),
        gasPrice: q.gasPrice,
        gasLimit: q.gasLimit,
        to: call.to,
        value: call.value.toString(),
        data: call.data,
      },
      req.account.id
    )
    raw = signed.rawTransaction
  } else {
    const tx: EthTransactionRequest = {
      from: req.account.ethAddress,
      to: call.to,
      value: toHex(call.value),
      data: call.data,
      nonce: toHex(nonce),
      chainId: toHex(chainId),
      gas: toHex(BigInt(q.gasLimit)),
      gasPrice: toHex(BigInt(q.gasPrice)),
    }
    raw = (await signer.signEvmTransaction(tx, req.account.id)).rawTransaction
  }

  const hash = await provider.sendRawTransaction(raw)
  recordPendingTransaction(
    chain.id,
    hash,
    from.display,
    req.to,
    toHex(call.value),
    req.token?.symbol ?? chain.nativeCurrency.symbol,
    req.token?.decimals ?? chain.nativeCurrency.decimals
  )
  return { hash, from: from.display, toAccountId: q.toAccountId, credential: req.credential }
}

// ─── Speed up / cancel ──────────────────────────────────────────────────────

/** A replacement must outbid the queued transaction; EVM nodes ask for at least 10 % more. */
const REPLACEMENT_BUMP_PCT = 112n

interface RpcTx {
  from: string
  to: string | null
  value: string
  input: string
  gas: string
  gasPrice?: string
  maxFeePerGas?: string
  nonce: string
  blockNumber: string | null
}

/** Whether a pending transaction can be replaced: EVM networks only, from the account's 0x key. */
export function canReplace(chain: ChainConfig | string, account: WalletAccount, from: string): boolean {
  const c = chainOf(chain)
  return !isQrdxChain(c) && from.toLowerCase() === account.ethAddress.toLowerCase()
}

/**
 * Replace a pending EVM transaction with one at the same nonce and a higher gas price:
 * `speedup` resends it as it was, `cancel` sends nothing to yourself so the original can no
 * longer confirm. Whichever the network mines first wins. QRDX nodes keep one transaction per
 * sender and nonce and refuse replacements, so it is not offered there.
 */
export async function replaceTransaction(
  signer: Signer,
  input: { chain: ChainConfig | string; account: WalletAccount; hash: string; mode: 'speedup' | 'cancel' }
): Promise<{ hash: string; gasPrice: bigint }> {
  const chain = chainOf(input.chain)
  if (isQrdxChain(chain)) throw new TxError('QRDX nodes do not accept a replacement for a queued transaction')
  const provider = getEvmProvider(chain.id)
  const tx = await provider.rpc<RpcTx | null>('eth_getTransactionByHash', [input.hash])
  if (!tx) throw new TxError('The network no longer knows this transaction; it may have been dropped')
  if (tx.blockNumber) throw new TxError('This transaction is already in a block')
  if (tx.from.toLowerCase() !== input.account.ethAddress.toLowerCase()) throw new TxError('Only transactions sent from this account can be replaced')
  if (!tx.to && input.mode === 'speedup') throw new TxError('A contract deployment cannot be sped up from here; cancel it instead')

  const old = fromHex(tx.gasPrice ?? tx.maxFeePerGas ?? '0x0')
  const current = await provider.getGasPrice()
  const bumped = (old * REPLACEMENT_BUMP_PCT) / 100n + 1n
  const gasPrice = bumped > current ? bumped : current
  const cancel = input.mode === 'cancel'
  const chainId = await resolveSigningChainId(chain)
  const replacement: EthTransactionRequest = {
    from: input.account.ethAddress,
    to: cancel || !tx.to ? input.account.ethAddress : tx.to,
    value: cancel ? '0x0' : tx.value,
    data: cancel ? '0x' : tx.input,
    nonce: tx.nonce,
    chainId: toHex(chainId),
    gas: cancel ? toHex(21_000n) : tx.gas,
    gasPrice: toHex(gasPrice),
  }
  const raw = (await signer.signEvmTransaction(replacement, input.account.id)).rawTransaction
  const hash = await provider.sendRawTransaction(raw)
  dropPendingTransaction(input.hash)
  recordPendingTransaction(chain.id, hash, input.account.ethAddress, replacement.to, replacement.value ?? '0x0', chain.nativeCurrency.symbol, chain.nativeCurrency.decimals)
  return { hash, gasPrice }
}

// ─── Exchange operations (swap, stake, token ops) ───────────────────────────

async function nodeRpc<T>(chain: ChainConfig, method: string, params: unknown[]): Promise<T> {
  return getEvmProvider(chain.id).rpc<T>(method, params)
}

/** Nonces of exchange operations submitted from this wallet and not yet in a block. */
export const exchangeNonces = new ExchangeNonceTracker()
const MAX_NONCE_RETRIES = 8

/** What the connected node runs beyond the original exchange (one probe per chain, 5 minutes). */
export interface NodeFeatures {
  /**
   * The trading features of qrdx-node's 2026-10 release (docs/TRADING_FEATURES.md): triggers,
   * BATCH, modify, TWAP, agents, the free trading lane, QNS, account control.
   */
  trading: boolean
}

const featureCache = new Map<string, { at: number; value: Promise<NodeFeatures> }>()

/** A JSON-RPC "method not found" (-32601), as the node answers a method it predates. */
export function isMethodMissing(err: unknown): boolean {
  // EvmProvider.rpc throws "RPC error <code>: <message>".
  const e = err as { code?: number; message?: string } | undefined
  return e?.code === -32601 || /RPC error -32601\b|method not found/i.test(e?.message ?? String(err))
}

export function nodeFeatures(chain: ChainConfig | string): Promise<NodeFeatures> {
  const c = chainOf(chain)
  const hit = featureCache.get(c.id)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value
  // Anything but an answer counts as "no": a BATCH sent to a node without it would be refused.
  // Only an answer, or "method not found", is remembered; a failed read is asked again.
  const value = nodeRpc<unknown>(c, 'perp_getFeeSchedule', [])
    .then(() => ({ trading: true }))
    .catch((e) => {
      if (!isMethodMissing(e)) featureCache.delete(c.id)
      return { trading: false }
    })
  featureCache.set(c.id, { at: Date.now(), value })
  return value
}

/** exchange_getFreeActions: an account's free trading actions (docs/TOKENOMICS.md). */
export interface FreeActions {
  budget: number
  used: number
  remaining: number
  lane_open: boolean
  free_now: boolean
  why_not: string | null
}

export async function freeActions(chain: ChainConfig | string, sender: string): Promise<FreeActions | null> {
  return nodeRpc<FreeActions>(chainOf(chain), 'exchange_getFreeActions', [sender]).catch(() => null)
}

/**
 * The gas price to sign a trading operation at: 0 (the free lane) while the node says
 * the account's next one goes free, else `paid`. Anything else always pays.
 */
export async function exchangeGasPrice(
  chain: ChainConfig,
  sender: string,
  op: ExchangeOpName,
  params: Record<string, JsonValue>,
  paid: bigint | undefined
): Promise<bigint | undefined> {
  if (!freeLaneOp(op, params)) return paid
  const free = await freeActions(chain, sender)
  return free?.free_now ? 0n : paid
}

/** Sign and submit a native exchange operation from the account's PQ credential. */
export async function submitExchangeOp(
  signer: Signer,
  input: {
    chain: ChainConfig | string
    account: WalletAccount
    op: ExchangeOpName
    params?: Record<string, JsonValue>
    gasLimit?: number
    /** Wei per gas; default: the free lane when it takes this operation, else exchange_gasPrice. */
    gasPrice?: bigint
  }
): Promise<{ txHash: string; nonce: number; /** Wei per gas it was signed at ("0": the free lane). */ gasPrice: string }> {
  const chain = chainOf(input.chain)
  if (!isQrdxChain(chain)) throw new TxError('Exchange operations exist only on QRDX networks')
  const sender = input.account.pqAddress
  const params = input.params ?? {}
  const [committed, nodePrice, chainId] = await Promise.all([
    nodeRpc<number>(chain, 'exchange_getNonce', [sender]),
    input.gasPrice !== undefined
      ? Promise.resolve(undefined)
      : nodeRpc<number | string>(chain, 'exchange_gasPrice', []).catch(() => undefined),
    // Exchange signatures are bound to the chain id; sign with the node's, once it matches the registry.
    resolveSigningChainId(chain),
  ])
  const paid = nodePrice !== undefined ? BigInt(nodePrice) : undefined
  let gasPrice =
    input.gasPrice ??
    (await exchangeGasPrice(chain, sender, input.op, params, paid))
  // Re-sign the same (already approved) operation with the next free nonce when
  // the node says a nonce is taken: an earlier operation is still waiting for a block.
  for (let attempt = 0; ; attempt++) {
    const nonce = exchangeNonces.next(chain.id, sender, Number(committed))
    const tx = buildExchangeTx({
      op: input.op,
      chainId,
      sender,
      nonce,
      params,
      gasLimit: input.gasLimit,
      gasPrice,
    })
    const signed = await signer.signExchangeTransaction(tx, input.account.id)
    const { tx_hash: _local, ...wire } = signed
    try {
      const txHash = await nodeRpc<string>(chain, 'exchange_sendTransaction', [wire])
      exchangeNonces.record(chain.id, sender, nonce)
      return { txHash, nonce, gasPrice: tx.gas_price }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // The free lane refused it after all (its budget or the block's ran out since we
      // asked; it consumed nothing): pay instead, as the user approved the operation.
      if (gasPrice === 0n && input.gasPrice === undefined && /pay gas/i.test(message) && attempt < MAX_NONCE_RETRIES) {
        gasPrice = paid
        continue
      }
      if (!isNonceConflict(message) || attempt >= MAX_NONCE_RETRIES) throw err
      exchangeNonces.record(chain.id, sender, nonce)
    }
  }
}


/** Poll an exchange receipt. `null` = still pending. */
export async function exchangeReceipt(
  chain: ChainConfig | string,
  txHash: string
): Promise<{ success: boolean; error: string; data?: unknown } | null> {
  return nodeRpc(chainOf(chain), 'exchange_getTransactionReceipt', [txHash])
}
