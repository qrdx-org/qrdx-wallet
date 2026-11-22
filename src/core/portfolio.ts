/**
 * One portfolio across every network: the account's holdings on QRDX, each EVM network,
 * Bitcoin and Solana, fetched in parallel, grouped by asset (USDC on Base, on Arbitrum and on
 * QRDX is one USDC with three holdings) and priced.
 *
 * Prices are real market prices or absent: CoinGecko for the coin a holding stands for, the
 * QRDX trade API for QRDX. A test network's coin is shown at its real coin's price (Sepolia ETH
 * at ETH's, QRDX testnet USDC at USDC's), and counted in the total like any other.
 *
 * Verified (src/core/token-trust.ts): the network's own coin, a token its registry lists by
 * address, a QRDX verified asset, or a token the user trusts. Anything else is priced nowhere
 * and folded away unless the user shows unverified tokens.
 */

import { chainFamily, isListedToken, isQrdxChain, type ChainConfig, type ChainToken } from './chains'
import type { TokenBalance } from './ethereum'
import type { WalletAccount } from './types'
import { fetchBalances } from './tx-service'
import { exchange } from './exchange-client'
import { addressOn, fetchOtherBalances, type ChainAddresses } from './other-chains'
import { fetchPrices, symbolToCoingeckoId, type TokenPrice } from './prices'
import { qrdxUsdPrice, tradeUsdPrice } from './trade/prices'
import { isTrustedToken, qrdxVerifiedAssets, type VerifiedAsset } from './token-trust'
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
  /** Verified, or trusted by the user: shown with the rest, and priced. */
  listed: boolean
  /** Not verified, but the user trusts it. */
  trusted?: boolean
  /** The coin whose market prices it (CoinGecko id). */
  coingeckoId?: string
  /** QRDX verified asset: its slug, for the trade API's price when CoinGecko has none. */
  qrdxSlug?: string
  price?: TokenPrice
  /** Value in USD, when priced. */
  usd?: number
}

export interface Asset {
  /** coingecko id for priced coins (so one coin across networks is one asset), else chain:address. */
  key: string
  symbol: string
  name: string
  listed: boolean
  holdings: Holding[]
  price?: TokenPrice
  /** Value of every holding, test networks' included (at the real coin's price). */
  usd: number
  /** Only on test networks. */
  testnet: boolean
}

export interface Portfolio {
  assets: Asset[]
  /** Value in USD, and its change over 24 hours, weighted by holding. */
  usd: number
  change24hUsd: number
  /** Networks that did not answer: their holdings are missing, not zero. */
  failed: ChainConfig[]
  at: number
}

/** The networks a portfolio covers: the account's QRDX network first, every mainnet, and test networks when shown. */
export function portfolioChains(all: ChainConfig[], qrdx: ChainConfig, showTestnets: boolean): ChainConfig[] {
  return [qrdx, ...all.filter((c) => !isQrdxChain(c) && !c.notLive && (showTestnets || !c.isTestnet))]
}

/**
 * The coin a token stands for, by CoinGecko id: the registry's id for a listed token; the
 * network's own coin by its symbol (test networks' too: Sepolia ETH is priced as ETH); a QRDX
 * verified asset or a trusted token by its symbol. QRDX itself is priced by the trade API.
 */
export function priceIdFor(chain: ChainConfig, address: string, symbol: string, verified?: VerifiedAsset, trusted?: boolean): string | undefined {
  const listed = chain.tokens.find((t) => t.address.toLowerCase() === address.toLowerCase())
  if (listed?.coingeckoId) return listed.coingeckoId
  if (!address) return isQrdxChain(chain) ? undefined : symbolToCoingeckoId(chain.nativeCurrency.symbol)
  if (verified) return symbolToCoingeckoId(verified.symbol)
  if (listed || trusted) return symbolToCoingeckoId(symbol)
  return undefined
}

async function holdingsOn(
  chain: ChainConfig,
  account: WalletAccount,
  addresses: ChainAddresses | null,
  extraTokens: (chainId: string) => Promise<ChainToken[]>
): Promise<Holding[]> {
  const verifiedAssets = await qrdxVerifiedAssets(chain)
  const make = (b: TokenBalance, credential?: 'classic' | 'pq'): Holding => {
    const verified = b.address ? verifiedAssets.get(b.address.toLowerCase()) : undefined
    const listed = isListedToken(chain, b.address) || !!verified
    const trusted = !listed && isTrustedToken(chain.id, b.address)
    return {
      chain,
      address: b.address,
      // A verified asset shows as the coin it stands for (qUSDC as USDC).
      symbol: verified?.symbol ?? b.symbol,
      name: b.name,
      decimals: b.decimals,
      raw: b.rawBalance,
      credential,
      listed: listed || trusted,
      trusted: trusted || undefined,
      coingeckoId: priceIdFor(chain, b.address, b.symbol, verified, trusted),
      qrdxSlug: verified?.slug,
    }
  }
  if (chainFamily(chain) !== 'evm') {
    const address = addressOn(chain, addresses)
    return address ? (await fetchOtherBalances(chain, address)).map((b) => make(b)) : []
  }
  const watched = await extraTokens(chain.id).catch(() => [])
  if (!isQrdxChain(chain)) return account.ethAddress ? (await fetchBalances(chain, account, 'classic', watched)).map((b) => make(b)) : []
  // QRDX: both addresses, and every token the node lists.
  const native = await exchange
    .tokens(chain)
    .then((l) => l.map((t) => ({ address: t.token_address, symbol: t.symbol, name: t.name, decimals: t.decimals })))
    .catch(() => [])
  const extra = [...native, ...watched]
  // A watched address (watch-list.ts) fills one of the two.
  const [classic, pq] = await Promise.all([
    account.ethAddress ? fetchBalances(chain, account, 'classic', extra) : [],
    account.pqAccountId ? fetchBalances(chain, account, 'pq', extra).catch(() => []) : [],
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

  // Real prices only: CoinGecko for the coin each verified holding stands for, the trade API
  // for QRDX and for QRDX verified assets CoinGecko does not price.
  const ids = [...new Set(holdings.filter((h) => h.listed && h.coingeckoId).map((h) => h.coingeckoId!))]
  const tradeOnly = holdings.filter((h) => h.listed && !h.coingeckoId && h.qrdxSlug)
  const [cg, qrdxPrice, tradePrices] = await Promise.all([
    ids.length ? fetchPrices(ids).catch(() => new Map<string, TokenPrice>()) : Promise.resolve(new Map<string, TokenPrice>()),
    qrdxUsdPrice(input.chains[0]).catch(() => null),
    Promise.all(tradeOnly.map((h) => tradeUsdPrice(h.chain, h.qrdxSlug!).then((p) => [h.qrdxSlug!, p] as const))).then((l) => new Map(l)),
  ])
  for (const h of holdings) {
    const price = isQrdxChain(h.chain) && h.address === '' ? qrdxPrice : !h.listed ? null : h.coingeckoId ? cg.get(h.coingeckoId) : h.qrdxSlug ? tradePrices.get(h.qrdxSlug) : null
    if (!price) continue
    h.price = price
    h.usd = Number(formatUnitsExact(h.raw, h.decimals)) * price.usd
  }
  return { ...summarize(groupHoldings(holdings)), failed, at: Date.now() }
}

/** Group holdings into assets: the same verified coin across networks (test networks' too) is one asset. */
export function groupHoldings(holdings: Holding[]): Asset[] {
  const byKey = new Map<string, Asset>()
  for (const h of holdings) {
    const key = isQrdxChain(h.chain) && h.address === '' ? 'qrdx' : h.listed && h.coingeckoId ? `cg:${h.coingeckoId}` : `${h.chain.id}:${h.address.toLowerCase()}`
    const a = byKey.get(key) ?? ({ key, symbol: h.symbol, name: h.name, listed: h.listed, holdings: [], price: h.price, usd: 0, testnet: true } as Asset)
    a.holdings.push(h)
    a.usd += h.usd ?? 0
    if (!h.chain.isTestnet) {
      a.testnet = false
      // The mainnet holding names the asset (ETH, not Sepolia ETH).
      a.name = h.name
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
      y.usd - x.usd ||
      Number(y.listed) - Number(x.listed) ||
      x.symbol.localeCompare(y.symbol)
  )
}

function summarize(assets: Asset[]): Omit<Portfolio, 'failed' | 'at'> {
  let usd = 0
  let before = 0
  for (const a of assets) {
    usd += a.usd
    const change = a.price?.usd_24h_change
    before += change != null ? a.usd / (1 + change / 100) : a.usd
  }
  return { assets, usd, change24hUsd: usd - before }
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
