/**
 * One portfolio across every network: the account's holdings on QRDX, each EVM network,
 * Bitcoin and Solana, fetched in parallel, grouped by asset (USDC on Base and on Arbitrum is
 * one USDC with two holdings) and priced.
 *
 * Prices are real or absent: CoinGecko for coins the registry lists by address, the QRDX trade
 * API for QRDX. Test networks' holdings are never added to the real total: their value (QRDX
 * testnet's own market) is reported apart.
 */

import { chainFamily, isListedToken, isQrdxChain, type ChainConfig, type ChainToken } from './chains'
import type { TokenBalance } from './ethereum'
import type { WalletAccount } from './types'
import { fetchBalances } from './tx-service'
import { exchange } from './exchange-client'
import { addressOn, fetchOtherBalances, type ChainAddresses } from './other-chains'
import { fetchPrices, type TokenPrice } from './prices'
import { qrdxUsdPrice } from './trade/prices'
import { formatUnitsExact } from './balances'

export interface Holding {
  chain: ChainConfig
  /** Token address on `chain` ('' for its own coin; a mint on Solana). */
  address: string
  symbol: string
  name: string
  decimals: number
  raw: bigint
  /** QRDX: which of the account's two addresses holds it. */
  credential?: 'classic' | 'pq'
  /** Listed for its network by address (chains.ts isListedToken). */
  listed: boolean
  coingeckoId?: string
  price?: TokenPrice
  /** Value in USD, when priced. */
  usd?: number
}

export interface Asset {
  /** coingecko id for listed coins (so one coin across networks is one asset), else chain:address. */
  key: string
  symbol: string
  name: string
  listed: boolean
  holdings: Holding[]
  price?: TokenPrice
  /** Value of the mainnet holdings; testnet value apart. */
  usd: number
  testnetUsd: number
  /** Only on test networks. */
  testnet: boolean
}

export interface Portfolio {
  assets: Asset[]
  /** Mainnet value in USD, and its change over 24 hours, weighted by holding. */
  usd: number
  change24hUsd: number
  testnetUsd: number
  /** Networks that did not answer: their holdings are missing, not zero. */
  failed: ChainConfig[]
  at: number
}

/** The networks a portfolio covers: the account's QRDX network first, every mainnet, and test networks when shown. */
export function portfolioChains(all: ChainConfig[], qrdx: ChainConfig, showTestnets: boolean): ChainConfig[] {
  return [qrdx, ...all.filter((c) => !isQrdxChain(c) && !c.notLive && (showTestnets || !c.isTestnet))]
}

const coingeckoIdOf = (chain: ChainConfig, address: string): string | undefined =>
  chain.tokens.find((t) => t.address.toLowerCase() === address.toLowerCase())?.coingeckoId

async function holdingsOn(
  chain: ChainConfig,
  account: WalletAccount,
  addresses: ChainAddresses | null,
  extraTokens: (chainId: string) => Promise<ChainToken[]>
): Promise<Holding[]> {
  const make = (b: TokenBalance, credential?: 'classic' | 'pq'): Holding => ({
    chain,
    address: b.address,
    symbol: b.symbol,
    name: b.name,
    decimals: b.decimals,
    raw: b.rawBalance,
    credential,
    listed: isListedToken(chain, b.address),
    coingeckoId: coingeckoIdOf(chain, b.address),
  })
  if (chainFamily(chain) !== 'evm') {
    const address = addressOn(chain, addresses)
    return address ? (await fetchOtherBalances(chain, address)).map((b) => make(b)) : []
  }
  const watched = await extraTokens(chain.id).catch(() => [])
  if (!isQrdxChain(chain)) return (await fetchBalances(chain, account, 'classic', watched)).map((b) => make(b))
  // QRDX: both addresses, and every token the node lists.
  const native = await exchange
    .tokens(chain)
    .then((l) => l.map((t) => ({ address: t.token_address, symbol: t.symbol, name: t.name, decimals: t.decimals })))
    .catch(() => [])
  const extra = [...native, ...watched]
  const [classic, pq] = await Promise.all([
    fetchBalances(chain, account, 'classic', extra),
    fetchBalances(chain, account, 'pq', extra).catch(() => []),
  ])
  return [...classic.map((b) => make(b, 'classic')), ...pq.map((b) => make(b, 'pq'))]
}

export async function fetchPortfolio(input: {
  chains: ChainConfig[]
  account: WalletAccount
  addresses: ChainAddresses | null
  extraTokens: (chainId: string) => Promise<ChainToken[]>
}): Promise<Portfolio> {
  const failed: ChainConfig[] = []
  const lists = await Promise.all(
    input.chains.map((c) =>
      holdingsOn(c, input.account, input.addresses, input.extraTokens).catch(() => {
        failed.push(c)
        return [] as Holding[]
      })
    )
  )
  // Keep what is held, and each network's own coin on QRDX (the home of the account).
  const holdings = lists.flat().filter((h) => h.raw > 0n || (isQrdxChain(h.chain) && h.address === '' && h.credential === 'pq'))

  // Real prices only: CoinGecko for listed coins on mainnets, the trade API for QRDX.
  const ids = [...new Set(holdings.filter((h) => !h.chain.isTestnet && h.listed && h.coingeckoId).map((h) => h.coingeckoId!))]
  const [cg, qrdxPrice] = await Promise.all([
    ids.length ? fetchPrices(ids).catch(() => new Map<string, TokenPrice>()) : Promise.resolve(new Map<string, TokenPrice>()),
    qrdxUsdPrice(input.chains[0]).catch(() => null),
  ])
  for (const h of holdings) {
    const price = isQrdxChain(h.chain) && h.address === '' ? (qrdxPrice ?? undefined) : !h.chain.isTestnet && h.listed && h.coingeckoId ? cg.get(h.coingeckoId) : undefined
    if (!price) continue
    h.price = price
    h.usd = Number(formatUnitsExact(h.raw, h.decimals)) * price.usd
  }
  return { ...summarize(groupHoldings(holdings)), failed, at: Date.now() }
}

/** Group holdings into assets: the same listed coin across networks is one asset. */
export function groupHoldings(holdings: Holding[]): Asset[] {
  const byKey = new Map<string, Asset>()
  for (const h of holdings) {
    const key = isQrdxChain(h.chain) && h.address === '' ? 'qrdx' : h.listed && h.coingeckoId && !h.chain.isTestnet ? `cg:${h.coingeckoId}` : `${h.chain.id}:${h.address.toLowerCase()}`
    const a =
      byKey.get(key) ??
      ({ key, symbol: h.symbol, name: h.name, listed: h.listed, holdings: [], price: h.price, usd: 0, testnetUsd: 0, testnet: true } as Asset)
    a.holdings.push(h)
    if (h.chain.isTestnet) a.testnetUsd += h.usd ?? 0
    else {
      a.usd += h.usd ?? 0
      a.testnet = false
    }
    a.price ??= h.price
    byKey.set(key, a)
  }
  const assets = [...byKey.values()]
  for (const a of assets) a.holdings.sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0) || Number(y.raw - x.raw))
  // QRDX first (the wallet's home), then by value, then verified before not.
  return assets.sort(
    (x, y) =>
      Number(y.key === 'qrdx') - Number(x.key === 'qrdx') ||
      y.usd + y.testnetUsd - (x.usd + x.testnetUsd) ||
      Number(y.listed) - Number(x.listed) ||
      x.symbol.localeCompare(y.symbol)
  )
}

function summarize(assets: Asset[]): Omit<Portfolio, 'failed' | 'at'> {
  let usd = 0
  let before = 0
  let testnetUsd = 0
  for (const a of assets) {
    usd += a.usd
    testnetUsd += a.testnetUsd
    const change = a.price?.usd_24h_change
    before += change != null ? a.usd / (1 + change / 100) : a.usd
  }
  return { assets, usd, change24hUsd: usd - before, testnetUsd }
}

/** An asset's amount, when every holding has the same decimals (one coin); else null. */
export function assetAmount(a: Asset): string | null {
  const d = a.holdings[0]?.decimals
  if (a.holdings.some((h) => h.decimals !== d)) return null
  return formatUnitsExact(
    a.holdings.reduce((s, h) => s + h.raw, 0n),
    d
  )
}
