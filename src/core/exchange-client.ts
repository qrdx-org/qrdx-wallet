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

// ─── Staking and delegation pools (qrdx-node docs/STAKING.md) ───────────────
// Reads only; delegating is STAKE_DELEGATE / STAKE_UNDELEGATE through submitExchangeOp.

export interface StakingValidator {
  address: string
  status: string
  stake: string
  effective_stake: string
  /** QRDX in its delegation pool. */
  delegated: string
  /** Own effective stake plus delegated: what it proposes and votes with. */
  weight: string
  earned: string
  activation_epoch: number | null
  exit_epoch: number | null
  slashed: boolean
}

export interface StakingPool {
  validator: string
  commission_bps: number
  next_commission_bps: number | null
  value: string
  total_shares: string
  share_price: string
  delegators: number
  warming_up: string
}

export interface StakingParams {
  reward_rate_bps_per_year: number
  default_commission_bps: number
  min_delegation: string
  min_validator_stake: string
  warmup_epochs: number
  unbonding_epochs: number
  withdrawal_delay_epochs: number
}

export interface Delegations {
  stakes: { validator: string; shares: string; value: string; warming_up: { amount: string; active_from_epoch: number }[] }[]
  payouts: { id: number; kind: string; amount: string; due_epoch: number; validator: string }[]
}

export const staking = {
  validators: (chain: ChainConfig) => rpc<StakingValidator[]>(chain, 'staking_getValidators'),
  pools: (chain: ChainConfig) => rpc<StakingPool[]>(chain, 'staking_getPools'),
  params: (chain: ChainConfig) => rpc<StakingParams>(chain, 'staking_getParams'),
  delegations: (chain: ChainConfig, address: string) => rpc<Delegations>(chain, 'staking_getDelegations', [address]),
  /** Slot length and slots an epoch, from the node's chain spec. */
  clock: async (chain: ChainConfig): Promise<{ slotMs: number; slotsPerEpoch: number; epochMs: number } | null> => {
    const spec = await rpc<{ params: { SLOT_DURATION_MS: number; SLOTS_PER_EPOCH: number } }>(chain, 'qrdx_chainSpec').catch(() => null)
    if (!spec) return null
    const slotMs = Number(spec.params.SLOT_DURATION_MS)
    const slotsPerEpoch = Number(spec.params.SLOTS_PER_EPOCH)
    return { slotMs, slotsPerEpoch, epochMs: slotMs * slotsPerEpoch }
  },
  /** The head block's epoch (warm-ups and payouts count in epochs), from the node's REST API. */
  headEpoch: async (chain: ChainConfig): Promise<number | null> => {
    if (!chain.nodeApiUrl) return null
    try {
      const status = (await (await fetch(`${chain.nodeApiUrl}/get_status`)).json()) as { result?: { height: number } }
      const height = status.result?.height
      if (height == null) return null
      const block = (await (await fetch(`${chain.nodeApiUrl}/get_block?block=${height}`)).json()) as { result?: { block?: { content?: string } } }
      const m = /['"]epoch['"]:\s*(\d+)/.exec(block.result?.block?.content ?? '')
      return m ? Number(m[1]) : null
    } catch {
      return null
    }
  },
}
