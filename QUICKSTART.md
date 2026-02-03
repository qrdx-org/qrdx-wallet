# QRDX Wallet - Quick Start Guide

## For Users

### Browser Extension

1. **Download** the extension from:
   - [Chrome Web Store](#) (coming soon)
   - [Firefox Add-ons](#) (coming soon)

2. **Install** by clicking "Add to Browser"

3. **Setup**:
   - Click the QRDX Wallet icon
   - Choose "Create New Wallet" or "Import Existing Wallet"
   - Set a strong password
   - **IMPORTANT**: Save your recovery phrase securely!

4. **Start Using**:
   - Send and receive QRDX tokens
   - Connect to DApps
   - Manage your assets

### Mobile App

1. **Download** from:
   - [App Store](#) (iOS - coming soon)
   - [Play Store](#) (Android - coming soon)

2. **Install** and open the app

3. **Setup**: Same as browser extension

## For Developers

### Quick Start

```bash
# Clone the repository
git clone https://github.com/qrdx-org/mono.git
cd mono/qrdx-wallet

# Install dependencies
pnpm install

# Start development
pnpm dev:extension  # For browser extension
# OR
pnpm dev:mobile     # For mobile app
```

### Browser Extension

```bash
# Build
pnpm build:extension

# Package for distribution
pnpm package:chrome
pnpm package:firefox

# Load in browser
# Chrome: chrome://extensions -> Load unpacked -> select dist/chrome
# Firefox: about:debugging -> Load Temporary Add-on -> select dist/firefox
```

### Mobile App

```bash
# Start Expo
pnpm dev:mobile

# Run on device
# Scan QR code with Expo Go app
# Or press 'a' for Android, 'i' for iOS
```

## Documentation

- [Full README](README.md) - Complete project documentation
- [Development Guide](docs/DEVELOPMENT.md) - Detailed development instructions
- [Security Architecture](docs/SECURITY.md) - Security design and best practices

## Support

- **Issues**: [GitHub Issues](https://github.com/qrdx-org/qrdx-wallet/issues)
- **Discord**: [QRDX Community](https://discord.gg/qrdx)
- **Email**: support@qrdx.org

## Important Security Notes

⚠️ **Never share your private keys or recovery phrase**
⚠️ **Always verify the website URL before connecting your wallet**
⚠️ **Use a strong, unique password**
⚠️ **Keep your recovery phrase offline in a secure location**
