# QRDX Wallet Architecture

## Overview

QRDX Wallet is a multi-platform cryptocurrency wallet that runs as both a browser extension and a mobile application. The architecture is designed around a shared core with platform-specific implementations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        QRDX Wallet                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Platform Layer                              │
├─────────────────────────────┬───────────────────────────────────┤
│   Browser Extension         │      Mobile App (Expo)            │
│                             │                                   │
│  ┌─────────────────────┐   │   ┌─────────────────────┐        │
│  │ Popup UI (React)    │   │   │ Screens (RN)        │        │
│  │ - Setup             │   │   │ - HomeScreen        │        │
│  │ - Unlock            │   │   │ - SetupScreen       │        │
│  │ - Home              │   │   │ - SendScreen        │        │
│  │ - Send/Receive      │   │   │ - ReceiveScreen     │        │
│  └─────────────────────┘   │   └─────────────────────┘        │
│           │                 │            │                      │
│  ┌─────────────────────┐   │   ┌─────────────────────┐        │
│  │ Background Script   │   │   │ React Navigation    │        │
│  │ - Message Handler   │   │   └─────────────────────┘        │
│  │ - State Manager     │   │                                   │
│  └─────────────────────┘   │                                   │
│           │                 │            │                      │
│  ┌─────────────────────┐   │   ┌─────────────────────┐        │
│  │ chrome.storage      │   │   │ SecureStore         │        │
│  └─────────────────────┘   │   │ (Keychain/Keystore) │        │
│                             │   └─────────────────────┘        │
└─────────────────────────────┴───────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                      Shared Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Shared Components (React)                                │   │
│  │ - WalletContext                                          │   │
│  │ - Utility functions                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                      Core Layer                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ Crypto       │  │ Storage      │  │ Wallet Manager   │     │
│  │              │  │              │  │                  │     │
│  │ - Key Gen    │  │ - Interface  │  │ - Create Wallet  │     │
│  │ - Sign       │  │ - Extension  │  │ - Import         │     │
│  │ - Verify     │  │ - Mobile     │  │ - Sign Tx        │     │
│  │ - Encrypt    │  │ - State Mgmt │  │ - Lock/Unlock    │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ Types        │  │ Constants    │                            │
│  │              │  │              │                            │
│  │ - Wallet     │  │ - Networks   │                            │
│  │ - Account    │  │ - Config     │                            │
│  │ - Transaction│  │              │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                    External Services                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ QRDX RPC     │  │ Explorer API │  │ Price APIs       │     │
│  │ - Mainnet    │  │              │  │                  │     │
│  │ - Testnet    │  │              │  │                  │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Details

### Platform Layer

**Browser Extension:**
- **Popup UI**: React-based interface (375px width)
- **Background Script**: Service worker handling messages and state
- **Storage**: chrome.storage.local API
- **Manifest**: V3 for Chrome/Edge, V2 for Firefox

**Mobile App:**
- **Screens**: React Native components
- **Navigation**: React Navigation stack
- **Storage**: Expo SecureStore (platform-specific encryption)
- **Build**: Expo/EAS Build system

### Shared Layer

- **Components**: Reusable React components
- **Contexts**: React Context API for state management
- **Utilities**: Common helper functions
- **Theme**: Consistent styling (Tailwind for web, StyleSheet for mobile)

### Core Layer

Platform-agnostic business logic:

1. **Crypto Module**
   - Quantum-resistant key generation
   - Transaction signing and verification
   - Data encryption/decryption
   - PBKDF2 password hashing

2. **Storage Module**
   - Abstract storage interface
   - Platform-specific implementations
   - Encrypted wallet state management

3. **Wallet Manager**
   - Wallet creation and import
   - Transaction signing workflow
   - Lock/unlock mechanisms
   - Network management

4. **Types**
   - TypeScript interfaces
   - Type safety across platforms

5. **Constants**
   - Network configurations
   - App configuration
   - Default settings

## Data Flow

### Wallet Creation Flow

```
User Action (Create Wallet)
    │
    ├─→ [Extension] Popup → Background Script
    │       │
    │       └─→ WalletManager.createWallet()
    │
    └─→ [Mobile] Screen → WalletContext
            │
            └─→ WalletManager.createWallet()
                    │
                    ├─→ QuantumCrypto.generateKeyPair()
                    │
                    ├─→ QuantumCrypto.encrypt(privateKey, password)
                    │
                    └─→ WalletStorage.addWallet()
                            │
                            ├─→ [Extension] chrome.storage.local.set()
                            │
                            └─→ [Mobile] SecureStore.setItemAsync()
```

### Transaction Signing Flow

```
User Action (Sign Transaction)
    │
    ├─→ Request password/biometric
    │
    ├─→ WalletManager.signTransaction()
    │       │
    │       ├─→ WalletStorage.getCurrentWallet()
    │       │
    │       ├─→ QuantumCrypto.decrypt(encryptedKey, password)
    │       │
    │       ├─→ QuantumCrypto.sign(transaction, privateKey)
    │       │
    │       └─→ Clear privateKey from memory
    │
    └─→ Broadcast signed transaction to network
```

## Security Architecture

### Encryption Layers

1. **Password Encryption**
   - User password → PBKDF2 (100k iterations) → AES-256-GCM key
   - Encrypts private keys at rest

2. **Platform Encryption**
   - **Extension**: Browser-level encryption of chrome.storage
   - **Mobile**: OS-level encryption (Keychain/Keystore)

3. **Transport Encryption**
   - All network requests over HTTPS
   - Certificate pinning (planned)

### Key Management

- Private keys stored encrypted
- Never exposed to UI layer
- Cleared from memory after use
- Auto-lock on inactivity
- Biometric unlock (mobile)

## Scalability Considerations

### Performance

- Lazy loading of components
- Efficient re-renders with React optimization
- Background sync for balance updates
- Caching of network requests

### Extensibility

- Plugin architecture (planned)
- Support for multiple networks
- Token standard support
- DApp integration ready

## Technology Stack

### Common
- TypeScript 5.8+
- React 19
- Zustand (state management, planned)

### Browser Extension
- esbuild (fast bundling)
- Tailwind CSS 4 (matching QRDX design system)
- webextension-polyfill
- Chrome/Firefox APIs
- Webpack 5
- Tailwind CSS 4
- webextension-polyfill
- Chrome/Firefox APIs

### Mobile
- Expo 52
- React Native
- React Navigation
- Expo SecureStore
- Expo Crypto

### Development
- pnpm (package manager)
- ESLint (linting)
- Prettier (formatting)
- Git (version control)

## Build Process

### Extension Build

```
Source (TypeScript + React)
    │
    └─→ esbuild (fast!)
            │
            ├─→ TypeScript compilation
            ├─→ React JSX transformation (automatic runtime)
            ├─→ Code bundling
            └─→ Tailwind CSS processing
                    │
                    └─→ dist/chrome/ or dist/firefox/
```

### Mobile Build

```
Source (TypeScript + React Native)
    │
    └─→ Expo/Metro
            │
            ├─→ TypeScript compilation
            ├─→ React Native transformation
            ├─→ Asset bundling
            └─→ Platform-specific compilation
                    │
                    ├─→ iOS (Xcode)
                    └─→ Android (Gradle)
```

## Deployment

### Browser Extension
- Chrome Web Store
- Firefox Add-ons
- Edge Add-ons

### Mobile
- Apple App Store
- Google Play Store
- Direct APK/IPA (development)

## Monitoring & Analytics (Planned)

- Error tracking (Sentry)
- Usage analytics (privacy-focused)
- Performance monitoring
- Security incident tracking
