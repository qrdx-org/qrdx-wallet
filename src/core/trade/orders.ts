/**
 * Exchange parameters for the wallet's trading screen, in the node's terms.
 * Ported from qrdx-trade (lib/orders.ts, the perps form): the same rules sign the
 * same orders whether a trade starts on trade.qrdx.org or in the wallet.
 */

import { dec, div, divUp, mul, round, str } from './decimal'
import type { OrderBook, SpotMarket } from './types'

export type Side = 'buy' | 'sell'

/**
 * A spot limit order. The node's book is keyed by the sorted pair: side and amount
 * refer to token0 and price is token1 per token0. When the market's base is
 * token1 (`inverted`), a buy of the base is a sell of token0 at the inverse price,
 * sized in token0, rounded so it never fills worse than the price typed.
 */
export function spotLimitParams(market: SpotMarket, side: Side, priceStr: string, sizeStr: string) {
  const base = market.base.address!
  const quote = market.quote.address!
  if (!market.inverted) {
    return { pair: `${base}:${quote}`, side, order_type: 'limit', price: priceStr, amount: sizeStr }
  }
  const p = dec(priceStr)
  const one = dec('1')
  return {
    pair: `${quote}:${base}`,
    side: side === 'buy' ? 'sell' : 'buy',
    order_type: 'limit',
    price: str(side === 'buy' ? divUp(one, p) : div(one, p)),
    amount: str(mul(dec(sizeStr), p)),
  }
}

/**
 * Perps "market" orders are IOC limit orders at the far side of the book plus a
 * slippage allowance: they fill what they can at the book's prices and cancel the rest.
 */
export function perpMarketPrice(book: OrderBook | null, side: Side, slippagePct: number): string | null {
  const best = side === 'buy' ? book?.bestAsk : book?.bestBid
  if (!best) return null
  const bps = BigInt(Math.round(slippagePct * 100))
  const p = (dec(best) * (side === 'buy' ? 10_000n + bps : 10_000n - bps)) / 10_000n
  return round(str(p), 2, side === 'buy' ? 'up' : 'down')
}

/** Close a position: reduce-only IOC 2 % through the mark, so it fills against the book and never flips. */
export function perpCloseParams(marketId: string, positionSize: string, mark: string) {
  const long = dec(positionSize) > 0n
  const px = (dec(mark) * (long ? 98n : 102n)) / 100n
  return {
    market_id: marketId,
    side: long ? 'sell' : 'buy',
    size: positionSize.replace('-', ''),
    price: round(str(px), 2, long ? 'down' : 'up'),
    reduce_only: true,
    tif: 'ioc',
  }
}
