# QRDX Wallet

A self-custody wallet for QRDX and EVM networks. Every account has a classic
(secp256k1) and a post-quantum (ML-DSA-65) credential, both restorable from one
recovery phrase.

**Three targets, one codebase:**

- **Web** — runs in any browser tab at `/wallet`.
- **iPhone app** — the same web app installed to the home screen, with Face ID unlock.
- **Browser extension** — Chrome and Firefox, with a dApp provider (`window.ethereum`, `window.qrdx`, EIP-6963).

Each target has its own feature set; see [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Features

- **Wallets:** create (12 or 24 words, with backup verification), or import a recovery phrase, private key, or keystore (V3 from MetaMask, geth or this wallet).
- **Accounts:** many accounts from one phrase, discovery of used accounts, rename, remove, and exports of phrase, keys or keystore (password required).
- **Unlocking:** password or biometrics (passkey PRF; Face ID on iPhone), with auto-lock, lock-when-hidden, and unlock throttling.
- **Sending:** from either credential. Type-`0x51` post-quantum transactions on QRDX; any recipient form (`0x`, `0xPQ`, `0xPQMS`) resolved to its ledger account.
- **QRDX native:** swap on the built-in exchange; stake by running a validator; token discovery; read-only perps overview.
- **dApps (extension):** EIP-1193, EIP-6963, EIP-712, EIP-2255, a `qrdx_*` namespace, and an approval window with decoded calls.

## Development

Requirements: Node 22, pnpm 10, and Bun (used by the extension build script).

```bash
pnpm install
pnpm dev                 # web app on http://localhost:3000/wallet
pnpm typecheck
pnpm lint
pnpm test:unit           # core, vault, protocol conformance, provider policy
pnpm build               # static export → out/
pnpm extension:build     # Chrome + Firefox → dist/chrome, dist/firefox
pnpm test:e2e            # real-browser tests (run after extension:build)
pnpm verify              # all of the above
```

The first `test:e2e` run needs Chromium: `pnpm exec playwright install --with-deps chromium`.

### Loading the extension

- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`
- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`

### Testing on an iPhone

Serve the static export (`out/`) over HTTPS — passkeys and service workers
need a secure origin — then open `/wallet` in Safari, tap **Share → Add to Home
Screen**, and launch it from the home screen.

### Local QRDX node

The wallet develops against a real QRDX node. `scripts/local-chain.sh` finds
the node checkout (`$QRDX_NODE_DIR`, else `../qrdx-node`, else `ref/qrdx-chain`)
and runs a single-node testnet:

```bash
pnpm chain:up        # start; waits until JSON-RPC answers
pnpm chain:status    # health (exit 0 = healthy)
pnpm chain:watch     # continuous, reports block height
pnpm chain:logs
pnpm chain:down
bash scripts/local-chain.sh fund 0x… 10   # test QRDX
```

The local network is **chain ID 9999**, with JSON-RPC at `http://127.0.0.1:3007/rpc`.
Select "QRDX Local Testnet" in the network menu (enable testnets in Settings).

### Node conformance

The wallet must encode QRDX transactions byte-for-byte as the node does.
`tests/conformance/vectors.json` is generated **by the node's own code**:

```bash
pnpm conformance:generate   # needs ../qrdx-node; plain python3, no packages
```

Regenerate after any node protocol change. CI checks the wallet against these vectors.

## Documentation

| | |
|---|---|
| [docs/PLATFORMS.md](docs/PLATFORMS.md) | Web vs iPhone PWA vs extension, biometrics, storage |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code map |
| [docs/SECURITY.md](docs/SECURITY.md) | Vault, unlocking, dApp trust boundaries, known limits |
| [docs/DAPP_INTEGRATION.md](docs/DAPP_INTEGRATION.md) | Provider API for dApp developers |
| [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | What's done and what remains for 1.0 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Contributor notes |

## License

ISC
