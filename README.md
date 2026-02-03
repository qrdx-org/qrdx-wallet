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

