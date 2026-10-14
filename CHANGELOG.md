# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Confirmations before anything is signed or removed**: sending opens a review (recipient and contact name, amount and its fiat value, from-account and address, network, fee, total, a warning for an address never sent to); every staking operation and NFT transfer is reviewed; removing a contact and disconnecting sites ask first.
- **Account switcher**: the account name in the header opens every account with its value, switches on tap, and adds or manages accounts.
- **Balance in fiat first**: the total across both addresses leads, with the native amount and the day's change under it.
- **Currency**: values follow Settings → Currency (EUR, GBP, JPY, CAD, AUD, CHF), converted at CoinGecko's rates; without a rate they stay in USD.
- **Token pages**: price with 1H/1D/1W/1M charts, the holding by address, the token's on-chain record (supply, authorities, creator), the account's activity in it, and send, receive and swap; tokens can be hidden and shown again.
- **NFTs**: the account's NFTs from the node, by collection, with images and traits from their metadata, and sending them.
- **Notifications**: funds received and sends confirmed or failed, and price alerts set in Settings, while the wallet is open.
- **Get QRDX** replaces the card-purchase mock: receive, swap, and how QRDX is funded on each network. Shield shows the network's bridged assets.
- **Activity from the node's transaction index** (`/get_address_history`): every transfer in or out, EVM call and exchange operation of the account, from any device, with what each operation did ("Delegate stake"); the local log still shows what was just sent. Falls back to the local log on a node without the index.
- **Transaction details**: status, both parties named from contacts and the wallet's accounts, fee, block, hash; **Send again**, **Save contact**, and on EVM networks **Speed up** / **Cancel** of a pending transaction (same nonce, at least 12 % more gas). QRDX nodes refuse replacements, so it is not offered there.
- **Recipient suggestions** in Send: recent recipients (with how often and when), the wallet's other accounts and contacts, filtered as you type.
- **Explore**: the network's markets (price, 24 h change, volume; sort by volume, gainers, losers), perpetuals and new launches from the trade API; CoinGecko's most traded coins on other networks. A market opens its token page.
- **Swap settings**: custom maximum slippage (with a warning from 5 %) and how long a signed swap stays valid, kept per device. Swap from a token's page pays with that token.
- **Pre-sign checks for dApp transactions**: the call is run against the latest block (`eth_call`) and the approval shows whether it succeeds or why it reverts, and the balance changes and token allowances it carries, with token symbols and decimals read from the contract.
- **Look-alike site warnings** on every approval: names resembling well-known wallets, exchanges and QRDX domains, punycode, bare IP addresses and plain HTTP. A heuristic on the name; there is no blocklist service yet.

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
- Approvals for minting (`TOKEN_MINT`, "Mint 5,000 new X to you") and for giving up or handing over a token's mint or freeze authority, with a warning that renouncing is permanent.
- **QRDX Connect** (web and iPhone PWA): connect to sites by scanning their QR code (or opening its link) and approve their requests on the phone, with the same router, permissions and approval screens as the extension. End-to-end encrypted; pairing is refused unless the relay attests the site's origin. Camera scanning uses BarcodeDetector or jsQR (iOS).
- Approvals for token launches: `TOKEN_DEPLOY` states the supply and whether anyone can mint more or freeze balances; `CREATE_POOL` states the pair, starting price, fee and the QRDX it burns or stakes, and names tokens created earlier in the same block as "not created yet".

- **Delegation**: the Stake screen delegates QRDX to a validator's pool (`STAKE_DELEGATE`) and undelegates all or part (`STAKE_UNDELEGATE`), with each validator's commission and the rate after it, warm-up and unstaking times, and the account's stake and payouts, read from the node's `staking_*` methods. Running your own validator (`STAKE_DEPOSIT` / `STAKE_EXIT`) moves under it. dApps can send both operations; approvals describe them.
- Exchange op codes up to 55 (token extensions, NFTs, governance, bridge withdrawals, delegation).

### Fixed
- Shield read bridged assets' `address` and `chain_id`, which the node does not send (`token_address`, `chain`).
- **Exchange signatures bound to the chain.** The node now signs exchange transactions over a domain tag and the network's chain id (`QRDX-EXCHANGE-TX-v1\0` ‖ chain id ‖ …) and carries `chain_id` in the envelope; the wallet's older bytes no longer verified, so every swap, order and launch was refused. The wallet signs the new form with the node's chain id; conformance vectors regenerated from the node.
- Testnet's chain id is `7620` (its chain spec), and QRDX blocks are 250 ms apart: receipts are polled every second, not every 180 s.
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
- Settings that did nothing: Language (no translations exist), Smart Wallet ("coming soon"), and the security and news notification toggles.

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
