/** The wallet signs the same orders trade.qrdx.org does (src/core/trade/orders.ts). */
import { describe, expect, it } from 'vitest'
import { perpCloseParams, perpMarketPrice, spotLimitParams } from '../../src/core/trade/orders'
import type { OrderBook, SpotMarket } from '../../src/core/trade/types'

const ETH = '0x1000000000000000000000000000000000000001'
const USDC = '0x2000000000000000000000000000000000000002'
const market = (inverted: boolean) =>
  ({ base: { address: inverted ? USDC : ETH }, quote: { address: inverted ? ETH : USDC }, inverted }) as unknown as SpotMarket

describe('spot limit orders', () => {
  it('passes a canonical market through', () => {
    expect(spotLimitParams(market(false), 'buy', '2642.77', '0.5')).toEqual({ pair: `${ETH}:${USDC}`, side: 'buy', order_type: 'limit', price: '2642.77', amount: '0.5' })
  })
  it('inverts an inverted market, rounding toward the user', () => {
    // Buying the base (token1) is a node-side sell of token0 at 1/P: a minimum, rounded up.
    const buy = spotLimitParams(market(true), 'buy', '3', '2')
    expect(buy).toEqual({ pair: `${ETH}:${USDC}`, side: 'sell', order_type: 'limit', price: '0.333333333333333334', amount: '6' })
    // Selling it is a node-side buy at 1/P: a maximum, rounded down.
    expect(spotLimitParams(market(true), 'sell', '3', '2').price).toBe('0.333333333333333333')
  })
})

describe('perps', () => {
  const book = { bestBid: '84957.5', bestAsk: '85093.5' } as OrderBook
  it('prices a market order 1% through the far side of the book', () => {
    expect(perpMarketPrice(book, 'buy', 1)).toBe('85944.44')
    expect(perpMarketPrice(book, 'sell', 1)).toBe('84107.92')
    expect(perpMarketPrice({ ...book, bestAsk: null } as OrderBook, 'buy', 1)).toBeNull()
  })
  it('closes a position reduce-only, 2% through the mark, never flipping', () => {
    expect(perpCloseParams('BTC-USD-PERP', '-0.1', '85000')).toEqual({
      market_id: 'BTC-USD-PERP',
      side: 'buy',
      size: '0.1',
      price: '86700',
      reduce_only: true,
      tif: 'ioc',
    })
    expect(perpCloseParams('BTC-USD-PERP', '0.1', '85000')).toMatchObject({ side: 'sell', price: '83300' })
  })
})
