/**
 * The fee reserve (qrdx-node qrdx/post_state.py, chain-spec FEE_RESERVE_QRDX, in force from
 * node 3.0.0's `two_block_deferral`): within a block nothing but fees takes an account below
 * min(reserve, its QRDX as the block began), so the fees of what it has already signed stay
 * payable. An exchange operation may spend through it only by signing `params.spend_reserve`,
 * which the wallet does not set on its own: "Max" leaves the reserve in the account. EVM and
 * type-0x51 sends are not held to it.
 */

import { dec, str } from './trade/decimal'

/** Chain-spec default; the node refuses on its own value, whatever this says. */
export const FEE_RESERVE_QRDX = '1'

/** Whether `asset` is native QRDX as the exchange names it (any casing). */
const isNative = (asset: string | null | undefined): boolean => !!asset && asset.toUpperCase() === 'QRDX'

/** What of `balance` an exchange operation can take: all of a token, QRDX less the reserve. */
export function spendable(balance: string, asset: string | null | undefined, reserve: string = FEE_RESERVE_QRDX): string {
  if (!isNative(asset)) return balance
  const left = dec(balance) - dec(reserve)
  return left > 0n ? str(left) : '0'
}

/** The node's refusal for touching the reserve, said for a person; any other error unchanged. */
export function explainNodeError(error: string): string {
  const m = /would keep less than its fee reserve \(([\d.]+) QRDX\)/.exec(error)
  return m ? `This would leave less than ${m[1]} QRDX in the account. The network keeps that much back so the account can always pay its fees.` : error
}
