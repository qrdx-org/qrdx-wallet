/**
 * QRDX Connect, wallet side (qrdx-trade docs/CONNECT.md).
 *
 * The vector is the one qrdx-trade tests (and that was checked with Python's
 * AES-GCM): both sides must produce and accept exactly these bytes.
 */
import { describe, expect, it } from 'vitest'
import { open, seal, topicOf } from '../../src/core/connect/crypto'
import { formatPairing, walletLink } from '../../src/core/connect/pairing'
import { WalletManager } from '../../src/core/wallet-manager'
import { MemoryStorage } from '../../src/core/storage'
import { PairingError, RemoteSessions } from '../../src/shared/remote-sessions'

const KEY = Uint8Array.from({ length: 32 }, (_, i) => i)
const IV = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
const TOPIC = '630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd'
const MESSAGE = { t: 'req', id: '1', method: 'qrdx_accounts', params: [] }
const PAYLOAD =
  'oKGio6SlpqeoqaqrnToID3_pcNoTR6vxbh7i5FKdezyw2icY9GFCpEWJBHO2DhiezEE8SDHod-olWPOYNXorO0DqQSM8Et9R4DCX5-CYKxYXqw3hTQ'

describe('QRDX Connect encryption', () => {
  it('matches the vector qrdx-trade uses', async () => {
    expect(await topicOf(KEY)).toBe(TOPIC)
    expect(await seal(KEY, TOPIC, 'dapp', MESSAGE, IV)).toBe(PAYLOAD)
    expect(await open(KEY, TOPIC, 'dapp', PAYLOAD)).toEqual(MESSAGE)
  })

  it('will not accept the site’s own message as one from the wallet', async () => {
    await expect(open(KEY, TOPIC, 'wallet', PAYLOAD)).rejects.toThrow()
  })
})

describe('pairing', () => {
  const sessions = (meta: unknown, status = 200) => {
    const storage = new MemoryStorage()
    return new RemoteSessions({
      manager: new WalletManager(storage),
      storage,
      requestApproval: async () => ({ approved: false }),
      fetch: (async () => new Response(JSON.stringify(meta), { status })) as typeof fetch,
    })
  }
  const link = (url: string) =>
    walletLink('https://wallet.qrdx.org', formatPairing({ key: KEY, relay: 'https://trade.qrdx.org/api/relay', name: 'QRDX Trade', url }))

  it('refuses a code whose session was opened by a different site than it names', async () => {
    const rs = sessions({ dappOrigin: 'https://evil.example' })
    await expect(rs.pair(link('https://trade.qrdx.org'))).rejects.toThrow(/opened by https:\/\/evil\.example/)
  })

  it('refuses a code no site ever opened (the relay has no attested origin)', async () => {
    const rs = sessions({ dappOrigin: null })
    await expect(rs.pair(link('https://trade.qrdx.org'))).rejects.toBeInstanceOf(PairingError)
  })

  it('refuses when the relay cannot be reached, and anything that is not a QRDX Connect code', async () => {
    await expect(sessions({}, 502).pair(link('https://trade.qrdx.org'))).rejects.toThrow(/relay/)
    await expect(sessions({}).pair('https://example.com')).rejects.toThrow(/not a QRDX Connect/)
  })
})
