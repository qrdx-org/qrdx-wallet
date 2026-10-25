/**
 * Smart routing, as the trade API returns it (`/quote/route`, qrdx-trade lib/server/routing.ts):
 * the best path from one token to another through up to three markets, each hop quoted by the
 * node. On a node with multi-hop swaps (qrdx-node docs/TRADING_FEATURES.md §6) `routePathOp`
 * makes it one SWAP through the `path`, all or nothing; otherwise `routeOps` turns it into one
 * SWAP a hop (qrdx-trade lib/routing.ts, the same rules).
 */

import { dec, div, lessSlippage, mul, round, str } from './decimal'
import type { ApiAsset } from './types'

export interface RouteHop {
  from: ApiAsset
  to: ApiAsset
  amountIn: string
  amountOut: string
  fee: string
  venue: string
  poolId: string | null
  priceImpact: string | null
}

export interface RoutedQuote {
  from: ApiAsset
  to: ApiAsset
  amountIn: string
  amountOut: string
  executionPrice: string
  priceImpact: string | null
  hops: RouteHop[]
  directAmountOut: string | null
}

export interface RouteOp {
  op: 'SWAP'
  params: { token_in: string; token_out: string; amount_in: string; min_amount_out: string; venue: 'auto'; deadline: number }
}

/**
 * Hop 1 spends what was typed; each later hop spends the previous hop's minimum output and
 * expects its quoted output scaled to that input; each refuses to fill below its own minimum.
 */
export function routeOps(hops: Pick<RouteHop, 'from' | 'to' | 'amountIn' | 'amountOut'>[], amountIn: string, slippagePct: number, deadline: number): { ops: RouteOp[]; minOut: string } {
  const ops: RouteOp[] = []
  let spend = amountIn
  for (const h of hops) {
    const expected = str(mul(dec(h.amountOut), div(dec(spend), dec(h.amountIn))))
    const min = round(lessSlippage(expected, slippagePct), 18, 'down')
    ops.push({ op: 'SWAP', params: { token_in: h.from.address!, token_out: h.to.address!, amount_in: spend, min_amount_out: min, venue: 'auto', deadline } })
    spend = min
  }
  return { ops, minOut: spend }
}

export interface RoutePathOp {
  op: 'SWAP'
  params: { path: string[]; amount_in: string; min_amount_out: string; venue: 'auto'; deadline: number }
}

/** The most hops one SWAP `path` takes (qrdx-node MAX_SWAP_HOPS). */
export const MAX_PATH_HOPS = 4

/** The route as one atomic SWAP: the slippage applies once, to the final output. */
export function routePathOp(hops: Pick<RouteHop, 'from' | 'to' | 'amountOut'>[], amountIn: string, slippagePct: number, deadline: number): { op: RoutePathOp; minOut: string } {
  const minOut = round(lessSlippage(hops[hops.length - 1].amountOut, slippagePct), 18, 'down')
  return {
    op: { op: 'SWAP', params: { path: [hops[0].from.address!, ...hops.map((h) => h.to.address!)], amount_in: amountIn, min_amount_out: minOut, venue: 'auto', deadline } },
    minOut,
  }
}
