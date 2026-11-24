/**
 * What a scanned QR code asks to be paid: a recipient, and maybe an amount. Accepted:
 *
 *  - a bare address (`0x…`, `0xPQ…`, `0xPQMS…`) or a QRDX name (`name.qrdx`), as the wallet's
 *    own Receive screen shows;
 *  - `qrdx:<address or name>[@<chain id>][?amount=<decimal>[&token=<0x contract>][&note=<text>]]`: a
 *    payment request (the wallet's Receive → Request an amount makes one), its amount in the
 *    token's whole units, or the network's native currency without `token`;
 *  - a wallet link carrying one, `…/wallet?pay=<qrdx: code>`: what a request's QR holds, so a
 *    phone's camera opens the wallet on it;
 *  - EIP-681 `ethereum:<address>[@chain][?value=<wei>]` (a plain value transfer; a token
 *    `…/transfer?address=` call gives its recipient only, since its amount is in base units of a
 *    token the code does not describe).
 *
 * Anything else is not a payment code (null). The amount is only ever a suggestion the user
 * sees in the form, never sent without review.
 */

import { validateAddress } from './address'
import { isQnsName } from './qns'

export interface ScannedPayment {
  to: string
  /** In whole units (of `token`, or the native currency), as a decimal string. */
  amount?: string
  /** The network the request is for (EIP-155 chain id). */
  chainId?: number
  /** An ERC-20 contract the amount is in; the native currency without it. */
  token?: string
  /** The requester's note: their words, shown as such. */
  note?: string
}

/** The web wallet, which a request's QR links to when it is made where there is no web origin (the extension). */
export const WEB_WALLET = 'https://wallet.qrdx.org/wallet'

/** A payment request: `qrdx:<to>@<chain>?amount=…[&token=…][&note=…]`. */
export function paymentRequest(r: { to: string; chainId: number; amount: string; token?: string; note?: string }): string {
  const q = new URLSearchParams({ amount: r.amount })
  if (r.token) q.set('token', r.token)
  if (r.note?.trim()) q.set('note', r.note.trim().slice(0, 140))
  return `qrdx:${r.to}@${r.chainId}?${q}`
}

/** A link to the wallet that opens a request: what its QR holds, for the phone's camera. */
export function paymentLink(code: string, base = WEB_WALLET): string {
  return `${base}?pay=${encodeURIComponent(code)}`
}

const isRecipient = (s: string) => validateAddress(s).valid || /^0xPQMS[0-9a-fA-F]{40,}$/.test(s) || isQnsName(s)

/** wei (a decimal integer, or EIP-681's `2.014e18` form) as a decimal of 18 places. */
function weiToDecimal(v: string): string | undefined {
  let wei: bigint
  const sci = /^(\d+)(?:\.(\d+))?e(\d+)$/i.exec(v)
  if (sci) {
    const [, w, f = '', e] = sci
    const exp = Number(e)
    if (f.length > exp) return undefined
    wei = BigInt(w + f + '0'.repeat(exp - f.length))
  } else if (/^\d+$/.test(v)) wei = BigInt(v)
  else return undefined
  const whole = wei / 10n ** 18n
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export function parsePaymentQr(raw: string): ScannedPayment | null {
  const text = raw.trim()
  if (isRecipient(text)) return { to: text }

  // A wallet link: the request is in its `pay` parameter.
  if (/^https?:\/\//i.test(text)) {
    try {
      const pay = new URL(text).searchParams.get('pay')
      return pay && !/^https?:/i.test(pay) ? parsePaymentQr(pay) : null
    } catch {
      return null
    }
  }

  const m = /^(qrdx|ethereum):(?:pay-)?([^@/?#]+)(?:@(\d+))?(\/[A-Za-z]+)?(?:\?(.*))?$/i.exec(text)
  if (!m) return null
  const [, scheme, target, chain, fn, query = ''] = m
  const q = new URLSearchParams(query)
  if (fn) {
    // A token call: its `address` parameter is the recipient.
    const to = q.get('address')
    return to && isRecipient(to) ? { to } : null
  }
  if (!isRecipient(target)) return null
  const qrdx = scheme.toLowerCase() === 'qrdx'
  const amount = qrdx ? q.get('amount') ?? undefined : q.get('value') ? weiToDecimal(q.get('value')!) : undefined
  const out: ScannedPayment = amount && /^\d*\.?\d+$/.test(amount) && Number(amount) > 0 ? { to: target, amount } : { to: target }
  const chainId = chain ? Number(chain) : NaN
  if (qrdx && Number.isSafeInteger(chainId) && chainId > 0) out.chainId = chainId
  const token = qrdx ? q.get('token') : null
  if (token) {
    // A token request names its contract; anything else is not a request this wallet can read.
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return null
    out.token = token
  }
  const note = qrdx ? q.get('note')?.trim() : undefined
  if (note) out.note = note.slice(0, 140)
  return out
}
