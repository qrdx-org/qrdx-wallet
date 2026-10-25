import { describe, it, expect } from 'vitest'
import { indexedToItem, type IndexedTx } from '../../src/core/activity'
import { getChain } from '../../src/core/chains'

const chain = getChain('qrdx-testnet')!
const USDC = '0x801ae63d236d7a4ea69868a9d7be5d27a09e5580'
const tokens = new Map([[USDC, { symbol: 'USDC', decimals: 6 }]])
const row = (over: Partial<IndexedTx>): IndexedTx => ({
  block_height: 10,
  tx_hash: 'ab'.repeat(32),
  timestamp: 1_700_000_000,
  kind: 'evm',
  op: 'TRANSFER',
  sender: '0x1111111111111111111111111111111111111111',
  target: '0x2222222222222222222222222222222222222222',
  asset: 'QRDX',
  amount: '1.5',
  status: 'success',
  fee: '0.0001',
  error: null,
  detail: { gas_used: 21000, gas_price: '1000000000', token_transfers: [] },
  roles: ['to'],
  ...over,
})

describe('indexed history rows', () => {
  it('reads a native transfer in as a receive with its fee', () => {
    const item = indexedToItem(chain, row({}), tokens)
    expect(item.type).toBe('receive')
    expect(item.value).toBe('1.5 QRDX')
    expect(item.hash.startsWith('0x')).toBe(true)
    expect(item.fee).toBe('0.0001')
    expect(item.label).toBeUndefined()
  })

  it('reads an outgoing ERC-20 transfer with the token units', () => {
    const item = indexedToItem(
      chain,
      row({ op: 'TOKEN_TRANSFER', asset: USDC, amount: null, roles: ['sender', 'token_from'], detail: { token_transfers: [{ token: USDC, from: '0x1', to: '0x2', value: '2500000' }] } }),
      tokens
    )
    expect(item.type).toBe('send')
    expect(item.tokenSymbol).toBe('USDC')
    expect(item.tokenAmount).toBe('2.5')
  })

  it('labels exchange operations', () => {
    const item = indexedToItem(chain, row({ kind: 'exchange', op: 'STAKE_DELEGATE', asset: 'QRDX', amount: '100', roles: ['sender'] }), tokens)
    expect(item.label).toBe('Delegate stake')
    expect(item.type).toBe('contract')
    expect(item.hash).toBe('ab'.repeat(32))
  })

  it('marks failed transactions', () => {
    expect(indexedToItem(chain, row({ status: 'failed' }), tokens).status).toBe('failed')
  })
})
