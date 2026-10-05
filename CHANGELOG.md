# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Vault v2** (envelope encryption): a random data key wrapped by the password (PBKDF2-SHA256, 600k) and optionally by passkeys. v1 vaults migrate on first unlock.
- **Biometric unlock** with passkeys (WebAuthn PRF) on web, the iPhone PWA (Face ID / Touch ID) and the extension, where supported. The password is never stored.
- **New onboarding**: create (12/24 words, tap-to-pick verification) or import a recovery phrase, private key, or V3 keystore; then a "secure this device" step (biometrics, install, persistent storage).
- **HD accounts** from one recovery phrase, account discovery, rename, and per-account exports.
- **Unlock throttling** (persisted backoff), working **auto-lock**, and **lock-when-hidden** for installed apps.
- **Type-0x51 post-quantum transactions** and canonical **account IDs**, matching the node byte for byte (conformance vectors generated from node code).
- **Exchange transactions**: swaps on QRDX's native exchange, and staking (validator deposit and exit).
- **Extension dApp provider**: `window.ethereum`, `window.qrdx`, EIP-6963, EIP-712, EIP-2255, a `qrdx_*` namespace, and approval windows with decoded calls.
- **Web3 Secret Storage v3 keystores** (MetaMask/geth compatible) that also carry the PQ seed.
- Activity log for QRDX history; native-token discovery; watched tokens (`wallet_watchAsset`).
- PWA: rewritten service worker (no cross-origin caching, user-approved updates), manifest shortcuts, safe-area layout, install guidance for iOS.
- CI (typecheck, lint, unit tests, extension build, real-browser end-to-end tests).
- Docs: PLATFORMS, DAPP_INTEGRATION, rewritten ARCHITECTURE, SECURITY and DEVELOPMENT.
- **Readable exchange approvals** for trading dApps (qrdx-trade): orders, swaps, cancels, liquidity and perps are described in words ("Buy 0.01 qBTC at 84,058.6 qUSDC", "Swap 1,000 qUSDC for at least 0.0117 qBTC"), with each token's address, the equivalent order from the other token's side, the deposit a liquidity add takes, and warnings for unknown tokens, swaps with no minimum and approvals. Raw parameters stay visible.
- `perp_getEvents` and `exchange_getStateRoot` pass through to the node for dApps.
- **QRDX Connect** (web and iPhone PWA): connect to sites by scanning their QR code (or opening its link) and approve their requests on the phone, with the same router, permissions and approval screens as the extension. End-to-end encrypted; pairing is refused unless the relay attests the site's origin. Camera scanning uses BarcodeDetector or jsQR (iOS).
- Approvals for token launches: `TOKEN_DEPLOY` states the supply and whether anyone can mint more or freeze balances; `CREATE_POOL` states the pair, starting price, fee and the QRDX it burns or stakes, and names tokens created earlier in the same block as "not created yet".

### Fixed
- A second exchange operation before the next block reused the pending nonce and the node refused it ("nonce N already queued"). The wallet now tracks nonces it has submitted and retries a refused nonce with the next free one.
- `qrdx_sendExchangeTransaction` refused `from` set to the account's own `0xPQ` address.
- Changing the password left the recovery phrase encrypted under the old password.
- Keystore export dropped the post-quantum key of phrase wallets, so a re-import produced a different `0xPQ` address.
- `0xPQ` recipients were truncated into a wrong 20-byte `to` in EVM transactions.
- PQ message signatures used UTF-16 length instead of byte length, so non-ASCII messages did not verify on the node.
- Native PQ sends called RPC methods the node does not serve (the old UTXO path).
- A second send before the first confirmed reused its nonce (`latest` → `pending`).
- "New account" generated a new recovery phrase every time.
- Password inputs on the old setup screen lost focus on every keystroke.
- The "All tokens" list did not update when balances loaded.
- ESLint had silently stopped running (ESLint 9 / Next 16); migrated to a flat config.

### Removed
- Simulated Shield, Trade and Swap flows, hard-coded qETH/qBTC/qUSDC token addresses, and the developer "mock GUI" controls.
- `WalletManager.signTransaction` (signed JSON as a message) and `QuantumCrypto.verify` (accepted any signature).
- QUICKSTART.md and PROJECT_SUMMARY.md, which described commands and files that no longer exist.

## [1.0.0] - TBD

### Added
- Initial release
- Browser extension support (Chrome, Firefox, Edge)
- Mobile app support (iOS, Android via Expo)
- Wallet creation and import
- Basic send/receive functionality
- Multi-wallet management
- Quantum-resistant cryptography foundation
- Dark/light theme support
- Auto-lock security feature
- Transaction history
- Network switching
