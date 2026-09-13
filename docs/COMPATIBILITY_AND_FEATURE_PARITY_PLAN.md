# QRDX Wallet Compatibility and Feature Parity Plan

## Purpose

This document defines the work required to make QRDX Wallet fully compatible with:

1. **QRDX-native behavior** across the QRDX chain and QRDX-specific wallet features.
2. **web3 compatibility** for dApps using EIP-1193, EIP-6963, legacy `window.web3`, and common Web3.js/Ethereum wallet flows.
3. **Full wallet feature parity** across setup, account management, sending, receiving, staking, swapping, trading, security, settings, and multi-platform support.

It is intended to be the implementation checklist for finishing the product, not a marketing summary.

---

## Current Baseline

The project already has a strong foundation:

- Shared wallet core exists in `src/core/`.
- Browser extension and mobile app shells exist.
- QRDX and Ethereum chain configs exist in `src/core/chains.ts`.
- Wallet storage and encrypted state management exist.
- BIP-39 mnemonic generation, mnemonic validation, and JSON keystore export/import are implemented.
- The Setup flow has been upgraded to a professional mnemonic-based onboarding flow.
- Settings now supports real account actions and professional account creation/import flow.
- Extension content injection exposes a QRDX provider stub in `src/extension/content.ts`.

What is still missing is the final production-grade compatibility layer, complete feature parity, and the remaining app polish around dApp integration and wallet operations.

---

## Goals

### QRDX Compatibility Goals

- QRDX Wallet must behave as a first-class wallet for the QRDX ecosystem.
- It must support QRDX mainnet and testnet cleanly.
- It must expose QRDX-specific provider methods and events in a stable way.
- It must preserve QRDX post-quantum identity, addresses, and signing support.
- It must support QRDX chain switching, QRDX-native balances, QRDX-specific transactions, and QRDX dApp integration.

### web3 Compatibility Goals

- DApps must be able to connect using standard web3 wallet patterns.
- Wallet injection must support `window.ethereum` and `window.qrdx`.
- The wallet must support EIP-1193 request semantics.
- The wallet must support EIP-6963 multi-wallet discovery.
- The wallet must remain compatible with common Web3.js and Ethereum dApp expectations.
- Legacy `window.web3` support should exist only as an optional compatibility layer.

### Feature Parity Goals

- All main wallet features should be complete, polished, and discoverable.
- Setup, unlock, account creation, and import flows must feel production-grade.
- The dashboard must support tokens, balances, history, and quick actions.
- Send/receive/swap/stake/buy/trade flows must be functional.
- Settings must fully manage accounts, networks, security, localization, and privacy.
- Mobile and extension should share the same core behaviors where possible.

---

## 1. QRDX Compatibility Requirements

### 1.1 Provider Namespace and Injection

QRDX Wallet should expose providers in a way that supports both QRDX-native dApps and standard Ethereum dApps.

#### Required provider surfaces

- `window.qrdx`
  - QRDX-native provider object.
  - Primary namespace for QRDX-specific signing and chain operations.
- `window.ethereum`
  - EIP-1193 compatible provider.
  - Must be available for Ethereum-style dApps.
- EIP-6963 provider announcement
  - Wallet should announce itself as a discoverable provider.
  - Must include QRDX metadata and supported chain info.
- Optional legacy `window.web3`
  - Only for older dApps that still depend on it.
  - Should be marked as legacy compatibility only.

#### Required provider metadata

- Wallet name
- Wallet icon
- Wallet UUID / identifier
- Supported chains
- QRDX support indicator
- Version
- Feature flags
- Connection status

#### Required provider behavior

- Stable request handling.
- Correct event emission.
- No duplicate injection conflicts.
- Clean teardown on extension reload/reconnect.
- No leakage of sensitive data into page context.

---

### 1.2 QRDX Chain Support

QRDX chain support must be fully explicit and enforced.

#### Required chain support

- QRDX Mainnet
- QRDX Testnet
- Ethereum mainnet (if the wallet advertises Ethereum support)
- Any additional EVM-compatible QRDX ecosystem chains

#### Required chain behavior

- Read chain ID correctly.
- Switch chain correctly.
- Add chain correctly.
- Reject unsupported chains clearly.
- Show the correct native symbol and explorer links.
- Support QRDX RPC endpoints and fallbacks.

#### Required chain UX

- Network selector must clearly distinguish QRDX and non-QRDX chains.
- Testnet must be visually separated from mainnet.
- Unsupported chains should explain why they are unsupported.
- Chain switching should preserve the active wallet session correctly.

---

### 1.3 QRDX Wallet Methods

The QRDX provider should define a stable QRDX method namespace.

#### Minimum QRDX method set

- `qrdx_requestAccounts`
- `qrdx_accounts`
- `qrdx_chainId`
- `qrdx_switchChain`
- `qrdx_addChain`
- `qrdx_signMessage`
- `qrdx_signTypedData`
- `qrdx_sendTransaction`
- `qrdx_getPublicKey`
- `qrdx_getPQPublicKey`
- `qrdx_signPQMessage`
- `qrdx_signPQTransaction`
- `qrdx_getBalances`
- `qrdx_getHistory`
- `qrdx_watchAsset`
- `qrdx_disconnectSite`

#### Required QRDX behavior

- QRDX-specific signing must use the wallet’s real cryptographic model.
- QRDX methods must reject unsupported inputs with clear messages.
- QRDX methods must not expose decrypted keys to the page.
- QRDX methods must be permission gated.
- QRDX methods must be compatible with extension and mobile architecture.

---

### 1.4 QRDX DApp Permissions

The wallet must have a durable permission model for dApps.

#### Required permission types

- View account addresses
- Request account access
- Request transactions
- Sign messages
- Sign typed data
- Access QRDX-native actions
- Watch assets/tokens
- Read chain/network info

#### Required permission UX

- First connection should show a clear approval sheet.
- Permissions should be per-origin.
- Permissions should be reviewable in Settings.
- Permissions should be revocable.
- Permission changes should immediately affect provider behavior.

---

## 2. web3 Compatibility Requirements

### 2.1 EIP-1193 Provider Compliance

The injected Ethereum-compatible provider must behave like a real EIP-1193 provider.

#### Required request handling

- `provider.request({ method, params })`
- Proper promise resolution and rejection.
- Standard error codes where possible.
- Parameter validation.
- Correct method routing.

#### Required EIP-1193 methods

At minimum, support the methods commonly required by dApps:

- `eth_chainId`
- `net_version`
- `eth_accounts`
- `eth_requestAccounts`
- `eth_getBalance`
- `eth_blockNumber`
- `eth_call`
- `eth_estimateGas`
- `eth_sendTransaction`
- `eth_sign`
- `personal_sign`
- `eth_signTypedData`
- `eth_signTypedData_v4`
- `wallet_switchEthereumChain`
- `wallet_addEthereumChain`
- `wallet_watchAsset`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_getTransactionCount`
- `eth_feeHistory`
- `eth_gasPrice`

#### Required provider events

- `connect`
- `disconnect`
- `chainChanged`
- `accountsChanged`
- `message`

#### Required behavior

- Chain/account changes must emit events immediately.
- Disconnect must be emitted on lock/logout/revocation where applicable.
- Provider should remain stable across page reloads.
- Requests should be rejected when the wallet is locked.
- Requests should revalidate the active account and chain before signing.

---

### 2.2 EIP-6963 Multi-Wallet Discovery

QRDX Wallet should be discoverable alongside other wallets.

#### Required EIP-6963 behavior

- Announce provider availability on page load.
- Include provider info metadata.
- Support multi-wallet selection flows.
- Avoid overwriting other injected providers.
- Work with wallets that use EIP-6963 instead of `window.ethereum`.

#### Required metadata

- `rdns`
- `name`
- `icon`
- `uuid`
- supported chains
- QRDX compatibility markers

#### Required tests

- dApp can detect QRDX Wallet via EIP-6963.
- dApp can select QRDX Wallet from multiple providers.
- Multiple wallet announcements do not conflict.

---

### 2.3 Legacy web3 Compatibility

Some dApps still expect legacy Web3.js patterns.

#### Required compatibility surfaces

- `window.web3` compatibility object if enabled.
- `send` / `sendAsync` compatibility if needed.
- Compatibility with Web3.js provider detection.
- Compatibility with older dApps that call `ethereum.enable()` or similar legacy methods if supporting them is intentional.

#### Required considerations

- Legacy APIs should be clearly marked as compatibility-only.
- Prefer EIP-1193 as the primary API.
- Do not implement unstable legacy methods unless needed for a target dApp.
- Add compatibility tests for older dApps if legacy support is shipped.

---

### 2.4 Web3.js Integration Requirements

The wallet should be usable from Web3.js-based apps with minimal friction.

#### Required behavior

- Web3.js provider detection should pass.
- `new Web3(provider)` should work with injected provider.
- `web3.eth.accounts` flows should work.
- Sending, signing, and chain queries should behave as expected.
- Subscriptions should be supported if the underlying provider/RPC supports them.

#### Required tests

- Basic `web3.eth.getAccounts()` works.
- `web3.eth.getChainId()` works.
- `web3.eth.sendTransaction()` works.
- `web3.eth.personal.sign()` or equivalent wallet flows work where applicable.
- Contract calls and sends work on supported networks.

---

## 3. Wallet Feature Parity Requirements

### 3.1 Setup and Onboarding

The onboarding experience must remain professional and complete.

#### Required setup features

- Create wallet flow
- Import wallet flow
- Password and password confirmation
- Recovery phrase generation
- Recovery phrase confirmation
- Mnemonic backup warning
- JSON keystore export/import
- Private key import for advanced users
- Clear success state after creation

#### Required onboarding UX

- Step-by-step wizard
- Clear progress indication
- Strong visual hierarchy
- Safe disclosure of sensitive material
- No mock or placeholder create/import logic

---

### 3.2 Unlock and Session Management

The wallet must manage lock/unlock state correctly.

#### Required features

- Unlock with password
- Auto-lock timer
- Manual lock
- Session persistence across reloads where appropriate
- Correct reauthentication for sensitive actions
- Recovery from invalid password attempts

#### Required UX

- Clear locked/unlocked states
- Fast unlock for returning users
- No accidental sign actions while locked

---

### 3.3 Account Management

Account management must be complete and polished.

#### Required features

- Create new account
- Import account via private key
- Import account via mnemonic phrase
- Import account via JSON keystore
- Export private key
- Export recovery phrase
- Export JSON keystore
- Switch between accounts
- Remove account
- Change account password
- Reset wallet
- Per-account metadata

#### Required details

- Account creation should be available in Settings as a full flow, not a simple input form.
- Account creation should mirror the setup flow quality.
- Import flows should support private key, mnemonic, and keystore.
- Exports should require password confirmation and explicit warning text.

---

### 3.4 Dashboard and Portfolio

The main wallet home must provide useful at-a-glance data.

#### Required features

- Native balance display
- Token list
- Portfolio value
- Price history chart
- Recent activity feed
- Quick actions
- Network and account context

#### Required enhancements

- Empty-state handling for new wallets
- Loading states for balance and price fetches
- Error states for RPC / pricing failures
- Native and token balance refresh controls
- Clear QRDX vs EVM asset labeling

---

### 3.5 Send / Receive / Swap / Trade / Stake / Buy

Core transaction flows must be complete.

#### Send flow

- Native asset send
- ERC-20 token send
- Fee estimation
- Address validation
- QR code / clipboard input support
- Transaction confirmation screen
- Broadcast success/failure handling

#### Receive flow

- Wallet address display
- QR code generation
- Network-specific address labels
- Copy button
- Share/export behavior if appropriate

#### Swap / Trade / Buy / Stake

- Functional modal flows
- Clear routing to supported external services or internal aggregation logic
- Fee preview and slippage handling where relevant
- Error handling and unsupported chain messaging
- State updates after transaction completion

---

### 3.6 Token Management

Token support must be useful and accurate.

#### Required features

- Token list
- All tokens view
- Token search/filter
- Token metadata display
- Add/remove watched token
- Asset balance refresh
- Native vs token differentiation
- QRDX token grouping

#### Optional but strongly recommended

- NFT support
- Portfolio grouping by chain
- Favorite tokens

---

### 3.7 Activity / History

Users need reliable transaction history.

#### Required features

- Recent activity list
- Transaction status
- Incoming/outgoing labeling
- Chain-aware history
- Native and token transaction history
- Pending / confirmed / failed statuses
- Explorer linkouts

#### Required behavior

- Activity should refresh after wallet actions.
- Failed transactions should be clearly explained.
- History should work for QRDX and EVM-compatible chains.

---

### 3.8 Settings and Preferences

Settings must be fully functional and persistent.

#### Required categories

- Accounts
- Security
- Networks
- Theme
- Language
- Currency
- Notifications
- Connected sites
- Injected APIs
- Address book
- About / support

#### Required settings behavior

- Changes persist across restarts.
- Settings updates should reflect immediately in UI.
- High-risk actions must require confirmation.
- Network and chain preferences must update provider behavior.

---

### 3.9 Security Features

Security must be treated as a first-class wallet feature.

#### Required features

- Password change
- Auto-lock configuration
- Reset wallet
- Recovery phrase export warnings
- Private key export warnings
- Session timeout handling
- Locked-state request rejection
- Sensitive action reauthentication

#### Strongly recommended

- Biometric unlock on mobile
- Device trust / remembered device support if safe
- Phishing warning UX for unknown sites
- Clear signature request details

---

### 3.10 Connected Sites and Permissions

DApp connections must be manageable.

#### Required features

- Connected site list
- Per-site permissions
- Revoke access
- Last connected timestamp
- Site origin display
- Permission review in Settings

#### Required behavior

- Revoking access should immediately affect the injected provider.
- Permission state should be persisted.
- Reconnecting should re-run approval flows where needed.

---

### 3.11 Address Book and Contacts

The wallet should support recipient management.

#### Required features

- Add/edit/delete address book entries
- ETH address and QRDX address support
- Favorites
- Chain labels
- Validation before save
- Import/export contacts if desired later

---

### 3.12 Localization, Currency, and Theme

The product should be polished for real users.

#### Required features

- Theme support
- Language selection
- Fiat currency selection
- Number formatting
- Localization hooks for all major UI strings

---

## 4. Mobile and Extension Parity Requirements

### 4.1 Shared Core

The shared core should remain the source of truth.

#### Required shared modules

- Wallet creation and import logic
- Storage abstraction
- Cryptography
- Chain metadata
- Transaction formatting
- QRDX and EVM signing logic
- Settings persistence

#### Required rule

- Platform-specific UI should not duplicate wallet business logic.

---

### 4.2 Extension-Specific Work

#### Required extension work

- Content script provider injection
- Background message handling
- Popup UI integration
- Manifest permissions validation
- DApp approval requests
- Site connection management
- Browser-compatible storage handling

#### Required extension checks

- Chrome and Firefox build outputs must remain working.
- MV3 / MV2 compatibility must be preserved where supported.
- Provider injection must not break page behavior.

---

### 4.3 Mobile-Specific Work

#### Required mobile work

- SecureStore integration
- Navigation flows for setup/unlock/home/send/receive/settings
- Biometric unlock
- Mobile-friendly transaction and approval screens
- Platform-specific QR scanning and sharing

---

## 5. QRDX Chain-Specific Feature Requirements

### Required QRDX-native support

- Native QRDX balance tracking
- QRDX token display
- QRDX RPC and explorer integration
- QRDX chain switching
- QRDX testnet support
- QRDX-specific transaction formatting
- QRDX-specific address display
- PQ signature support in UI and provider layers

### Required QRDX ecosystem support

- QRDX dApps should be able to request wallet access.
- QRDX dApps should be able to sign messages and transactions.
- QRDX explorer links should be used throughout history and activity.
- QRDX branding should be consistent in the UI.

---

## 6. Implementation Phases

### Phase 1 — Compatibility Foundation

- Finalize provider injection behavior.
- Ensure EIP-1193 request compatibility.
- Add EIP-6963 announcement.
- Stabilize `window.qrdx` and `window.ethereum` behavior.
- Define and implement legacy compatibility boundaries.

### Phase 2 — QRDX Native Integration

- Complete QRDX method namespace.
- Ensure QRDX signing, chain switching, and balance flows are complete.
- Add QRDX dApp approval UI.
- Add QRDX-specific tests and example dApp flows.

### Phase 3 — Feature Parity Completion

- Finish any incomplete send/receive/swap/stake/trade/buy flows.
- Polish history, token, and dashboard views.
- Make settings fully functional across all sections.
- Add address book and connected site management if any gaps remain.

### Phase 4 — Hardening

- Add negative-path and security tests.
- Review error handling and sensitive data exposure.
- Audit all provider methods.
- Add regression tests for extension and mobile.

### Phase 5 — Release Readiness

- Update README, quickstart, and user docs.
- Confirm production builds.
- Confirm extension packaging.
- Verify mobile startup and onboarding.

---

## 7. Acceptance Criteria

QRDX Wallet can be considered complete when all of the following are true:

- QRDX dApps can connect using `window.qrdx` and/or `window.ethereum`.
- EIP-1193 wallet flows work correctly for common dApps.
- EIP-6963 wallet discovery works.
- Standard Web3.js apps can connect without special handling.
- QRDX chain support is complete and well-labeled.
- Account creation/import/export flows are professional and safe.
- Send/receive/history/token/dashboard flows are functional.
- Settings fully persist and manage all important wallet state.
- Security-sensitive actions require confirmation and password re-entry.
- Mobile and extension share the same wallet behavior where possible.
- Builds pass for web, extension, and mobile targets.

---

## 8. Notes for Future Work

- Keep QRDX-native features additive; do not break standard Ethereum compatibility.
- Prefer standards-based APIs first, then add QRDX extensions second.
- Do not leak decrypted material into UI state.
- Treat all signature and transaction requests as security-sensitive operations.
- Keep dApp compatibility tests alongside wallet feature tests.
- Update this document as features move from planned to complete.
