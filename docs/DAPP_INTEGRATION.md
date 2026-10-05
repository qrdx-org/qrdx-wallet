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

### Without the extension: QRDX Connect

Sites can also reach the web wallet and the iPhone PWA by QR code. The site
gets the same EIP-1193 provider (methods, errors and events as below) over an
end-to-end encrypted relay, and the user approves on their phone. Protocol,
relay API and a reference provider: qrdx-trade `docs/CONNECT.md`,
`lib/wallet/remote.ts`.

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
| `qrdx_sendExchangeTransaction({ op, params, gasLimit? })` | A native exchange operation (`SWAP`, `PLACE_ORDER`, `PERP_ORDER`, `TOKEN_TRANSFER`, `STAKE_DEPOSIT`, …; see `ExchangeOp` in `src/core/exchange-tx.ts`), signed with the account's PQ key and its exchange nonce. Returns `{ txHash, nonce }`; poll `exchange_getTransactionReceipt`. Several operations may be sent before a block includes the first (see below). |
| `wallet_watchAsset({ type: 'ERC20', options: { address, symbol, decimals } })` | Adds a token after the user approves. |

Every transaction and signature opens an approval window that shows the site's
real origin, the decoded call (ERC-20 transfers and approvals, with a warning
for unlimited approvals), and the maximum fee.

Exchange operations are decoded too (`src/core/exchange-describe.ts`): "Buy 0.5
qBTC at 85,000 qUSDC", "Swap 1,000 qUSDC for at least 0.0117 qBTC", "Close-only
sell 1 BTC-USD-PERP at up to 64,000". The wallet reads each token the request
names from the node and shows its address next to its symbol; a token the node
does not know, a swap with no `min_amount_out`, and a `TOKEN_APPROVE` are
warnings. For `ADD_LIQUIDITY` it shows the deposit the pool will take. The raw
parameters stay visible below the summary.

### Exchange nonces and block time

QRDX blocks are about 180 s apart and an exchange operation executes only when
a block includes it. `exchange_getNonce` counts committed operations only, so
the wallet keeps track of the nonces it has submitted that no block has
included yet (`src/core/exchange-nonce.ts`) and signs the next operation with
the first free nonce. If the node still refuses a nonce as already queued (the
wallet restarted, or another device of the same account submitted), the wallet
re-signs the same approved operation with the next nonce, without asking again.
A dApp can therefore place an order and cancel it inside one block window.

The returned `nonce` is the exchange nonce the operation was signed with. A
`TOKEN_DEPLOY`'s token address is `0x` + blake2b-160 of
`"<sender 0xPQ address>:<nonce>:<symbol>"`, so a dApp can create the token's
pool in the same block without waiting for the receipt (qrdx-trade's launchpad
does this). The approval window shows such a token as "not created yet" rather
than as unknown.

## Reading chain data

These are passed through to the active network's node without needing a
connection: `eth_blockNumber`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`,
`eth_getBalance`, `eth_getBlockBy*`, `eth_getCode`, `eth_getLogs`,
`eth_getStorageAt`, `eth_getTransaction*`, `eth_getTransactionCount`,
`eth_feeHistory`, `qrdx_getAccountId`, `qrdx_getIntrinsicGas`, the
`exchange_get*` / `exchange_quote*` reads (including `exchange_getStateRoot`), and the `perp_get*` reads (including `perp_getEvents`).

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
