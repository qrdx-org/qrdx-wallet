/**
 * Bitcoin and Solana in the wallet's own shapes: balances as TokenBalance (so the
 * token list, prices and portfolio value work unchanged), history as
 * TransactionHistoryItem, and sends planned here, signed by the wallet manager.
 */

import { chainFamily, type ChainConfig } from './chains'
import type { TokenBalance } from './ethereum'
import type { TransactionHistoryItem } from './history'
import { formatUnitsExact } from './balances'
import {
  BTC_EXPLORERS,
  broadcastBtc,
  btcBalance,
  btcFeeRates,
  btcHistory,
  isBtcAddress,
  parseBtc,
  planBtcSend,
  type BtcFeeRates,
  type BtcNetwork,
  type BtcSendPlan,
} from './bitcoin'
import {
  KNOWN_MINTS,
  SOL_EXPLORER,
  confirmSolTransaction,
  isSolAddress,
  parseUnits,
  planSolSend,
  sendSolTransaction,
  serializeSigned,
  solBalance,
  solHistory,
  solRpc,
  splHoldings,
  type SolNetwork,
  type SolSendPlan,
  type SplHolding,
} from './solana'
import { base64 } from '@scure/base'
import { Address, NETWORK, OutScript, TEST_NETWORK } from '@scure/btc-signer'

const btcScriptOf = (address: string, network: BtcNetwork) =>
  OutScript.encode(Address(network === 'mainnet' ? NETWORK : TEST_NETWORK).decode(address))

export const btcNetworkOf = (chain: ChainConfig): BtcNetwork => (chain.isTestnet ? 'testnet' : 'mainnet')
export const solNetworkOf = (chain: ChainConfig): SolNetwork => (chain.isTestnet ? 'devnet' : 'mainnet')

export interface ChainAddresses {
  bitcoin: Record<BtcNetwork, string>
  solana: string | null
}

/** The account's address on a Bitcoin or Solana chain (null: an imported key has no Solana address). */
export function addressOn(chain: ChainConfig, addresses: ChainAddresses | null): string | null {
  if (!addresses) return null
  const family = chainFamily(chain)
  if (family === 'bitcoin') return addresses.bitcoin[btcNetworkOf(chain)]
  if (family === 'solana') return addresses.solana
  return null
}

export function isAddressOn(chain: ChainConfig, address: string): boolean {
  const family = chainFamily(chain)
  if (family === 'bitcoin') return isBtcAddress(address, btcNetworkOf(chain))
  if (family === 'solana') return isSolAddress(address)
  return false
}

export function explorerTxUrl(chain: ChainConfig, id: string): string {
  return chainFamily(chain) === 'bitcoin' ? `${BTC_EXPLORERS[btcNetworkOf(chain)]}/tx/${id}` : SOL_EXPLORER(solNetworkOf(chain), `tx/${id}`)
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string {
  return chainFamily(chain) === 'bitcoin' ? `${BTC_EXPLORERS[btcNetworkOf(chain)]}/address/${address}` : SOL_EXPLORER(solNetworkOf(chain), `address/${address}`)
}

const balance = (address: string, symbol: string, name: string, decimals: number, raw: bigint): TokenBalance => ({
  address,
  symbol,
  name,
  decimals,
  rawBalance: raw,
  formattedBalance: formatUnitsExact(raw, decimals),
})

/** The native coin first, then (Solana) every token held, keyed by mint. */
export async function fetchOtherBalances(chain: ChainConfig, address: string): Promise<TokenBalance[]> {
  const { symbol, name, decimals } = chain.nativeCurrency
  if (chainFamily(chain) === 'bitcoin') {
    const b = await btcBalance(btcNetworkOf(chain), address)
    // Unconfirmed coins count: the wallet spends them, as other wallets do.
    return [balance('', symbol, name, decimals, b.confirmed + b.pending)]
  }
  const network = solNetworkOf(chain)
  const [lamports, tokens] = await Promise.all([solBalance(network, address), splHoldings(network, address).catch(() => [])])
  return [balance('', symbol, name, decimals, lamports), ...tokens.map((t) => balance(t.mint, t.symbol, t.name, t.decimals, t.amount))]
}

export async function fetchOtherHistory(chain: ChainConfig, address: string): Promise<TransactionHistoryItem[]> {
  const { symbol, decimals } = chain.nativeCurrency
  if (chainFamily(chain) === 'bitcoin') {
    const items = await btcHistory(btcNetworkOf(chain), address)
    return items.map((t) => {
      const out = t.delta < 0n
      // A send's delta includes the fee; show what the recipient got.
      const moved = out ? -t.delta - t.fee : t.delta
      return {
        hash: t.txid,
        from: out ? address : (t.counterparty ?? ''),
        to: out ? (t.counterparty ?? '') : address,
        value: `${formatUnitsExact(moved, decimals)} ${symbol}`,
        valueRaw: '0x' + moved.toString(16),
        timestamp: t.time ?? Math.floor(Date.now() / 1000),
        blockNumber: t.height ?? 0,
        status: t.confirmed ? 'confirmed' : 'pending',
        type: out ? 'send' : 'receive',
        explorerUrl: explorerTxUrl(chain, t.txid),
        chainId: chain.id,
        fee: out ? `${formatUnitsExact(t.fee, decimals)} ${symbol}` : undefined,
      }
    })
  }
  const items = await solHistory(solNetworkOf(chain), address)
  return items.map((t) => {
    const out = t.delta < 0n
    const moved = out ? -t.delta : t.delta
    const tokenSymbol = t.mint ? (KNOWN_MINTS[t.mint]?.symbol ?? `${t.mint.slice(0, 4)}…`) : symbol
    const places = t.mint ? (t.decimals ?? 0) : decimals
    return {
      hash: t.signature,
      from: out ? address : (t.counterparty ?? ''),
      to: out ? (t.counterparty ?? '') : address,
      value: t.delta === 0n ? (t.failed ? 'Failed' : 'Program call') : `${formatUnitsExact(moved, places)} ${tokenSymbol}`,
      valueRaw: '0x' + moved.toString(16),
      timestamp: t.time ?? Math.floor(Date.now() / 1000),
      blockNumber: 0,
      status: t.failed ? 'failed' : t.confirmed ? 'confirmed' : 'pending',
      type: t.delta === 0n ? 'contract' : out ? 'send' : 'receive',
      explorerUrl: explorerTxUrl(chain, t.signature),
      chainId: chain.id,
      fee: t.fee ? `${formatUnitsExact(t.fee, decimals)} ${symbol}` : undefined,
    }
  })
}

/** Reachability for the network status dot: the tip height or slot. */
export async function probeOtherChain(chain: ChainConfig): Promise<number> {
  if (chainFamily(chain) === 'bitcoin') {
    const res = await fetch(`${chain.rpcUrl}/blocks/tip/height`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Number(await res.text())
  }
  return solRpc<number>(solNetworkOf(chain), 'getSlot')
}

// ─── Sending ────────────────────────────────────────────────────────────────

export type OtherSendPlan =
  | ({ family: 'bitcoin'; to: string } & BtcSendPlan)
  | ({ family: 'solana'; to: string; symbol: string; decimals: number } & SolSendPlan)

export type FeeSpeed = keyof BtcFeeRates

export { btcFeeRates }

/** Plan a send of `amount` (a decimal string, or "max") of the native coin or, on Solana, a token (its mint). */
export async function planOtherSend(input: {
  chain: ChainConfig
  from: string
  to: string
  amount: string
  token?: string
  /** Bitcoin: sat/vB. */
  feeRate?: number
}): Promise<OtherSendPlan> {
  const { chain, from } = input
  const to = input.to.trim()
  const max = input.amount === 'max'
  if (chainFamily(chain) === 'bitcoin') {
    const plan = await planBtcSend({
      network: btcNetworkOf(chain),
      from: { address: from, script: btcScriptOf(from, btcNetworkOf(chain)) },
      to,
      amount: max ? 'max' : parseBtc(input.amount),
      feeRate: input.feeRate ?? 2,
    })
    return { family: 'bitcoin', to, ...plan }
  }
  const network = solNetworkOf(chain)
  let holding: SplHolding | undefined
  if (input.token) {
    holding = (await splHoldings(network, from)).find((h) => h.mint === input.token)
    if (!holding) throw new Error('This account no longer holds that token')
  }
  const decimals = holding?.decimals ?? chain.nativeCurrency.decimals
  const plan = await planSolSend({ network, from, to, holding, amount: max ? 'max' : parseUnits(input.amount, decimals) })
  return { family: 'solana', to, symbol: holding?.symbol ?? chain.nativeCurrency.symbol, decimals, ...plan }
}

export interface OtherSigner {
  signBitcoinPsbt(psbt: string, network: BtcNetwork, accountId?: string): Promise<{ hex: string; txid: string }>
  signSolanaMessage(message: string, accountId?: string): Promise<string>
}

/** Sign and broadcast a plan; the transaction id. */
export async function submitOtherSend(signer: OtherSigner, chain: ChainConfig, plan: OtherSendPlan, accountId?: string): Promise<string> {
  if (plan.family === 'bitcoin') {
    const network = btcNetworkOf(chain)
    const signed = await signer.signBitcoinPsbt(plan.psbt, network, accountId)
    return broadcastBtc(network, signed.hex)
  }
  const network = solNetworkOf(chain)
  const signature = await signer.signSolanaMessage(plan.message, accountId)
  return sendSolTransaction(network, serializeSigned(base64.decode(plan.message), base64.decode(signature)))
}

/** Solana: wait for confirmation. Bitcoin confirms in a block about every ten minutes; there is nothing to wait for. */
export async function confirmOtherSend(chain: ChainConfig, id: string): Promise<boolean> {
  if (chainFamily(chain) !== 'solana') return true
  return confirmSolTransaction(solNetworkOf(chain), id)
}
