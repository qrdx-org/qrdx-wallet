/**
 * Developer options: the tokens an account runs (src/core/dev-tokens.ts), and ignoring test
 * networks for product mocks (src/core/chains.ts setIgnoreTestnets).
 */
import { afterEach, describe, it, expect } from 'vitest'
import { toAccountId } from '../../src/core/account-id'
import type { IndexedTx } from '../../src/core/activity'
import { CHAINS, allChains, getChain, isListedToken, isMaskedTestnet, isNetworkShown, looksLikeTestnet, setIgnoreTestnets, standInFor, trueChainName } from '../../src/core/chains'
import { authorities, deployedTokenContracts, isTokenAmount, mintable, pastMintRecipients, whichOf, withinCap, yourTokens } from '../../src/core/dev-tokens'
import type { ExchangeToken } from '../../src/core/exchange-client'
import { groupHoldings, portfolioChains, priceIdFor, type Holding } from '../../src/core/portfolio'
import { knownName } from '../../src/core/recipients'
import { plainDecimal } from '../../src/core/plain-decimal'
import { ethToWei } from '../../src/core/ethereum'
import { groupDigits } from '../../src/core/exchange-describe'
import { minimumOut } from '../../src/core/exchange-client'

const PQ = '0xPQ' + 'ab'.repeat(32)
const CLASSIC = '0x' + '12'.repeat(20)
const OTHER = '0xPQ' + 'cd'.repeat(32)
const me = { pq: PQ, classic: CLASSIC }
const TOKEN = '0x' + 'aa'.repeat(20)

const token = (over: Partial<ExchangeToken> = {}): ExchangeToken => ({
  token_address: TOKEN,
  name: 'Mock',
  symbol: 'MOCK',
  decimals: 6,
  total_supply: '1000',
  max_supply: null,
  mint_authority: null,
  freeze_authority: null,
  creator: OTHER,
  created_height: 10,
  ...over,
})

const row = (over: Partial<IndexedTx> & { params?: Record<string, unknown> }): IndexedTx => {
  const { params, ...rest } = over
  return {
    block_height: 1,
    tx_hash: Math.random().toString(16),
    timestamp: 1_000,
    kind: 'exchange',
    op: 'TOKEN_MINT',
    sender: PQ,
    target: null,
    asset: TOKEN,
    amount: null,
    status: 'success',
    fee: null,
    error: null,
    detail: { params },
    ...rest,
  }
}

describe('dev tokens', () => {
  it('lists the tokens the account created or holds an authority over, with which address', () => {
    const list = yourTokens(
      [
        token({ token_address: '0x01', creator: PQ, created_height: 5 }),
        // The mint authority given as the PQ address's ledger id: still this account.
        token({ token_address: '0x02', mint_authority: toAccountId(PQ), created_height: 9 }),
        token({ token_address: '0x03', freeze_authority: CLASSIC.toUpperCase().replace('0X', '0x') }),
        token({ token_address: '0x04', mint_authority: OTHER, extensions: { pausable: { pause_authority: PQ, paused: false } } }),
        token({ token_address: '0x05', mint_authority: OTHER }),
      ],
      me
    )
    expect(list.map((y) => y.token.token_address)).toEqual(['0x03', '0x04', '0x02', '0x01'])
    expect(list.find((y) => y.token.token_address === '0x02')!.powers).toEqual({ mint: 'pq' })
    expect(list.find((y) => y.token.token_address === '0x03')!.powers).toEqual({ freeze: 'classic' })
    expect(list.find((y) => y.token.token_address === '0x04')!.powers).toEqual({ pause: 'pq' })
    expect(list.find((y) => y.token.token_address === '0x01')!.creator).toBe('pq')
    expect(whichOf(OTHER, me)).toBeNull()
  })

  it("reads every authority a token's extensions give it, and none it lacks", () => {
    expect(authorities(token())).toEqual({ mint: null, freeze: null })
    const t = token({
      mint_authority: PQ,
      extensions: {
        metadata: { uri: '', fields: {}, update_authority: PQ },
        transfer_fee: { bps: 25, max_fee: null, pending: null, fee_authority: OTHER, withdraw_authority: null, withheld_at: TOKEN },
        permanent_delegate: OTHER,
      },
    })
    expect(authorities(t)).toEqual({ mint: PQ, freeze: null, metadata: PQ, fee: OTHER, withdraw: null, permanent_delegate: OTHER })
  })

  it('checks amounts against the decimals and the cap', () => {
    expect(isTokenAmount('12.5', 6)).toBe(true)
    expect(isTokenAmount('0.0000001', 6)).toBe(false)
    expect(isTokenAmount('0', 6)).toBe(false)
    expect(isTokenAmount('1.', 6)).toBe(false)
    expect(isTokenAmount('5', 0)).toBe(true)
    expect(isTokenAmount('5.5', 0)).toBe(false)
    const capped = token({ mint_authority: PQ, total_supply: '1000', max_supply: '1500.25' })
    expect(mintable(capped)).toBe('500.25')
    expect(withinCap(capped, '500.25')).toBe(true)
    expect(withinCap(capped, '500.26')).toBe(false)
    expect(mintable(token({ mint_authority: PQ }))).toBeNull()
    expect(withinCap(token({ mint_authority: PQ }), '1000000000')).toBe(true)
  })

  it("reads the node's amounts in exponent form (a balance spent to zero is \"0E-18\")", () => {
    expect(['0E-18', '0e-18', '1E+6', '1.5E-7', '-2.5E+2', '12.340E+1', '-0E-18', '1000200', ' 7.5 '].map(plainDecimal)).toEqual([
      '0', '0', '1000000', '0.00000015', '-250', '123.4', '0', '1000200', '7.5',
    ])
    expect(ethToWei('0E-18', 18)).toBe(0n)
    expect(ethToWei('1.5E-7', 18)).toBe(150_000_000_000n)
    expect(groupDigits('1E+6')).toBe('1,000,000')
    expect(groupDigits('0E-18')).toBe('0')
    expect(minimumOut('1E+2', 1)).toBe('99')
    const spent = token({ mint_authority: PQ, total_supply: '0E-18', max_supply: '1E+3' })
    expect(mintable(spent)).toBe('1000')
    expect(withinCap(spent, '1000')).toBe(true)
  })

  it('finds where the account minted a token before, most recent first, each account once', () => {
    const rows = [
      row({ block_height: 5, timestamp: 50, params: { token_address: TOKEN, amount: '10', to: OTHER } }),
      // The same account in its ledger-id form.
      row({ block_height: 7, timestamp: 70, params: { token_address: TOKEN, amount: '3', to: toAccountId(OTHER) } }),
      // No `to`: it went to the sender.
      row({ block_height: 6, timestamp: 60, params: { token_address: TOKEN.toUpperCase().replace('0X', '0x'), amount: '1' } }),
      row({ block_height: 8, params: { token_address: '0x' + 'bb'.repeat(20), amount: '1', to: CLASSIC } }),
      row({ block_height: 9, status: 'failed', params: { token_address: TOKEN, amount: '1', to: CLASSIC } }),
      row({ block_height: 4, op: 'TOKEN_TRANSFER', params: { token_address: TOKEN, amount: '1', to: CLASSIC } }),
    ]
    const past = pastMintRecipients(rows, TOKEN)
    expect(past.map((p) => [p.address, p.times, p.at, p.amount])).toEqual([
      [toAccountId(OTHER), 2, 70, '3'],
      [PQ, 1, 60, '1'],
    ])
  })

  it('finds the token contracts the account deployed', () => {
    const contract = '0x' + 'cc'.repeat(20)
    const rows = [
      row({ kind: 'evm', op: 'CREATE', block_height: 3, roles: ['sender'], detail: { contract_address: contract, token_transfers: [{ token: contract, from: '0x' + '00'.repeat(20), to: CLASSIC, value: '1' }] } as IndexedTx['detail'] }),
      // A contract that is not a token.
      row({ kind: 'evm', op: 'CREATE', block_height: 4, roles: ['sender'], detail: { contract_address: '0x' + 'dd'.repeat(20), token_transfers: [] } as IndexedTx['detail'] }),
      // Someone else's creation that paid this account.
      row({ kind: 'evm', op: 'CREATE', block_height: 5, roles: ['token_to'], detail: { contract_address: '0x' + 'ee'.repeat(20), token_transfers: [{ token: '0x' + 'ee'.repeat(20), from: '0x' + '00'.repeat(20), to: CLASSIC, value: '1' }] } as IndexedTx['detail'] }),
    ]
    expect(deployedTokenContracts(rows)).toEqual([{ address: contract, txHash: rows[0].tx_hash, height: 3 }])
  })

  it('names an address the wallet knows', () => {
    const sources = { contacts: [{ name: 'Alice', address: OTHER, addressType: 'pq' }], accounts: [{ id: '1', name: 'Account 2', ethAddress: CLASSIC, pqAddress: PQ }] }
    expect(knownName(toAccountId(OTHER), sources)).toBe('Alice')
    expect(knownName(PQ, sources)).toBe('Account 2 · PQ')
    expect(knownName(CLASSIC, sources)).toBe('Account 2')
    expect(knownName('0x' + '99'.repeat(20), sources)).toBeUndefined()
  })
})

describe('ignoring test networks', () => {
  afterEach(() => setIgnoreTestnets(false))

  it('shows each test network as its mainnet, in its place, and back again', () => {
    expect(looksLikeTestnet(CHAINS['ethereum-sepolia'])).toBe(true)
    setIgnoreTestnets(true)
    const sepolia = CHAINS['ethereum-sepolia']
    expect([sepolia.name, sepolia.shortName, sepolia.nativeCurrency.name, sepolia.tokens[0].name]).toEqual(['Ethereum', 'ETH', 'Ether', 'Ether'])
    expect(CHAINS['qrdx-testnet'].name).toBe('QRDX Mainnet')
    expect(CHAINS['bitcoin-testnet'].tokens[0].name).toBe('Bitcoin')
    // What decides behaviour is untouched.
    expect([sepolia.isTestnet, sepolia.chainId, sepolia.rpcUrl]).toEqual([true, 11155111, 'https://ethereum-sepolia-rpc.publicnode.com'])
    expect(looksLikeTestnet(sepolia)).toBe(false)
    expect(isMaskedTestnet(sepolia)).toBe(true)
    expect(trueChainName(sepolia)).toBe('Ethereum Sepolia')
    // The stand-in takes the mainnet's place; the mainnet is not offered meanwhile.
    const ids = allChains().map((c) => c.id)
    expect(ids).not.toContain('ethereum')
    expect(ids).not.toContain('qrdx-mainnet')
    expect(ids.indexOf('ethereum-sepolia')).toBeLessThan(ids.indexOf('polygon-amoy'))
    expect(ids).toContain('qrdx-local')
    expect(standInFor('ethereum')).toBe('ethereum-sepolia')
    expect(getChain('ethereum')!.name).toBe('Ethereum')
    // Shown without "Show test networks"; the local node still needs it.
    expect(isNetworkShown(sepolia, false)).toBe(true)
    expect(isNetworkShown(CHAINS['qrdx-local'], false)).toBe(false)
    // Mainnet ETH's own token list is not touched by the rename.
    expect(CHAINS.ethereum.tokens[0].name).toBe('Ether')

    setIgnoreTestnets(false)
    expect([CHAINS['ethereum-sepolia'].name, CHAINS['ethereum-sepolia'].nativeCurrency.name, CHAINS['bitcoin-testnet'].tokens[0].name]).toEqual(['Ethereum Sepolia', 'Sepolia Ether', 'Testnet Bitcoin'])
    expect(allChains().map((c) => c.id)).toContain('ethereum')
    expect(standInFor('ethereum')).toBeUndefined()
    expect(isNetworkShown(CHAINS['ethereum-sepolia'], false)).toBe(false)
  })

  it("lists, prices and groups test networks' tokens like real ones", () => {
    const mock = '0x' + 'ab'.repeat(20)
    const qrdx = CHAINS['qrdx-testnet']
    expect(isListedToken(qrdx, mock)).toBe(false)
    expect(priceIdFor(qrdx, mock, 'USDC')).toBeUndefined()
    setIgnoreTestnets(true)
    expect(isListedToken(qrdx, mock)).toBe(true)
    expect(isListedToken(CHAINS.ethereum, mock)).toBe(false)
    expect(priceIdFor(qrdx, mock, 'USDC')).toBe('usd-coin')
    const h: Holding = { chain: CHAINS['ethereum-sepolia'], address: '', symbol: 'ETH', name: 'Ether', decimals: 18, raw: 10n ** 18n, listed: true, coingeckoId: 'ethereum' }
    expect(groupHoldings([h])[0].testnet).toBe(false)
    expect(portfolioChains(allChains(), qrdx, false).map((c) => c.id)).toContain('ethereum-sepolia')
  })
})
