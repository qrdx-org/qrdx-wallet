import { describe, expect, it } from 'vitest'
import { buildExchangeTx, exchangeSigningBytes, freeLaneOp, ExchangeOp } from '../../src/core/exchange-tx'
import { describeExchangeOp, tokenAddressesIn } from '../../src/core/exchange-describe'
import { isQnsName } from '../../src/core/qns'

const SENDER = '0xPQ' + 'ab'.repeat(32)
const A = '0x' + '11'.repeat(20)
const B = '0x' + '22'.repeat(20)

describe('trading operations (qrdx-node docs/TRADING_FEATURES.md)', () => {
  it('numbers the new operations as the node does', () => {
    expect(ExchangeOp.PERP_TRIGGER).toBe(56)
    expect(ExchangeOp.BATCH).toBe(60)
    expect(ExchangeOp.ACCOUNT_POLICY).toBe(70)
    expect(ExchangeOp.QNS_REGISTER).toBe(71)
    expect(ExchangeOp.TICKER_CLAIM).toBe(83)
  })

  it('takes trading operations, and batches only of them, in the free lane', () => {
    expect(freeLaneOp('PERP_ORDER', {})).toBe(true)
    expect(freeLaneOp('CANCEL_ALL', {})).toBe(true)
    expect(freeLaneOp('PERP_WITHDRAW', {})).toBe(false)
    expect(freeLaneOp('QNS_REGISTER', {})).toBe(false)
    expect(freeLaneOp('BATCH', { actions: [{ op: 'SWAP', params: {} }, { op: 'PERP_CANCEL', params: {} }] })).toBe(true)
    expect(freeLaneOp('BATCH', { actions: [{ op: 'SWAP', params: {} }, { op: 'PERP_DEPOSIT', params: {} }] })).toBe(false)
    expect(freeLaneOp('BATCH', { actions: [] })).toBe(false)
  })

  it('signs gas price 0 only for the free lane', () => {
    const base = { chainId: 7620, sender: SENDER, nonce: 0, gasPrice: 0n }
    expect(() => buildExchangeTx({ ...base, op: 'PERP_CANCEL', params: { market_id: 'BTC-USD-PERP', order_id: 'x' } })).not.toThrow()
    expect(() => buildExchangeTx({ ...base, op: 'PERP_WITHDRAW', params: { amount: '1' } })).toThrow(/free lane/)
    expect(() => buildExchangeTx({ ...base, op: 'PERP_WITHDRAW', params: { amount: '1' }, gasPrice: 10n ** 8n })).not.toThrow()
    expect(() => buildExchangeTx({ ...base, op: 'PERP_WITHDRAW', params: { amount: '1' }, gasPrice: 10n ** 7n })).toThrow(/floor/)
  })

  it('accepts a multi-hop swap by path, and checks a batch', () => {
    const base = { chainId: 7620, sender: SENDER, nonce: 0 }
    expect(() => buildExchangeTx({ ...base, op: 'SWAP', params: { path: ['QRDX', A, B], amount_in: '1', min_amount_out: '0.9' } })).not.toThrow()
    expect(() => buildExchangeTx({ ...base, op: 'SWAP', params: { amount_in: '1' } })).toThrow(/token_in/)
    expect(() => buildExchangeTx({ ...base, op: 'BATCH', params: { actions: [] } })).toThrow(/1 to 20/)
    expect(() => buildExchangeTx({ ...base, op: 'BATCH', params: { actions: [{ op: 'TOKEN_TRANSFER', params: {} }] } })).toThrow(/cannot hold/)
  })

  it('describes a batch action by action and finds its tokens', () => {
    const params = {
      actions: [
        { op: 'SWAP', params: { path: ['QRDX', A, B], amount_in: '1', min_amount_out: '2' } },
        { op: 'PERP_TRIGGER', params: { market_id: 'BTC-USD-PERP', side: 'sell', kind: 'sl', trigger_price: '90000', position: true } },
      ],
    }
    expect(tokenAddressesIn(params).sort()).toEqual([A, B])
    const d = describeExchangeOp('BATCH', params, { tokens: { [A]: { symbol: 'AAA' }, [B]: { symbol: 'BBB' } } })
    expect(d.headline).toBe('2 operations, all or nothing')
    expect(d.details[0].value).toBe('Swap 1 QRDX for at least 2 BBB')
    expect(d.details[1].value).toMatch(/Stop loss on BTC-USD-PERP: sell the whole position when the mark reaches 90,000/)
  })

  it('warns before an agent key or a controller is bound', () => {
    expect(describeExchangeOp('AGENT_APPROVE', { agent: SENDER }, { tokens: {} }).warnings.join(' ')).toMatch(/never expires/)
    expect(describeExchangeOp('ACCOUNT_POLICY', { action: 'add_controller', controller: SENDER }, { tokens: {} }).warnings[0]).toMatch(/withdrawals included/)
  })

  it('recognises .qrdx names', () => {
    expect(isQnsName('alice.qrdx')).toBe(true)
    expect(isQnsName('Alice.QRDX')).toBe(true)
    expect(isQnsName('ab.qrdx')).toBe(false)
    expect(isQnsName('-ab.qrdx')).toBe(false)
    expect(isQnsName('alice')).toBe(false)
  })

  it('writes a batch’s signing bytes', () => {
    const tx = buildExchangeTx({
      op: 'BATCH',
      chainId: 7620,
      sender: SENDER,
      nonce: 3,
      gasPrice: 0n,
      gasLimit: 2_010_000,
      params: { actions: [{ op: 'SWAP', params: { path: ['QRDX', A, B], amount_in: '1', min_amount_out: '2' } }, { op: 'CANCEL_ALL', params: { scope: 'perps' } }] },
    })
    // What qrdx-node 321da74's ExchangeTransaction(...).signing_bytes() gives for the same batch.
    expect(Buffer.from(exchangeSigningBytes(tx)).toString('hex')).toBe(
      '515244582d45584348414e47452d54582d7631000000000000001dc43c307850516162616261626162616261626162616261626162616261626162616261626162616261626162616261626162616261626162616261626162616261626162616200000000000000037b22616374696f6e73223a205b7b226f70223a202253574150222c2022706172616d73223a207b22616d6f756e745f696e223a202231222c20226d696e5f616d6f756e745f6f7574223a202232222c202270617468223a205b2251524458222c2022307831313131313131313131313131313131313131313131313131313131313131313131313131313131222c2022307832323232323232323232323232323232323232323232323232323232323232323232323232323232225d7d7d2c207b226f70223a202243414e43454c5f414c4c222c2022706172616d73223a207b2273636f7065223a20227065727073227d7d5d7d00000000001eab9030'
    )
  })
})

describe('acting for another account', () => {
  it('appends the signer to the signed bytes, as the node does', async () => {
    const { exchangeTxHash } = await import('../../src/core/exchange-tx')
    const tx = buildExchangeTx({
      op: 'PERP_CANCEL',
      chainId: 7620,
      sender: '0xSUBA' + '12'.repeat(20),
      signer: '0xPQ' + 'ab'.repeat(32),
      nonce: 2,
      gasPrice: 0n,
      gasLimit: 100000,
      params: { market_id: 'BTC-USD-PERP', order_id: 'ab' },
    })
    // qrdx-node 321da74: ExchangeTransaction(..., signer=...).tx_hash()
    expect(exchangeTxHash(tx)).toBe('e75436990e055090aebad98a032a59e3aa71510f1ac5f059f9dca8269d274578')
  })

  it('drops a signer equal to the sender, and wants a 0xPQ signer', () => {
    const own = '0xPQ' + 'ab'.repeat(32)
    expect(buildExchangeTx({ op: 'PERP_CANCEL', chainId: 7620, sender: own, signer: own, nonce: 0, params: { market_id: 'M', order_id: 'x' } }).signer).toBeUndefined()
    expect(() => buildExchangeTx({ op: 'PERP_CANCEL', chainId: 7620, sender: '0xSUBA' + '12'.repeat(20), signer: '0x' + '11'.repeat(20), nonce: 0, params: { market_id: 'M', order_id: 'x' } })).toThrow(/signer/)
  })
})
