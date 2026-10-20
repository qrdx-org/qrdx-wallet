/**
 * Smart routing, as the trade API returns it (`/quote/route`, qrdx-trade lib/server/routing.ts):
 * the best path from one token to another through up to three markets, each hop quoted by the
 * node. `routeOps` turns it into the SWAPs to sign (qrdx-trade lib/routing.ts, the same rules).
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
