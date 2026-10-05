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
import { pqIntrinsicGas, type PqTxFields, type SignedPqTx } from './pq-tx'
import {
  buildExchangeTx,
  type ExchangeOpName,
  type JsonValue,
  type SignedExchangeTx,
  type UnsignedExchangeTx,
} from './exchange-tx'
import { ExchangeNonceTracker, isNonceConflict } from './exchange-nonce'
import { recordPendingTransaction } from './history'
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
    const estimated = await provider
      .rpc<string>('eth_estimateGas', [
        {
          from: from.accountId,
          to: call.to,
          value: toHex(call.value),
          data: call.data,
          type: '0x51',
        },
      ])
      .then(fromHex)
      .catch(() => 0n)
    // Execution cost on top of the envelope floor; 10% headroom on whichever is larger.
    gasLimit = ((estimated > floor ? estimated : floor + 30_000n) * 110n) / 100n
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

// ─── Exchange operations (swap, stake, token ops) ───────────────────────────

async function nodeRpc<T>(chain: ChainConfig, method: string, params: unknown[]): Promise<T> {
  return getEvmProvider(chain.id).rpc<T>(method, params)
}

/** Nonces of exchange operations submitted from this wallet and not yet in a block. */
export const exchangeNonces = new ExchangeNonceTracker()
const MAX_NONCE_RETRIES = 8

/** Sign and submit a native exchange operation from the account's PQ credential. */
export async function submitExchangeOp(
  signer: Signer,
  input: {
    chain: ChainConfig | string
    account: WalletAccount
    op: ExchangeOpName
    params?: Record<string, JsonValue>
    gasLimit?: number
  }
): Promise<{ txHash: string; nonce: number }> {
  const chain = chainOf(input.chain)
  if (!isQrdxChain(chain)) throw new TxError('Exchange operations exist only on QRDX networks')
  const sender = input.account.pqAddress
  const [committed, gasPrice] = await Promise.all([
    nodeRpc<number>(chain, 'exchange_getNonce', [sender]),
    nodeRpc<number | string>(chain, 'exchange_gasPrice', []).catch(() => undefined),
  ])
  // Re-sign the same (already approved) operation with the next free nonce when
  // the node says a nonce is taken: an earlier operation is still waiting for a block.
  for (let attempt = 0; ; attempt++) {
    const nonce = exchangeNonces.next(chain.id, sender, Number(committed))
    const tx = buildExchangeTx({
      op: input.op,
      sender,
      nonce,
      params: input.params,
      gasLimit: input.gasLimit,
      gasPrice: gasPrice !== undefined ? BigInt(gasPrice) : undefined,
    })
    const signed = await signer.signExchangeTransaction(tx, input.account.id)
    const { tx_hash: _local, ...wire } = signed
    try {
      const txHash = await nodeRpc<string>(chain, 'exchange_sendTransaction', [wire])
      exchangeNonces.record(chain.id, sender, nonce)
      return { txHash, nonce }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
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
