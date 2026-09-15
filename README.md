# QRDX Wallet

A professional multi-platform cryptocurrency wallet supporting both browser extension and mobile (iOS/Android) platforms with quantum-resistant cryptography.

## Features

- **Multi-Platform Support**
  - Browser Extension (Chrome, Firefox, Edge)
  - Mobile App (iOS & Android via Expo)
  
- **Quantum-Resistant Security**
  - Post-quantum cryptographic algorithms
  - Secure key storage and encryption
  - Hardware wallet support (planned)

- **User Experience**
  - Clean, modern interface following QRDX design standards
  - Dark/light theme support
  - Multiple wallet management
  - Asset management and tracking
  - Transaction history
  - QR code scanning and generation

## Project Structure

```
qrdx-wallet/
├── src/
│   ├── core/              # Shared business logic
│   │   ├── crypto.ts      # Quantum-resistant cryptography
│   │   ├── storage.ts     # Cross-platform storage abstraction
│   │   ├── types.ts       # TypeScript type definitions
│   │   ├── constants.ts   # App constants and configuration
│   │   └── wallet-manager.ts  # Wallet management logic
│   │
│   ├── shared/            # Shared UI components and utilities
│   │   ├── components/    # React components (web & extension)
│   │   ├── contexts/      # React contexts
│   │   └── lib/          # Utility functions
│   │
│   ├── extension/         # Browser extension specific code
│   │   ├── components/    # Extension UI components
│   │   ├── background.ts  # Background service worker
│   │   ├── popup.tsx      # Extension popup entry point
│   │   └── manifest.*.json # Browser-specific manifests
│   │
│   └── mobile/           # Expo/React Native specific code
│       ├── screens/      # Mobile screens
│       └── App.tsx       # Mobile app entry point
│
├── app.config.js         # Expo configuration
├── tailwind.config.js    # Tailwind CSS configuration
├── package.json         # Dependencies and scripts
└── scripts/
    └── build-extension.js # esbuild configuration for extension
```

## Development

### Prerequisites

- Node.js 18+
- pnpm 10.6.4+
- Expo CLI (for mobile development)

### Installation

```bash
# Install dependencies
pnpm install
```

### Local QRDX Testnet

The wallet develops against a real QRDX node rather than a mock. `scripts/local-chain.sh`
wraps the node in `ref/qrdx-chain` and adds the things that make it usable day to day:
it puts the chain's virtualenv on PATH, makes liboqs discoverable, and waits for the
JSON-RPC surface to actually answer before reporting success.

```bash
./scripts/local-chain.sh doctor    # check prerequisites without starting anything
./scripts/local-chain.sh up        # start the node, wait until RPC responds
./scripts/local-chain.sh status    # one-shot health report (exit 0 = healthy)
./scripts/local-chain.sh watch     # continuous health check, reports block production
./scripts/local-chain.sh logs      # tail the node log
./scripts/local-chain.sh fund 0x... 10   # send test QRDX to an address
./scripts/local-chain.sh down      # stop
```

`pnpm chain:up`, `chain:down`, `chain:status`, `chain:watch` and `chain:logs` are
shorthands for the same commands.

The local network is **chain ID 9999**, with JSON-RPC at `http://127.0.0.1:3007/rpc`.
Note that `testnet.sh` also sets `QRDX_RPC_PORT=8545`, but the node never binds a
listener there — `/rpc` on the node API port is the working endpoint.

`watch` reports the block height each poll, so a node that is up but wedged (RPC
answering, height frozen) is visible. From the wallet's side that state is otherwise
indistinguishable from a healthy chain.

### Post-Quantum Accounts

Every wallet has two on-chain identities, and they are separate accounts with
separate holdings:

| | Address | Signature | Layer |
|---|---|---|---|
| EVM | `0x…` (20 bytes) | secp256k1 / ECDSA | EVM account state |
| Post-quantum | `0xPQ…` (32 bytes) | ML-DSA-65 (FIPS 204) | Native UTXO |

PQ signing uses [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum),
a pure-TypeScript FIPS 204 implementation — no native module, no WASM, so it
runs unchanged in the extension, the web app and React Native. The node verifies
with liboqs and `qrdx/crypto/pq/dilithium.py` states it has no fallback, so the
two must agree byte-for-byte. `tests/integration/pq-liboqs.test.ts` checks both
directions against the node's own liboqs build, and checks that address
derivation matches the node's `public_key_to_address`.

PQ keys are derived from the BIP-39 recovery phrase under a domain-separated
seed, so the phrase restores the PQ account too. They are deliberately **not**
derived from the account's secp256k1 key: that would make the post-quantum key
only as strong as the classical one, against exactly the adversary ML-DSA exists
to defend against. Accounts imported from a raw private key are the exception —
there is no independent entropy to recover from, so their PQ key inherits the
imported key's security.

Two current limitations, both surfaced in the UI rather than hidden:

- **A PQ address cannot receive an EVM transfer.** The transaction recipient
  field is 20 bytes; a PQ address is 32. Send rejects `0xPQ…` recipients with
  that explanation.
- **Sending *from* a PQ address is not implemented.** It needs a native-layer
  transaction signed with the ML-DSA key, not the EVM transaction the send
  screen builds. The Send screen blocks PQ mode and says so.

Wallets created by earlier builds hold placeholder PQ material (public keys were
a repeated SHA-256 digest). Those records are repaired automatically on unlock.

### Testing

```bash
pnpm typecheck          # TypeScript, strict
pnpm test               # unit + integration (integration skips with no node running)
pnpm test:unit          # pure unit tests, no chain needed
node tests/e2e/ui-check.mjs     # browser: onboarding, network switching, balances
node tests/e2e/send-check.mjs   # browser: send validation and a real broadcast
```

The end-to-end scripts drive a real browser against a running dev server and the
local chain. Start both first (`./scripts/local-chain.sh up` and `pnpm dev -- -p 3100`).

### Browser Extension Development

```bash
# Development mode with hot reload
pnpm dev:extension

# Build for production
pnpm build:extension

# Package for distribution
pnpm package:chrome
pnpm package:firefox
```

The built extension will be in `dist/chrome/` or `dist/firefox/`.

#### Loading the Extension

**Chrome/Edge:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/chrome/` directory

**Firefox:**
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in `dist/firefox/` directory

### Mobile Development

```bash
# Start Expo development server
pnpm dev:mobile

# Run on Android
pnpm run android

# Run on iOS
pnpm run ios
```

## Architecture

### Core Modules

The wallet is built with a shared core that works across all platforms:

- **crypto.ts**: Implements quantum-resistant cryptographic operations
- **storage.ts**: Platform-agnostic storage interface with implementations for:
  - Browser extension (chrome.storage API)
  - Mobile (Expo SecureStore)
- **wallet-manager.ts**: Business logic for wallet operations
- **types.ts**: Comprehensive TypeScript types for type safety

### Platform-Specific Code

**Browser Extension:**
- Uses esbuild for fast, modern bundling
- Manifest V3 for Chrome/Edge
- Manifest V2 for Firefox
- React-based popup UI with Tailwind CSS
- Follows QRDX design system conventions

**Mobile App:**
- Built with Expo for cross-platform development
- React Native for native UI components
- Expo SecureStore for encrypted storage
- React Navigation for app navigation

## Security

- Private keys are encrypted with AES-256-GCM
- Password-based key derivation using PBKDF2 (100,000 iterations)
- Quantum-resistant signature schemes (implementation in progress)
- Secure storage:
  - Extension: chrome.storage.local
  - Mobile: Expo SecureStore (iOS Keychain / Android Keystore)

## Roadmap

- [ ] Complete quantum-resistant cryptography integration
- [ ] Hardware wallet support (Ledger, Trezor)
- [ ] Multi-signature wallet support
- [ ] DApp integration (WalletConnect)
- [ ] Token swap integration
- [ ] NFT support
- [ ] Advanced transaction features (batch, scheduled)
- [ ] Biometric authentication
- [ ] Cloud backup (encrypted)

## Contributing

Please follow the coding standards established in other QRDX projects:
- Use TypeScript with strict mode
- Follow the existing component structure
- Use Tailwind CSS for styling (web/extension)
- Use StyleSheet for React Native styling (mobile)
- Write clean, documented code

## License

ISC License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [qrdx-org/qrdx-wallet](https://github.com/qrdx-org/qrdx-wallet/issues)
- Discord: [QRDX Community](https://discord.gg/qrdx)
- Email: support@qrdx.org

