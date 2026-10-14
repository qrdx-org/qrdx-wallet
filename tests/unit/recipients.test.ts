import { describe, it, expect } from 'vitest'
import { matchRecipients, recipientSuggestions, type RecipientSources } from '../../src/core/recipients'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const ME = '0x3333333333333333333333333333333333333333'
const OTHER = '0x4444444444444444444444444444444444444444'
const OTHER_PQ = '0xPQ' + '5'.repeat(64)

const base = (over: Partial<RecipientSources> = {}): RecipientSources => ({
  contacts: [{ name: 'Alice', address: ALICE, addressType: 'eth' }],
  accounts: [
    { id: 'a1', name: 'Account 1', ethAddress: ME },
    { id: 'a2', name: 'Savings', ethAddress: OTHER, pqAddress: OTHER_PQ },
  ],
  transactions: [
    { type: 'send', to: BOB, timestamp: 100, status: 'confirmed' },
    { type: 'send', to: ALICE, timestamp: 200, status: 'confirmed' },
    { type: 'send', to: BOB, timestamp: 50, status: 'confirmed' },
    { type: 'receive', to: ME, timestamp: 300, status: 'confirmed' },
  ],
  self: { id: 'a1', addresses: [ME] },
  qrdx: true,
  ...over,
})

describe('recipient suggestions', () => {
  it('lists recent recipients newest first, with send counts and contact names', () => {
    const recent = recipientSuggestions(base()).filter((s) => s.kind === 'recent')
    expect(recent.map((s) => s.address)).toEqual([ALICE, BOB])
    expect(recent[0].label).toBe('Alice')
    expect(recent[1].sends).toBe(2)
  })

  it('offers the other accounts but never the sending one', () => {
    const accounts = recipientSuggestions(base()).filter((s) => s.kind === 'account')
    expect(accounts.map((s) => s.address)).toEqual([OTHER, OTHER_PQ])
    expect(accounts[1].label).toBe('Savings · PQ')
  })

  it('leaves out post-quantum addresses off QRDX networks', () => {
    const all = recipientSuggestions(base({ qrdx: false }))
    expect(all.some((s) => s.address === OTHER_PQ)).toBe(false)
  })

  it('skips failed sends', () => {
    const all = recipientSuggestions(base({ transactions: [{ type: 'send', to: BOB, timestamp: 1, status: 'failed' }] }))
    expect(all.some((s) => s.kind === 'recent')).toBe(false)
  })

  it('matches a query by name or address, once per address', () => {
    const all = recipientSuggestions(base())
    expect(matchRecipients(all, 'sav').map((s) => s.label)).toEqual(['Savings', 'Savings · PQ'])
    const alice = matchRecipients(all, 'alice')
    expect(alice).toHaveLength(1)
    expect(alice[0].kind).toBe('recent')
    expect(matchRecipients(all, '0x2222').map((s) => s.address)).toEqual([BOB])
    expect(matchRecipients(all, BOB)).toEqual([])
  })
})
