/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Ethereum / EVM JSON-RPC Provider
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Minimal, zero-dependency EVM provider that talks raw JSON-RPC to any
 *  Ethereum-compatible chain. Used for:
 *    • Fetching native & ERC-20 balances
 *    • Estimating gas
 *    • Building, signing, and broadcasting transactions
 *    • Querying transaction receipts
 *
 *  This intentionally avoids pulling in ethers.js or web3.js as a runtime
 *  dependency — the wallet needs to stay small for the browser extension.
 *  For signing, it uses the Web Crypto API (secp256k1 via SubtleCrypto is
 *  not available, so we provide a minimal implementation and will integrate
 *  with the external web3.js submodule for production signing).
 */

import { type ChainConfig, getChain, CHAINS, supportsWeb3 } from './chains'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

export interface EthTransactionRequest {
  from: string
  to: string
  value?: string        // hex wei
  data?: string         // hex calldata
  gas?: string          // hex gas limit
  gasPrice?: string     // hex gas price (legacy)
  maxFeePerGas?: string // hex (EIP-1559)
  maxPriorityFeePerGas?: string // hex (EIP-1559)
  nonce?: string        // hex
  chainId?: string      // hex
}

export interface EthTransactionReceipt {
  transactionHash: string
  blockNumber: string
  blockHash: string
  from: string
  to: string
  status: string  // '0x1' success, '0x0' revert
  gasUsed: string
  effectiveGasPrice: string
  logs: Array<{
    address: string
    topics: string[]
    data: string
    logIndex: string
    blockNumber: string
    transactionHash: string
  }>
}

export interface GasEstimate {
  gasLimit: bigint
  gasPrice: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  estimatedCostWei: bigint
}

export interface TokenBalance {
  address: string   // contract address ('' for native)
  symbol: string
  name: string
  decimals: number
  rawBalance: bigint
  formattedBalance: string
}

// ─── Hex / BigInt helpers ───────────────────────────────────────────────────

export function toHex(n: bigint | number): string {
  return '0x' + BigInt(n).toString(16)
}

export function fromHex(hex: string): bigint {
  return BigInt(hex)
}

export function weiToEth(wei: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = wei / divisor
  const remainder = wei % divisor
  const fracStr = remainder.toString().padStart(decimals, '0')
  // trim trailing zeros but keep at least 4 decimal places
  const trimmed = fracStr.replace(/0+$/, '').padEnd(4, '0')
  return `${whole}.${trimmed}`
}

export function ethToWei(eth: string, decimals = 18): bigint {
  const [whole = '0', frac = ''] = eth.split('.')
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded)
}

// ─── ERC-20 ABI fragments (just the function selectors we need) ─────────────

/** balanceOf(address) → uint256 */
const ERC20_BALANCE_OF = '0x70a08231'
/** transfer(address,uint256) → bool */
const ERC20_TRANSFER = '0xa9059cbb'
/** decimals() → uint8 */
const ERC20_DECIMALS = '0x313ce567'
/** symbol() → string */
const ERC20_SYMBOL = '0x95d89b41'

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0')
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EvmProvider — main class
// ═══════════════════════════════════════════════════════════════════════════════

export class EvmProvider {
  private chain: ChainConfig
  private rpcUrls: string[]
  private currentRpcIndex = 0
  private requestId = 1

  constructor(chainIdOrSlug: number | string) {
    const chain =
      typeof chainIdOrSlug === 'number'
        ? Object.values(CHAINS).find(c => c.chainId === chainIdOrSlug)
        : getChain(chainIdOrSlug)

    if (!chain) {
      throw new Error(`Unknown chain: ${chainIdOrSlug}`)
    }
    if (!chain.isEvm) {
      throw new Error(`Chain ${chain.name} is not EVM-compatible`)
    }
    if (!supportsWeb3(chain)) {
      throw new Error(`Chain ${chain.name} does not support web3 transport`)
    }

    this.chain = chain
    this.rpcUrls = [chain.rpcUrl, ...(chain.rpcFallbacks ?? [])]
  }

  /** The chain config this provider is connected to */
  get chainConfig(): ChainConfig {
    return this.chain
  }

  // ─── Low-level RPC ──────────────────────────────────────────────────────

  /**
   * Send a raw JSON-RPC request with automatic fallback to alternate RPCs.
   */
  async rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.rpcUrls.length; attempt++) {
      const url = this.rpcUrls[(this.currentRpcIndex + attempt) % this.rpcUrls.length]
      try {
        const body: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: this.requestId++,
          method,
          params,
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        const json: JsonRpcResponse<T> = await res.json()

        if (json.error) {
          throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
        }

        // If we had to fall back, stick with the working RPC
        if (attempt > 0) {
          this.currentRpcIndex =
            (this.currentRpcIndex + attempt) % this.rpcUrls.length
        }

        return json.result as T
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        // Try next RPC
      }
    }

    throw lastError ?? new Error('All RPC endpoints failed')
  }

  // ─── Chain info ─────────────────────────────────────────────────────────

  /** Get the current chain ID from the RPC (validates connectivity) */
  async getChainId(): Promise<number> {
    const hex = await this.rpc<string>('eth_chainId')
    return Number(BigInt(hex))
  }

  /** Get the latest block number */
  async getBlockNumber(): Promise<bigint> {
    const hex = await this.rpc<string>('eth_blockNumber')
    return fromHex(hex)
  }

  /** Get the current gas price (legacy) */
  async getGasPrice(): Promise<bigint> {
    const hex = await this.rpc<string>('eth_gasPrice')
    return fromHex(hex)
  }

  // ─── Account queries ───────────────────────────────────────────────────

  /** Get native balance in wei */
  async getBalance(address: string): Promise<bigint> {
    const hex = await this.rpc<string>('eth_getBalance', [address, 'latest'])
    return fromHex(hex)
  }

  /** Get native balance formatted (e.g. "1.2345 ETH") */
  async getFormattedBalance(address: string): Promise<string> {
    const wei = await this.getBalance(address)
    const { decimals, symbol } = this.chain.nativeCurrency
    return `${weiToEth(wei, decimals)} ${symbol}`
  }

  /** Get the transaction count (nonce) for an address */
  async getTransactionCount(address: string): Promise<bigint> {
    const hex = await this.rpc<string>('eth_getTransactionCount', [
      address,
      'latest',
    ])
    return fromHex(hex)
  }

  // ─── ERC-20 token queries ─────────────────────────────────────────────

  /** Get ERC-20 token balance */
  async getTokenBalance(
    tokenAddress: string,
    walletAddress: string
  ): Promise<bigint> {
    const data = ERC20_BALANCE_OF + encodeAddress(walletAddress)
    const hex = await this.rpc<string>('eth_call', [
      { to: tokenAddress, data },
      'latest',
    ])
    return fromHex(hex)
  }

  /** Get ERC-20 decimals */
  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const hex = await this.rpc<string>('eth_call', [
      { to: tokenAddress, data: ERC20_DECIMALS },
      'latest',
    ])
    return Number(BigInt(hex))
  }

  /**
   * Get all balances for the chain's known tokens.
   * Returns native + all configured ERC-20 balances.
   */
  async getAllBalances(walletAddress: string): Promise<TokenBalance[]> {
    const results: TokenBalance[] = []

    // Native balance
    const nativeWei = await this.getBalance(walletAddress)
    const nativeToken = this.chain.tokens[0]
    results.push({
      address: '',
      symbol: nativeToken.symbol,
      name: nativeToken.name,
      decimals: nativeToken.decimals,
      rawBalance: nativeWei,
      formattedBalance: weiToEth(nativeWei, nativeToken.decimals),
    })

    // ERC-20 balances (fire all in parallel)
    const erc20Tokens = this.chain.tokens.filter(t => t.address !== '')
    const promises = erc20Tokens.map(async token => {
      try {
        const raw = await this.getTokenBalance(token.address, walletAddress)
        return {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          rawBalance: raw,
          formattedBalance: weiToEth(raw, token.decimals),
        } satisfies TokenBalance
      } catch {
        // Token contract might not exist on this chain — return zero
        return {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          rawBalance: 0n,
          formattedBalance: '0.0000',
        } satisfies TokenBalance
      }
    })

    results.push(...(await Promise.all(promises)))
    return results
  }

  // ─── Gas estimation ───────────────────────────────────────────────────

  /** Estimate gas for a transaction */
  async estimateGas(tx: EthTransactionRequest): Promise<bigint> {
    const hex = await this.rpc<string>('eth_estimateGas', [tx])
    return fromHex(hex)
  }

  /**
   * Get a full gas estimate including price and total cost.
   * Tries EIP-1559 first, falls back to legacy gasPrice.
   */
  async getGasEstimate(tx: EthTransactionRequest): Promise<GasEstimate> {
    const [gasLimit, gasPrice] = await Promise.all([
      this.estimateGas(tx),
      this.getGasPrice(),
    ])

    // Try EIP-1559 fee data
    let maxFeePerGas: bigint | undefined
    let maxPriorityFeePerGas: bigint | undefined
    try {
      const feeHistory = await this.rpc<{
        baseFeePerGas: string[]
        reward: string[][]
      }>('eth_feeHistory', [1, 'latest', [50]])

      if (feeHistory?.baseFeePerGas?.length) {
        const baseFee = fromHex(feeHistory.baseFeePerGas[0])
        maxPriorityFeePerGas = gasPrice / 10n // ~10% tip
        if (maxPriorityFeePerGas < 1000000000n) {
          maxPriorityFeePerGas = 1000000000n // minimum 1 gwei tip
        }
        maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas
      }
    } catch {
      // EIP-1559 not supported — use legacy
    }

    const effectiveGasPrice = maxFeePerGas ?? gasPrice
    const estimatedCostWei = gasLimit * effectiveGasPrice

    return {
      gasLimit,
      gasPrice,
      maxFeePerGas,
      maxPriorityFeePerGas,
      estimatedCostWei,
    }
  }

  // ─── Transaction building ─────────────────────────────────────────────

  /**
   * Build a native-currency transfer transaction (unsigned).
   * Returns the full transaction object ready for signing.
   */
  async buildTransfer(
    from: string,
    to: string,
    amountWei: bigint
  ): Promise<EthTransactionRequest> {
    const [nonce, gasEstimate] = await Promise.all([
      this.getTransactionCount(from),
      this.getGasEstimate({
        from,
        to,
        value: toHex(amountWei),
      }),
    ])

    const tx: EthTransactionRequest = {
      from,
      to,
      value: toHex(amountWei),
      nonce: toHex(nonce),
      chainId: toHex(this.chain.chainId),
      gas: toHex(gasEstimate.gasLimit),
    }

    // Prefer EIP-1559 if available
    if (gasEstimate.maxFeePerGas != null) {
      tx.maxFeePerGas = toHex(gasEstimate.maxFeePerGas)
      tx.maxPriorityFeePerGas = toHex(gasEstimate.maxPriorityFeePerGas!)
    } else {
      tx.gasPrice = toHex(gasEstimate.gasPrice)
    }

    return tx
  }

  /**
   * Build an ERC-20 transfer transaction (unsigned).
   */
  async buildTokenTransfer(
    from: string,
    tokenAddress: string,
    to: string,
    amount: bigint
  ): Promise<EthTransactionRequest> {
    const data =
      ERC20_TRANSFER + encodeAddress(to) + encodeUint256(amount)

    const [nonce, gasEstimate] = await Promise.all([
      this.getTransactionCount(from),
      this.getGasEstimate({
        from,
        to: tokenAddress,
        data,
      }),
    ])

    const tx: EthTransactionRequest = {
      from,
      to: tokenAddress,
      data,
      value: '0x0',
      nonce: toHex(nonce),
      chainId: toHex(this.chain.chainId),
      gas: toHex(gasEstimate.gasLimit),
    }

    if (gasEstimate.maxFeePerGas != null) {
      tx.maxFeePerGas = toHex(gasEstimate.maxFeePerGas)
      tx.maxPriorityFeePerGas = toHex(gasEstimate.maxPriorityFeePerGas!)
    } else {
      tx.gasPrice = toHex(gasEstimate.gasPrice)
    }

    return tx
  }

  // ─── Transaction submission ───────────────────────────────────────────

  /**
   * Send a raw signed transaction.
   * Returns the transaction hash.
   */
  async sendRawTransaction(signedTx: string): Promise<string> {
    return this.rpc<string>('eth_sendRawTransaction', [signedTx])
  }

  /**
   * Get a transaction receipt (returns null if pending).
   */
  async getTransactionReceipt(
    txHash: string
  ): Promise<EthTransactionReceipt | null> {
    return this.rpc<EthTransactionReceipt | null>(
      'eth_getTransactionReceipt',
      [txHash]
    )
  }

  /**
   * Wait for a transaction to be mined.
   * Polls every `intervalMs` (default: chain block time × 1000).
   * Throws after `timeoutMs` (default: 2 minutes).
   */
  async waitForTransaction(
    txHash: string,
    timeoutMs = 120_000,
    intervalMs?: number
  ): Promise<EthTransactionReceipt> {
    const pollInterval = intervalMs ?? this.chain.blockTimeSec * 1000
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const receipt = await this.getTransactionReceipt(txHash)
      if (receipt) return receipt
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(
      `Transaction ${txHash} not mined within ${timeoutMs / 1000}s`
    )
  }

  // ─── Utility ──────────────────────────────────────────────────────────

  /** Get the explorer URL for a transaction */
  txUrl(txHash: string): string {
    return `${this.chain.explorerUrl}/tx/${txHash}`
  }

  /** Get the explorer URL for an address */
  addressUrl(address: string): string {
    return `${this.chain.explorerUrl}/address/${address}`
  }

  /** Get the explorer URL for a token */
  tokenUrl(tokenAddress: string): string {
    return `${this.chain.explorerUrl}/token/${tokenAddress}`
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Provider cache — one provider per chain
// ═══════════════════════════════════════════════════════════════════════════════

const providerCache = new Map<string, EvmProvider>()

/**
 * Get (or create) a cached EvmProvider for the given chain.
 *
 * @example
 *   const eth = getEvmProvider('ethereum')
 *   const balance = await eth.getBalance('0x...')
 */
export function getEvmProvider(chainIdOrSlug: number | string): EvmProvider {
  const key = String(chainIdOrSlug)
  let provider = providerCache.get(key)
  if (!provider) {
    provider = new EvmProvider(chainIdOrSlug)
    // Also cache by the resolved slug so both paths hit the same instance
    providerCache.set(key, provider)
    providerCache.set(provider.chainConfig.id, provider)
    providerCache.set(String(provider.chainConfig.chainId), provider)
  }
  return provider
}

/** Clear the provider cache (useful on network settings change) */
export function clearProviderCache(): void {
  providerCache.clear()
}
