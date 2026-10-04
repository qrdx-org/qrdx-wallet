# Security

How QRDX Wallet protects keys, and where the limits are. Report vulnerabilities
privately to **security@qrdx.org**, not in a public issue.

## Keys

- **Classic key:** secp256k1 via `ethereum-cryptography` (audited noble
  libraries). BIP-39 phrase, BIP-32 path `m/44'/60'/0'/0/i`.
- **Post-quantum key:** ML-DSA-65 (FIPS 204, formerly Dilithium3) via
  `@noble/post-quantum`. It is verified byte-for-byte against liboqs, the
  library the node uses. Its 32-byte seed is derived from the BIP-39 seed with
  HMAC-SHA-512 under a versioned domain tag, so **the recovery phrase restores
  both keys** of every account.
- **Imported private keys** get a PQ key derived from the classic key. That
  key is reproducible but only as strong as secp256k1, and the UI labels such
  accounts "classical PQ". Keystores exported by this wallet carry the real PQ
  seed.

## The vault (v2)

```
data key (DEK, 32 random bytes) ── AES-256-GCM ──▶ every keyring secret
password ── PBKDF2-SHA256 (600,000, per-vault salt) ──▶ KEK ── wraps DEK
passkey  ── WebAuthn PRF (32 bytes) ── HKDF-SHA256 ──▶ KEK ── wraps DEK   (optional, per device)
```

- **Every sealed blob is bound to its slot** with AES-GCM additional data.
  A blob moved to another record fails to decrypt.
- **Changing the password re-wraps the DEK only.** No secret is
  re-encrypted, so none can be left under the old password. Passkeys keep
  working.
- **While unlocked, only the DEK is held**, as a non-extractable `CryptoKey`.
  The password is not kept. Decrypted key material is wiped after each use
  (best effort in JavaScript).
- **Exports** (recovery phrase, private keys, keystore) **always require the
  password again**. Copied secrets are cleared from the clipboard after 60 s.
- **The KDF parameters are stored per vault**, so the iteration count can rise
  later without breaking existing vaults.
- v1 vaults (each secret encrypted directly under the password, PBKDF2 100k)
  are migrated on the first unlock. The v1 blob is kept until the v2 vault
  has been written and read back.

## Unlocking

- **Throttling.** Five free attempts, then 30 s doubling to a 1 h cap. The
  state is persisted, so restarting the app does not reset it. Exports and
  account removal count toward the same limit.
- **Auto-lock** after inactivity (default 5–15 min by platform; "never" warns).
  Activity extends the deadline. The deadline is enforced on every key use,
  not only by a timer.
- **Lock when hidden** (iPhone PWA default 30 s).
- **Biometrics** use a passkey PRF secret, never a stored password; see
  [PLATFORMS.md](PLATFORMS.md#biometric-unlock-all-targets). Without PRF
  support, biometric unlock is unavailable rather than weakened.
- **Extension sessions** survive service-worker restarts through
  `chrome.storage.session`, which is memory-only, cleared on browser close,
  and not readable by content scripts. They still end at the auto-lock
  deadline.

## dApps (extension)

Trust boundaries, from least to most trusted:

1. **The web page.** It can call `window.ethereum.request` and nothing else.
   It cannot replace `window.qrdx`.
2. **The content script** only relays. The page origin the background uses
   comes from the browser (`port.sender`), not from any message.
3. **The background** applies `provider/router.ts`:
   - unknown methods → `4200`
   - `eth_sign` is disabled
   - read-only calls go to the node
   - everything account-related requires a connected origin
   - every signature and transaction opens an approval window showing the
     real origin, the decoded call, and the maximum fee
   - typed data bound to another chain is refused
   - an origin can have at most 3 pending approvals
4. **Extension pages** (popup, approval windows) are the only senders allowed
   to call wallet methods (`isTrustedSender`).

## Network

- **Chain identity is verified** against the live node before signing
  (`chain-identity.ts`). A mismatch blocks signing until the user explicitly
  trusts it.
- **On QRDX, recipients are resolved to their 20-byte account ID.** An `0xPQ`
  address can never be truncated into a wrong `to`. Protocol-owned holders
  (`0xPOOL`/`0xCLOB`/`0xPERP`) are refused as recipients.
- **Nonces use `pending`**, so back-to-back sends don't collide.
- **The service worker never caches cross-origin responses** (RPC, prices).

## Known limits

- **JavaScript memory.** Wiping keys in JavaScript is best effort. A
  compromised browser or OS can read keys while the wallet is unlocked.
- **Web storage eviction.** Web-tab storage can be evicted. The recovery
  phrase is the backup on every target.
- **Weak passwords.** The vault is only as strong as its password against
  offline guessing. The strength meter is advisory beyond the 8-character
  minimum.
- **Chain IDs.** QRDX chain IDs are not yet registered or unique (see
  [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) §1).
- **No hardware wallets yet.** No hardware wallet supports ML-DSA.

## Before a release

- [ ] Third-party audit of `src/core/vault.ts`, `wallet-manager.ts`, `keystore.ts`, `pq-tx.ts`, `exchange-tx.ts` and `src/extension/`
- [ ] `pnpm audit` clean; SBOM published
- [ ] Reproducible extension build; store submission reviewed
- [ ] Conformance vectors regenerated against the release node (`pnpm conformance:generate`)
- [ ] Bug bounty live
