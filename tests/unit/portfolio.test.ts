/**
 * The cross-network portfolio (src/core/portfolio.ts), bridge deposits (src/core/bridge.ts),
 * aggregator links (src/core/aggregators.ts) and signing Solana v0 transactions (src/core/solana.ts).
 */
import { describe, it, expect } from 'vitest'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58 } from '@scure/base'
import { CHAINS } from '../../src/core/chains'
import { groupHoldings, assetAmount, portfolioChains, priceIdFor, type Holding } from '../../src/core/portfolio'
import { bridgeRouteFor, encodeLockboxDeposit } from '../../src/core/bridge'
import { dexLink } from '../../src/core/aggregators'
import { signSolMessage, solAddressOf, solPrivateKey, splitTransaction, withPayerSignature } from '../../src/core/solana'
import type { TokenPrice } from '../../src/core/prices'

const price = (id: string, usd: number, change = 0): TokenPrice => ({ id, usd, usd_24h_change: change, lastUpdated: 0 })
const h = (chain: keyof typeof CHAINS, address: string, symbol: string, raw: bigint, decimals: number, p?: TokenPrice): Holding => {
  const c = CHAINS[chain]
  const t = c.tokens.find((x) => x.address.toLowerCase() === address.toLowerCase())
  const usd = p ? (Number(raw) / 10 ** decimals) * p.usd : undefined
  return { chain: c, address, symbol, name: symbol, decimals, raw, listed: !!t || !address, coingeckoId: t?.coingeckoId, price: p, usd }
}

describe('portfolio', () => {
  it('groups one coin across networks and puts QRDX first', () => {
    const usdc = price('usd-coin', 1)
    const assets = groupHoldings([
      h('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 5_000_000n, 6, usdc),
      h('arbitrum', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 7_000_000n, 6, usdc),
      h('ethereum', '', 'ETH', 10n ** 18n, 18, price('ethereum', 2000)),
      h('qrdx-testnet', '', 'QRDX', 2n * 10n ** 18n, 18, price('qrdx', 400)),
    ])
    expect(assets[0].key).toBe('qrdx')
    const u = assets.find((a) => a.symbol === 'USDC')!
    expect(u.holdings).toHaveLength(2)
    expect(u.usd).toBeCloseTo(12)
    expect(assetAmount(u)).toBe('12')
    // QRDX testnet is valued like any other network.
    expect(assets[0].usd).toBe(800)
  })

  it('prices test coins and QRDX verified assets as the real coin, and unverified tokens not at all', () => {
    expect(priceIdFor(CHAINS['ethereum-sepolia'], '', 'ETH')).toBe('ethereum')
    expect(priceIdFor(CHAINS['bitcoin-testnet'], '', 'BTC')).toBe('bitcoin')
    expect(priceIdFor(CHAINS['solana-devnet'], '', 'SOL')).toBe('solana')
    // QRDX itself: the trade API prices it.
    expect(priceIdFor(CHAINS['qrdx-testnet'], '', 'QRDX')).toBeUndefined()
    const usdc = '0xa0ad4f35bf2d518a62ebb7e39a32a8f791703362'
    expect(priceIdFor(CHAINS['qrdx-testnet'], usdc, 'USDC', { symbol: 'USDC', slug: 'usdc' })).toBe('usd-coin')
    expect(priceIdFor(CHAINS['qrdx-testnet'], usdc, 'USDC')).toBeUndefined()
    expect(priceIdFor(CHAINS['qrdx-testnet'], usdc, 'USDC', undefined, true)).toBe('usd-coin')
  })

  it('puts a test network\'s USDC with the real one', () => {
    const usdc = price('usd-coin', 1)
    const test: Holding = { ...h('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 3_000_000n, 6, usdc), chain: CHAINS['qrdx-testnet'], address: '0xa0ad4f35bf2d518a62ebb7e39a32a8f791703362', listed: true }
    const assets = groupHoldings([h('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 5_000_000n, 6, usdc), test])
    expect(assets).toHaveLength(1)
    expect(assets[0].usd).toBeCloseTo(8)
    expect(assets[0].testnet).toBe(false)
  })

  it('keeps an unlisted token named USDC apart from USDC', () => {
    const assets = groupHoldings([
      h('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 1n, 6, price('usd-coin', 1)),
      h('base', '0x000000000000000000000000000000000000dEaD', 'USDC', 1n, 6),
    ])
    expect(assets).toHaveLength(2)
    expect(assets.find((a) => !a.listed)!.usd).toBe(0)
  })

  it('covers the QRDX network, every mainnet, and test networks only when shown', () => {
    const all = Object.values(CHAINS)
    const main = portfolioChains(all, CHAINS['qrdx-testnet'], false)
    expect(main[0].id).toBe('qrdx-testnet')
    expect(main.some((c) => c.id === 'bitcoin') && main.some((c) => c.id === 'solana')).toBe(true)
    expect(main.some((c) => c.id === 'ethereum-sepolia' || c.id === 'qrdx-mainnet')).toBe(false)
    expect(portfolioChains(all, CHAINS['qrdx-testnet'], true).some((c) => c.id === 'solana-devnet')).toBe(true)
  })
})

describe('bridge', () => {
  const usdc = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
  const config = {
    assets: [{ symbol: 'USDC', chain: 42161, source_token: usdc, token_address: '0x1', decimals: 6, supply: '0' }],
    lockboxes: { 42161: '0x00000000000000000000000000000000000b0c5e' },
  }

  it('finds a route only for a listed token with a lockbox', () => {
    expect(bridgeRouteFor(config, CHAINS.arbitrum, usdc.toUpperCase().replace('0X', '0x'))?.lockbox).toBe(config.lockboxes[42161])
    expect(bridgeRouteFor(config, CHAINS.arbitrum, '')).toBeNull()
    expect(bridgeRouteFor(config, CHAINS.base, usdc)).toBeNull()
  })

  it('encodes deposit(address,uint256,string)', () => {
    const recipient = '0xPQ815De541E3eB474F46489Ed3e84dE708d816fB91317045B79493383Ef5622400'
    const data = encodeLockboxDeposit(usdc, 1_500_000n, recipient)
    const selector = Array.from(keccak256(new TextEncoder().encode('deposit(address,uint256,string)')).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('')
    expect(data.slice(2, 10)).toBe(selector)
    const words = data.slice(10).match(/.{64}/g)!
    expect(BigInt('0x' + words[0])).toBe(BigInt(usdc))
    expect(BigInt('0x' + words[1])).toBe(1_500_000n)
    expect(BigInt('0x' + words[2])).toBe(96n)
    expect(Number(BigInt('0x' + words[3]))).toBe(recipient.length)
    const text = words.slice(4).join('').slice(0, recipient.length * 2)
    expect(new TextDecoder().decode(Uint8Array.from(text.match(/../g)!, (b) => parseInt(b, 16)))).toBe(recipient)
  })
})

describe('aggregators', () => {
  it('links the DEX each network uses', () => {
    const eth = { address: '', symbol: 'ETH', decimals: 18 }
    const usdc = { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 }
    expect(dexLink(CHAINS.ethereum, eth, usdc)?.url).toBe(`https://app.uniswap.org/swap?chain=mainnet&inputCurrency=ETH&outputCurrency=${usdc.address}`)
    expect(dexLink(CHAINS.bsc, { address: '', symbol: 'BNB', decimals: 18 }, usdc)?.name).toBe('PancakeSwap')
    expect(dexLink(CHAINS.solana, { address: '', symbol: 'SOL', decimals: 9 }, { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 })?.url).toContain('raydium.io/swap/?inputMint=sol')
    expect(dexLink(CHAINS.bitcoin, { address: '', symbol: 'BTC', decimals: 8 }, eth)).toBeNull()
  })
})

describe('solana v0 transactions', () => {
  it('signs a v0 message paid for by the account, into the payer slot', () => {
    const secret = { type: 'hd' as const, mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' }
    const key = solPrivateKey(secret, 0)!
    const payer = base58.decode(solAddressOf(key))
    // 0x80 (v0), header [1,0,1], 2 accounts, blockhash, no instructions, no lookups.
    const message = new Uint8Array([0x80, 1, 0, 1, 2, ...payer, ...new Uint8Array(32).fill(9), ...new Uint8Array(32).fill(7), 0, 0])
    const tx = new Uint8Array([1, ...new Uint8Array(64), ...message])
    const split = splitTransaction(tx)
    expect(split.signatures).toBe(1)
    expect(split.message).toEqual(message)
    const sig = signSolMessage(split.message, key)
    const signed = withPayerSignature(tx, sig)
    expect(ed25519.verify(signed.slice(1, 65), message, payer)).toBe(true)
    const other = new Uint8Array(message)
    other.set(new Uint8Array(32).fill(3), 5)
    expect(() => signSolMessage(other, key)).toThrow(/not paid for/)
  })
})

describe('value history', () => {
  it('rebuilds holdings backwards from today through each change', async () => {
    const { amountsOver } = await import('../../src/core/portfolio-history')
    // Now 10; received 4 at t=200s, sent 3 (fee included) at t=500s.
    const changes = [
      { time: 500, token: '', delta: -3n },
      { time: 200, token: '', delta: 4n },
    ]
    const times = [100_000, 300_000, 600_000]
    expect(amountsOver(10n, changes, times)).toEqual([9n, 13n, 10n])
    // A history that does not reach back far enough never goes below zero.
    expect(amountsOver(1n, [{ time: 50, token: '', delta: 5n }], [0])).toEqual([0n])
  })

  it('reads QRDX index rows: fees, transfers both ways, swaps, failures', async () => {
    const { qrdxRowEvents } = await import('../../src/core/portfolio-history')
    const me = '0xpqabc'
    const usdc = '0xa0ad4f35bf2d518a62ebb7e39a32a8f791703362'
    const decimals = (t: string) => (t === usdc ? 18 : undefined)
    const row = (r: Record<string, unknown>) => ({ block_height: 1, tx_hash: 'x', timestamp: 100, kind: 'exchange', op: null, sender: null, target: null, asset: null, amount: null, status: 'success', fee: null, error: null, detail: null, ...r }) as never
    const e18 = 10n ** 18n
    expect(qrdxRowEvents(row({ op: 'TOKEN_TRANSFER', sender: '0xPQabc', target: '0xother', asset: 'QRDX', amount: '2', fee: '0.5' }), me, 'pq', decimals)).toEqual([
      { time: 100, token: '', delta: -(e18 / 2n), credential: 'pq' },
      { time: 100, token: '', delta: -2n * e18, credential: 'pq' },
    ])
    expect(qrdxRowEvents(row({ op: 'TOKEN_TRANSFER', sender: '0xother', target: '0xPQabc', asset: usdc, amount: '1.5' }), me, 'pq', decimals)).toEqual([{ time: 100, token: usdc, delta: (3n * e18) / 2n, credential: 'pq' }])
    const swap = qrdxRowEvents(row({ op: 'SWAP', sender: '0xpqabc', fee: '0', detail: { params: { token_in: 'QRDX', token_out: usdc, amount_in: '10' }, amount_out: '4' } }), me, 'pq', decimals)
    expect(swap.map((e) => [e.token, e.delta])).toEqual([
      ['', -10n * e18],
      [usdc, 4n * e18],
    ])
    // Failed: only the fee moved. Staking keeps the value in the account: only the fee.
    expect(qrdxRowEvents(row({ op: 'TOKEN_TRANSFER', status: 'failed', sender: '0xpqabc', asset: 'QRDX', amount: '9', fee: '1' }), me, 'pq', decimals).map((e) => e.delta)).toEqual([-e18])
    expect(qrdxRowEvents(row({ op: 'STAKE_DELEGATE', sender: '0xpqabc', asset: 'QRDX', amount: '9', fee: '1' }), me, 'pq', decimals).map((e) => e.delta)).toEqual([-e18])
    // A token whose decimals are unknown is not guessed.
    expect(qrdxRowEvents(row({ op: 'TOKEN_TRANSFER', target: '0xpqabc', asset: '0xdead', amount: '1' }), me, 'pq', decimals)).toEqual([])
  })
})
