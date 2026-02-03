# Development Guide

## Getting Started

### Setting Up Development Environment

1. **Install Dependencies**
   ```bash
   cd qrdx-wallet
   pnpm install
   ```

2. **Choose Your Platform**

   **Browser Extension:**
   ```bash
   pnpm dev:extension
   ```

   **Mobile App:**
   ```bash
   pnpm dev:mobile
   ```

## Architecture Overview

### Core Principles

1. **Platform Agnostic Core**: All business logic lives in `src/core/` and works across all platforms
2. **Platform-Specific UI**: Each platform has its own UI implementation
3. **Shared Components**: Common React components in `src/shared/`
4. **Type Safety**: Comprehensive TypeScript types throughout

### Key Modules

#### Core Module (`src/core/`)

**crypto.ts**
- Quantum-resistant key generation
- Transaction signing
- Data encryption/decryption
- Signature verification

**storage.ts**
- Abstract storage interface
- Platform-specific implementations
- Wallet state management

**wallet-manager.ts**
- Wallet creation and import
- Transaction signing
- Balance queries
- Network management

**types.ts**
- All TypeScript interfaces and types
- Ensures type safety across the codebase

#### Shared Module (`src/shared/`)

**contexts/WalletContext.tsx**
- React context for wallet state
- Hooks for accessing wallet functionality
- Platform-agnostic state management

**lib/utils.ts**
- Utility functions
- Address formatting
- Balance formatting
- Date/time helpers

### Platform-Specific Implementation

#### Browser Extension (`src/extension/`)

**Structure:**
```
extension/
├── background.ts        # Service worker for Chrome/Firefox
├── popup.tsx           # Main popup entry point
├── popup.html          # HTML template
├── popup.css           # Tailwind CSS
├── manifest.chrome.json # Chrome manifest v3
├── manifest.firefox.json # Firefox manifest v2
└── components/
    ├── PopupApp.tsx    # Main app component
    └── pages/
        ├── Home.tsx
        ├── Setup.tsx
        └── Unlock.tsx
```

**Background Script:**
- Handles persistent storage
- Manages wallet state
- Processes messages from popup and content scripts
- Handles extension lifecycle events

**Popup:**
- 375px width for consistent UX
- React-based UI with Tailwind CSS
- Communicates with background script via messages

#### Mobile App (`src/mobile/`)

**Structure:**
```
mobile/
├── App.tsx              # Main app component
├── screens/
│   ├── HomeScreen.tsx
│   ├── SetupScreen.tsx
│   ├── UnlockScreen.tsx
│   ├── SendScreen.tsx
│   └── ReceiveScreen.tsx
└── ...
```

**Navigation:**
- React Navigation for screen routing
- Native stack navigator
- Platform-specific transitions

**Storage:**
- Expo SecureStore for encrypted data
- iOS Keychain integration
- Android Keystore integration

## Development Workflow

### Browser Extension Development

1. **Start Development Server:**
   ```bash
   pnpm dev:extension
   ```

2. **Load Extension:**
   - Chrome: Load `dist/chrome/` as unpacked extension
   - Firefox: Load temporary add-on from `dist/firefox/`

3. **Make Changes:**
   - Edit files in `src/extension/` or `src/core/`
   - esbuild watches for changes and rebuilds automatically (fast!)
   - Reload extension in browser to see changes

4. **Build for Production:**
   ```bash
   pnpm build:extension
   ```

5. **Package:**
   ```bash
   pnpm package:chrome
   pnpm package:firefox
   ```

### Mobile Development

1. **Start Expo:**
   ```bash
   pnpm dev:mobile
   ```

2. **Run on Device/Emulator:**
   - Scan QR code with Expo Go app
   - Or press `a` for Android, `i` for iOS

3. **Make Changes:**
   - Edit files in `src/mobile/` or `src/core/`
   - Changes reflect immediately with Fast Refresh

4. **Build for Production:**
   ```bash
   pnpm build:mobile
   ```

## Code Style

### TypeScript

- Use strict mode
- Prefer interfaces over types
- Use explicit return types for functions
- Avoid `any`, use `unknown` if needed

### React

- Functional components only
- Use hooks for state and effects
- Keep components small and focused
- Extract complex logic to custom hooks

### Styling

**Web/Extension:**
- Use Tailwind CSS utility classes
- Follow the design system from other QRDX projects
- Use CSS variables for theming

**Mobile:**
- Use React Native StyleSheet
- Follow iOS/Android design guidelines
- Keep styles close to components

## Testing

### Unit Tests
```bash
pnpm test
```

### Extension Testing
- Test in both Chrome and Firefox
- Test all user flows
- Test storage persistence
- Test background script communication

### Mobile Testing
- Test on both iOS and Android
- Test on different screen sizes
- Test secure storage
- Test navigation flows

## Debugging

### Extension Debugging

**Chrome:**
1. Right-click extension icon → "Inspect popup"
2. Background script: chrome://extensions → "Inspect views: service worker"

**Firefox:**
1. about:debugging → "Inspect"
2. Use Browser Console for background script

### Mobile Debugging

**React Native Debugger:**
```bash
# Open developer menu on device
# Select "Debug with Chrome"
```

**Expo DevTools:**
```bash
# Automatically opens in browser when running expo start
```

## Common Tasks

### Adding a New Screen (Mobile)

1. Create screen component in `src/mobile/screens/`
2. Add route to navigator in `src/mobile/App.tsx`
3. Add navigation types if needed

### Adding a New Feature to Extension

1. Add background script handler if needed
2. Create UI component in `src/extension/components/`
3. Add message types to `src/core/types.ts`
4. Implement in both platforms

### Adding Shared Functionality

1. Add interface to `src/core/types.ts`
2. Implement in `src/core/`
3. Add platform-specific adapters if needed
4. Update WalletContext if state management needed

## Troubleshooting

### Extension Issues

**Extension won't load:**
- Check manifest.json syntax
- Verify all files are in dist folder
- Check browser console for errors

**Popup blank:**
- Check popup.js is built correctly
- Inspect popup for errors
- Verify HTML template is correct

### Mobile Issues

**Metro bundler errors:**
- Clear cache: `expo start -c`
- Delete node_modules and reinstall

**Native module errors:**
- Rebuild app with `expo prebuild --clean`
- Check Expo SDK compatibility

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [QRDX Documentation](https://docs.qrdx.org/)
