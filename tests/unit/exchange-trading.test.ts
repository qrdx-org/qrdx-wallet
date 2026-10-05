/**
 * Trading support: pending exchange nonces and the approval-window decoding of
 * exchange operations (docs/DAPP_INTEGRATION.md, qrdx-trade).
 */
import { describe, it, expect } from 'vitest'
import { ExchangeNonceTracker, isNonceConflict } from '../../src/core/exchange-nonce'
import {
  canonicalPair,
  describeExchangeOp,
  groupDigits,
  tokenAddressesIn,
} from '../../src/core/exchange-describe'

const SENDER = '0xPQ' + 'ab'.repeat(32)
const BTC = '0x0e3524986b660821eb1417212fc3b02de54e5658'
const USDC = '0x2a8f3d5cbfc77e2913ca8aaf1d4009ad3bf11ca7'
const tokens = { [BTC]: { symbol: 'qBTC' }, [USDC]: { symbol: 'qUSDC' } }

describe('ExchangeNonceTracker', () => {
  it('hands out the committed nonce when nothing is pending', () => {
    expect(new ExchangeNonceTracker().next('qrdx', SENDER, 7)).toBe(7)
  })

  it('skips nonces still waiting for a block', () => {
    const t = new ExchangeNonceTracker()
    t.record('qrdx', SENDER, 7)
    t.record('qrdx', SENDER, 8)
    expect(t.next('qrdx', SENDER, 7)).toBe(9)
  })

  it('fills the first hole, because the node includes only a gap-free run', () => {
    const t = new ExchangeNonceTracker()
    t.record('qrdx', SENDER, 7)
    t.record('qrdx', SENDER, 9)
    expect(t.next('qrdx', SENDER, 7)).toBe(8)
  })

  it('forgets nonces a block has committed', () => {
    const t = new ExchangeNonceTracker()
    t.record('qrdx', SENDER, 7)
    t.record('qrdx', SENDER, 8)
    expect(t.next('qrdx', SENDER, 9)).toBe(9)
    expect(t.held('qrdx', SENDER, 9)).toEqual([])
  })

  it('expires a nonce whose transaction the node dropped', () => {
    let now = 0
    const t = new ExchangeNonceTracker(1_000, () => now)
    t.record('qrdx', SENDER, 7)
    now = 2_000
    expect(t.next('qrdx', SENDER, 7)).toBe(7)
  })

  it('keeps chains and senders apart, and ignores address case', () => {
    const t = new ExchangeNonceTracker()
    t.record('qrdx-mainnet', SENDER, 3)
    expect(t.next('qrdx-testnet', SENDER, 3)).toBe(3)
    expect(t.next('qrdx-mainnet', SENDER.toLowerCase().replace('0xpq', '0xPQ'), 3)).toBe(4)
  })

  it('recognises the node refusals that mean "nonce taken"', () => {
    expect(isNonceConflict('nonce 4 already queued for sender')).toBe(true)
    expect(isNonceConflict('nonce too low: 3 < expected 4 (stale/replay)')).toBe(true)
    expect(isNonceConflict('duplicate: transaction already in mempool')).toBe(true)
    expect(isNonceConflict('invalid signature')).toBe(false)
  })
})

describe('describeExchangeOp', () => {
  it('reads a spot order on the canonical pair, whatever order the dApp wrote it in', () => {
    // BTC < USDC by address, so BTC is the base and price is qUSDC per qBTC.
    const s = describeExchangeOp(
      'PLACE_ORDER',
      { pair: `${USDC}:${BTC}`, side: 'buy', order_type: 'limit', price: '85000', amount: '0.5' },
      { tokens }
    )
    expect(s.headline).toBe('Buy 0.5 qBTC at 85,000 qUSDC')
    expect(s.details.find((d) => d.label === 'Locks up to')?.value).toBe('42,500 qUSDC while it rests')
    expect(s.warnings).toEqual([])
  })

  it('also shows the order from the other token side (how an app on the inverse pair shows it)', () => {
    // An ETH/USDC page buys 0.5 ETH at 2642.77; with USDC as token0 the node sees a USDC sell.
    const ETH = '0x5f36765059df36d522fa815429c5777105733417'
    const s = describeExchangeOp(
      'PLACE_ORDER',
      { pair: `${USDC}:${ETH}`, side: 'sell', order_type: 'limit', price: '0.000378390855049816', amount: '1321.385' },
      { tokens: { ...tokens, [ETH]: { symbol: 'qETH' } } }
    )
    expect(s.headline).toBe('Sell 1,321.385 qUSDC at 0.000378390855049816 qETH')
    expect(s.details.find((d) => d.label === 'Same as')?.value).toBe('Buy 0.5 qETH at 2,642.77 qUSDC')
  })

  it('states a swap minimum and warns when there is none', () => {
    const ok = describeExchangeOp(
      'SWAP',
      { token_in: USDC, token_out: BTC, amount_in: '1000', min_amount_out: '0.0117' },
      { tokens }
    )
    expect(ok.headline).toBe('Swap 1,000 qUSDC for at least 0.0117 qBTC')
    expect(ok.warnings).toEqual([])
    const open = describeExchangeOp('SWAP', { token_in: USDC, token_out: BTC, amount_in: '1000' }, { tokens })
    expect(open.headline).toContain('at any price')
    expect(open.warnings[0]).toMatch(/No minimum output/)
  })

  it('flags a token the node does not know instead of trusting a symbol', () => {
    const fake = '0x' + '99'.repeat(20)
    const s = describeExchangeOp(
      'SWAP',
      { token_in: USDC, token_out: fake, amount_in: '5', min_amount_out: '1' },
      { tokens: { ...tokens, [fake]: null } }
    )
    expect(s.warnings.some((w) => w.includes(fake))).toBe(true)
  })

  it('describes perp orders, including close-only IOC', () => {
    const s = describeExchangeOp(
      'PERP_ORDER',
      { market_id: 'BTC-USD-PERP', side: 'sell', size: '1', price: '64000', reduce_only: true, tif: 'ioc' },
      { tokens: {} }
    )
    expect(s.headline).toBe('Close-only sell 1 BTC-USD-PERP at up to 64,000')
  })

  it('shows the deposit a liquidity add will take', () => {
    const s = describeExchangeOp(
      'ADD_LIQUIDITY',
      { pool_id: 'p1', tick_lower: -600, tick_upper: 600, amount: '1000' },
      { tokens, pool: { token0: BTC, token1: USDC }, liquidityCost: { amount0: '0.1', amount1: '8500' } }
    )
    expect(s.headline).toBe('Add liquidity to qBTC/qUSDC')
    expect(s.details.find((d) => d.label === 'Deposit')?.value).toBe('0.1 qBTC + 8,500 qUSDC')
  })

  it('describes a token launch: deploy with fixed supply, and its pool before the token exists', () => {
    const d = describeExchangeOp('TOKEN_DEPLOY', { name: 'Quantum Frog', symbol: 'QFROG', decimals: 18, initial_supply: '1000000000' }, { tokens: {} })
    expect(d.headline).toBe('Create token Quantum Frog (QFROG) with 1,000,000,000 supply')
    expect(d.details.find((x) => x.label === 'Supply')?.value).toBe('Fixed forever')
    expect(d.warnings).toEqual([])
    const minted = describeExchangeOp('TOKEN_DEPLOY', { name: 'X', symbol: 'X', initial_supply: '1', mint_authority: '0x' + '12'.repeat(20) }, { tokens: {} })
    expect(minted.warnings[0]).toMatch(/able to mint more X/)

    const NEW = '0x0000000000000000000000000000000000000abc'
    const p = describeExchangeOp(
      'CREATE_POOL',
      { token0: NEW, token1: USDC, fee_tier: 10000, pool_type: 'SUBSIDIZED', initial_price: '0.000004', stake_amount: '5000' },
      { tokens: { [NEW]: null, [USDC]: { symbol: 'qUSDC' } } }
    )
    expect(p.headline).toBe('Create pool 0x000000…0abc/qUSDC: 1 0x000000…0abc = 0.000004 qUSDC')
    expect(p.details.find((x) => x.label === 'Same as')?.value).toBe('1 qUSDC = 250,000 0x000000…0abc')
    expect(p.details.find((x) => x.label === '0x000000…0abc')?.value).toMatch(/not created yet/)
    expect(p.warnings).toEqual(['5,000 QRDX is burned. You cannot get it back.'])
    expect(p.details.find((x) => x.label === 'Fee')?.value).toBe('1%')
  })

  it('collects every token address a request names', () => {
    expect(tokenAddressesIn({ pair: `${USDC}:${BTC}`, token_in: BTC.toUpperCase().replace('0X', '0x') }).sort()).toEqual(
      [BTC, USDC].sort()
    )
    expect(canonicalPair(`${USDC}:${BTC}`)).toEqual([BTC, USDC])
    expect(groupDigits('1234567.891')).toBe('1,234,567.891')
    expect(groupDigits('1000.000000000000000000')).toBe('1,000')
    expect(groupDigits('100')).toBe('100')
  })
})
