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

describe('QRDX node revert messages', () => {
  it('reads revert data printed as a Python bytes literal', async () => {
    const { bytesLiteralHex } = await import('../../src/core/simulate')
    expect(bytesLiteralHex("Call failed: b'x\\x8aho'")).toBe('0x788a686f')
    expect(revertReason({ message: "Call failed: b'\\x08\\xc3y\\xa0'" }).length).toBeGreaterThan(0)
  })
})

describe('NFT market calls', () => {
  it('names a token-priced purchase and what it spends', async () => {
    const { vi } = await import('vitest')
    const eth = await import('../../src/core/ethereum')
    const USDC = '0x801ae63d236d7a4ea69868a9d7be5d27a09e5580'
    const COLL = '0x1721b12557a6b8ec492e386dd842a4839b3f1b5e'
    const answers: Record<string, unknown> = {
      exchange_getNftCollection: { name: 'QRDX Logo' },
      eth_call: '0x',
    }
    vi.spyOn(eth, 'getEvmProvider').mockReturnValue({
      rpc: async (method: string, params: unknown[]) => {
        if (method === 'eth_call') {
          const data = (params[0] as { data: string }).data
          if (data === '0x95d89b41') return '0x' + '0'.repeat(62) + '20' + '0'.repeat(63) + '4' + Buffer.from('USDC').toString('hex').padEnd(64, '0')
          if (data === '0x313ce567') return '0x' + (6).toString(16).padStart(64, '0')
          return '0x'
        }
        return answers[method]
      },
    } as never)
    const { simulateTransaction } = await import('../../src/core/simulate')
    const w = (h: string) => h.replace(/^0x/, '').padStart(64, '0')
    // buy(address,uint256,address,uint256)
    const data = '0xb3ffb760' + w(COLL) + w('1') + w(USDC) + w((200_500_000).toString(16))
    const sim = await simulateTransaction('qrdx-testnet', { from: '0x' + 'aa'.repeat(20), to: '0x' + 'bb'.repeat(20), value: '0', data }, { symbol: 'QRDX', decimals: 18, fee: '1000' })
    expect(sim.action).toBe('Buy QRDX Logo #1 for 200.5 USDC')
    expect(sim.changes).toEqual(expect.arrayContaining([{ symbol: 'USDC', amount: '-200.5' }, { symbol: 'QRDX Logo #1', amount: '+1 NFT' }]))
    vi.restoreAllMocks()
  })
})
