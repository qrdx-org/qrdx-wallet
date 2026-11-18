/**
 * Quantum migration (src/core/migration.ts) and the account-security notifications
 * (src/core/notify.ts). test.qrdx.org (node 3.0.0) answered `eth_call` of bindSuccessorCall at
 * the write precompile with success, and refused an operation a contract may not send.
 */
import { describe, it, expect } from 'vitest'
import { bindSuccessorCall, encodeSendAction, migrationState } from '../../src/core/migration'
import { securityEvents, snapshotOf } from '../../src/core/notify'
import type { Authority } from '../../src/core/qns'

const PQ = '0xPQ815De541E3eB474F46489Ed3e84dE708d816fB91317045B79493383Ef5622400'

const authority = (over: Partial<Authority> = {}): Authority => ({
  address: '0x' + '11'.repeat(20),
  controllers: [],
  own_key: true,
  delay: 0,
  pending_changes: [],
  agents: [],
  ...over,
})

describe('sendAction calldata', () => {
  it('is the selector and an ABI-encoded string', () => {
    const data = encodeSendAction({ op: 'ACCOUNT_POLICY', params: { action: 'own_key', enabled: false } })
    const json = '{"op":"ACCOUNT_POLICY","params":{"action":"own_key","enabled":false}}'
    // keccak256("sendAction(string)")[:4]
    expect(data.slice(0, 10)).toBe(bindSuccessorCall(PQ).slice(0, 10))
    expect(BigInt('0x' + data.slice(10, 74))).toBe(32n)
    expect(Number(BigInt('0x' + data.slice(74, 138)))).toBe(json.length)
    const body = data.slice(138)
    expect(body.length % 64).toBe(0)
    expect(Buffer.from(body, 'hex').toString().replace(/\0+$/, '')).toBe(json)
  })

  it('binds the successor as a controller', () => {
    const body = Buffer.from(bindSuccessorCall(PQ).slice(138), 'hex').toString().replace(/\0+$/, '')
    expect(JSON.parse(body)).toEqual({ op: 'ACCOUNT_POLICY', params: { action: 'add_controller', controller: PQ } })
  })
})

describe('where a classic address stands', () => {
  it('is protected once the successor controls it', () => {
    expect(migrationState(authority({ controllers: [{ address: PQ.toLowerCase(), members: null }] }), PQ)).toEqual({ kind: 'protected', ownKey: true, via: 'qrdx' })
    expect(migrationState(authority({ controllers: [{ address: PQ, members: null }], own_key: false, migration: { successor: PQ, chain: 'ethereum', registered_at: 1 } }), PQ)).toEqual({
      kind: 'protected',
      ownKey: false,
      via: 'registry',
    })
  })

  it('waits while the binding waits out a delay, and is unprotected otherwise', () => {
    expect(migrationState(authority({ pending_changes: [{ change_id: 'c1', action: 'add_controller', value: PQ, due: '1800000000' }] }), PQ)).toEqual({ kind: 'waiting', due: 1800000000 })
    expect(migrationState(authority({ controllers: [{ address: '0xPQ' + 'ab'.repeat(32), members: null }] }), PQ)).toEqual({ kind: 'unprotected' })
  })
})

describe('account security notifications', () => {
  it('tells of what is new, once', () => {
    const before = snapshotOf(authority({ pending_changes: [{ change_id: 'old', action: 'delay', value: 3600, due: '1' }] }))
    const now = authority({
      own_key: false,
      controllers: [{ address: PQ, members: null }],
      pending_changes: [
        { change_id: 'old', action: 'delay', value: 3600, due: '1' },
        { change_id: 'r1', action: 'recover', value: PQ, due: '1800000000' },
      ],
    })
    const events = securityEvents('Main', before, now)
    expect(events.map((e) => e.tag)).toEqual(['recover:r1', `controller:${PQ.toLowerCase()}`, 'own-key-off:Main'])
    expect(events[0].title).toBe('Recovery started: Main')
    expect(securityEvents('Main', snapshotOf(now), now)).toEqual([])
  })
})
