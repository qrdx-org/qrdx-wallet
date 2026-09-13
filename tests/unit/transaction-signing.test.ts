/**
 * Transaction signing conformance tests.
 *
 * The expected values in `VECTORS` were produced by `eth_account` (the Python
 * reference implementation bundled with the QRDX node), not by this codebase.
 * That makes these tests a genuine cross-implementation check: if our RLP
 * encoding, EIP-155 `v` derivation, or signature normalisation drifts, the
 * bytes stop matching what the chain would accept.
 *
 * Regenerate with the snippet in `tests/README.md` if the reference key or
 * cases ever need to change.
 */

import { describe, it, expect } from 'vitest'
import {
  signLegacyTransaction,
  signEip1559Transaction,
  signTransaction,
} from '../../src/core/transaction'
import type { EthTransactionRequest } from '../../src/core/ethereum'

/** Reference key from the EIP-155 specification examples. */
const PRIVATE_KEY =
  '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23'

interface Vector {
  name: string
  tx: EthTransactionRequest
  raw: string
  hash: string
  v: number
}

const toHex = (n: bigint | number) => '0x' + BigInt(n).toString(16)

const VECTORS: Vector[] = [
  {
    name: 'simple native transfer on the local QRDX testnet (chain 88888)',
    tx: {
      from: ADDRESS,
      to: '0x3535353535353535353535353535353535353535',
      nonce: toHex(0),
      gasPrice: toHex(1_000_000_000),
      gas: toHex(21000),
      value: toHex(10n ** 18n),
      chainId: toHex(88888),
    },
    raw:
      '0xf86e80843b9aca008252089435353535353535353535353535353535353535358' +
      '80de0b6b3a7640000808302b694a076181e367840b10a6945e49b056c3a927dc904' +
      '5ec8ea29be529bf1b27a537fa8a0185455b40c5dcd10878f1c0f955b7d253ad2c59' +
      '7dd616383d20eab9df0f590e0',
    hash: '0x7422324dadcb8581f231c8388e34df2d878e668f04d3d8d49e346829a24466a7',
    v: 177812,
  },
  {
    name: 'non-zero nonce and large value',
    tx: {
      from: ADDRESS,
      to: '0x000000000000000000000000000000000000dEaD',
      nonce: toHex(7),
      gasPrice: toHex(2_000_000_000),
      gas: toHex(30000),
      value: toHex(12345678901234567890n),
      chainId: toHex(88888),
    },
    raw:
      '0xf86e07847735940082753094000000000000000000000000000000000000dead8' +
      '8ab54a98ceb1f0ad2808302b694a0438f129e57bc6e5ec36d1101c1539bc08830cc' +
      '1b42c5f0cdf30c754d2352e165a01a188e5ab4db183a69b0940b1681d4bc26e9dfd' +
      '71b73edc3c958ab567f405397',
    hash: '0x41a9fd8a3292e7de0ecab5654cd52eb309c673fbba6f853ee37c75cbee391014',
    v: 177812,
  },
  {
    name: 'zero-value transfer on the seeded mainnet chain id (1337)',
    tx: {
      from: ADDRESS,
      to: '0x3535353535353535353535353535353535353535',
      nonce: toHex(3),
      gasPrice: toHex(1_500_000_000),
      gas: toHex(21000),
      value: '0x0',
      chainId: toHex(1337),
    },
    raw:
      '0xf865038459682f00825208943535353535353535353535353535353535353535' +
      '8080820a96a09abe35878f8a31fdd26d153504f6940b640a6fce4392c946c91d5e' +
      '3d9043f803a07aef02899f1eb6824e06f755fbe4a99c5ef15489ed2d602d4c7126' +
      '20564c8984',
    hash: '0x193a6c333b332350421f8ac00adb94e335763e16fc46e663900ec9ad91c2110c',
    v: 2710,
  },
  {
    name: 'ERC-20 transfer calldata',
    tx: {
      from: ADDRESS,
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      nonce: toHex(1),
      gasPrice: toHex(1_000_000_000),
      gas: toHex(60000),
      value: '0x0',
      data:
        '0xa9059cbb00000000000000000000000035353535353535353535353535353535' +
        '353535350000000000000000000000000000000000000000000000000de0b6b3a7640000',
      chainId: toHex(88888),
    },
    raw: '0xf8ab01843b9aca0082ea6094a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4880b844a9059cbb00000000000000000000000035353535353535353535353535353535353535350000000000000000000000000000000000000000000000000de0b6b3a76400008302b694a09edbed53adf200dc20c9fb6bc85206c1c89fc7cdc92217ff292c80e41a74c609a031db7613375979f42f8aef9cb794a020169d4bd1dcde96712f3f682309ecd13d',
    hash: '0x180f5f60fbdedf3c55c0e575bdf86d15b2276d3a957fbf55f315d9a8c5b3f98c',
    v: 177812,
  },
  {
    name: 'contract creation (empty `to`)',
    tx: {
      from: ADDRESS,
      to: '',
      nonce: toHex(2),
      gasPrice: toHex(1_000_000_000),
      gas: toHex(100000),
      value: '0x0',
      data: '0x6060604052',
      chainId: toHex(88888),
    },
    raw:
      '0xf85802843b9aca00830186a080808560606040528302b694a05a845fea54d5608' +
      '20797e9e6d3ca5dadfb0815497973a6443c8b1df0f0776c43a03342bb993dd07f96' +
      'ebc0d90c9b9ff98187b8de33e2badbdb1930c9f14904d05f',
    hash: '0x08b465547fd048ac6b531d54feddacaea88697f115fe9b8d35137a2853617e03',
    v: 177812,
  },
]

describe('signLegacyTransaction — EIP-155 conformance', () => {
  for (const vector of VECTORS) {
    it(`matches the eth_account reference for ${vector.name}`, () => {
      const signed = signLegacyTransaction(vector.tx, PRIVATE_KEY)

      expect(signed.rawTransaction).toBe(vector.raw)
      expect(signed.transactionHash).toBe(vector.hash)
      expect(signed.v).toBe(vector.v)
    })
  }

  it('derives v as chainId * 2 + 35 + recovery', () => {
    const chainId = 88888
    const signed = signLegacyTransaction(VECTORS[0].tx, PRIVATE_KEY)
    const recovery = signed.v - (chainId * 2 + 35)

    expect(recovery === 0 || recovery === 1).toBe(true)
  })

  it('produces a different signature per chain id, preventing cross-chain replay', () => {
    const base = { ...VECTORS[0].tx }
    const onLocal = signLegacyTransaction({ ...base, chainId: toHex(88888) }, PRIVATE_KEY)
    const onMainnet = signLegacyTransaction({ ...base, chainId: toHex(1337) }, PRIVATE_KEY)

    expect(onLocal.rawTransaction).not.toBe(onMainnet.rawTransaction)
    expect(onLocal.transactionHash).not.toBe(onMainnet.transactionHash)
  })
})

describe('signTransaction — envelope selection', () => {
  it('emits an untyped legacy payload when no 1559 fields are present', () => {
    const signed = signTransaction(VECTORS[0].tx, PRIVATE_KEY)

    // Legacy transactions are a bare RLP list: the first byte is >= 0xc0.
    const firstByte = parseInt(signed.rawTransaction.slice(2, 4), 16)
    expect(firstByte).toBeGreaterThanOrEqual(0xc0)
    expect(signed.rawTransaction).toBe(VECTORS[0].raw)
  })

  it('emits a type-2 payload when maxFeePerGas is present', () => {
    const signed = signTransaction(
      {
        ...VECTORS[0].tx,
        gasPrice: undefined,
        maxFeePerGas: toHex(2_000_000_000),
        maxPriorityFeePerGas: toHex(1_000_000_000),
      },
      PRIVATE_KEY,
    )

    expect(signed.rawTransaction.startsWith('0x02')).toBe(true)
  })

  it('EIP-1559 signing is stable for identical input', () => {
    const tx: EthTransactionRequest = {
      ...VECTORS[0].tx,
      gasPrice: undefined,
      maxFeePerGas: toHex(2_000_000_000),
      maxPriorityFeePerGas: toHex(1_000_000_000),
    }

    expect(signEip1559Transaction(tx, PRIVATE_KEY).rawTransaction).toBe(
      signEip1559Transaction(tx, PRIVATE_KEY).rawTransaction,
    )
  })
})
