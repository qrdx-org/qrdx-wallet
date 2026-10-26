import { describe, expect, it } from 'vitest'
import { parsePaymentQr } from '../../src/core/payment-uri'

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

  it('refuses anything else', () => {
    expect(parsePaymentQr('https://example.com')).toBeNull()
    expect(parsePaymentQr('qrdx-connect:abc')).toBeNull()
    expect(parsePaymentQr('0x1234')).toBeNull()
  })
})
