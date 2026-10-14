import { describe, it, expect } from 'vitest'
import { assessOrigin, editDistance } from '../../src/core/site-risk'

describe('site risk', () => {
  it('passes the genuine domains and their subdomains', () => {
    for (const o of ['https://trade.qrdx.org', 'https://app.uniswap.org', 'https://phantom.app', 'https://explorer.qrdx.org']) {
      expect(assessOrigin(o).level, o).toBe('none')
    }
  })

  it('passes ordinary unrelated sites', () => {
    expect(assessOrigin('https://example.com').level).toBe('none')
    expect(assessOrigin('https://my-dapp.xyz').level).toBe('none')
  })

  it('flags look-alikes of known names', () => {
    for (const o of ['https://uniswop.org', 'https://uniswap.com', 'https://qrdx.claim-rewards.io', 'https://phantorn.app', 'https://metamask-io.app', 'https://qrdx-airdrop.xyz', 'https://0pensea.io']) {
      const r = assessOrigin(o)
      expect(r.level, o).toBe('danger')
    }
  })

  it('flags punycode, IP addresses and plain HTTP', () => {
    expect(assessOrigin('https://xn--uniswp-9ta.org').level).toBe('danger')
    expect(assessOrigin('https://203.0.113.9').level).toBe('caution')
    expect(assessOrigin('http://example.com').level).toBe('caution')
  })

  it('does not warn for local development', () => {
    expect(assessOrigin('http://localhost:3000').level).toBe('none')
  })

  it('computes edit distance', () => {
    expect(editDistance('uniswop', 'uniswap')).toBe(1)
    expect(editDistance('abc', 'abc')).toBe(0)
  })
})
