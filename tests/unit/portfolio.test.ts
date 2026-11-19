/**
 * The cross-network portfolio (src/core/portfolio.ts), bridge deposits (src/core/bridge.ts),
 * aggregator links (src/core/aggregators.ts) and signing Solana v0 transactions (src/core/solana.ts).
 */
import { describe, it, expect } from 'vitest'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58 } from '@scure/base'
import { CHAINS } from '../../src/core/chains'
import { groupHoldings, assetAmount, portfolioChains, type Holding } from '../../src/core/portfolio'
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
    // Test networks' value is kept apart from the real total.
    expect(assets[0].usd).toBe(0)
    expect(assets[0].testnetUsd).toBe(800)
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
})
