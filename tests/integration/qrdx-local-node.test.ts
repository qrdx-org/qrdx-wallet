/**
 * End-to-end tests against a real QRDX node.
 *
 * These drive the wallet's own provider and signing code — not a mock — against
 * a node started by `ref/qrdx-chain/scripts/testnet.sh`. They are the check
 * that the wallet's transaction envelope, chain-id handling, and unit
 * conversions match what the chain actually accepts.
 *
 * Start the node first:
 *
 *   cd ref/qrdx-chain
 *   PATH="$PWD/.venv/bin:$PATH" bash scripts/testnet.sh start --nodes 1 --validators 1
 *
 * When no node is reachable the suite skips rather than fails, so unit runs in
 * CI stay green without chain infrastructure.
 */

import { describe, it, expect } from 'vitest'
import { CHAINS, getFeeModel } from '../../src/core/chains'
import { EvmProvider } from '../../src/core/ethereum'
import { signTransaction } from '../../src/core/transaction'
import {
  probeChainIdentity,
  resolveSigningChainId,
  clearChainIdentityCache,
} from '../../src/core/chain-identity'
import { ethKeyPairFromPrivateKey } from '../../src/core/crypto'

/**
 * The local testnet's genesis block prefunds the well-known address for private
 * key 1 with 1e9 QRDX. It is the only account on the local chain whose key is
 * public, which makes it the faucet for these tests.
 */
const FAUCET_PRIVATE_KEY =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const FAUCET_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'

const CHAIN = CHAINS['qrdx-local']

/** Distinct recipient per run so balance assertions are not order-dependent. */
function freshRecipient(): string {
  const hex = Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return '0x' + hex
}

/**
 * Probed at module scope, not in `beforeAll`: `describe.skipIf` is evaluated
 * during collection, which happens before any hook runs. Deciding later would
 * leave every test skipped even with a node up.
 */
const nodeAvailable = await (async () => {
  clearChainIdentityCache()
  try {
    const res = await fetch(CHAIN.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
})()

if (!nodeAvailable) {
  console.warn(
    `[integration] No QRDX node at ${CHAIN.rpcUrl} — skipping live-chain tests. ` +
      `Start one with: cd ref/qrdx-chain && PATH="$PWD/.venv/bin:$PATH" ` +
      `bash scripts/testnet.sh start --nodes 1 --validators 1`,
  )
}

describe.skipIf(!nodeAvailable)('QRDX local node — chain identity', () => {
  it('reports the chain id the registry expects', async () => {
    const identity = await probeChainIdentity(CHAIN, true)

    expect(identity.liveChainId).toBe(CHAIN.chainId)
    expect(identity.matches).toBe(true)
  })

  it('resolves a signing chain id without throwing', async () => {
    await expect(resolveSigningChainId(CHAIN)).resolves.toBe(CHAIN.chainId)
  })

  it('refuses to sign when the registry disagrees with the node', async () => {
    // Same live endpoint, deliberately mislabelled.
    const misconfigured = { ...CHAIN, id: 'qrdx-local-wrong', chainId: 4242 }
    clearChainIdentityCache('qrdx-local-wrong')

    await expect(resolveSigningChainId(misconfigured)).rejects.toThrow(
      /reports chain ID 9999, but this network is configured as 4242/,
    )
  })
})

describe.skipIf(!nodeAvailable)('QRDX local node — reads', () => {
  const provider = new EvmProvider('qrdx-local')

  it('derives the faucet address from its private key', () => {
    const keyPair = ethKeyPairFromPrivateKey(FAUCET_PRIVATE_KEY)
    expect(keyPair.address.toLowerCase()).toBe(FAUCET_ADDRESS.toLowerCase())
  })

  it('reads the prefunded faucet balance in wei', async () => {
    const balance = await provider.getBalance(FAUCET_ADDRESS)
    const genesisAmount = 10n ** 9n * 10n ** 18n // 1e9 QRDX

    // The faucet is spendable, so its balance drops as tests run. Assert the
    // magnitude rather than an exact figure: the point is that the node's
    // micro-QRDX UTXO amounts are scaled to wei (x 10^12), which a wrong
    // conversion would miss by six orders of magnitude.
    expect(balance).toBeGreaterThan(genesisAmount / 2n)
    expect(balance).toBeLessThanOrEqual(genesisAmount)
  })

  it('reads a block number and gas price', async () => {
    expect(await provider.getBlockNumber()).toBeGreaterThan(0n)
    expect(await provider.getGasPrice()).toBeGreaterThan(0n)
  })
})

describe.skipIf(!nodeAvailable)('QRDX local node — transaction envelope', () => {
  const provider = new EvmProvider('qrdx-local')

  it('declares QRDX as a legacy-envelope chain', () => {
    expect(getFeeModel(CHAIN)).toBe('legacy')
  })

  it('builds a legacy transaction with no EIP-1559 fields', async () => {
    const tx = await provider.buildTransfer(
      FAUCET_ADDRESS,
      freshRecipient(),
      10n ** 18n,
    )

    expect(tx.gasPrice).toBeDefined()
    expect(tx.maxFeePerGas).toBeUndefined()
    expect(tx.maxPriorityFeePerGas).toBeUndefined()
    // The chain id must come from the live node, not the registry constant.
    expect(BigInt(tx.chainId!)).toBe(BigInt(CHAIN.chainId))
  })

  it('signs that transaction as an untyped RLP list', async () => {
    const tx = await provider.buildTransfer(
      FAUCET_ADDRESS,
      freshRecipient(),
      10n ** 18n,
    )
    const signed = signTransaction(tx, FAUCET_PRIVATE_KEY)

    const firstByte = parseInt(signed.rawTransaction.slice(2, 4), 16)
    expect(firstByte).toBeGreaterThanOrEqual(0xc0)
    expect(signed.rawTransaction.startsWith('0x02')).toBe(false)
  })

  it('rejects a type-2 payload, confirming the legacy envelope is required', async () => {
    const tx = await provider.buildTransfer(
      FAUCET_ADDRESS,
      freshRecipient(),
      10n ** 18n,
    )
    // Force the 1559 path the old fee-sniffing logic would have taken.
    const typed = signTransaction(
      {
        ...tx,
        gasPrice: undefined,
        maxFeePerGas: '0x77359400',
        maxPriorityFeePerGas: '0x3b9aca00',
      },
      FAUCET_PRIVATE_KEY,
    )
    expect(typed.rawTransaction.startsWith('0x02')).toBe(true)

    await expect(
      provider.sendRawTransaction(typed.rawTransaction),
    ).rejects.toThrow()
  })
})

describe.skipIf(!nodeAvailable)('QRDX local node — send', () => {
  const provider = new EvmProvider('qrdx-local')

  it('broadcasts a signed transfer and moves the balance', async () => {
    const recipient = freshRecipient()
    const amount = 10n ** 18n // 1 QRDX

    expect(await provider.getBalance(recipient)).toBe(0n)

    const tx = await provider.buildTransfer(FAUCET_ADDRESS, recipient, amount)
    const signed = signTransaction(tx, FAUCET_PRIVATE_KEY)
    const txHash = await provider.sendRawTransaction(signed.rawTransaction)

    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/)

    const after = await provider.getBalance(recipient)
    expect(after).toBe(amount)
  })
})
