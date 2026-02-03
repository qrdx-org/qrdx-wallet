# Security Architecture

## Overview

QRDX Wallet implements multiple layers of security to protect user assets and private keys across both browser extension and mobile platforms.

## Cryptography

### Quantum-Resistant Algorithms

The wallet is designed to support quantum-resistant cryptographic algorithms:

- **Key Generation**: Post-quantum key pair generation
- **Signatures**: Quantum-resistant signature schemes
- **Encryption**: AES-256-GCM for data encryption

### Current Implementation

**Note**: The current implementation uses placeholder cryptography. Production implementation will use:
- CRYSTALS-Dilithium for signatures
- CRYSTALS-Kyber for key exchange
- Integration with QRDX blockchain quantum-resistant protocols

### Password-Based Encryption

Private keys are encrypted using:
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with SHA-256
- **Iterations**: 100,000
- **Salt**: 16 random bytes per encrypted item
- **IV**: 12 random bytes per encryption

## Storage Security

### Browser Extension

**Storage Location**: `chrome.storage.local`

**Security Features:**
- Isolated per-extension storage
- Encrypted at rest by browser
- No cross-extension access
- Additional encryption layer for private keys

**Data Structure:**
```typescript
{
  version: "1.0.0",
  initialized: true,
  locked: true,
  currentWalletId: "wallet_123",
  wallets: [
    {
      id: "wallet_123",
      name: "Main Wallet",
      encryptedPrivateKey: "...", // Encrypted with user password
      publicKey: "...",
      address: "...",
      createdAt: 1234567890
    }
  ],
  currentNetwork: { ... },
  settings: { ... }
}
```

### Mobile App

**Storage Location**: Expo SecureStore

**Platform-Specific:**
- **iOS**: Keychain Services
  - Hardware-backed encryption (when available)
  - Biometric protection (Face ID/Touch ID)
  - Accessible only when device unlocked
  
- **Android**: EncryptedSharedPreferences
  - Android Keystore System
  - Hardware-backed encryption (when available)
  - Biometric protection

**Additional Security:**
- All data encrypted with device-specific keys
- Private keys double-encrypted (device + password)
- Automatic wipe on tamper detection (planned)

## Authentication

### Password Requirements

Enforced password requirements:
- Minimum 8 characters
- Mix of uppercase and lowercase
- At least one number
- At least one special character

### Auto-Lock

**Extension:**
- Lock after inactivity (default: 15 minutes)
- Lock on browser close (optional)
- Lock on computer lock

**Mobile:**
- Lock after inactivity (default: 5 minutes)
- Lock on app background (optional)
- Require biometric on unlock (optional)

## Transaction Signing

### Flow

1. User initiates transaction
2. App requests password (or biometric)
3. Private key decrypted in memory
4. Transaction signed
5. Private key immediately cleared from memory
6. Signed transaction broadcast

### Security Measures

- Private keys never exposed to UI
- Signing happens in isolated context
- Memory cleared after signing
- User confirmation required for all transactions

## Network Security

### API Communication

- HTTPS only
- Certificate pinning (planned)
- Request signing for authenticated endpoints
- Rate limiting protection

### RPC Endpoints

- Trusted node list
- Fallback nodes for reliability
- Connection encryption
- Request/response validation

## Threat Model

### Protected Against

✅ Malicious websites stealing keys
✅ Man-in-the-middle attacks (HTTPS)
✅ Dictionary attacks (PBKDF2 iterations)
✅ Brute force (auto-lock, rate limiting)
✅ Physical device theft (encryption, biometric)
✅ Malicious apps accessing storage (platform isolation)

### Not Protected Against

⚠️ Keyloggers on compromised devices
⚠️ Physical access with device password
⚠️ Advanced persistent threats (APT)
⚠️ Phishing attacks (user education required)
⚠️ Compromised dependencies (supply chain)

### Planned Protections

🔄 Hardware wallet integration
🔄 Multi-signature wallets
🔄 Time-locked transactions
🔄 Social recovery
🔄 Advanced threat detection

## Best Practices for Developers

### Handling Private Keys

```typescript
// ✅ Good: Decrypt, use, and clear immediately
const privateKey = await decrypt(encryptedKey, password)
const signature = await sign(data, privateKey)
privateKey = null // Clear from memory

// ❌ Bad: Storing decrypted key in state
setState({ privateKey: await decrypt(...) })
```

### Error Handling

```typescript
// ✅ Good: Don't leak sensitive information
catch (error) {
  log('Operation failed')
  throw new Error('Operation failed')
}

// ❌ Bad: Exposing internal details
catch (error) {
  throw new Error(`Decryption failed: ${error.message}`)
}
```

### Logging

```typescript
// ✅ Good: Log actions without sensitive data
log('Transaction signed', { txHash, from, to, value })

// ❌ Bad: Logging private keys or passwords
log('Signing with key:', privateKey)
```

## Security Checklist

### Before Release

- [ ] All API calls use HTTPS
- [ ] Private keys are encrypted at rest
- [ ] Private keys are cleared from memory after use
- [ ] Password requirements enforced
- [ ] Auto-lock implemented and tested
- [ ] No sensitive data in logs
- [ ] No sensitive data in error messages
- [ ] Input validation on all user inputs
- [ ] Content Security Policy configured
- [ ] Dependencies audited for vulnerabilities
- [ ] Security review completed
- [ ] Penetration testing completed

### Regular Maintenance

- [ ] Dependency security audits
- [ ] Review and update cryptographic algorithms
- [ ] Monitor for new attack vectors
- [ ] Update threat model
- [ ] Security patches applied promptly

## Incident Response

### In Case of Security Issue

1. **Immediately**:
   - Assess severity and impact
   - Disable affected features if critical
   - Notify security team

2. **Short-term**:
   - Develop and test fix
   - Prepare security advisory
   - Plan coordinated disclosure

3. **Long-term**:
   - Release security update
   - Notify affected users
   - Conduct post-mortem
   - Update security practices

## Reporting Security Issues

**Do not** open public GitHub issues for security vulnerabilities.

**Do** email: security@qrdx.org

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 48 hours and resolve critical issues within 7 days.

## Compliance

### Standards

- OWASP Top 10
- CWE/SANS Top 25
- Platform-specific security guidelines

### Audits

- Regular security audits planned
- Third-party penetration testing
- Community bug bounty program (planned)

## Resources

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [iOS Keychain Services](https://developer.apple.com/documentation/security/keychain_services)
- [Android Keystore](https://developer.android.com/training/articles/keystore)
