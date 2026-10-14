import { describe, it, expect } from 'vitest'
import { decodeString, revertReason } from '../../src/core/simulate'

const abiString = (s: string) => {
  const hex = Buffer.from(s, 'utf8').toString('hex')
  return '0x' + (32).toString(16).padStart(64, '0') + s.length.toString(16).padStart(64, '0') + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')
}

describe('simulation decoding', () => {
  it('decodes ABI strings and bytes32 symbols', () => {
    expect(decodeString(abiString('USDC'))).toBe('USDC')
    expect(decodeString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0'))).toBe('MKR')
  })

  it('reads Error(string) and Panic reverts', () => {
    expect(revertReason({ message: 'execution reverted', data: '0x08c379a0' + abiString('insufficient balance').slice(2) })).toBe('insufficient balance')
    expect(revertReason({ data: '0x4e487b71' + (0x11).toString(16).padStart(64, '0') })).toBe('panic 0x11')
    expect(revertReason({ message: 'execution reverted: paused' })).toBe('paused')
  })
})
