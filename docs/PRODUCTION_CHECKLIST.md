# QRDX Wallet — Production Feature Checklist

Gap analysis of `qrdx-wallet` against the current `qrdx-node` (qrdx-chain, `test` branch,
commit `5fabda3`). Every item names the wallet file to change and the node code it must match.

**Targets:** web, iPhone PWA, browser extension — see [PLATFORMS.md](PLATFORMS.md).

**Status legend:** `[x]` done · `[~]` partly done (the note says what is left) · `[ ]` open · ⛔ blocked on node work (see §10)

**Priority:** **P0** blocks any release · **P1** required for 1.0 · **P2** feature-complete with the node · **P3** later

Node paths are relative to `qrdx-node/`. Wallet paths are relative to `qrdx-wallet/`.

---

## Status at a glance (2026-10-04)

| Area | State |
|---|---|
| §1 Protocol compatibility (P0) | **Done** except unique chain IDs ⛔ |
| §2 Key management and vault bugs (P0) | **Done** |
| §3 Security model (P0) | **Mostly done**; phishing and address-poisoning warnings, plus web CSP, are open |
| §4 dApp provider (P0) | **Done**, verified in real Chromium; WalletConnect open (P1) |
| §5 QRDX-native features | Swap, staking, token discovery and PQ accounts done; LP, limit orders, allowances and token tools open; shield and governance ⛔ |
| §6 Core wallet features | Accounts, sending and QRDX history done; speed-up/cancel, QR scanning, custom networks and i18n open |
| §7 Platforms | Extension and iPhone PWA done; Firefox needs a manual pass |
| §8 Extras | Mostly open (P2/P3) |
| §9 Engineering and release | CI, conformance and e2e done; node-in-CI, audit and store submission open |

Verification: **185 unit tests** (including node-generated conformance vectors), **11/11** web
e2e checks, **16/16** extension e2e checks, `tsc` clean, ESLint 0 errors.

---

## 0. Foundations (kept, built on)

- [x] Real ML-DSA-65 (FIPS 204) via `@noble/post-quantum`, with sizes matching liboqs (`src/core/pq.ts`)
- [x] PQ seed derived from the BIP-39 mnemonic with a versioned domain tag, so the phrase restores the PQ account
- [x] secp256k1, EIP-55, EIP-191, EIP-155 and EIP-1559 signing (`src/core/crypto.ts`, `src/core/transaction.ts`)
- [x] Chain registry declares `feeModel: 'legacy'` for QRDX (the node only decodes 9-field legacy RLP)
- [x] Live chain-ID probing and explicit trust (`src/core/chain-identity.ts`)
- [x] Per-origin permission store (`src/core/permissions.ts`), now enforced by the provider router

## 1. P0 — Protocol compatibility

- [x] **UTXO path removed.** `native-tx.ts` called `qrdx_getUTXOs`/`qrdx_sendTransaction`, which no node module serves. Deleted, along with its test.
- [x] **Type-0x51 PQ transactions**: `src/core/pq-tx.ts`, checked against vectors produced by `qrdx/transactions/pq_tx.py`.
- [x] **`to_account_id` port**: `src/core/account-id.ts`, all address forms, against node vectors.
- [x] **Recipients resolved to account IDs** in `transaction.ts`, `tx-service.ts` and the provider. The send and approval screens show "ledger account 0x…".
- [~] **`0xPQMS` / legacy `Q…`/`R…` recipients.** Accepted by the send path and provider (`resolveRecipient`); protocol holders (`0xPOOL`/`0xCLOB`/`0xPERP`) are refused. *Left:* `src/core/address.ts` validation and the address book still accept only `0x`/`0xPQ`.
- [x] **PQ balances and nonces** read through `eth_getBalance` / `eth_getTransactionCount(pqAccountId, "pending")` (`tx-service.fetchBalances`).
- [x] **PQ gas floor**: `pqIntrinsicGas()` plus `eth_estimateGas` with `type: 0x51`. Signing refuses a gas limit below the floor.
- [ ] ⛔ **Canonical chain IDs.** The wallet ships `1337`/`31337`; the node defaults to `1`, with an `88888` fallback. Needs unique registered IDs pinned in node config (§10 #2), then `src/core/chains.ts`.
- [x] **EIP-1559 → legacy** for dApp transactions on QRDX (`provider/router.ts`).
- [x] **PQ message prefix uses the byte length**: `pqPrefixedMessage()` in `src/core/pq.ts`, with non-ASCII vectors.
- [x] **Fake QRDX tokens removed** (`qETH`/`qBTC`/`qUSDC` at `0x…0101-0103`). Native tokens are discovered via `exchange_getTokens`.
- [x] **Stale tests replaced.** Conformance suite in `tests/unit/conformance.test.ts`; vectors from `tests/conformance/generate_vectors.py`.

## 2. P0 — Key management and vault bugs

- [x] **Password change keeps the phrase readable.** Vault v2 wraps one data key, so a password change re-wraps 32 bytes (`src/core/vault.ts`), with a regression test.
- [x] **Keystore export carries the PQ seed** (`x-qrdx` block), so re-import restores the same `0xPQ` address (test).
- [x] **Real V3 keystores** (`src/core/keystore.ts`): AES-128-CTR, pbkdf2/scrypt, keccak MAC. Passes the spec vector and still reads the legacy format.
- [x] **Fake crypto removed**: `WalletManager.signTransaction` and the `QuantumCrypto` class (whose `verify` accepted anything) are gone.
- [x] **Unlock verifies against the password wrap**, independent of the account count.
- [x] **IDs use `crypto.randomUUID()`.**
- [x] **`MobileStorage.clear()` erases** (it tracks the keys it writes). The Expo app is no longer a target.

## 3. P0 — Security model

- [x] **No plaintext password in memory.** Only a non-extractable data key is held (`WalletManager.session()`).
- [x] **Keyring in the extension background** (`src/extension/background.ts`); the popup uses a proxy (`src/shared/backend.ts`). The session persists in `chrome.storage.session`.
- [x] **Auto-lock** is enforced on every key use, extended by activity; **lock-when-hidden** applies to installed apps.
- [x] **Unlock throttling**: 5 free attempts, then a 30 s backoff doubling to a 1 h cap, persisted.
- [x] **KDF** raised to PBKDF2-SHA256 at 600k iterations, with per-vault parameters.
- [~] **Re-authentication.** Exports, account removal and biometric enrolment ask for the password, and copied secrets clear after 60 s. *Left:* large-send confirmation, and custom RPCs (the feature doesn't exist yet).
- [~] **Clear-signing.** Approvals decode ERC-20/native-token `transfer`/`approve`, warn on unlimited approvals, and show account-ID resolution, the maximum fee, and binary-message warnings. *Left:* general ABI decoding and simulation (§8).
- [ ] **Phishing and address-poisoning warnings**: origin blocklist, first-time-recipient and look-alike detection.
- [x] **Host permissions** declared (`https://*/*`, localhost) for background RPC.
- [x] **`console.log` stripped** from extension bundles (esbuild `pure`) and from the web build (Next `removeConsole`).
- [x] **Dev mocks removed.** Settings → Developer now shows read-only diagnostics.
- [~] **Web target decision.** Shipped, with documented storage-eviction handling (install prompt, `persist()`, warnings). *Left:* a strict Content-Security-Policy for the hosted web app (needs headers from the host, or hashed inline scripts).

## 4. P0 — dApp provider (extension)

- [x] **MAIN-world provider**: `src/extension/inpage.ts` (a MAIN content script on Chrome, script injection on Firefox), at `document_start`.
- [x] **Background router** with an origin from `port.sender` and permission checks (`src/extension/provider/router.ts`, 16 unit tests).
- [x] **`window.ethereum`** (without overwriting another wallet) **plus EIP-6963** (`rdns: org.qrdx.wallet`). `window.qrdx` cannot be replaced by pages.
- [x] **Approval windows** with a queue, at most 3 pending per origin; closing one rejects. An unlock prompt appears when a connected site needs the wallet.
- [x] **Standard methods**: accounts, chain, `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction`, switch/add chain (registry only), `wallet_watchAsset`, EIP-2255 permissions, and read-only passthrough. `eth_sign` is disabled.
- [x] **EIP-712** (`src/core/eip712.ts`, spec vector); typed data bound to another chain is refused.
- [x] **Events**: `connect`, `accountsChanged`, `chainChanged`, `disconnect`, pushed on lock/unlock/switch/revoke.
- [x] **QRDX namespace**: `qrdx_requestAccounts`/`accounts`, `qrdx_signPQMessage`, `qrdx_sendPQTransaction`, `qrdx_sendExchangeTransaction`, `qrdx_getAccountId`, `qrdx_chainInfo` (documented in [DAPP_INTEGRATION.md](DAPP_INTEGRATION.md)).
- [x] **Real-browser test** (`tests/e2e/extension-provider.mjs`): injection, EIP-6963, permissions, popup onboarding, connect, sign, reject.
- [ ] **P1:** WalletConnect v2, so the iPhone PWA and the web app can connect to desktop dApps.

---

## 5. QRDX-native features

### 5.1 Unified account UX (P1)

- [x] Both credentials' balances (dashboard EVM/PQ split; `pqBalances` in context).
- [~] **"Move to quantum-safe".** The Shield screen offers "Send to my quantum-safe account". *Left:* a one-tap "move everything" helper and a quantum-exposure indicator.
- [x] **Send envelope by source credential** (Classic / Quantum-safe toggle in Send; `tx-service.send`).
- [x] **PQ accounts can call contracts** (0x51 `data`), available to dApps via `qrdx_sendPQTransaction`.

### 5.2 Exchange transactions (P1)

- [x] **Builder and signer** (`src/core/exchange-tx.ts`): Python-compatible JSON including `ensure_ascii`, BLAKE2b hash, sender-key binding check, node vectors.
- [x] **Submit and receipts** (`tx-service.submitExchangeOp`, `exchange-client.waitForExchangeReceipt`).
- [~] **Error mapping.** Node reasons are shown verbatim. *Left:* friendly messages per op.

### 5.3 Swap and liquidity

- [x] **P1 Swap.** `exchange_quoteSwap` then `SWAP` with `min_amount_out` (slippage 0.1–3%), a deadline, route, price and fee (`components/wallet/SwapModal.tsx`).
- [ ] **P2:** pools and LP (`ADD_LIQUIDITY`/`REMOVE_LIQUIDITY`, positions).
- [ ] **P2:** spot limit orders (`PLACE_ORDER`/`CANCEL_ORDER`).

### 5.4 Staking (P1)

- [x] **`STAKE_DEPOSIT`** (validator = this account's PQ key) and **`STAKE_EXIT`**, with real parameters and slashing table, and status from `GET /get_validators` (`components/wallet/StakeModal.tsx`).
- [x] **Misleading copy removed** (delegation, invented APY and block time). The screen states that a validator node must run with this key.
- [ ] ⛔ `ValidatorModule` is still not registered on `/rpc` (§10 #1); the screen uses REST meanwhile.

### 5.5 Native tokens

- [x] **P1 Discovery** via `exchange_getTokens`; balances via the ERC-20 view; tokens identified by address in Swap.
- [x] **P1 `wallet_watchAsset`** / watched tokens (`src/core/watched-tokens.ts`).
- [ ] **P1 Allowance manager** (`TOKEN_APPROVE`, 256-allowance cap).
- [ ] **P1 Frozen-balance indicator.**
- [ ] **P2 Creator tools** (deploy, mint, burn, authorities, freeze).

### 5.6 Perpetuals (P2)

- [~] **Read-only.** Markets and the account's perp state (`TradeModal.tsx`); dApps can trade through `qrdx_sendExchangeTransaction`. *Left:* in-wallet order entry, if wanted once the stablecoin is live.

### 5.7 Shield / bridge ⛔

- [x] **The simulated flow is gone.** The screen explains the status and offers the classic → quantum-safe move.
- [ ] ⛔ **Real shield/unshield** once the node exposes it (§10 #3).

### 5.8 Governance ⛔

- [ ] ⛔ Proposals, voting and delegation once the node has a governance transaction (§10 #4).

### 5.9 Advanced accounts (P3)

- [ ] System-wallet controller mode (0x51 `on_behalf_of`; already supported in `pq-tx.ts` and its vectors)
- [ ] `0xPQMS` threshold multisig co-signing
- [ ] Prefunded sub-wallets

---

## 6. P1 — Core wallet features

**Accounts**
- [x] **HD accounts from one phrase** (`addHdAccount`), with no new phrase per account.
- [x] **Discovery**: "Find accounts" scans indices for balance/nonce (Settings → Accounts).
- [~] **Account management.** Rename, remove, 24-word phrases and a 100-account cap are done; `setAccountHidden` is in the manager. *Left:* watch-only accounts, a hide toggle in the UI, and reordering.

**Send**
- [x] **"Max" subtracts the quoted fee**; the fee shown is the fee charged (quote reused).
- [~] **Pending tracking.** Sends are tracked in the activity log until their receipt. *Left:* speed-up/cancel and a custom nonce.
- [ ] **QR scanning** (camera / `BarcodeDetector`, with a fallback for iOS).

**Balances, history, prices**
- [~] **QRDX history** (`src/core/activity.ts`): the wallet's own transactions (classic, PQ, exchange, dApp), resolved from receipts, plus incoming token `Transfer` logs. *Left:* incoming native QRDX ⛔ (§10 #5).
- [~] **QRDX price.** The fake CoinGecko id is removed and the UI says "price unavailable". *Left:* an on-chain TWAP price.
- [ ] **Real-time updates** (`/ws` blocks, `eth_subscribe`) and incoming-funds notifications.
- [ ] **RPC fallbacks for QRDX**, `/healthz` checks and rate-limit backoff.
- [ ] **Custom networks** (add/edit with chain-ID verification).

**Settings**
- [ ] **i18n framework**; locale number formatting. The currency list is extended in types only.
- [~] **Settings split**: Accounts and Security extracted, and `Settings.tsx` cut from 2,839 to about 1,600 lines. *Left:* the remaining pages.

## 7. P1 — Platforms

**Extension**
- [x] **MV3 service-worker lifecycle**: session store, ports reconnect, approvals survive the popup closing.
- [~] **Firefox MV2 build** produced (`dist/firefox`, gecko id, injected inpage). *Left:* a manual test in Firefox, plus store assets and privacy policy.
- [x] **Docs match the build** (esbuild + Next export; README, ARCHITECTURE).

**iPhone PWA** (replaces the Expo app — see [PLATFORMS.md](PLATFORMS.md))
- [x] **Face ID / Touch ID** via passkey PRF (iOS 18+).
- [x] **Full-screen layout** with safe areas; no forced zoom lock; 16 px inputs.
- [x] **Locks when backgrounded** (30 s default).
- [x] **Install guidance** (Share → Add to Home Screen) and storage-eviction messaging; home-screen shortcuts.
- [x] **Update flow** that never reloads mid-transaction.
- [ ] **QR scanner** (see §6).
- [ ] **On-device test pass** on a physical iPhone (Face ID enrolment, background lock, offline launch).

## 8. P2/P3 — Extras

- [ ] Portfolio across chains with 24 h change and PnL
- [ ] Fiat on-ramp for `BuyModal.tsx` (still honestly "Coming soon")
- [ ] Transaction simulation before signing
- [ ] Notifications (incoming funds, staking, liquidation risk)
- [ ] CSV history export
- [ ] Contact QR / address-book import and export
- [x] Onboarding explains classic vs quantum-safe accounts (done screen, Shield, Stake copy)
- [ ] Accessibility pass (WCAG 2.1 AA). Flows have labels and roles; a full audit is not done.
- [ ] P3: NFTs · hardware wallets (classic key) · encrypted cloud backup / social recovery

## 9. P1 — Engineering and release

- [x] **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit tests, extension build, Playwright e2e.
- [ ] **Node-in-CI integration tests** for 0x51 send, swap and stake against a live node. Blocked in this environment because the node's Python dependencies can't be installed.
- [x] **Conformance vectors from node code**, with no Python packages needed (`pnpm conformance:generate`).
- [x] **E2E**: web onboarding/unlock/throttle/import; extension injection/connect/sign/reject.
- [x] **ESLint working again** (flat config); 61 errors fixed to 0.
- [ ] **One Tailwind version** (both `tailwindcss@3` and `@tailwindcss/postcss@4` are installed).
- [x] **Vault migrations** are versioned and tested (v1 → v2 with placeholder-era records).
- [ ] **Privacy-preserving error reporting** (opt-in).
- [x] **Docs**: PLATFORMS, DAPP_INTEGRATION, ARCHITECTURE, SECURITY, DEVELOPMENT, README, CHANGELOG.
- [ ] **Release gates**: dependency audit and SBOM, reproducible extension build, external security audit, bug bounty, store submissions.

---

## 10. Node-side asks (blocking items above)

These live in `qrdx-node`/`qrdx-chain`, which is reference-only from this repo (mono-repo `CLAUDE.md`).

1. Register `ValidatorModule` (as an `RPCModule`) and `BridgeModule` on `/rpc`.
2. Unique chain IDs in place of `1` / `88888`, the same on every surface.
3. A user shield/unshield transaction and RPC.
4. A governance transaction (propose, vote, delegate) and read RPCs.
5. An account-history RPC (`qrdx_getAccountTransactions`) covering legacy, 0x51 and exchange transactions, so incoming native transfers can be shown.

## Suggested next steps

1. Get §10 #2 (chain IDs) decided with the node owners; it gates mainnet.
2. WalletConnect, QR scanning, and a physical-iPhone test pass, which finish the mobile story.
3. Allowance manager, frozen indicator, speed-up/cancel and custom networks (the remaining P1 items).
4. Node-in-CI integration tests, then the release gates in §9.
