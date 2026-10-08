import { describe, expect, it } from 'vitest'
import { defaultCredential, formatAmount, formatUnitsExact, mergeCredentialBalances } from '../../src/core/balances'
import type { TokenBalance } from '../../src/core/ethereum'

const tb = (address: string, raw: bigint, symbol = address ? 'TOK' : 'QRDX', decimals = 18): TokenBalance => ({
  address, symbol, name: symbol, decimals, rawBalance: raw, formattedBalance: '',
})
const E18 = 10n ** 18n

describe('merging the two credentials', () => {
  it('sums each token across the classic and post-quantum accounts', () => {
    const merged = mergeCredentialBalances(
      [tb('', 2n * E18), tb('0xaa', 0n), tb('0xbb', 0n)],
      [tb('', 3n * E18), tb('0xAA', 5n * E18 + 5n * 10n ** 17n), tb('0xbb', 0n)]
    )
    expect(merged.map((b) => [b.address.toLowerCase(), b.formattedBalance, b.classicRaw > 0n, b.pqRaw > 0n])).toEqual([
      ['', '5', true, true],
      ['0xaa', '5.5', false, true],
    ])
  })

  it('keeps the native coin at zero, drops tokens nobody holds unless watched', () => {
    const merged = mergeCredentialBalances([tb('', 0n), tb('0xcc', 0n)], [tb('', 0n), tb('0xdd', 0n)], ['0xDD'])
    expect(merged.map((b) => b.address)).toEqual(['', '0xdd'])
  })

  it('opens Send on the address that holds funds', () => {
    expect(defaultCredential([tb('', 0n)], [tb('', 0n), tb('0xaa', 1n)], true)).toBe('pq')
    expect(defaultCredential([tb('', E18)], [tb('', 0n)], true)).toBe('classic')
    expect(defaultCredential([], [], true)).toBe('pq')
    expect(defaultCredential([tb('', 0n)], [tb('', E18)], false)).toBe('classic')
  })
})

describe('formatting amounts', () => {
  it('is exact beyond float precision', () => {
    expect(formatUnitsExact(10000000169175216398496239468020234n, 18)).toBe('10000000169175216.398496239468020234')
    expect(formatAmount(10000000169175216398496239468020234n, 18)).toBe('10,000,000,169,175,216.3984')
  })
  it('truncates, trims and marks dust', () => {
    expect(formatAmount(1_999_999n * 10n ** 12n, 18)).toBe('1.9999')
    expect(formatAmount(2n * E18, 18)).toBe('2')
    expect(formatAmount(10n ** 13n, 18)).toBe('<0.0001')
    expect(formatAmount(0n, 18)).toBe('0')
    expect(formatAmount(12345n, 2)).toBe('123.45')
  })
})
