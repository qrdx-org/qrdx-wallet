/**
 * The cross-network portfolio (src/core/portfolio.ts), bridge deposits (src/core/bridge.ts),
 * aggregator links (src/core/aggregators.ts) and signing Solana v0 transactions (src/core/solana.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58 } from '@scure/base'
import { CHAINS } from '../../src/core/chains'
import { groupHoldings, assetAmount, portfolioChains, priceIdFor, type Holding } from '../../src/core/portfolio'
import { bridgeRouteFor, encodeLockboxDeposit } from '../../src/core/bridge'
import { dexLink } from '../../src/core/aggregators'
import { signSolMessage, solAddressOf, solPrivateKey, splitTransaction, withPayerSignature } from '../../src/core/solana'
import type { TokenPrice } from '../../src/core/prices'
import { tradeUsdPrice } from '../../src/core/trade/prices'
import { approvalPairs, approvalsSupported, revokeCall } from '../../src/core/approvals'
import { watchAccount, watchChains, watchKind } from '../../src/core/watch-list'
import { toAccountId } from '../../src/core/account-id'

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

describe('QRDX price from the trade API', () => {
  const testnet = CHAINS['qrdx-testnet']
  const ok = (price: string) => new Response(JSON.stringify({ price, change24h: null, source: 'route', asOf: Math.floor(Date.now() / 1000) }))
  afterEach(() => vi.unstubAllGlobals())

  it('tries again once, then keeps the last real price, marked stale', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(ok('443.9'))
    vi.stubGlobal('fetch', fetchMock)
    const fresh = await tradeUsdPrice(testnet, 'qrdx')
    expect(fresh).toMatchObject({ usd: 443.9 })
    expect(fresh?.stale).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    expect(await tradeUsdPrice(testnet, 'qrdx')).toMatchObject({ usd: 443.9, stale: true })
  })

  it('gives nothing for an asset it never priced', async () => {
    const notFound = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Unknown asset' } }), { status: 404 }))
    vi.stubGlobal('fetch', notFound)
    expect(await tradeUsdPrice(testnet, 'never-priced')).toBeNull()
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})

describe('token approvals', () => {
  const me = '0x00000000000000000000000000000000000000aa'
  const token = '0x00000000000000000000000000000000000000bb'
  const router = '0x00000000000000000000000000000000000000cc'
  const word = (a: string) => a.slice(2).padStart(64, '0')
  const tx = (input: string, at: number, extra: Record<string, string> = {}) => ({ from: me, to: token, input, timeStamp: String(at), isError: '0', ...extra })

  it('finds approvals the account sent, keeping the latest per token and spender', () => {
    const pairs = approvalPairs(
      [
        tx(`0x095ea7b3${word(router)}${'f'.repeat(64)}`, 100),
        tx(`0x095ea7b3${word(router)}${'0'.repeat(64)}`, 200),
        tx(`0xa22cb465${word(router)}${word('0x1')}`, 150),
        tx(`0x095ea7b3${word(router)}${'1'.padStart(64, '0')}`, 300, { isError: '1' }),
        tx(`0xa9059cbb${word(router)}${'1'.padStart(64, '0')}`, 400),
        { ...tx(`0x095ea7b3${word(router)}${'1'.padStart(64, '0')}`, 500), from: router },
      ],
      me.toUpperCase().replace('0X', '0x')
    )
    expect([...pairs.values()]).toEqual([
      { token, spender: router, kind: 'amount', at: 200 },
      { token, spender: router, kind: 'all', at: 150 },
    ])
  })

  it('revokes with approve(spender, 0) or setApprovalForAll(operator, false)', () => {
    expect(revokeCall({ token, spender: router, kind: 'amount' })).toEqual({ to: token, data: `0x095ea7b3${word(router)}${'0'.repeat(64)}` })
    expect(revokeCall({ token, spender: router, kind: 'all' })).toEqual({ to: token, data: `0xa22cb465${word(router)}${'0'.repeat(64)}` })
  })

  it('lists approvals only where a keyless explorer reads the account', () => {
    expect(approvalsSupported(CHAINS['ethereum'])).toBe(true)
    expect(approvalsSupported(CHAINS['qrdx-testnet'])).toBe(false)
    expect(approvalsSupported(CHAINS['bitcoin'])).toBe(false)
  })
})

describe('watched addresses', () => {
  const pq = '0xPQ8d30632d776eC1b311f674aE80ECd06d04df27f4bb0f6BEE32693cAFb5AC59D6'
  const eth = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  const btc = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
  const sol = '11111111111111111111111111111111'
  const all = portfolioChains(Object.values(CHAINS), CHAINS['qrdx-testnet'], true)

  it('tells the address apart and reads it only where it exists', () => {
    expect([pq, eth, btc, sol, 'nonsense'].map(watchKind)).toEqual(['pq', 'evm', 'bitcoin', 'solana', null])
    expect(watchChains(pq, all).map((c) => c.id)).toEqual(['qrdx-testnet'])
    expect(watchChains(btc, all).map((c) => c.id)).toEqual(['bitcoin'])
    const evm = watchChains(eth, all)
    expect(evm.some((c) => c.id === 'qrdx-testnet') && evm.some((c) => c.id === 'base')).toBe(true)
    expect(evm.every((c) => c.family !== 'bitcoin' && c.family !== 'solana')).toBe(true)
  })

  it('fills one slot of a key-less stand-in account', () => {
    expect(watchAccount(pq).account).toMatchObject({ ethAddress: '', pqAddress: pq, pqAccountId: toAccountId(pq) })
    expect(watchAccount(eth).account).toMatchObject({ ethAddress: eth, pqAddress: '', pqAccountId: '' })
    expect(watchAccount(eth).addresses).toBeNull()
    expect(watchAccount(btc).addresses).toEqual({ bitcoin: { mainnet: btc, testnet: '' }, solana: null })
  })
})
