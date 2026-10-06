/**
 * The trade API (trade.qrdx.org/api, qrdx-trade docs/API.md) for the wallet's
 * trading screen: markets, books, candles, quotes and the account, already
 * oriented by pair and labelled by source. Read-only; everything the wallet
 * signs is built locally (./orders.ts) and signed with the account's PQ key.
 *
 * Each QRDX network has its API. Before trusting one, the wallet checks that it
 * serves the chain the wallet is on (`verifyTradeApi`).
 */

import type { ChainConfig } from '../chains'

const TRADE_URL = (process.env.NEXT_PUBLIC_QRDX_TRADE_URL || 'https://trade.qrdx.org').replace(/\/$/, '')
/** The local network's API: the trade site in development, with its test slot pointed at the local node. */
const LOCAL_API = (process.env.NEXT_PUBLIC_QRDX_TRADE_LOCAL_API || 'http://127.0.0.1:3100/api/v1-test').replace(/\/$/, '')

/** API base for a QRDX chain, or null for chains without one. */
export function tradeApiBase(chain: ChainConfig): string | null {
  switch (chain.id) {
    case 'qrdx-mainnet':
      return `${TRADE_URL}/api/v1`
    case 'qrdx-testnet':
      return `${TRADE_URL}/api/v1-test`
    case 'qrdx-local':
      return LOCAL_API
    default:
      return null
  }
}

/** The trade site page for a market path (/trade/btc/usdc), to continue on a bigger screen. */
export function tradeSiteUrl(chain: ChainConfig, path: string): string {
  const base = tradeApiBase(chain)
  return base ? base.replace(/\/api\/v1(-test)?$/, '') + path : TRADE_URL + path
}

export class TradeApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function tradeGet<T>(base: string, path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(base + path, {
      signal: signal ?? AbortSignal.timeout(12_000),
      headers: { accept: 'application/json' },
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new TradeApiError('The trading service is unreachable.', 0)
  }
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) throw new TradeApiError(body?.error?.message ?? `Trading service error (HTTP ${res.status})`, res.status)
  return body as T
}

export interface TradeApiStatus {
  ok: boolean
  message?: string
}

/** Does the API serve this chain? A mismatch would show another network's markets. */
export async function verifyTradeApi(chain: ChainConfig): Promise<TradeApiStatus> {
  const base = tradeApiBase(chain)
  if (!base) return { ok: false, message: `${chain.name} has no trading service.` }
  try {
    const info = await tradeGet<{ chainId: number; networkName: string }>(base, '')
    if (info.chainId !== chain.chainId)
      return { ok: false, message: `The trading service at ${base} serves ${info.networkName} (chain ${info.chainId}), not ${chain.name}.` }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
