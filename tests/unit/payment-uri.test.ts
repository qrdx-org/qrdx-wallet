import { describe, expect, it } from 'vitest'
import { parsePaymentQr, paymentLink, paymentRequest } from '../../src/core/payment-uri'

const EVM = '0x' + '1a'.repeat(20)
const PQ = '0xPQ' + 'ab'.repeat(32)

describe('scanned payment codes', () => {
  it('takes a bare address or name', () => {
    expect(parsePaymentQr(EVM)).toEqual({ to: EVM })
    expect(parsePaymentQr(`  ${PQ}\n`)).toEqual({ to: PQ })
    expect(parsePaymentQr('alice.qrdx')).toEqual({ to: 'alice.qrdx' })
  })

  it('reads qrdx: links with an amount', () => {
    expect(parsePaymentQr(`qrdx:${PQ}?amount=1.5`)).toEqual({ to: PQ, amount: '1.5' })
    expect(parsePaymentQr('qrdx:alice.qrdx')).toEqual({ to: 'alice.qrdx' })
  })

  it('reads EIP-681 value transfers and token calls', () => {
    expect(parsePaymentQr(`ethereum:${EVM}@7620?value=2.5e18`)).toEqual({ to: EVM, amount: '2.5' })
    expect(parsePaymentQr(`ethereum:pay-${EVM}?value=1000000000000000000`)).toEqual({ to: EVM, amount: '1' })
    expect(parsePaymentQr(`ethereum:0x${'22'.repeat(20)}/transfer?address=${EVM}&uint256=1e6`)).toEqual({ to: EVM })
  })

  it('reads payment requests: network, token and note', () => {
    const TOKEN = '0x' + '33'.repeat(20)
    expect(parsePaymentQr(`qrdx:${PQ}@7620?amount=25`)).toEqual({ to: PQ, amount: '25', chainId: 7620 })
    expect(parsePaymentQr(`qrdx:${EVM}@1?amount=12.5&token=${TOKEN}&note=Lunch`)).toEqual({ to: EVM, amount: '12.5', chainId: 1, token: TOKEN, note: 'Lunch' })
    // A token that is not a contract address is not something to pay.
    expect(parsePaymentQr(`qrdx:${EVM}@1?amount=1&token=USDC`)).toBeNull()
  })

  it('round-trips a request through the wallet link its QR holds', () => {
    const code = paymentRequest({ to: PQ, chainId: 7620, amount: '3.25', note: 'Coffee & cake' })
    const link = paymentLink(code)
    expect(link.startsWith('https://wallet.qrdx.org/wallet?pay=')).toBe(true)
    expect(parsePaymentQr(link)).toEqual({ to: PQ, amount: '3.25', chainId: 7620, note: 'Coffee & cake' })
    expect(parsePaymentQr(paymentLink(code, 'http://localhost:3000/wallet'))).toEqual(parsePaymentQr(code))
    // A link without a request, or one nesting another link, is nothing.
    expect(parsePaymentQr('https://wallet.qrdx.org/wallet?pay=https%3A%2F%2Fevil.example')).toBeNull()
  })

  it('refuses anything else', () => {
    expect(parsePaymentQr('https://example.com')).toBeNull()
    expect(parsePaymentQr('qrdx-connect:abc')).toBeNull()
    expect(parsePaymentQr('0x1234')).toBeNull()
  })
})
