/**
 * Chain-identity probe tests.
 *
 * This layer decides whether the wallet is allowed to sign, so the cases that
 * matter are the refusals: an endpoint reporting a chain id other than the one
 * configured, and an endpoint that cannot be reached at all.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  probeChainIdentity,
  resolveSigningChainId,
  getCachedChainIdentity,
  clearChainIdentityCache,
  trustChainId,
  untrustChainId,
  setTrustedChainIds,
  getTrustedChainIds,
  ChainIdentityError,
} from '../../src/core/chain-identity'
import type { ChainConfig } from '../../src/core/chains'

function chain(overrides: Partial<ChainConfig> = {}): ChainConfig {
  return {
    id: 'test-chain',
    name: 'Test Chain',
    shortName: 'TEST',
    chainId: 9999,
    rpcUrl: 'http://node.invalid/rpc',
    explorerUrl: 'http://explorer.invalid',
    nativeCurrency: { name: 'Test', symbol: 'TST', decimals: 18 },
    transport: 'web3',
    isEvm: true,
    isTestnet: true,
    blockTimeSec: 1,
    color: '',
    tokens: [],
    ...overrides,
  }
}

/** Respond to eth_chainId with `id`, after an optional delay. */
function respondWith(id: number, delayMs = 0) {
  return vi.fn(async () => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs))
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x' + id.toString(16) }),
    } as unknown as Response
  })
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  clearChainIdentityCache()
  setTrustedChainIds({})
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('probeChainIdentity', () => {
  it('reports a match when the node agrees with the registry', async () => {
    globalThis.fetch = respondWith(9999)

    const identity = await probeChainIdentity(chain())
    expect(identity.liveChainId).toBe(9999)
    expect(identity.matches).toBe(true)
    expect(identity.trusted).toBe(false)
  })

  it('reports a mismatch when the node disagrees', async () => {
    globalThis.fetch = respondWith(88888)

    const identity = await probeChainIdentity(chain())
    expect(identity.liveChainId).toBe(88888)
    expect(identity.configuredChainId).toBe(9999)
    expect(identity.matches).toBe(false)
  })

  it('caches a result and shares one request between concurrent callers', async () => {
    const fetchMock = respondWith(9999)
    globalThis.fetch = fetchMock

    const c = chain()
    const [a, b] = await Promise.all([probeChainIdentity(c), probeChainIdentity(c)])

    expect(a.liveChainId).toBe(b.liveChainId)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await probeChainIdentity(c)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-probes when forced', async () => {
    const fetchMock = respondWith(9999)
    globalThis.fetch = fetchMock

    await probeChainIdentity(chain())
    await probeChainIdentity(chain(), true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the next endpoint when the primary fails', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call++
      if (call === 1) throw new Error('ECONNREFUSED')
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x270f' }),
      } as unknown as Response
    })

    const identity = await probeChainIdentity(
      chain({ rpcFallbacks: ['http://backup.invalid/rpc'] }),
    )
    expect(identity.liveChainId).toBe(9999)
    expect(identity.rpcUrl).toBe('http://backup.invalid/rpc')
  })

  it('throws when no endpoint answers, naming what it tried', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })

    await expect(probeChainIdentity(chain())).rejects.toThrow(ChainIdentityError)
  })

  it('rejects a nonsense chain id rather than signing with it', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x0' }),
    })) as unknown as typeof fetch

    await expect(probeChainIdentity(chain())).rejects.toThrow(ChainIdentityError)
  })
})

describe('resolveSigningChainId', () => {
  it('returns the live chain id when it matches', async () => {
    globalThis.fetch = respondWith(9999)
    await expect(resolveSigningChainId(chain())).resolves.toBe(9999)
  })

  it('refuses to sign on a mismatch, naming both ids', async () => {
    globalThis.fetch = respondWith(88888)

    await expect(resolveSigningChainId(chain())).rejects.toThrow(
      /reports chain ID 88888, but this network is configured as 9999/,
    )
  })

  it('refuses to sign when the node is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(resolveSigningChainId(chain())).rejects.toThrow(ChainIdentityError)
  })

  it('signs with a mismatched id only after it is explicitly trusted', async () => {
    globalThis.fetch = respondWith(88888)
    const c = chain()

    await expect(resolveSigningChainId(c)).rejects.toThrow(ChainIdentityError)

    trustChainId(c.id, 88888)
    await expect(resolveSigningChainId(c)).resolves.toBe(88888)

    // Withdrawing trust must re-block signing.
    untrustChainId(c.id)
    await expect(resolveSigningChainId(c)).rejects.toThrow(ChainIdentityError)
  })

  it('scopes trust to one chain and one id', async () => {
    globalThis.fetch = respondWith(88888)

    // Trusting a different id than the node reports must not unblock signing.
    trustChainId('test-chain', 12345)
    await expect(resolveSigningChainId(chain())).rejects.toThrow(ChainIdentityError)

    // Trust recorded for another chain must not leak across.
    untrustChainId('test-chain')
    trustChainId('other-chain', 88888)
    await expect(resolveSigningChainId(chain())).rejects.toThrow(ChainIdentityError)
  })
})

describe('trust persistence', () => {
  it('round-trips trust decisions for the settings layer', () => {
    trustChainId('qrdx-local', 88888)
    expect(getTrustedChainIds()).toEqual({ 'qrdx-local': 88888 })

    setTrustedChainIds({ 'qrdx-mainnet': 1337 })
    expect(getTrustedChainIds()).toEqual({ 'qrdx-mainnet': 1337 })
  })

  it('ignores malformed persisted entries', () => {
    setTrustedChainIds({ good: 7, bad: -1, alsoBad: 0 } as Record<string, number>)
    expect(getTrustedChainIds()).toEqual({ good: 7 })
  })
})

describe('getCachedChainIdentity', () => {
  it('returns nothing before a probe, and the result after', async () => {
    globalThis.fetch = respondWith(9999)

    expect(getCachedChainIdentity('test-chain')).toBeNull()
    await probeChainIdentity(chain())
    expect(getCachedChainIdentity('test-chain')?.liveChainId).toBe(9999)

    clearChainIdentityCache('test-chain')
    expect(getCachedChainIdentity('test-chain')).toBeNull()
  })
})
