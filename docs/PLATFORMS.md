# Platforms

QRDX Wallet ships to three targets from one codebase. They share every line of
wallet logic (`src/core`) and every screen (`components/`); what differs is where
the keys live, how the wallet unlocks, and what the platform can offer.

The running platform is detected at runtime (`src/shared/platform.ts`), not
chosen at build time. The same web bundle behaves as the web app in a browser
tab and as the iPhone app when launched from the home screen.

| | **Web** (browser tab) | **iPhone PWA** (home screen) | **Browser extension** (Chrome / Firefox) |
|---|---|---|---|
| Built by | `pnpm build` → `out/` | same as web | `pnpm extension:build` → `dist/chrome`, `dist/firefox` |
| Where keys live | in the page | in the page | background service worker |
| Vault storage | `localStorage` | `localStorage` | `chrome.storage.local` |
| Biometric unlock | passkey + PRF where supported | Face ID / Touch ID (iOS 18+) | passkey + PRF where the browser supports it |
| Unlocked across reloads | no — reload locks | no — relaunch locks | yes, until auto-lock or browser close |
| Auto-lock default | 10 min | 5 min | 15 min |
| Lock when hidden | off (configurable) | 30 s (configurable) | n/a (popup closes) |
| dApp provider (`window.ethereum`, `window.qrdx`, EIP-6963) | — | — | ✓ |
| Connect to sites by QR code (QRDX Connect) | ✓ | ✓ | — (uses the provider) |
| Install | browser install prompt | Share → Add to Home Screen | Chrome Web Store / Firefox Add-ons |
| Storage eviction risk | yes (Safari deletes after 7 days unused) | no (installed apps are exempt) | no |
| Offline | app shell cached | app shell cached | bundled |

All three share the onboarding, accounts, send/receive, swap and staking flows,
security settings, and the same vault format. A recovery phrase or keystore
moves between them.

## Web

Runs at `/wallet` of the static export.

- **Sessions end on reload.** There is nowhere in a web page to keep an
  unlocked key that a reload would not also expose to whatever runs next, so
  the data key exists only in memory.
- **Storage can disappear.** Safari's tracking prevention deletes
  script-writable storage for sites not visited in seven days. The wallet asks
  for persistent storage (`navigator.storage.persist()`), shows an install
  prompt, and warns users to keep their recovery phrase. The phrase is the
  real backup on every target.
- **No injected provider.** Web pages cannot inject into other origins. Sites
  connect by QR code instead (QRDX Connect, below).

## iPhone PWA

The web app, installed from Safari with **Share → Add to Home Screen**. When
launched that way the platform reports `ios-pwa`, and the app:

- runs full-screen. The layout uses `viewport-fit=cover` and safe-area insets
  (`.pt-safe` / `.pb-safe`), so nothing sits under the notch or home indicator.
- **is exempt from Safari's 7-day storage eviction**, which is why the
  onboarding and Security screens push installation on iOS.
- unlocks with **Face ID / Touch ID** through a passkey (below). This needs
  iOS 18 or later, with passkeys in iCloud Keychain.
- locks after 30 s in the background by default (Settings → Security → Lock
  when hidden).
- has home-screen shortcuts for **Send** and **Receive** (`manifest.json`
  `shortcuts`, opened as `/wallet?action=…`).

Updates install in the background. When a new version is ready, a banner offers
**Update**; the app never reloads itself mid-flow (`src/pwa/PWAProvider.tsx`,
`public/sw.js`).

## Browser extension

Chrome (MV3, 111+) and Firefox (MV2, 115+). The popup is the same `/wallet`
page; the keys live in the background (`src/extension/background.ts`).

- **The popup talks to the background** for every wallet operation
  (`src/shared/backend.ts`). Only the extension's own pages may make those
  calls; content scripts, which run inside websites, are refused.
- **The session survives** the popup closing and the service worker being
  stopped. The data key is kept in `chrome.storage.session`, which is
  memory-only and cleared when the browser closes, until auto-lock.
- **dApps** see `window.ethereum` (unless another wallet claimed it),
  `window.qrdx`, and an EIP-6963 announcement (`rdns: org.qrdx.wallet`). See
  [DAPP_INTEGRATION.md](DAPP_INTEGRATION.md).
- **Approvals** open in a small window (`popup/index.html#approval=<id>`), one
  at a time. Closing the window rejects the request.
- **Host permissions** (`https://*/*`, localhost) exist so the background can
  call JSON-RPC nodes when signing for dApps, including custom networks.

## QRDX Connect (web and iPhone PWA)

A site shows a QR code (on QRDX Trade: Connect → QRDX Wallet on your phone);
**Connect to a site** on the dashboard scans it with the camera (BarcodeDetector
where available, jsQR on iOS) or takes its pasted link, and a link opened from
the phone camera pairs too. The wallet then serves the site's requests with the
extension's own `ProviderRouter` (`src/shared/remote-sessions.ts`), so the same
permissions and approval screens apply, on the phone.

- Pairing is refused unless the relay attests that the site that opened the
  session is the one the code names.
- Requests are handled while the app is open. A request sent while it is
  closed or locked waits in the relay and appears when the app is opened and
  unlocked; keep the app open while trading.
- Connected sites are listed on the dashboard and in Connect to a site, each
  with Disconnect, which also revokes the site's access.

Protocol and relay: qrdx-trade `docs/CONNECT.md`.

## Biometric unlock (all targets)

Biometric unlock uses a **passkey with the WebAuthn PRF extension**
(`src/shared/passkey.ts`):

1. With biometric unlock on, the wallet creates a platform passkey and asks it
   to evaluate a PRF over a random salt. The authenticator returns a 32-byte
   secret only after Face ID / Touch ID / Windows Hello succeeds.
2. That secret, through HKDF, wraps the vault's data key. The password also
   wraps it, separately (`src/core/vault.ts`).
3. To unlock, the wallet asks the passkey for the same PRF output, unwraps the
   data key, and is open.

The password is never stored. If a device's authenticator cannot do PRF,
biometric unlock is not offered there: an assertion without PRF proves
presence but yields no key, so a "biometric" unlock built on it would have to
leave the key readable in storage.

Passkeys are per site (per `rpId`): one enrolled on `wallet.qrdx.org` does not
unlock the extension, and vice versa. Settings → Security lists each one and
can remove it. Changing the password keeps passkeys working, because they wrap
the same data key.

Support is detected with `PublicKeyCredential.getClientCapabilities()` where
available, and enrolment verifies it regardless.

## Not a target: the Expo app

`src/mobile/` is an earlier React Native (Expo) prototype. It is excluded from
the typecheck and lint, is not built in CI, and does not use the current wallet
API. The iPhone PWA replaces it. Remove it, or bring it back to parity, as a
deliberate decision.
