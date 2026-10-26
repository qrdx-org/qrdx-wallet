/**
 * What a scanned QR code asks to be paid: a recipient, and maybe an amount. Accepted:
 *
 *  - a bare address (`0x…`, `0xPQ…`, `0xPQMS…`) or a QRDX name (`name.qrdx`), as the wallet's
 *    own Receive screen shows;
 *  - `qrdx:<address or name>[?amount=<decimal>]`;
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
  /** In the native currency's whole units, as a decimal string. */
  amount?: string
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

  const m = /^(qrdx|ethereum):(?:pay-)?([^@/?#]+)(?:@\d+)?(\/[A-Za-z]+)?(?:\?(.*))?$/i.exec(text)
  if (!m) return null
  const [, scheme, target, fn, query = ''] = m
  const q = new URLSearchParams(query)
  if (fn) {
    // A token call: its `address` parameter is the recipient.
    const to = q.get('address')
    return to && isRecipient(to) ? { to } : null
  }
  if (!isRecipient(target)) return null
  const amount = scheme.toLowerCase() === 'qrdx' ? q.get('amount') ?? undefined : q.get('value') ? weiToDecimal(q.get('value')!) : undefined
  return amount && /^\d*\.?\d+$/.test(amount) && Number(amount) > 0 ? { to: target, amount } : { to: target }
}
