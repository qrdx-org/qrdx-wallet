/**
 * dApp provider policy (extension background).
 *
 * Real WalletManager + SitePermissions + WatchedTokens; approvals and the node
 * are fakes. These tests pin the security behaviour: what a page can learn or
 * do without the user, and what each approval actually authorises.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { WalletManager } from '../../src/core/wallet-manager'
import { MemoryStorage } from '../../src/core/storage'
import { SitePermissions } from '../../src/core/permissions'
import { WatchedTokens } from '../../src/core/watched-tokens'
import {
  ProviderRouter,
  type ApprovalRequest,
  type ApprovalResult,
} from '../../src/extension/provider/router'
import { hexToBytes, recoverAddress } from '../../src/core/crypto'
import { typedDataDigest } from '../../src/core/eip712'
import { rlpDecode } from '../../src/core/rlp'
import { toAccountId } from '../../src/core/account-id'

const PASSWORD = 'correct horse battery staple'
const MNEMONIC = 'test test test test test test test test test test test junk'
const ADDR0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const SITE = 'https://app.example.com'
const OTHER = 'https://evil.example.net'

let manager: WalletManager
let permissions: SitePermissions
let watched: WatchedTokens
let approvals: ApprovalRequest[]
let decide: (r: ApprovalRequest) => ApprovalResult
let rpcCalls: { method: string; params: unknown[] }[]
let router: ProviderRouter

beforeEach(async () => {
  const storage = new MemoryStorage()
  manager = new WalletManager(storage, { kdfIterations: 1000 })
  await manager.createVaultFromMnemonic({ password: PASSWORD, mnemonic: MNEMONIC })
  await manager.updateSettings({ activeChainId: 'qrdx-local' })
  permissions = new SitePermissions(storage)
  watched = new WatchedTokens(storage)
  approvals = []
  rpcCalls = []
  decide = (r) => (r.kind === 'connect' ? { approved: true, accountIds: [] } : { approved: true })
  router = new ProviderRouter({
    manager,
    permissions,
    watchedTokens: watched,
    async requestApproval(r) {
      approvals.push(r)
      const res = decide(r)
      if (r.kind === 'connect' && res.approved && res.accountIds?.length === 0) {
        const s = await manager.getState()
        return { approved: true, accountIds: [s!.currentWalletId!] }
      }
      return res
    },
    async rpc(_chain, method, params) {
      rpcCalls.push({ method, params })
      const answers: Record<string, unknown> = {
        eth_blockNumber: '0x10',
        eth_getTransactionCount: '0x3',
        eth_gasPrice: '0x3b9aca00',
        eth_estimateGas: '0x5208',
        eth_sendRawTransaction: '0x' + 'ab'.repeat(32),
      }
      return answers[method] as never
    },
    signingChainId: async () => 9999,
  })
})

const connect = () => router.handle(SITE, { method: 'eth_requestAccounts' })

describe('without connecting', () => {
  it('serves read-only chain data and the chain id', async () => {
    expect(await router.handle(OTHER, { method: 'eth_blockNumber' })).toBe('0x10')
    expect(await router.handle(OTHER, { method: 'eth_chainId' })).toBe('0x270f')
  })

  it('reveals no accounts and refuses to sign or send', async () => {
    expect(await router.handle(OTHER, { method: 'eth_accounts' })).toEqual([])
    await expect(
      router.handle(OTHER, { method: 'personal_sign', params: ['0x68', ADDR0] })
    ).rejects.toMatchObject({ code: 4100 })
    await expect(
      router.handle(OTHER, { method: 'eth_sendTransaction', params: [{ from: ADDR0, to: ADDR0 }] })
    ).rejects.toMatchObject({ code: 4100 })
    expect(approvals).toHaveLength(0)
  })

  it('rejects unknown methods and eth_sign', async () => {
    await expect(router.handle(OTHER, { method: 'debug_traceTransaction' })).rejects.toMatchObject({
      code: 4200,
    })
    await expect(
      router.handle(OTHER, { method: 'eth_sign', params: [ADDR0, '0x00'] })
    ).rejects.toMatchObject({ code: 4200 })
  })
})

describe('connecting', () => {
  it('asks once, then exposes only the granted account to that origin', async () => {
    expect(await connect()).toEqual([ADDR0])
    expect(approvals.map((a) => a.kind)).toEqual(['connect'])
    expect(await connect()).toEqual([ADDR0])
    expect(approvals).toHaveLength(1)
    expect(await router.handle(OTHER, { method: 'eth_accounts' })).toEqual([])
  })

  it('reports a user rejection as 4001 and grants nothing', async () => {
    decide = () => ({ approved: false })
    await expect(connect()).rejects.toMatchObject({ code: 4001 })
    expect(await permissions.get(SITE)).toBeNull()
  })

  it('hides accounts while locked', async () => {
    await connect()
    await manager.lock()
    expect(await router.handle(SITE, { method: 'eth_accounts' })).toEqual([])
  })

  it('asks a connected site’s user to unlock before signing; unconnected sites get 4100', async () => {
    await connect()
    await manager.lock()
    decide = () => ({ approved: false })
    await expect(
      router.handle(SITE, { method: 'personal_sign', params: ['0x68', ADDR0] })
    ).rejects.toMatchObject({ code: 4001 })
    expect(approvals.at(-1)?.kind).toBe('unlock')
    const before = approvals.length
    await expect(
      router.handle(OTHER, { method: 'personal_sign', params: ['0x68', ADDR0] })
    ).rejects.toMatchObject({ code: 4100 })
    expect(approvals.length).toBe(before)
  })

  it('wallet_revokePermissions disconnects', async () => {
    await connect()
    await router.handle(SITE, {
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
    expect(await router.handle(SITE, { method: 'eth_accounts' })).toEqual([])
  })
})

describe('signing', () => {
  beforeEach(connect)

  it('personal_sign requires approval and recovers to the account', async () => {
    const sig = (await router.handle(SITE, {
      method: 'personal_sign',
      params: ['0x68656c6c6f', ADDR0],
    })) as string
    expect(approvals.at(-1)).toMatchObject({ kind: 'personal-sign', encoding: 'hex' })
    expect(sig).toBe(await manager.signPersonalMessage('hello'))
    expect(await permissions.can(SITE, 'signMessage')).toBe(true)
  })

  it('refuses typed data bound to another chain', async () => {
    const typed = {
      types: {
        EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
        X: [{ name: 'a', type: 'uint256' }],
      },
      primaryType: 'X',
      domain: { chainId: 1 },
      message: { a: 1 },
    }
    await expect(
      router.handle(SITE, {
        method: 'eth_signTypedData_v4',
        params: [ADDR0, JSON.stringify(typed)],
      })
    ).rejects.toMatchObject({ code: -32602 })
    const ok = { ...typed, domain: { chainId: 9999 } }
    const sig = (await router.handle(SITE, {
      method: 'eth_signTypedData_v4',
      params: [ADDR0, JSON.stringify(ok)],
    })) as string
    expect(recoverAddress(typedDataDigest(ok), hexToBytes(sig.slice(2)))).toBe(ADDR0)
  })

  it('a rejected signature is 4001 and nothing is signed', async () => {
    decide = () => ({ approved: false })
    await expect(
      router.handle(SITE, { method: 'personal_sign', params: ['0x68', ADDR0] })
    ).rejects.toMatchObject({ code: 4001 })
  })
})

describe('transactions', () => {
  beforeEach(connect)

  it('builds a legacy QRDX transaction with node nonce and gas, after approval', async () => {
    const hash = await router.handle(SITE, {
      method: 'eth_sendTransaction',
      params: [{ from: ADDR0, to: '0x' + '11'.repeat(20), value: '0x1', maxFeePerGas: '0x99' }],
    })
    expect(hash).toBe('0x' + 'ab'.repeat(32))
    expect(approvals.at(-1)).toMatchObject({
      kind: 'transaction',
      credential: 'classic',
      tx: { gasPrice: '1000000000' },
    })
    const raw = rpcCalls.find((c) => c.method === 'eth_sendRawTransaction')!.params[0] as string
    // Legacy envelope (no type byte): RLP list of 9 fields, nonce 3.
    const fields = rlpDecode(hexToBytes(raw.slice(2))).data as { data: Uint8Array }[]
    expect(fields).toHaveLength(9)
    expect(fields[0].data[0]).toBe(3)
  })

  it('sends a type-0x51 PQ transaction to a resolved 0xPQ recipient', async () => {
    const pqTo = '0xPQ' + 'ab'.repeat(32)
    await router.handle(SITE, {
      method: 'qrdx_sendPQTransaction',
      params: [{ to: pqTo, value: '0x5' }],
    })
    const approval = approvals.at(-1) as Extract<ApprovalRequest, { kind: 'transaction' }>
    expect(approval.credential).toBe('pq')
    expect(approval.tx.toAccountId).toBe(toAccountId(pqTo))
    expect(BigInt(approval.tx.gasLimit)).toBeGreaterThan(140_000n)
    const raw = rpcCalls.find((c) => c.method === 'eth_sendRawTransaction')!.params[0] as string
    expect(raw.slice(0, 4)).toBe('0x51')
  })

  it('refuses a from-address the site was not granted', async () => {
    await expect(
      router.handle(SITE, {
        method: 'eth_sendTransaction',
        params: [{ from: '0x' + '22'.repeat(20), to: ADDR0 }],
      })
    ).rejects.toMatchObject({ code: 4100 })
  })
})

describe('networks and assets', () => {
  beforeEach(connect)

  it('switches only to registry chains, with approval', async () => {
    await expect(
      router.handle(SITE, {
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x123456' }],
      })
    ).rejects.toMatchObject({ code: 4902 })
    await router.handle(SITE, {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
    })
    expect((await manager.getState())!.settings.activeChainId).toBe('ethereum')
    expect(await router.handle(SITE, { method: 'eth_chainId' })).toBe('0x1')
  })

  it('wallet_watchAsset stores the token after approval', async () => {
    const token = '0x' + '33'.repeat(20)
    expect(
      await router.handle(SITE, {
        method: 'wallet_watchAsset',
        params: { type: 'ERC20', options: { address: token, symbol: 'TKN', decimals: 6 } },
      })
    ).toBe(true)
    expect(await watched.list('qrdx-local')).toMatchObject([
      { address: token, symbol: 'TKN', decimals: 6 },
    ])
  })
})
