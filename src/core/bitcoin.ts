/**
 * Bitcoin: one native SegWit (P2WPKH, BIP-84) address per account.
 *
 *   hd keyring   m/84'/0'/0'/0/i on mainnet, m/84'/1'/0'/0/i on testnet, the
 *                path other wallets restore from the same recovery phrase.
 *   key keyring  the imported secp256k1 key itself.
 *
 * Balances, history and broadcasting go through an Esplora API (mempool.space,
 * with Blockstream as mainnet fallback). Transactions are built here as a PSBT
 * and signed inside the wallet manager, which never signs an input it does not own.
 */

import { HDKey } from 'ethereum-cryptography/hdkey.js'
import { mnemonicToSeedSync } from 'ethereum-cryptography/bip39/index.js'
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'
import { Address, NETWORK, TEST_NETWORK, Transaction, p2wpkh, selectUTXO } from '@scure/btc-signer'
import { base64, hex } from '@scure/base'
import type { KeyringSecret } from './keyring'

export type BtcNetwork = 'mainnet' | 'testnet'

const NETS = { mainnet: NETWORK, testnet: TEST_NETWORK } as const

/** Esplora endpoints, tried in order. Testnet is testnet4. */
export const BTC_APIS: Record<BtcNetwork, string[]> = {
  mainnet: ['https://mempool.space/api', 'https://blockstream.info/api'],
  testnet: ['https://mempool.space/testnet4/api'],
}

export const BTC_EXPLORERS: Record<BtcNetwork, string> = {
  mainnet: 'https://mempool.space',
  testnet: 'https://mempool.space/testnet4',
}

/** Outputs below this are refused by relays; the wallet never creates one. */
export const BTC_DUST = 546n

export class BitcoinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BitcoinError'
  }
}

// ─── Keys ───────────────────────────────────────────────────────────────────

/** The account's Bitcoin private key. */
export function btcPrivateKey(secret: KeyringSecret, index: number, network: BtcNetwork): Uint8Array {
  if (secret.type === 'key') return hex.decode(secret.ethPrivateKey.replace(/^0x/, ''))
  const seed = mnemonicToSeedSync(secret.mnemonic.trim().toLowerCase())
  const child = HDKey.fromMasterSeed(seed).derive(`m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/${index}`)
  if (!child.privateKey) throw new BitcoinError('Could not derive the Bitcoin key')
  return child.privateKey
}

export function btcPayment(privateKey: Uint8Array, network: BtcNetwork) {
  const p = p2wpkh(secp256k1.getPublicKey(privateKey, true), NETS[network])
  return { address: p.address!, script: p.script }
}

export function isBtcAddress(address: string, network: BtcNetwork): boolean {
  try {
    Address(NETS[network]).decode(address.trim())
    return true
  } catch {
    return false
  }
}

// ─── Esplora ────────────────────────────────────────────────────────────────

async function api<T>(network: BtcNetwork, path: string, init?: RequestInit): Promise<T> {
  let last: unknown
  for (const base of BTC_APIS[network]) {
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
      const text = await res.text()
      if (!res.ok) throw new BitcoinError(text.trim() || `HTTP ${res.status}`)
      return (res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) as T
    } catch (err) {
      last = err
      // A refusal from the network is final; only connection problems try the next endpoint.
      if (err instanceof BitcoinError) throw err
    }
  }
  throw last instanceof Error ? last : new BitcoinError('Could not reach the Bitcoin network')
}

interface EsploraStats {
  funded_txo_sum: number
  spent_txo_sum: number
}

/** Confirmed balance and the change still in the mempool, in satoshis. */
export async function btcBalance(network: BtcNetwork, address: string): Promise<{ confirmed: bigint; pending: bigint }> {
  const a = await api<{ chain_stats: EsploraStats; mempool_stats: EsploraStats }>(network, `/address/${address}`)
  const net = (s: EsploraStats) => BigInt(s.funded_txo_sum) - BigInt(s.spent_txo_sum)
  return { confirmed: net(a.chain_stats), pending: net(a.mempool_stats) }
}

export interface BtcFeeRates {
  /** sat/vB for the next block, about half an hour, and about an hour. */
  fast: number
  normal: number
  slow: number
}

export async function btcFeeRates(network: BtcNetwork): Promise<BtcFeeRates> {
  try {
    const r = await api<{ fastestFee: number; halfHourFee: number; hourFee: number }>(network, '/v1/fees/recommended')
    return { fast: r.fastestFee, normal: r.halfHourFee, slow: r.hourFee }
  } catch {
    // Blockstream's form: confirmation target (blocks) → sat/vB.
    const r = await api<Record<string, number>>(network, '/fee-estimates')
    const at = (n: string) => Math.max(1, Math.ceil(r[n] ?? 1))
    return { fast: at('1'), normal: at('3'), slow: at('6') }
  }
}

interface EsploraTx {
  txid: string
  fee: number
  status: { confirmed: boolean; block_height?: number; block_time?: number }
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[]
  vout: { scriptpubkey_address?: string; value: number }[]
}

export interface BtcHistoryItem {
  txid: string
  confirmed: boolean
  height?: number
  time?: number
  /** Net change to this address in satoshis (negative: sent, fee included). */
  delta: bigint
  fee: bigint
  /** The other side: the first address paid (a send) or paying (a receipt). */
  counterparty?: string
}

export async function btcHistory(network: BtcNetwork, address: string): Promise<BtcHistoryItem[]> {
  const txs = await api<EsploraTx[]>(network, `/address/${address}/txs`)
  return txs.map((t) => {
    const spent = t.vin.reduce((s, i) => s + (i.prevout?.scriptpubkey_address === address ? BigInt(i.prevout.value) : 0n), 0n)
    const got = t.vout.reduce((s, o) => s + (o.scriptpubkey_address === address ? BigInt(o.value) : 0n), 0n)
    const delta = got - spent
    const counterparty =
      delta < 0n
        ? t.vout.find((o) => o.scriptpubkey_address && o.scriptpubkey_address !== address)?.scriptpubkey_address
        : t.vin.find((i) => i.prevout?.scriptpubkey_address && i.prevout.scriptpubkey_address !== address)?.prevout?.scriptpubkey_address
    return {
      txid: t.txid,
      confirmed: t.status.confirmed,
      height: t.status.block_height,
      time: t.status.block_time,
      delta,
      fee: BigInt(t.fee),
      counterparty,
    }
  })
}

export async function broadcastBtc(network: BtcNetwork, rawHex: string): Promise<string> {
  const txid = await api<string>(network, '/tx', { method: 'POST', body: rawHex, headers: { 'content-type': 'text/plain' } })
  return String(txid).trim()
}

// ─── Sending ────────────────────────────────────────────────────────────────

export interface BtcSendPlan {
  /** Unsigned PSBT, base64: what the wallet manager signs. */
  psbt: string
  /** What the recipient gets, the fee, and the change back to this address, in satoshis. */
  amount: bigint
  fee: bigint
  change: bigint
  feeRate: number
  inputs: number
}

/**
 * Pick coins and build the unsigned transaction. `amount: 'max'` spends every
 * coin to the recipient, less the fee.
 */
export async function planBtcSend(input: {
  network: BtcNetwork
  from: { address: string; script: Uint8Array }
  to: string
  amount: bigint | 'max'
  feeRate: number
}): Promise<BtcSendPlan> {
  const { network, from, to } = input
  if (!isBtcAddress(to, network)) throw new BitcoinError(`That is not a Bitcoin ${network === 'testnet' ? 'testnet ' : ''}address`)
  if (to === from.address) throw new BitcoinError('That is this account’s own address')
  if (input.amount !== 'max' && input.amount < BTC_DUST) throw new BitcoinError(`Send at least ${BTC_DUST} sats`)
  const utxos = await api<{ txid: string; vout: number; value: number }[]>(network, `/address/${from.address}/utxo`)
  const coins = utxos.map((u) => ({
    txid: hex.decode(u.txid),
    index: u.vout,
    witnessUtxo: { amount: BigInt(u.value), script: from.script },
  }))
  if (!coins.length) throw new BitcoinError('This address holds no bitcoin to send')
  const feePerByte = BigInt(Math.max(1, Math.ceil(input.feeRate)))
  const opts = { feePerByte, network: NETS[network], createTx: true, bip69: true, dust: BTC_DUST }
  const max = input.amount === 'max'
  // Spending everything: no outputs and the "change" goes to the recipient.
  const picked = max
    ? selectUTXO(coins, [], 'all', { ...opts, changeAddress: to })
    : selectUTXO(coins, [{ address: to, amount: input.amount as bigint }], 'default', { ...opts, changeAddress: from.address })
  if (!picked || !picked.tx || picked.fee === undefined) {
    throw new BitcoinError('Not enough bitcoin for this amount and the network fee')
  }
  const total = picked.inputs.reduce((s, i) => s + (i.witnessUtxo?.amount ?? 0n), 0n)
  const amount = max ? total - picked.fee : (input.amount as bigint)
  if (amount < BTC_DUST) throw new BitcoinError('After the fee, too little is left to send')
  return {
    psbt: base64.encode(picked.tx.toPSBT()),
    amount,
    fee: picked.fee,
    change: max ? 0n : total - amount - picked.fee,
    feeRate: Number(feePerByte),
    inputs: picked.inputs.length,
  }
}

/** Sign every input of `psbt` with `privateKey`, refusing any it does not own. */
export function signBtcPsbt(psbt: string, privateKey: Uint8Array, network: BtcNetwork): { hex: string; txid: string } {
  const own = btcPayment(privateKey, network).script
  const tx = Transaction.fromPSBT(base64.decode(psbt))
  for (let i = 0; i < tx.inputsLength; i++) {
    const script = tx.getInput(i).witnessUtxo?.script
    if (!script || hex.encode(script) !== hex.encode(own)) {
      throw new BitcoinError('This transaction spends coins that are not this account’s')
    }
  }
  tx.sign(privateKey)
  tx.finalize()
  return { hex: tx.hex, txid: tx.id }
}

// ─── Units ──────────────────────────────────────────────────────────────────

/** "0.0012" BTC → satoshis. */
export function parseBtc(amount: string): bigint {
  const t = amount.trim()
  if (!/^\d*\.?\d{0,8}$/.test(t) || t === '' || t === '.') throw new BitcoinError('Enter an amount with at most 8 decimals')
  const [whole, frac = ''] = t.split('.')
  return BigInt(whole || '0') * 100_000_000n + BigInt(frac.padEnd(8, '0'))
}
