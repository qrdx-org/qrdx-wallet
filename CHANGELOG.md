# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **The web homepage**: the wallet's own dithered orb, live, beside the headline (blended into the page, its studio turning toward the pointer; a still frame without WebGPU); the features as numbered rows beside the one-phrase, two-keys diagram; no gradient text.
- **Sites can deploy contracts** with `eth_sendTransaction` from the classic key, as `qrdx_sendPQTransaction` already could from the post-quantum account: leave out `to` and put the code in `data`. The approval reads "Deploys a contract", with the size of the code. (docs.qrdx.org's contract playground uses it.) A deployment is simulated with the node's gas estimate, since QRDX's `eth_call` needs a `to`: the approval no longer reports a working deployment as failing.
- **A live dithered backdrop** (WebGPU, `components/gfx`) behind every screen, in the wallet's monochrome: a sphere of liquid chrome printed as 1-bit ordered dither, light dots on black or shadow on white. It sits top right on a phone and beside the wallet on a wide window. Swells drift over its surface; it stirs while one of the account's transactions waits to confirm, a new transaction sends a ripple over it from a point its hash chooses, and incoming funds send a ring of dots out across the screen. One pixel per dot and 30 frames a second at most, paused while the wallet is hidden; the same frame drawn once on the CPU without WebGPU or under reduced motion. Screens, cards and sheets are frosted glass over it.
- **The backdrop answers the visitor too**: the studio the orb mirrors tilts toward the pointer (or a finger), and scrolling turns its surface and lifts it a little slower than the page.
- **Price and value charts in the backdrop's dots** (`components/gfx/dither-chart.ts`, replacing lightweight-charts there): the area under the line is printed in the same ordered dither, dense under the line and thinning toward the floor, with a dotted mark at the range's opening price and a breathing dot on the newest one. The line draws in, morphs to a new range, and scrubs: the moment's price, change since the range opened and time replace the range's change, and what follows it dims. Idle charts draw nothing. The balance card is clear glass now, and its chart runs to the card's edges.
- **Welcome back (unlock) in the same composition as the welcome screen**, and the QRDX mark without a tile everywhere (welcome, unlock, About, loading, the landing page), written as the trade site writes its own: the mark, "QRDX", and "Wallet" in grey.
- **A new welcome screen**: the wallet's name at the top, clear of the orb; a large headline that rises word by word, three facts on hairline rules that draw across, and the two ways in at the bottom, where the thumb is. Primary buttons are flat ink.
- **Fluid motion**: screens change over with one spring (deeper screens come in from the right, going back from the left), the home tabs' pill slides and their content follows, sheets rise from the bottom edge, and buttons give under a press. Balances and prices roll to new values digit by digit, the chart ranges' pill slides, the home screen and asset list rise into place one after another, and rows sink a little under a press.
- **The icon is the QRDX mark in Liquid Glass**, clear and colourless (`scripts/icon`): no background for the browser, the extension, Android and desktop installs; on a black tile for the iPhone home screen, which fills transparent pixels with black. Small sizes use smoked glass so they read on light and dark toolbars.
- **Default network: QRDX Testnet** until mainnet launches. QRDX Mainnet is listed as not live yet (rpc.qrdx.org serves the testnet), instead of opening every new wallet on "Signing disabled".
- **Each network shows what works on it**: Receive offers the quantum-safe address (first) and the classic one on QRDX, the 0x address on other EVM networks, and the network's own address on Bitcoin and Solana; the header, balance split, actions, tabs and the "Quantum-Safe" badge follow suit.
- **Networks settings** list QRDX, EVM, Bitcoin and Solana, and your networks, with a working test-network switch (the old page's add and edit buttons did nothing).
- **Node 3.0.0 (the testnet's regenesis)**: `CREATE_MARKET` lists a token perpetual and is approved by its `token` (address or `QRDX`), with the market, margins and seeded liquidity shown; the retired deployer-market operations (79–82) are gone; `BRIDGE_PROVE_DEPOSIT` (84), `MIGRATION_CLAIM` (85) and `DOOMSDAY_PROVE` (86) are known, described and labelled in activity.
- **Fee reserve**: "Max" in swap, spot, perps deposits, sub-account transfers and staking leaves the account's fee reserve (1 QRDX) behind, as the node requires of exchange operations, and the node's refusal is explained in plain words. The wallet never signs `spend_reserve` on its own.

### Fixed
- Glass panels never blurred in Chrome: the CSS minifier kept only the prefixed `-webkit-backdrop-filter`.
- Dead RPC endpoints replaced: Ethereum's (eth.llamarpc.com returned a Cloudflare page), Polygon's, Sepolia's and Amoy's, and every Ankr fallback (Ankr now requires a key).
- An explorer's refusal ("Too many requests") was read as "no transactions"; it is now retried once and reported. Prices fall back to DefiLlama when CoinGecko's free API rate-limits, instead of reading $0. The chart's hover shows the chosen currency, and the date on ranges over a day.
- EVM activity was empty: Etherscan retired its keyless v1 API. History now comes from Blockscout's compatible API.
- Tokens not verified for their network are no longer priced, charted or given a logo by their symbol, unless you trust them.
- Send from the home screen opened on a zero balance: choosing a coin on the network already open cleared that network's balances and nothing reloaded them. Send now opens on the coin, from the QRDX address that holds it, and follows its balance as it loads.
- QRDX's price disappeared, and the total with it, whenever the trade API missed a request. It is asked twice, and when it still gives none the last real price from the past day is shown, marked "last price".
- QRDX testnet USDC (and every other QRDX verified asset, from the trade site's registry) read as unverified and unpriced; it is now verified and priced as USDC.
- The trading screen's token logos pointed at an absolute path that does not exist in the extension.
- Signed parameters containing the DEL character (0x7f) were serialized differently from the node; the wallet's signing bytes are now tested against the node's own vectors (`tests/fixtures/node-vectors.json`).

### Added
- **Token approvals** (Settings): every token allowance and NFT collection approval the account's 0x address gave, on each network with a keyless explorer, read back from the chain so only what a spender can still take is listed; the spender's name and a scam warning where the explorer (Blockscout) gives them; **Revoke** sends `approve(spender, 0)` or `setApprovalForAll(operator, false)`. Approvals given by signature (permits) leave no transaction and are not listed.
- **Watched addresses** (Settings): follow any 0x, 0xPQ, Bitcoin or Solana address, or a `.qrdx` name, read-only: its portfolio across the networks it exists on, the value chart and asset pages, with nothing to sign.
- **All networks** (home's default, in the network menu): one portfolio across QRDX, every EVM network, Bitcoin and Solana, fetched in parallel. The same coin on several networks is one asset (USDC on Base, Solana and QRDX); each shows its real price, the day's change and where it is held. QRDX leads. Test networks' coins are shown at the real coin's price (Sepolia ETH as ETH, QRDX testnet USDC as USDC) and counted in the total. Unverified tokens are folded away; open one to **trust** it (it is then listed and priced like a verified token), or list them all with **Show unverified tokens** (Settings → Networks, or "Show in my list"). A network that does not answer is named, so missing balances never read as zero.
- **Portfolio value chart** (1D, 1W, 1M, 1Y): what the account held at each moment at that moment's price. Holdings are rebuilt from today's balances by undoing each later transaction (sends and receipts, fees, contract and token transfers, Bitcoin and Solana transactions, and on QRDX the node's own index: transfers, fees and swaps), so deposits, withdrawals and swaps move the line as well as prices. Price history from DefiLlama, CoinGecko as fallback; QRDX's from its market on the trade API. Networks whose transactions cannot be read are named and drawn at today's holdings.
- **Asset pages**: price, 24 h / 7 d / 30 d change, chart (1D, 1W, 1M), and CoinGecko's market data (market cap, volume, fully diluted value, 24 h range, supply, all-time high), with the holding on each network.
- **Trade anywhere, QRDX first**: Swap opens straight on QRDX's swap; coins held on other networks are listed under "You pay" and open a swap of the same layout on their network, with bringing the coin to QRDX over the bridge (deposit into the network's lockbox, `BRIDGE_ASSETS` / `BRIDGE_LOCKBOXES`) offered beside it. Swaps elsewhere run through LI.FI on EVM networks (Uniswap, SushiSwap, Aerodrome, 1inch and others) and Jupiter on Solana (Raydium, Orca, Meteora and others), signed in the wallet. The quote shows the rate against the market rate, the least received, price impact, route, network fee and LI.FI's 0.25 % fee; an ERC-20 is approved for exactly the amount. Uniswap, PancakeSwap or Raydium's own site is linked too.
- **Activity across networks**, newest first, each with its network.
- **Send, Receive and Swap from the portfolio**: pick the asset (with its network) or the network to receive on.
- **Bitcoin**: each account's native SegWit address (BIP-84, `m/84'/0'/0'/0/i`; the imported key itself for a key account), balance, history and sending with a fee speed (mempool.space, Blockstream as fallback). Transactions are built as a PSBT and signed in the wallet manager, which refuses inputs the account does not own. Testnet4 too.
- **Solana**: each account's address at `m/44'/501'/i'/0'` (as Phantom and Solflare), SOL and SPL balances, history, and sending SOL or a token, creating the recipient's token account when needed. The wallet manager signs only messages the account pays for. Devnet too. Accounts imported from a key have no Solana address.
- **More EVM networks**: Linea, Scroll, Unichain, Mantle, Gnosis, Celo and Sonic (Fantom's successor; Fantom's RPCs no longer answer).
- **Your own networks**: Settings → Networks adds any EVM network by its RPC, which must answer with the chain id; remove it any time. Sites can propose one with `wallet_addEthereumChain`, approved first.
- **Coin and network logos** in one colour (web3icons, MIT), in the token list, token pages, send and the network menu. Only a network's own coin and tokens listed for it by address get a logo; a token anyone named "USDC" shows its initials.
- **Protect your classic address**: on QRDX, home shows when the classic address holds QRDX without a quantum-safe successor, and opens Quantum safety.
- **Quantum safety** (Settings): binds the account's own `0xPQ` address as its classic `0x` address's successor with one approval from the classic key (`ACCOUNT_POLICY add_controller` through the write precompile `0x…0401`). Once bound, the post-quantum key turns the classic key off and moves the classic address's QRDX to the quantum-safe one. Shows a binding that waits out a delay, one proven from the Ethereum registry, and whether the Doomsday Protocol has triggered.
- **Multisig** (Settings): shows the account's member key; sets up an m-of-n `0xPQMS` multisig from its members' keys (the node's derivation: the same keys and threshold make the same address); starts a request for the multisig itself or an account it controls (send QRDX, bind or unbind a controller, own key on or off, cancel a waiting change); signs as a member; merges signatures from other copies; submits with the aggregate signature. Requests travel as text or a file. The wallet manager signs a partial only for a transaction of a multisig the account belongs to. Checked against test.qrdx.org: the node authenticates the wallet's signatures and refuses a corrupted one.
- **Guardian recovery**: Account control lists the accounts you guard; back a new controller for one, or withdraw the backing (`ACCOUNT_RECOVER`). A recovery waiting against your own account is shown at the top, with Cancel.
- **Account security notifications**: while the wallet is open, a new waiting change, a recovery by guardians, a new controller or a key turned off, on either of the account's addresses. On unless turned off; they need the system's permission.
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
- **Approvals for the token standard's extensions**: `TOKEN_DEPLOY` states a transfer fee, soulbound, default-frozen accounts, a permanent delegate, pausing, default operators and locked or editable metadata, with warnings for each power over holders' balances.
- **Approvals for NFT operations**: creating a collection (royalty, supply cap, soulbound), minting, burning, approving one NFT, and letting an operator (a marketplace) move a collection's NFTs.
- **`qrdx_sendExchangeBatch`**: several exchange operations (up to 8) with one approval that shows each step, signed with consecutive nonces so a block applies them in order. Used for multi-hop swaps.
- **Smart routing in Swap**: when the trade API serves the network, swaps go through up to two tokens in between when that delivers more than the direct pair, reviewed and confirmed once.
- **NFT market calls decoded**: buying, listing and delisting on the QRDX NFT market say what they do ("Buy QRDX Logo #1 for 200.5 USDC"), and a token-priced purchase lists the token it spends and the NFT it receives instead of "0 QRDX".
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
- dApp approvals said a call that sends QRDX would fail: QRDX nodes run `eth_call` without the value. Such calls are now checked by a gas estimate that carries the value, and revert data the node prints as a Python bytes literal is decoded.
- **Post-quantum EVM transactions ran out of gas.** The node answers `eth_estimateGas` with `type: 0x51` with the envelope floor alone, so a contract call or deployment from the 0xPQ account got the floor plus 30,000 gas. The wallet now estimates the call as an ordinary EVM transaction and adds the envelope (verification and key and signature bytes), with 10 % headroom: in dApp requests (`qrdx_sendPQTransaction`) and in its own sends.
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
