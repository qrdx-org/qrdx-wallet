/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — dApp request router (extension background)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Every request a web page makes through `window.ethereum` / `window.qrdx`
 *  ends up here, tagged with the page's origin *as the browser reported it*
 *  (never as the page claims). The router decides, in order:
 *
 *    1. Is the method known?                         → 4200 if not
 *    2. Is it read-only chain data?                  → proxy to the active RPC
 *    3. Is the origin connected (and wallet usable)? → 4100 if not
 *    4. Does it need the user?                       → approval window
 *    5. Sign in the background, broadcast, return.
 *
 *  Keys never leave the background; pages get addresses, signatures and
 *  transaction hashes only. Error codes follow EIP-1193 / EIP-1474.
 *
 *  Dependencies are injected so the whole policy is unit-tested without a
 *  browser (tests/unit/provider-router.test.ts).
 */

import type { WalletManager } from '../../core/wallet-manager'
import type { SitePermissions, SiteCapability } from '../../core/permissions'
import type { WatchedTokens } from '../../core/watched-tokens'
import type { WalletAccount } from '../../core/types'
import {
  getChain,
  getChainById,
  isQrdxChain,
  getFeeModel,
  CHAIN_LIST,
  type ChainConfig,
} from '../../core/chains'
import { addressesEqual } from '../../core/address'
import { toAccountId } from '../../core/account-id'
import { pqIntrinsicGas } from '../../core/pq-tx'
import { ExchangeOp, type ExchangeOpName, type JsonValue } from '../../core/exchange-tx'
import { parseTypedData, typedDataChainId } from '../../core/eip712'
import { submitExchangeOp } from '../../core/tx-service'
import { weiToEth, type EthTransactionRequest } from '../../core/ethereum'

// ─── Errors ─────────────────────────────────────────────────────────────────

export class ProviderRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'ProviderRpcError'
  }
}

export const Errors = {
  userRejected: () => new ProviderRpcError(4001, 'User rejected the request.'),
  unauthorized: (m = 'The requested account and/or method has not been authorized by the user.') =>
    new ProviderRpcError(4100, m),
  unsupported: (method: string) =>
    new ProviderRpcError(4200, `The wallet does not support ${method}.`),
  invalidParams: (m: string) => new ProviderRpcError(-32602, m),
  internal: (m: string) => new ProviderRpcError(-32603, m),
  unknownChain: (id: string) =>
    new ProviderRpcError(
      4902,
      `Unrecognized chain ID ${id}. QRDX Wallet supports only the networks in its registry.`
    ),
}

// ─── Approvals ──────────────────────────────────────────────────────────────

export type ApprovalRequest =
  | { kind: 'connect'; origin: string }
  /** A connected site needs the wallet; the window resolves as soon as the user unlocks. */
  | { kind: 'unlock'; origin: string }
  | {
      kind: 'personal-sign'
      origin: string
      account: string
      message: string
      encoding: 'utf8' | 'hex'
    }
  | { kind: 'typed-sign'; origin: string; account: string; typedData: unknown }
  | { kind: 'pq-sign'; origin: string; account: string; message: string }
  | {
      kind: 'transaction'
      origin: string
      account: string
      credential: 'classic' | 'pq'
      chain: string
      tx: {
        to: string | null
        value: string
        data: string
        gasLimit: string
        gasPrice: string
        fee: string
        toAccountId: string | null
      }
    }
  | {
      kind: 'exchange'
      origin: string
      account: string
      chain: string
      op: ExchangeOpName
      params: Record<string, JsonValue>
    }
  | { kind: 'switch-chain'; origin: string; chain: string }
  | {
      kind: 'watch-asset'
      origin: string
      chain: string
      token: { address: string; symbol: string; decimals: number; image?: string }
    }

export type ApprovalResult = { approved: false } | { approved: true; accountIds?: string[] }

export interface RouterDeps {
  manager: Pick<
    WalletManager,
    | 'getState'
    | 'isUnlocked'
    | 'signPersonalMessage'
    | 'signTypedData'
    | 'signPqMessage'
    | 'signEvmTransaction'
    | 'signPqTransaction'
    | 'signExchangeTransaction'
    | 'updateSettings'
  >
  permissions: SitePermissions
  watchedTokens: WatchedTokens
  /** Show an approval window and wait for the user. Resolves `{approved:false}` if closed. */
  requestApproval(req: ApprovalRequest): Promise<ApprovalResult>
  /** JSON-RPC to the node behind a chain. */
  rpc<T = unknown>(chain: ChainConfig, method: string, params: unknown[]): Promise<T>
  /** Chain id the wallet will sign with (verified against the live node). */
  signingChainId(chain: ChainConfig): Promise<number>
  /** Record a submitted transaction in the activity log (optional). */
  onSubmitted?(
    record: Parameters<import('../../core/activity').ActivityLog['add']>[0]
  ): Promise<void>
}

export interface RpcRequest {
  method: string
  params?: unknown
}

/** Chain data any page may read without connecting. */
const READ_ONLY = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_syncing',
  'eth_protocolVersion',
  'web3_clientVersion',
  'qrdx_getAccountId',
  'qrdx_getIntrinsicGas',
  'qrdx_getAddressInfo',
  'qrdx_getNetworkInfo',
  'exchange_getNonce',
  'exchange_gasPrice',
  'exchange_getTokens',
  'exchange_getToken',
  'exchange_getTokenBalance',
  'exchange_getPools',
  'exchange_getPool',
  'exchange_quoteSwap',
  'exchange_quoteLiquidity',
  'exchange_getOrderBook',
  'exchange_getOpenOrders',
  'exchange_getPositions',
  'exchange_getTransactionReceipt',
  'exchange_getAllowance',
  'perp_getMarkets',
  'perp_getMarket',
  'perp_getOrderBook',
  'perp_getAccount',
  'perp_getOpenOrders',
  'perp_getVault',
  'perp_getTrades',
])

/** Methods that need a connected origin and/or the user. */
const ACCOUNT_METHODS = new Set([
  'eth_accounts',
  'eth_requestAccounts',
  'eth_coinbase',
  'eth_chainId',
  'net_version',
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_watchAsset',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'wallet_revokePermissions',
  'qrdx_requestAccounts',
  'qrdx_accounts',
  'qrdx_signPQMessage',
  'qrdx_sendPQTransaction',
  'qrdx_sendExchangeTransaction',
  'qrdx_chainInfo',
])

const hex = (n: bigint | number) => '0x' + BigInt(n).toString(16)
const asArray = (p: unknown): unknown[] => (Array.isArray(p) ? p : p === undefined ? [] : [p])

export class ProviderRouter {
  constructor(private readonly d: RouterDeps) {}

  // ── Shared state ──────────────────────────────────────────────────────────

  async activeChain(): Promise<ChainConfig> {
    const state = await this.d.manager.getState()
    return getChain(state?.settings.activeChainId ?? '') ?? CHAIN_LIST[0]
  }

  private async accounts(): Promise<WalletAccount[]> {
    if (!(await this.d.manager.isUnlocked())) return []
    return (await this.d.manager.getState())?.wallets ?? []
  }

  /** What `eth_accounts` returns for an origin: granted, still held, selected first. Empty while locked. */
  async exposedAccounts(origin: string): Promise<string[]> {
    const state = await this.d.manager.getState()
    const all = await this.accounts()
    if (!state || all.length === 0) return []
    const visible = await this.d.permissions.visibleAccounts(
      origin,
      all.map((a) => a.ethAddress)
    )
    const selected = all.find((a) => a.id === state.currentWalletId)?.ethAddress
    return visible.sort((a, b) =>
      selected && addressesEqual(a, selected) ? -1 : selected && addressesEqual(b, selected) ? 1 : 0
    )
  }

  private async accountFor(origin: string, address?: string): Promise<WalletAccount> {
    if (!(await this.d.manager.isUnlocked())) {
      // Only sites the user already connected get to ask for an unlock.
      const rec = await this.d.permissions.get(origin).catch(() => null)
      if (!rec?.capabilities.includes('viewAccounts')) throw Errors.unauthorized()
      const r = await this.d.requestApproval({ kind: 'unlock', origin })
      if (!r.approved || !(await this.d.manager.isUnlocked())) throw Errors.userRejected()
    }
    const exposed = await this.exposedAccounts(origin)
    if (exposed.length === 0) throw Errors.unauthorized()
    const target = address ?? exposed[0]
    if (!exposed.some((a) => addressesEqual(a, target)))
      throw Errors.unauthorized(`${target} is not connected to this site.`)
    const account = (await this.accounts()).find((a) => addressesEqual(a.ethAddress, target))
    if (!account) throw Errors.unauthorized()
    return account
  }

  private async approve(
    req: ApprovalRequest,
    capability?: SiteCapability
  ): Promise<ApprovalResult & { approved: true }> {
    const result = await this.d.requestApproval(req)
    if (!result.approved) throw Errors.userRejected()
    if (capability) await this.d.permissions.grant(req.origin, { capabilities: [capability] })
    return result
  }

  // ── Entry point ──────────────────────────────────────────────────────────

  async handle(origin: string, req: RpcRequest): Promise<unknown> {
    const method = req?.method
    if (typeof method !== 'string') throw Errors.invalidParams('Missing method')
    const params = asArray(req.params)

    if (READ_ONLY.has(method)) {
      const chain = await this.activeChain()
      if (method === 'qrdx_getAccountId') {
        try {
          return toAccountId(String(params[0]))
        } catch (e) {
          throw Errors.invalidParams(e instanceof Error ? e.message : 'Invalid address')
        }
      }
      return this.d.rpc(chain, method, params)
    }
    if (!ACCOUNT_METHODS.has(method)) {
      if (method === 'eth_sign')
        throw new ProviderRpcError(
          4200,
          'eth_sign is disabled: it signs arbitrary hashes and is a common phishing vector. Use personal_sign or eth_signTypedData_v4.'
        )
      throw Errors.unsupported(method)
    }

    await this.d.permissions.touch(origin)

    switch (method) {
      case 'eth_chainId':
        return hex((await this.activeChain()).chainId)
      case 'net_version':
        return String((await this.activeChain()).chainId)
      case 'qrdx_chainInfo': {
        const c = await this.activeChain()
        return {
          id: c.id,
          name: c.name,
          chainId: c.chainId,
          isQrdx: isQrdxChain(c),
          isTestnet: c.isTestnet,
          nativeCurrency: c.nativeCurrency,
        }
      }
      case 'eth_accounts':
        return this.exposedAccounts(origin)
      case 'eth_coinbase':
        return (await this.exposedAccounts(origin))[0] ?? null
      case 'eth_requestAccounts':
        return this.requestAccounts(origin)
      case 'wallet_requestPermissions':
        await this.requestAccounts(origin)
        return this.permissionsView(origin)
      case 'wallet_getPermissions':
        return this.permissionsView(origin)
      case 'wallet_revokePermissions':
        await this.d.permissions.revokeAll(origin)
        return null
      case 'qrdx_requestAccounts':
      case 'qrdx_accounts': {
        const addrs =
          method === 'qrdx_requestAccounts'
            ? await this.requestAccounts(origin)
            : await this.exposedAccounts(origin)
        const all = await this.accounts()
        return addrs.map((a) => {
          const acc = all.find((x) => addressesEqual(x.ethAddress, a))!
          return {
            address: acc.ethAddress,
            pqAddress: acc.pqAddress,
            pqAccountId: acc.pqAccountId,
            pqPublicKey: acc.pqPublicKey,
            pqFingerprint: acc.pqFingerprint,
          }
        })
      }
      case 'personal_sign':
        return this.personalSign(origin, params)
      case 'eth_signTypedData_v4':
        return this.signTyped(origin, params)
      case 'qrdx_signPQMessage':
        return this.signPq(origin, params)
      case 'eth_sendTransaction':
        return this.sendEvm(origin, params)
      case 'qrdx_sendPQTransaction':
        return this.sendPq(origin, params)
      case 'qrdx_sendExchangeTransaction':
        return this.sendExchange(origin, params)
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
        return this.switchChain(origin, method, params)
      case 'wallet_watchAsset':
        return this.watchAsset(origin, params)
    }
    throw Errors.unsupported(method)
  }

  // ── Accounts & permissions ───────────────────────────────────────────────

  private async requestAccounts(origin: string): Promise<string[]> {
    const existing = await this.exposedAccounts(origin)
    if (existing.length) return existing
    // Approval also handles unlocking: the window shows the unlock screen first.
    const result = await this.d.requestApproval({ kind: 'connect', origin })
    if (!result.approved) throw Errors.userRejected()
    const all = (await this.d.manager.getState())?.wallets ?? []
    const chosen = all.filter((a) => result.accountIds?.includes(a.id)).map((a) => a.ethAddress)
    if (chosen.length === 0) throw Errors.userRejected()
    await this.d.permissions.grant(origin, {
      capabilities: ['viewAccounts', 'manageChain'],
      accounts: chosen,
    })
    return this.exposedAccounts(origin)
  }

  private async permissionsView(origin: string) {
    const rec = await this.d.permissions.get(origin).catch(() => null)
    if (!rec?.capabilities.includes('viewAccounts')) return []
    return [
      {
        parentCapability: 'eth_accounts',
        invoker: origin,
        date: rec.connectedAt,
        caveats: [{ type: 'restrictReturnedAccounts', value: await this.exposedAccounts(origin) }],
      },
    ]
  }

  // ── Signing ──────────────────────────────────────────────────────────────

  private async personalSign(origin: string, params: unknown[]): Promise<string> {
    // personal_sign(message, address); some dApps swap the order.
    let [message, address] = params as [string, string]
    if (
      typeof message === 'string' &&
      /^0x[0-9a-fA-F]{40}$/.test(message) &&
      typeof address === 'string' &&
      !/^0x[0-9a-fA-F]{40}$/.test(address)
    ) {
      ;[message, address] = [address, message]
    }
    if (typeof message !== 'string') throw Errors.invalidParams('personal_sign expects a message')
    const account = await this.accountFor(origin, address)
    const encoding = /^0x([0-9a-fA-F]{2})*$/.test(message) ? 'hex' : 'utf8'
    await this.approve(
      { kind: 'personal-sign', origin, account: account.id, message, encoding },
      'signMessage'
    )
    return this.d.manager.signPersonalMessage(message, { accountId: account.id, encoding })
  }

  private async signTyped(origin: string, params: unknown[]): Promise<string> {
    const [address, data] = params as [string, unknown]
    const account = await this.accountFor(origin, address)
    let typedData: unknown
    try {
      typedData = parseTypedData(data)
    } catch (e) {
      throw Errors.invalidParams(e instanceof Error ? e.message : 'Invalid typed data')
    }
    const domainChain = typedDataChainId(typedData)
    const chain = await this.activeChain()
    if (domainChain !== undefined && domainChain !== chain.chainId) {
      throw Errors.invalidParams(
        `Typed data is for chain ${domainChain}, but the wallet is on ${chain.name} (${chain.chainId}).`
      )
    }
    await this.approve(
      { kind: 'typed-sign', origin, account: account.id, typedData },
      'signMessage'
    )
    return this.d.manager.signTypedData(typedData, account.id)
  }

  private async signPq(origin: string, params: unknown[]) {
    const [message, address] = params as [string, string | undefined]
    if (typeof message !== 'string')
      throw Errors.invalidParams('qrdx_signPQMessage expects a message string')
    const account = await this.accountFor(origin, address)
    await this.approve({ kind: 'pq-sign', origin, account: account.id, message }, 'postQuantum')
    return this.d.manager.signPqMessage(message, account.id)
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  private async sendEvm(origin: string, params: unknown[]): Promise<string> {
    const req = params[0] as Partial<EthTransactionRequest> | undefined
    if (!req || typeof req !== 'object')
      throw Errors.invalidParams('eth_sendTransaction expects a transaction object')
    const account = await this.accountFor(origin, req.from)
    const chain = await this.activeChain()
    const to = req.to ? String(req.to) : null
    if (!to) throw Errors.unsupported('contract deployment from a dApp')
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw Errors.invalidParams('`to` must be a 0x address')
    const value = BigInt(req.value ?? '0x0')
    const data = req.data ?? (req as { input?: string }).input ?? '0x'

    const [nonce, gasPrice, chainId] = await Promise.all([
      this.d
        .rpc<string>(chain, 'eth_getTransactionCount', [account.ethAddress, 'pending'])
        .then(BigInt),
      req.gasPrice
        ? Promise.resolve(BigInt(req.gasPrice))
        : this.d.rpc<string>(chain, 'eth_gasPrice', []).then(BigInt),
      this.d.signingChainId(chain),
    ])
    const gas = req.gas
      ? BigInt(req.gas)
      : ((await this.d
          .rpc<string>(chain, 'eth_estimateGas', [
            { from: account.ethAddress, to, value: hex(value), data },
          ])
          .then(BigInt)) *
          120n) /
        100n

    await this.approve(
      {
        kind: 'transaction',
        origin,
        account: account.id,
        credential: 'classic',
        chain: chain.id,
        tx: {
          to,
          value: value.toString(),
          data,
          gasLimit: gas.toString(),
          gasPrice: gasPrice.toString(),
          fee: (gas * gasPrice).toString(),
          toAccountId: null,
        },
      },
      'sendTransaction'
    )

    // QRDX accepts only legacy envelopes; EIP-1559 fields from the dApp are folded into gasPrice.
    const tx: EthTransactionRequest = {
      from: account.ethAddress,
      to,
      value: hex(value),
      data,
      nonce: hex(nonce),
      gas: hex(gas),
      chainId: hex(chainId),
    }
    if (getFeeModel(chain) === 'eip1559' && req.maxFeePerGas) {
      tx.maxFeePerGas = req.maxFeePerGas
      tx.maxPriorityFeePerGas = req.maxPriorityFeePerGas ?? req.maxFeePerGas
    } else {
      tx.gasPrice = hex(gasPrice)
    }
    const signed = await this.d.manager.signEvmTransaction(tx, account.id)
    const hash = await this.d.rpc<string>(chain, 'eth_sendRawTransaction', [signed.rawTransaction])
    await this.d
      .onSubmitted?.({
        hash,
        chain: chain.id,
        kind: data && data !== '0x' ? 'contract' : 'send',
        track: 'evm',
        credential: 'classic',
        from: account.ethAddress,
        to,
        value: `${weiToEth(value, chain.nativeCurrency.decimals)} ${chain.nativeCurrency.symbol}`,
        origin,
      })
      .catch(() => undefined)
    return hash
  }

  private async sendPq(origin: string, params: unknown[]): Promise<string> {
    const req = params[0] as
      { to?: string; value?: string; data?: string; gas?: string; from?: string } | undefined
    if (!req || typeof req !== 'object')
      throw Errors.invalidParams('qrdx_sendPQTransaction expects a transaction object')
    const account = await this.accountFor(origin, req.from)
    const chain = await this.activeChain()
    if (!isQrdxChain(chain))
      throw Errors.invalidParams(`${chain.name} has no post-quantum transactions`)
    let recipientId: string | null = null
    try {
      recipientId = req.to ? toAccountId(req.to) : null
    } catch (e) {
      throw Errors.invalidParams(e instanceof Error ? e.message : 'Invalid recipient')
    }
    const value = BigInt(req.value ?? '0x0')
    const data = req.data ?? '0x'
    const [nonce, gasPrice, chainId] = await Promise.all([
      this.d
        .rpc<string>(chain, 'eth_getTransactionCount', [account.pqAccountId, 'pending'])
        .then(BigInt),
      this.d.rpc<string>(chain, 'eth_gasPrice', []).then(BigInt),
      this.d.signingChainId(chain),
    ])
    const floor = pqIntrinsicGas(data, recipientId === null)
    const estimated = req.gas
      ? BigInt(req.gas)
      : await this.d
          .rpc<string>(chain, 'eth_estimateGas', [
            { from: account.pqAccountId, to: recipientId, value: hex(value), data, type: '0x51' },
          ])
          .then(BigInt)
          .catch(() => floor + 30_000n)
    const gas = estimated > floor ? estimated : floor + 30_000n

    await this.approve(
      {
        kind: 'transaction',
        origin,
        account: account.id,
        credential: 'pq',
        chain: chain.id,
        tx: {
          to: req.to ?? null,
          value: value.toString(),
          data,
          gasLimit: gas.toString(),
          gasPrice: gasPrice.toString(),
          fee: (gas * gasPrice).toString(),
          toAccountId: recipientId,
        },
      },
      'postQuantum'
    )
    const signed = await this.d.manager.signPqTransaction(
      {
        chainId,
        nonce: nonce.toString(),
        gasPrice: gasPrice.toString(),
        gasLimit: gas.toString(),
        to: recipientId,
        value: value.toString(),
        data,
      },
      account.id
    )
    const hash = await this.d.rpc<string>(chain, 'eth_sendRawTransaction', [signed.rawTransaction])
    await this.d
      .onSubmitted?.({
        hash,
        chain: chain.id,
        kind: data && data !== '0x' ? 'contract' : 'send',
        track: 'evm',
        credential: 'pq',
        from: account.pqAddress,
        to: req.to ?? '',
        value: `${weiToEth(value, chain.nativeCurrency.decimals)} ${chain.nativeCurrency.symbol}`,
        origin,
      })
      .catch(() => undefined)
    return hash
  }

  private async sendExchange(origin: string, params: unknown[]): Promise<{ txHash: string }> {
    const req = params[0] as
      | { op?: string; params?: Record<string, JsonValue>; gasLimit?: number; from?: string }
      | undefined
    if (!req?.op || !(req.op in ExchangeOp))
      throw Errors.invalidParams(`Unknown exchange operation ${String(req?.op)}`)
    const account = await this.accountFor(origin, req.from)
    const chain = await this.activeChain()
    const op = req.op as ExchangeOpName
    const opParams = req.params ?? {}
    await this.approve(
      { kind: 'exchange', origin, account: account.id, chain: chain.id, op, params: opParams },
      'postQuantum'
    )
    const result = await submitExchangeOp(
      {
        signEvmTransaction: () => Promise.reject(),
        signPqTransaction: () => Promise.reject(),
        signExchangeTransaction: (tx, id) => this.d.manager.signExchangeTransaction(tx, id),
      },
      { chain, account, op, params: opParams, gasLimit: req.gasLimit }
    )
    await this.d
      .onSubmitted?.({
        hash: result.txHash,
        chain: chain.id,
        kind: op === 'SWAP' ? 'swap' : op.startsWith('STAKE_') ? 'stake' : 'exchange',
        track: 'exchange',
        credential: 'pq',
        from: account.pqAddress,
        to: '',
        value: '',
        label: op.replace(/_/g, ' ').toLowerCase(),
        origin,
      })
      .catch(() => undefined)
    return result
  }

  // ── Networks & assets ────────────────────────────────────────────────────

  private async switchChain(origin: string, method: string, params: unknown[]): Promise<null> {
    if ((await this.exposedAccounts(origin)).length === 0) throw Errors.unauthorized()
    const p = params[0] as { chainId?: string } | undefined
    if (!p?.chainId || !/^0x[0-9a-fA-F]+$/.test(p.chainId))
      throw Errors.invalidParams(`${method} expects { chainId: "0x…" }`)
    const target = getChainById(Number(BigInt(p.chainId)))
    if (!target) throw Errors.unknownChain(p.chainId)
    if ((await this.activeChain()).id === target.id) return null
    await this.approve({ kind: 'switch-chain', origin, chain: target.id }, 'manageChain')
    await this.d.manager.updateSettings({ activeChainId: target.id })
    return null
  }

  private async watchAsset(origin: string, params: unknown[]): Promise<boolean> {
    const p = (Array.isArray(params) ? params[0] : params) as {
      type?: string
      options?: { address?: string; symbol?: string; decimals?: number; image?: string }
    }
    if (p?.type !== 'ERC20' || !p.options?.address || !p.options.symbol)
      throw Errors.invalidParams('wallet_watchAsset supports ERC20 { address, symbol, decimals }')
    const chain = await this.activeChain()
    const token = {
      address: p.options.address,
      symbol: p.options.symbol,
      decimals: Number(p.options.decimals ?? 18),
      image: p.options.image,
    }
    await this.approve({ kind: 'watch-asset', origin, chain: chain.id, token }, 'watchAsset')
    await this.d.watchedTokens.add(chain.id, {
      address: token.address,
      symbol: token.symbol,
      name: token.symbol,
      decimals: token.decimals,
      logoURI: token.image,
    })
    return true
  }
}
