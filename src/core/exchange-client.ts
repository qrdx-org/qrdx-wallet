/**
 * Typed reads of the QRDX node's native exchange (`exchange_*` JSON-RPC,
 * docs/PERPS_API.md §3 and §7 in qrdx-node). Writes go through
 * tx-service.submitExchangeOp, which signs with the account's PQ key.
 *
 * Amounts on this surface are decimal strings in token units (not wei), and
 * native QRDX is addressed by the literal "QRDX".
 */

import { getEvmProvider } from './ethereum'
import type { ChainConfig } from './chains'

export const NATIVE_QRDX = 'QRDX'

export interface ExchangeToken {
  token_address: string
  name: string
  symbol: string
  decimals: number
  total_supply: string
  max_supply: string | null
  mint_authority: string | null
  freeze_authority: string | null
  creator: string
}

export interface SwapQuote {
  source: 'amm' | 'clob' | string
  pool_id: string | null
  pair: string
  token_in: string
  token_out: string
  amount_in: string
  amount_out: string
  unfilled_in: string
  fee: string
  execution_price: string
  price_impact?: string
}

export interface ExchangeReceipt {
  tx_hash: string
  block_height: number
  op: string
  sender: string
  nonce: number
  success: boolean
  error: string
  gas_used: number
  fee?: string
  data?: Record<string, unknown>
}

const rpc = <T>(chain: ChainConfig, method: string, params: unknown[] = []) =>
  getEvmProvider(chain.id).rpc<T>(method, params)

export const exchange = {
  tokens: (chain: ChainConfig) => rpc<ExchangeToken[]>(chain, 'exchange_getTokens'),
  tokenBalance: (chain: ChainConfig, token: string, address: string) =>
    rpc<string>(chain, 'exchange_getTokenBalance', [token, address]),
  quoteSwap: (
    chain: ChainConfig,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    sender: string
  ) => rpc<SwapQuote>(chain, 'exchange_quoteSwap', [tokenIn, tokenOut, amountIn, sender]),
  receipt: (chain: ChainConfig, txHash: string) =>
    rpc<ExchangeReceipt | null>(chain, 'exchange_getTransactionReceipt', [txHash]),
  nonce: (chain: ChainConfig, address: string) =>
    rpc<number>(chain, 'exchange_getNonce', [address]),
}

/**
 * Poll until a block includes the operation. Exchange transactions execute only
 * in a block, and a failed one still consumes its nonce and burns its gas — the
 * receipt says which.
 */
export async function waitForExchangeReceipt(
  chain: ChainConfig,
  txHash: string,
  timeoutMs = 5 * 60_000,
  intervalMs = 2_000
): Promise<ExchangeReceipt> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await exchange.receipt(chain, txHash).catch(() => null)
    if (r) return r
    await new Promise((res) => setTimeout(res, intervalMs))
  }
  throw new Error('Not included yet — it may still confirm. Check Activity later.')
}

/** Lower an expected output by a slippage tolerance (percent), as an 18-dp decimal string. */
export function minimumOut(amountOut: string, slippagePercent: number): string {
  const [whole, frac = ''] = amountOut.split('.')
  const scaled = BigInt(whole + frac.padEnd(18, '0').slice(0, 18))
  const bps = BigInt(Math.round(slippagePercent * 100))
  const min = (scaled * (10_000n - bps)) / 10_000n
  const s = min.toString().padStart(19, '0')
  return `${s.slice(0, -18)}.${s.slice(-18)}`.replace(/\.?0+$/, '') || '0'
}
