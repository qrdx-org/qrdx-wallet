# Integrating a dApp with QRDX Wallet

The QRDX Wallet extension is a standard EIP-1193 wallet with a QRDX namespace on
top. Ethereum tooling works unchanged; QRDX-specific features (post-quantum
accounts, the native exchange) use `qrdx_*` methods.

## Finding the wallet

Use **EIP-6963** where you can. It works even when another wallet owns
`window.ethereum`:

```js
window.addEventListener('eip6963:announceProvider', (e) => {
  if (e.detail.info.rdns === 'org.qrdx.wallet') useProvider(e.detail.provider)
})
window.dispatchEvent(new Event('eip6963:requestProvider'))
```

Also available:

- `window.qrdx` is always the QRDX provider. The binding cannot be overwritten by page scripts.
- `window.ethereum` is the QRDX provider only if no other wallet set it first. Check `window.ethereum.isQRDX`.

Both are injected before your scripts run.

## Accounts and chains

| Method | Notes |
|---|---|
| `eth_requestAccounts` | Opens a connect window. The user chooses which accounts to share. |
| `eth_accounts` | Shared accounts, the selected one first. `[]` while the wallet is locked or the site is not connected. |
| `eth_chainId`, `net_version` | The wallet's active network. |
| `wallet_switchEthereumChain` | Networks in the wallet's registry only; unknown IDs → `4902`. Asks the user. |
| `wallet_addEthereumChain` | Same as switch for known networks; custom networks are not accepted from dApps. |
| `wallet_getPermissions`, `wallet_requestPermissions`, `wallet_revokePermissions` | EIP-2255. `revoke` disconnects the site. |
| `qrdx_requestAccounts`, `qrdx_accounts` | Like the `eth_` versions, but each entry is `{ address, pqAddress, pqAccountId, pqPublicKey, pqFingerprint }`. |
| `qrdx_chainInfo` | `{ id, name, chainId, isQrdx, isTestnet, nativeCurrency }` |

Events: `connect`, `disconnect`, `accountsChanged`, `chainChanged`.

## Signing

| Method | Notes |
|---|---|
| `personal_sign(message, address)` | EIP-191. Hex messages are decoded for display when they are text. |
| `eth_signTypedData_v4(address, typedData)` | EIP-712. **Refused** if `domain.chainId` is not the active chain. |
| `qrdx_signPQMessage(message, address?)` | ML-DSA-65 over `"\x19QRDX PQ Signed Message:\n" + byteLength + message`. Returns `{ signature, publicKey, address }`; verify with the public key (PQ signatures do not recover a signer). |
| `eth_sign` | **Disabled** (`4200`): it signs arbitrary hashes and is a phishing vector. |

## Transactions

| Method | Notes |
|---|---|
| `eth_sendTransaction(tx)` | From the account's classic `0x` key. On QRDX, EIP-1559 fields are folded into a legacy `gasPrice`, because the node accepts only legacy envelopes. Contract deployment from dApps is not supported. |
| `qrdx_sendPQTransaction({ to, value, data?, gas? })` | From the account's **post-quantum** credential, as a type-`0x51` transaction. `to` may be any address form (`0x`, `0xPQ`, `0xPQMS`); the wallet resolves it to the 20-byte account ID. Gas is at least the PQ floor (≈145k for a transfer). QRDX networks only. |
| `qrdx_sendExchangeTransaction({ op, params, gasLimit? })` | A native exchange operation (`SWAP`, `PLACE_ORDER`, `PERP_ORDER`, `TOKEN_TRANSFER`, `STAKE_DEPOSIT`, …; see `ExchangeOp` in `src/core/exchange-tx.ts`), signed with the account's PQ key and its exchange nonce. Returns `{ txHash }`; poll `exchange_getTransactionReceipt`. |
| `wallet_watchAsset({ type: 'ERC20', options: { address, symbol, decimals } })` | Adds a token after the user approves. |

Every transaction and signature opens an approval window that shows the site's
real origin, the decoded call (ERC-20 transfers and approvals, with a warning
for unlimited approvals), and the maximum fee.

## Reading chain data

These are passed through to the active network's node without needing a
connection: `eth_blockNumber`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`,
`eth_getBalance`, `eth_getBlockBy*`, `eth_getCode`, `eth_getLogs`,
`eth_getStorageAt`, `eth_getTransaction*`, `eth_getTransactionCount`,
`eth_feeHistory`, `qrdx_getAccountId`, `qrdx_getIntrinsicGas`, the
`exchange_get*` / `exchange_quote*` reads, and the `perp_get*` reads.

Anything else returns `4200`.

## Errors

| Code | Meaning |
|---|---|
| `4001` | The user rejected the request (or closed the window). |
| `4100` | Not authorized: the site is not connected, or that account is not shared with it. |
| `4200` | Method not supported. |
| `4900` | The wallet is unavailable (reload the page). |
| `4902` | Unknown chain ID. |
| `-32602` | Invalid parameters. |

## QRDX accounts in one paragraph

Each wallet account has two credentials: a classic secp256k1 `0x` address and a
post-quantum ML-DSA-65 `0xPQ` address. On QRDX these are **two ledger
accounts**. The `0xPQ` account's ledger key is its 20-byte `pqAccountId`, which
is what `eth_getBalance` reads and what contracts see as `msg.sender`. Classic
transactions spend from the `0x` account. `qrdx_sendPQTransaction` and every
exchange operation spend from the PQ account.
