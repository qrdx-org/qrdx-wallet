/**
 * Bridging to QRDX (qrdx-node docs/BRIDGE.md): an asset the QRDX network lists in BRIDGE_ASSETS
 * is deposited into the lockbox on its home chain (BRIDGE_LOCKBOXES) with
 * `deposit(token, amount, recipient)`; the validators attest it and QRDX mints the bridged token
 * to the recipient, the account's quantum-safe address.
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { bytesToHex } from './crypto'
import type { ChainConfig } from './chains'
import { getEvmProvider } from './ethereum'
import { encodeErc20Approve, erc20Allowance, sendContractCall, type Signer } from './tx-service'
import type { WalletAccount } from './types'

/** bridge_getAssets (qrdx-node rpc/modules/bridge_ledger.py). */
export interface BridgeAsset {
  symbol: string
  /** The source chain's EIP-155 id. */
  chain: number
  source_token: string
  /** The bridged token on QRDX. */
  token_address: string
  decimals: number
  supply: string
}

export interface BridgeRoute {
  asset: BridgeAsset
  lockbox: string
}

/** What a QRDX network bridges, and the lockbox on each source chain. */
export async function bridgeConfig(qrdx: ChainConfig): Promise<{ assets: BridgeAsset[]; lockboxes: Record<number, string> }> {
  const rpc = getEvmProvider(qrdx.id)
  const [assets, spec] = await Promise.all([
    rpc.rpc<BridgeAsset[]>('bridge_getAssets', []).catch(() => []),
    rpc.rpc<{ params?: { BRIDGE_LOCKBOXES?: string[] } }>('qrdx_chainSpec', []).catch(() => null),
  ])
  const lockboxes: Record<number, string> = {}
  for (const entry of spec?.params?.BRIDGE_LOCKBOXES ?? []) {
    const [id, address] = entry.split(':')
    if (id && address) lockboxes[Number(id)] = address
  }
  return { assets: assets ?? [], lockboxes }
}

/** The route for a token on a source chain, or null when QRDX does not bridge it. */
export function bridgeRouteFor(config: { assets: BridgeAsset[]; lockboxes: Record<number, string> }, chain: ChainConfig, token: string): BridgeRoute | null {
  if (!chain.isEvm || !token) return null
  const asset = config.assets.find((a) => a.chain === chain.chainId && a.source_token.toLowerCase() === token.toLowerCase())
  const lockbox = config.lockboxes[chain.chainId]
  return asset && lockbox ? { asset, lockbox } : null
}

const DEPOSIT_SELECTOR = bytesToHex(keccak256(new TextEncoder().encode('deposit(address,uint256,string)')).slice(0, 4)).replace(/^0x/, '')

/** deposit(address token, uint256 amount, string recipient) calldata. */
export function encodeLockboxDeposit(token: string, amount: bigint, recipient: string): string {
  const word = (hex: string) => hex.padStart(64, '0')
  const text = new TextEncoder().encode(recipient)
  const data = Array.from(text, (b) => b.toString(16).padStart(2, '0')).join('')
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0')
  return `0x${DEPOSIT_SELECTOR}${word(token.toLowerCase().replace(/^0x/, ''))}${word(amount.toString(16))}${word((96).toString(16))}${word(text.length.toString(16))}${padded}`
}

/** Approve exactly the amount when needed, then deposit to the account's quantum-safe address. */
export async function depositToQrdx(
  signer: Signer,
  account: WalletAccount,
  chain: ChainConfig,
  route: BridgeRoute,
  amount: bigint,
  onStep?: (step: 'approving' | 'depositing') => void
): Promise<{ hash: string }> {
  const token = route.asset.source_token
  const allowance = await erc20Allowance(chain, token, account.ethAddress, route.lockbox)
  if (allowance < amount) {
    onStep?.('approving')
    const { hash } = await sendContractCall(signer, { chain, account, to: token, data: encodeErc20Approve(route.lockbox, amount) })
    const r = await getEvmProvider(chain.id).waitForTransaction(hash, 180_000)
    if (r.status !== '0x1') throw new Error('The token approval failed')
  }
  onStep?.('depositing')
  return sendContractCall(signer, { chain, account, to: route.lockbox, data: encodeLockboxDeposit(token, amount, account.pqAddress) })
}
