# Architecture

One wallet core, one UI, three targets (web, iPhone PWA, browser extension —
see [PLATFORMS.md](PLATFORMS.md)). This document maps the code.

```
                    ┌──────────────────────── UI (React, components/) ────────────────────────┐
                    │ Onboarding · Unlock · Dashboard · Send · Swap · Stake · Settings ·        │
                    │ Approval window (extension)                                               │
                    └───────────────┬───────────────────────────────────────────────────────────┘
                                    │ useWallet()  — src/shared/contexts/WalletContext.tsx
                    ┌───────────────▼───────────────┐
                    │ WalletBackend (src/shared/backend.ts)                                      │
                    │   web / PWA:  in-page WalletManager                                        │
                    │   extension:  proxy ──chrome.runtime──▶ background WalletManager           │
                    └───────────────┬───────────────┘
 ┌──────────────────────────────────▼──────────────────────────────────────────────────────────┐
 │ src/core  (platform-agnostic, no DOM)                                                         │
 │                                                                                               │
 │  wallet-manager.ts ── vault.ts (envelope encryption) ── keyring.ts (phrase/key → accounts)   │
 │        │                                                                                      │
 │        ├─ signing: transaction.ts (legacy/1559) · pq-tx.ts (0x51) · exchange-tx.ts · eip712  │
 │        └─ keystore.ts (V3 import/export)                                                      │
 │                                                                                               │
 │  tx-service.ts ── ethereum.ts (JSON-RPC) · account-id.ts · chain-identity.ts · chains.ts      │
 │  exchange-client.ts · activity.ts · history.ts · prices.ts · watched-tokens.ts                │
 │  permissions.ts · address-book.ts · storage.ts                                                │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘

 Extension only:
   web page ── inpage.ts (MAIN world: window.ethereum, window.qrdx, EIP-6963)
       │ window.postMessage
   content.ts (isolated world: relay)
       │ runtime port (origin set by the browser)
   background.ts ── provider/router.ts (policy) ── WalletManager
                └─ approval windows (popup/index.html#approval=<id>)
```

## Core (`src/core`)

| Module | Responsibility |
|---|---|
| `wallet-manager.ts` | The only place secrets are created, stored, unlocked and used. Vault lifecycle, accounts, unlock (password, passkey), throttling, auto-lock, session persistence, exports, signing, v1→v2 migration. Every method is JSON-serialisable so it works across the extension message boundary. |
| `vault.ts` | Vault v2 crypto: a random 256-bit data key encrypts all secrets; the password (PBKDF2-SHA256, 600k) and each passkey (PRF→HKDF) wrap that key. AES-256-GCM, with each blob bound to its slot by additional data. |
| `keyring.ts` | A keyring secret (recovery phrase, or imported key + PQ seed) → account `i`: secp256k1 at `m/44'/60'/0'/0/i`, ML-DSA-65 from the phrase under a versioned domain tag. |
| `pq.ts` | ML-DSA-65 (FIPS 204) via `@noble/post-quantum`, seeded key generation, and the QRDX PQ message prefix. |
| `account-id.ts` | Port of the node's `to_account_id`: every address form → its 20-byte ledger key. |
| `pq-tx.ts` | Type-`0x51` post-quantum transactions (encode, signing hash, intrinsic gas, sign). |
| `exchange-tx.ts` | Native exchange transactions: op codes, Python-compatible JSON, signing bytes, BLAKE2b hash. |
| `exchange-nonce.ts` | Exchange nonces submitted but not yet in a block, so several operations can go out in one block window. |
| `exchange-describe.ts` | Turns an exchange operation's params into the words the approval window shows. |
| `connect/` | QRDX Connect protocol (encryption, pairing links, relay client); identical to qrdx-trade `lib/connect`. |
| `transaction.ts` | Legacy EIP-155 and EIP-1559 secp256k1 transactions; recipients resolved through `account-id`. |
| `eip712.ts` | Typed-data hashing (`eth_signTypedData_v4`). |
| `keystore.ts` | Web3 Secret Storage v3 (pbkdf2/scrypt, AES-128-CTR, keccak MAC) with a QRDX block carrying the PQ seed; reads the legacy QRDX format. |
| `tx-service.ts` | Build → sign → broadcast. Chooses the envelope by source credential, resolves recipients, quotes fees, submits exchange operations. |
| `ethereum.ts` | JSON-RPC client with fallbacks, balances (native + ERC-20), gas. |
| `chains.ts` / `chain-identity.ts` | Network registry; live chain-ID verification before signing. |
| `exchange-client.ts` | Typed reads of `exchange_*` (tokens, balances, swap quotes, receipts). |
| `trade/` | The trading screen's data and orders. `api.ts` reads the trade API for the active QRDX network (trade.qrdx.org `/api/v1`, `/api/v1-test`; the local network uses `NEXT_PUBLIC_QRDX_TRADE_LOCAL_API`) and checks it serves the wallet's chain first. `orders.ts`, `decimal.ts`, `format.ts`, `types.ts` are ported from qrdx-trade, so an order signed here is the order the site would sign. |
| `activity.ts` | Durable log of transactions this wallet submitted, resolved from receipts. Plus incoming token transfers from logs. QRDX's history source. |
| `permissions.ts` | Per-origin dApp capabilities. Absence means denial. |
| `storage.ts` | `ChromeStorage`, `WebStorage`, `MemoryStorage`, and `chromeSessionStore()`. |

## Shared (`src/shared`)

- `backend.ts` picks where the `WalletManager` runs. It also holds the list
  of methods the UI may call, and the sender check the background applies.
- `platform.ts` detects the target and its default settings.
- `passkey.ts` runs the WebAuthn ceremonies (create, PRF evaluate) and
  capability detection.
- `remote-sessions.ts` is QRDX Connect's wallet side: sites paired by QR code, served by the extension's `ProviderRouter` in the page (web / PWA).
- `contexts/WalletContext.tsx` is React state for everything above: balances
  per credential, network status, prices, history, activity-based auto-lock,
  and lock-when-hidden.

## Extension (`src/extension`)

| File | Runs in | Does |
|---|---|---|
| `inpage.ts` | page MAIN world | The EIP-1193 provider object; EIP-6963 announce; legacy `enable`/`send`/`sendAsync`. No secrets, no decisions. |
| `content.ts` | isolated world | Relays page ⇄ background over a runtime port. On Firefox, injects `inpage.js`. |
| `background.ts` | service worker | Hosts the `WalletManager`; answers popup calls from trusted senders; runs the approval-window queue; pushes `accountsChanged`/`chainChanged` to connected pages. |
| `provider/router.ts` | service worker | The dApp policy: method allowlist, read-only passthrough, connection checks, approvals, signing, error codes. Unit-tested without a browser. |
| `provider/approval-protocol.ts` | both | Messages between approval windows and the background. |

## UI (`components/`)

- `WalletHome.tsx` routes to onboarding, unlock, dashboard, or (in an
  extension approval window) the approval screen.
- `wallet/flow/FlowKit.tsx` holds the shared building blocks for every flow:
  password fields, phrase grid and verifier, secret inputs, sheets.
  They are module-level components, so inputs keep focus.
- `wallet/onboarding/Onboarding.tsx` is create/import and the "secure this
  device" step.
- `wallet/settings/AccountsPage.tsx` and `SecurityPage.tsx` handle accounts,
  imports, discovery, exports, locking, biometrics, password and reset.
- `wallet/approval/ApprovalScreen.tsx` is the extension's request review.
- `wallet/TradeModal.tsx` and `wallet/trade/` are the trading screen, laid out
  like trade.qrdx.org: market list (spot, perpetuals), chart, book and trades,
  spot limit / market orders, perps (long / short, limit / IOC market,
  leverage and margin mode, reduce-only, collateral), open orders, balances,
  positions and activity. Nothing in the wallet asks for approval a second
  time, so every order passes through a review sheet (`trade/submit.tsx`) that
  decodes the exact params with `exchange-describe.ts`, the approval window's
  decoder, before the PQ key signs it; it then follows the receipt.
- `wallet/SwapModal.tsx` is the swap card (node quote, minimum out, deadline),
  through the same review sheet. It works from the node alone; the trade API
  adds logos, verification and USD estimates when it serves the network.

## Data on disk

| Key | Contents | Secret? |
|---|---|---|
| `qrdx_wallet_state` | Vault v2: KDF params, wrapped data key, passkey wraps, sealed keyrings, public account data, settings | sealed parts only |
| `qrdx_unlock_guard` | failed-attempt counter and next allowed time | no |
| `qrdx_site_permissions` | connected sites and capabilities | no |
| `qrdx_address_book`, `qrdx_watched_tokens`, `qrdx_activity` | user data | no |
| `qrdx_session` (`chrome.storage.session`, extension only) | raw data key + expiry while unlocked | yes — memory only |

## Testing

- `tests/unit` covers the core, the vault, migration, keystores and EIP-712
  against their spec vectors, and the provider router policy.
- `tests/unit/conformance.test.ts` checks byte-for-byte agreement with the node:
  account IDs, `0x51` transactions, exchange signing bytes and PQ message
  prefixes. Its vectors are generated by the node's own Python modules
  (`tests/conformance/generate_vectors.py`).
- `tests/e2e/onboarding.mjs` drives the real static export: create, verify,
  lock-on-reload, unlock, throttling, and import.
- `tests/e2e/extension-provider.mjs` loads the built extension in Chromium. It
  checks injection, EIP-6963, a request round-trip, permission errors, and
  onboarding in the popup, then connect, sign and reject from a page through
  real approval windows.
