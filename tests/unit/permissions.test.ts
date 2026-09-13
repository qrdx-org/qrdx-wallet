/**
 * Permission store tests.
 *
 * These focus on the security-relevant behaviour — origin normalisation,
 * default-deny, and that a grant of one capability never implies another —
 * since this store is what the injected provider consults before honouring a
 * dApp request.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SitePermissions,
  PermissionError,
  normalizeOrigin,
  DEFAULT_CONNECT_CAPABILITIES,
} from '../../src/core/permissions'
import type { IStorage } from '../../src/core/storage'

/** In-memory IStorage, matching the contract the real backends implement. */
class MemoryStorage implements IStorage {
  private data = new Map<string, string>()

  async get<T>(key: string): Promise<T | null> {
    const raw = this.data.get(key)
    return raw === undefined ? null : (JSON.parse(raw) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
  async clear(): Promise<void> {
    this.data.clear()
  }
}

const ACCOUNT = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
const OTHER_ACCOUNT = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'

let perms: SitePermissions

beforeEach(() => {
  perms = new SitePermissions(new MemoryStorage())
})

describe('normalizeOrigin', () => {
  it('reduces a full URL to its origin', () => {
    expect(normalizeOrigin('https://app.uniswap.org/swap?a=1#x')).toBe(
      'https://app.uniswap.org',
    )
  })

  it('drops credentials and default ports', () => {
    expect(normalizeOrigin('https://user:pw@example.com:443/path')).toBe(
      'https://example.com',
    )
  })

  it('keeps a non-default port, which is part of the origin', () => {
    expect(normalizeOrigin('http://localhost:3000/x')).toBe('http://localhost:3000')
  })

  it('treats different subdomains as different origins', () => {
    expect(normalizeOrigin('https://a.example.com')).not.toBe(
      normalizeOrigin('https://b.example.com'),
    )
  })

  it('treats http and https as different origins', () => {
    expect(normalizeOrigin('http://example.com')).not.toBe(
      normalizeOrigin('https://example.com'),
    )
  })

  it('refuses schemes that do not identify an attributable site', () => {
    expect(() => normalizeOrigin('file:///etc/passwd')).toThrow(PermissionError)
    expect(() => normalizeOrigin('javascript:alert(1)')).toThrow(PermissionError)
    expect(() => normalizeOrigin('not a url')).toThrow(PermissionError)
  })
})

describe('default deny', () => {
  it('reports no capabilities for an unknown origin', async () => {
    expect(await perms.can('https://evil.example', 'viewAccounts')).toBe(false)
    expect(await perms.can('https://evil.example', 'sendTransaction')).toBe(false)
    expect(await perms.get('https://evil.example')).toBeNull()
  })

  it('returns false rather than throwing for a malformed origin', async () => {
    expect(await perms.can('not a url', 'viewAccounts')).toBe(false)
  })

  it('exposes no accounts without a grant', async () => {
    expect(await perms.visibleAccounts('https://a.example', [ACCOUNT])).toEqual([])
  })
})

describe('granting', () => {
  it('a plain connect grants read-only capabilities only', async () => {
    const record = await perms.grant('https://app.example.com', {
      accounts: [ACCOUNT],
    })

    expect(record.capabilities).toEqual(DEFAULT_CONNECT_CAPABILITIES)
    expect(await perms.can('https://app.example.com', 'viewAccounts')).toBe(true)

    // The important half: connecting must not confer spending or signing.
    expect(await perms.can('https://app.example.com', 'sendTransaction')).toBe(false)
    expect(await perms.can('https://app.example.com', 'signMessage')).toBe(false)
  })

  it('merges capabilities instead of replacing them', async () => {
    await perms.grant('https://app.example.com', { capabilities: ['viewAccounts'] })
    await perms.grant('https://app.example.com', { capabilities: ['signMessage'] })

    expect(await perms.can('https://app.example.com', 'viewAccounts')).toBe(true)
    expect(await perms.can('https://app.example.com', 'signMessage')).toBe(true)
  })

  it('scopes a grant to the exact origin', async () => {
    await perms.grant('https://app.example.com', { capabilities: ['sendTransaction'] })

    expect(await perms.can('https://evil.example.com', 'sendTransaction')).toBe(false)
    expect(await perms.can('http://app.example.com', 'sendTransaction')).toBe(false)
  })

  it('normalises the origin when a full URL is used to grant', async () => {
    await perms.grant('https://app.example.com/deep/path?x=1')
    expect(await perms.get('https://app.example.com')).not.toBeNull()
  })

  it('stores accounts checksummed and de-duplicated', async () => {
    const record = await perms.grant('https://app.example.com', {
      accounts: [ACCOUNT.toLowerCase(), ACCOUNT.toUpperCase().replace('0X', '0x')],
    })
    expect(record.accounts).toEqual([ACCOUNT])
  })
})

describe('revoking', () => {
  it('removes only the named capabilities', async () => {
    await perms.grant('https://app.example.com', {
      capabilities: ['viewAccounts', 'sendTransaction'],
    })
    await perms.revoke('https://app.example.com', ['sendTransaction'])

    expect(await perms.can('https://app.example.com', 'viewAccounts')).toBe(true)
    expect(await perms.can('https://app.example.com', 'sendTransaction')).toBe(false)
  })

  it('keeps the site listed after revoking everything, as explicitly disconnected', async () => {
    await perms.grant('https://app.example.com', { capabilities: ['viewAccounts'] })
    await perms.revoke('https://app.example.com', ['viewAccounts'])

    const record = await perms.get('https://app.example.com')
    expect(record).not.toBeNull()
    expect(record!.capabilities).toEqual([])
  })

  it('revokeAll forgets the site entirely', async () => {
    await perms.grant('https://app.example.com')
    await perms.revokeAll('https://app.example.com')

    expect(await perms.get('https://app.example.com')).toBeNull()
    expect(await perms.list()).toEqual([])
  })
})

describe('visibleAccounts', () => {
  it('returns granted accounts the wallet still holds', async () => {
    await perms.grant('https://app.example.com', { accounts: [ACCOUNT] })

    expect(
      await perms.visibleAccounts('https://app.example.com', [ACCOUNT, OTHER_ACCOUNT]),
    ).toEqual([ACCOUNT])
  })

  it('hides an account the wallet no longer holds', async () => {
    await perms.grant('https://app.example.com', { accounts: [ACCOUNT] })

    // Account removed from the wallet — a stale grant must not keep it visible.
    expect(
      await perms.visibleAccounts('https://app.example.com', [OTHER_ACCOUNT]),
    ).toEqual([])
  })

  it('hides accounts once viewAccounts is revoked', async () => {
    await perms.grant('https://app.example.com', { accounts: [ACCOUNT] })
    await perms.revoke('https://app.example.com', ['viewAccounts'])

    expect(await perms.visibleAccounts('https://app.example.com', [ACCOUNT])).toEqual([])
  })

  it('matches accounts case-insensitively across casing variants', async () => {
    await perms.grant('https://app.example.com', { accounts: [ACCOUNT] })

    expect(
      await perms.visibleAccounts('https://app.example.com', [ACCOUNT.toLowerCase()]),
    ).toEqual([ACCOUNT])
  })
})

describe('persistence', () => {
  it('shares state across instances backed by the same storage', async () => {
    const storage = new MemoryStorage()
    await new SitePermissions(storage).grant('https://app.example.com', {
      capabilities: ['signMessage'],
    })

    const reopened = new SitePermissions(storage)
    expect(await reopened.can('https://app.example.com', 'signMessage')).toBe(true)
  })
})
