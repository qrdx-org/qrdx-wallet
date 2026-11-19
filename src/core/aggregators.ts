/**
 * Swaps on networks QRDX does not run: quotes from DEX aggregators, signed in the wallet.
 *
 *   EVM      LI.FI (li.quest), which routes through Uniswap, SushiSwap, Aerodrome, PancakeSwap
 *            and others on the same network. Keyless: 75 quotes per two hours per user.
 *   Solana   Jupiter (lite-api.jup.ag), which routes through Raydium, Orca, Meteora and others.
 *
 * The quote names the venues that fill it. The wallet signs only a transaction from (EVM) or
 * paid for by (Solana) the account; the aggregator's contracts move the tokens.
 * Each DEX's own site is linked as well (dexLink), for those who prefer to swap there.
 */

import { base64 } from '@scure/base'
import { chainFamily, type ChainConfig } from './chains'
import { solNetworkOf } from './other-chains'
import { confirmSolTransaction, sendSolTransaction, splitTransaction, withPayerSignature } from './solana'
import { encodeErc20Approve, erc20Allowance, sendContractCall, type Signer } from './tx-service'
import { getEvmProvider } from './ethereum'
import type { WalletAccount } from './types'

const LIFI = 'https://li.quest/v1'
const JUPITER = 'https://lite-api.jup.ag/swap/v1'
const EVM_NATIVE = '0x0000000000000000000000000000000000000000'
const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112'

export interface SwapToken {
  /** '' for the network's own coin. */
  address: string
  symbol: string
  decimals: number
}

export interface SwapQuote {
  provider: 'LI.FI' | 'Jupiter'
  chain: ChainConfig
  from: SwapToken
  to: SwapToken
  fromAmount: bigint
  /** Expected, and the least the swap accepts (slippage). */
  toAmount: bigint
  toAmountMin: bigint
  /** Percent, when the aggregator reports it. */
  priceImpact?: number
  /** Venues that fill it, in order ("Uniswap V3", "Raydium CLMM"). */
  route: string[]
  /** Network fee estimate in USD (LI.FI; Jupiter's priority fee is set at signing). */
  feeUsd?: number
  /** The aggregator's own fee, taken from the amount swapped (LI.FI without a key: 0.25 %). */
  serviceFee?: { name: string; percent: number; usd?: number }
  /** EVM: the token approval the swap needs, and the transaction. */
  approval?: { token: string; spender: string }
  tx?: { to: string; data: string; value: bigint; gasLimit?: bigint }
  /** Solana: Jupiter's quote, turned into a transaction at signing. */
  jupiter?: unknown
}

export class SwapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SwapError'
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => null)
  if (res.status === 429) throw new SwapError('Too many quotes asked; try again in a few minutes')
  if (!res.ok) throw new SwapError((body as { message?: string; error?: string })?.message ?? (body as { error?: string })?.error ?? `HTTP ${res.status}`)
  return body as T
}

interface LifiQuote {
  estimate: {
    toAmount: string
    toAmountMin: string
    approvalAddress?: string
    gasCosts?: { amountUSD?: string }[]
    feeCosts?: { name?: string; amountUSD?: string; percentage?: string; included?: boolean }[]
  }
  includedSteps?: { type?: string; toolDetails?: { name: string } }[]
  toolDetails?: { name: string }
  transactionRequest?: { to: string; data: string; value?: string; gasLimit?: string }
}

interface JupiterQuote {
  outAmount: string
  otherAmountThreshold: string
  priceImpactPct?: string
  routePlan?: { swapInfo?: { label?: string } }[]
}

/** A quote to swap `amount` of `from` for `to` on `chain`. `slippage` in percent. */
export async function quoteSwap(input: {
  chain: ChainConfig
  /** The account's address on that chain. */
  owner: string
  from: SwapToken
  to: SwapToken
  amount: bigint
  slippage?: number
}): Promise<SwapQuote> {
  const { chain, from, to, amount } = input
  const slippage = input.slippage ?? 0.5
  if (amount <= 0n) throw new SwapError('Enter an amount greater than zero')
  if (from.address.toLowerCase() === to.address.toLowerCase()) throw new SwapError('Pick two different tokens')
  const family = chainFamily(chain)

  if (family === 'solana') {
    if (chain.isTestnet) throw new SwapError('Swaps run on Solana mainnet only')
    const q = await getJson<JupiterQuote>(
      `${JUPITER}/quote?inputMint=${from.address || SOL_NATIVE_MINT}&outputMint=${to.address || SOL_NATIVE_MINT}&amount=${amount}&slippageBps=${Math.round(slippage * 100)}`
    )
    return {
      provider: 'Jupiter',
      chain,
      from,
      to,
      fromAmount: amount,
      toAmount: BigInt(q.outAmount),
      toAmountMin: BigInt(q.otherAmountThreshold),
      priceImpact: q.priceImpactPct !== undefined ? Number(q.priceImpactPct) * 100 : undefined,
      route: [...new Set((q.routePlan ?? []).map((r) => r.swapInfo?.label).filter((l): l is string => !!l))],
      jupiter: q,
    }
  }
  if (family !== 'evm') throw new SwapError(`${chain.name} has no DEX to swap on`)

  const params = new URLSearchParams({
    fromChain: String(chain.chainId),
    toChain: String(chain.chainId),
    fromToken: from.address || EVM_NATIVE,
    toToken: to.address || EVM_NATIVE,
    fromAmount: amount.toString(),
    fromAddress: input.owner,
    slippage: String(slippage / 100),
  })
  const q = await getJson<LifiQuote>(`${LIFI}/quote?${params}`)
  if (!q.transactionRequest) throw new SwapError('No route for this swap')
  const usd = (l?: { amountUSD?: string }[]) => (l ?? []).reduce((s, c) => s + Number(c.amountUSD ?? 0), 0)
  return {
    provider: 'LI.FI',
    chain,
    from,
    to,
    fromAmount: amount,
    toAmount: BigInt(q.estimate.toAmount),
    toAmountMin: BigInt(q.estimate.toAmountMin),
    // The venues; LI.FI's fee collection is a step too, reported as serviceFee instead.
    route: [...new Set((q.includedSteps ?? []).filter((s) => s.type !== 'protocol').map((s) => s.toolDetails?.name).filter((n): n is string => !!n))].concat(
      q.includedSteps?.length ? [] : q.toolDetails ? [q.toolDetails.name] : []
    ),
    feeUsd: usd(q.estimate.gasCosts) + usd(q.estimate.feeCosts?.filter((f) => !f.included)),
    serviceFee: (() => {
      const fees = (q.estimate.feeCosts ?? []).filter((f) => f.included)
      const percent = fees.reduce((sum, f) => sum + Number(f.percentage ?? 0) * 100, 0)
      return fees.length ? { name: 'LI.FI fee', percent, usd: usd(fees) } : undefined
    })(),
    approval: from.address && q.estimate.approvalAddress ? { token: from.address, spender: q.estimate.approvalAddress } : undefined,
    tx: {
      to: q.transactionRequest.to,
      data: q.transactionRequest.data,
      value: BigInt(q.transactionRequest.value ?? '0x0'),
      gasLimit: q.transactionRequest.gasLimit ? (BigInt(q.transactionRequest.gasLimit) * 120n) / 100n : undefined,
    },
  }
}

export interface SwapSigner extends Signer {
  signSolanaMessage(message: string, accountId?: string): Promise<string>
}

/**
 * Sign and send a quote. EVM: approves exactly the amount first when the allowance is short,
 * waits for it, then sends the swap. Solana: asks Jupiter for the transaction, checks this
 * account pays for it, signs and sends. `onStep` reports progress.
 */
export async function executeSwap(
  signer: SwapSigner,
  account: WalletAccount,
  owner: string,
  quote: SwapQuote,
  onStep?: (step: 'approving' | 'swapping' | 'confirming') => void
): Promise<{ id: string; ok: boolean }> {
  if (quote.provider === 'Jupiter') {
    const built = await getJson<{ swapTransaction: string }>(`${JUPITER}/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote.jupiter,
        userPublicKey: owner,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: 'medium' } },
      }),
    })
    const tx = base64.decode(built.swapTransaction)
    const { message } = splitTransaction(tx)
    onStep?.('swapping')
    // The wallet manager refuses a message another account pays for.
    const signature = base64.decode(await signer.signSolanaMessage(base64.encode(message), account.id))
    const network = solNetworkOf(quote.chain)
    const id = await sendSolTransaction(network, base64.encode(withPayerSignature(tx, signature)))
    onStep?.('confirming')
    return { id, ok: await confirmSolTransaction(network, id) }
  }

  const provider = getEvmProvider(quote.chain.id)
  if (quote.approval) {
    const allowance = await erc20Allowance(quote.chain, quote.approval.token, account.ethAddress, quote.approval.spender)
    if (allowance < quote.fromAmount) {
      onStep?.('approving')
      // Exactly this swap's amount: no standing approval for the aggregator to spend more.
      const { hash } = await sendContractCall(signer, { chain: quote.chain, account, to: quote.approval.token, data: encodeErc20Approve(quote.approval.spender, quote.fromAmount) })
      const r = await provider.waitForTransaction(hash, 180_000)
      if (r.status !== '0x1') throw new SwapError('The token approval failed')
    }
  }
  onStep?.('swapping')
  const { hash } = await sendContractCall(signer, { chain: quote.chain, account, ...quote.tx! })
  onStep?.('confirming')
  const r = await provider.waitForTransaction(hash, 180_000).catch(() => null)
  return { id: hash, ok: r ? r.status === '0x1' : true }
}

/** The DEX's own site for this pair, where there is one. */
export function dexLink(chain: ChainConfig, from: SwapToken, to: SwapToken): { name: string; url: string } | null {
  const family = chainFamily(chain)
  if (family === 'solana' && !chain.isTestnet) {
    return { name: 'Raydium', url: `https://raydium.io/swap/?inputMint=${from.address || 'sol'}&outputMint=${to.address || 'sol'}` }
  }
  if (family !== 'evm' || chain.isTestnet) return null
  if (chain.id === 'bsc') {
    return { name: 'PancakeSwap', url: `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${from.address || 'BNB'}&outputCurrency=${to.address || 'BNB'}` }
  }
  const uniswap: Record<string, string> = {
    ethereum: 'mainnet',
    base: 'base',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    polygon: 'polygon',
    avalanche: 'avalanche',
    zksync: 'zksync',
    unichain: 'unichain',
    celo: 'celo',
  }
  const slug = uniswap[chain.id]
  return slug ? { name: 'Uniswap', url: `https://app.uniswap.org/swap?chain=${slug}&inputCurrency=${from.address || 'ETH'}&outputCurrency=${to.address || 'ETH'}` } : null
}
