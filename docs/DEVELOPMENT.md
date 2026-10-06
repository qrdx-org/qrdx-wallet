# Development

The commands are in the [README](../README.md#development). This page covers how
to work on the code.

## Layout

```
app/                 Next.js routes: / (landing), /wallet (the wallet UI)
components/          UI — WalletHome routes between onboarding, unlock, dashboard, approvals
  wallet/flow/       shared flow building blocks (passwords, phrases, sheets)
  wallet/onboarding/ create / import
  wallet/settings/   Accounts and Security pages
  wallet/approval/   extension approval window
src/core/            wallet logic, crypto and protocol — no DOM, runs in Node for tests
src/shared/          backend selection, platform detection, passkeys, React context
src/extension/       background, content script, in-page provider, dApp router
src/pwa/             service-worker lifecycle, install prompt, storage persistence
public/              manifest.json, sw.js, icons
scripts/             build-extension.js, local-chain.sh
tests/unit/          vitest
tests/conformance/   node-generated vectors + generator
tests/e2e/           Playwright scripts against the static export and the built extension
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces connect.

## Rules of the codebase

- **Wallet logic lives in `src/core` only.** Components call `useWallet()`;
  they never import crypto or touch storage.
- **Keys never leave `WalletManager`** except through its password-gated
  export methods. New signing features are new `WalletManager` methods, added to
  `BACKEND_METHODS` in `src/shared/backend.ts` so the extension can reach them.
- **Everything crossing the extension boundary is JSON.** No `bigint`, `Uint8Array`
  or class instances in `WalletManager` arguments or return values. Pass decimal
  strings and hex.
- **Protocol encodings must match the node byte for byte.** Change them only
  with a regenerated conformance vector (`pnpm conformance:generate`) that
  proves the new bytes.
- **Gate features by platform capability** (`detectPlatform()`, `passkeySupport()`),
  never by build flags. One bundle serves web, PWA and the extension popup.
- **Don't define components inside other components.** It remounts their
  inputs on every render.
- **Be honest in the UI.** If the network does not support something yet,
  say so rather than simulating it.

## Common tasks

**Add a dApp method:** extend `ProviderRouter.handle` in
`src/extension/provider/router.ts`, add an approval kind if it needs the user,
render it in `ApprovalScreen.tsx`, and add a case to
`tests/unit/provider-router.test.ts`. Document it in [DAPP_INTEGRATION.md](DAPP_INTEGRATION.md).

**Add an exchange operation in the UI:** call
`useWallet().submitExchangeOp(op, params)`, then
`waitForExchangeReceipt`. Operations and their required params are listed in
`src/core/exchange-tx.ts`.

**Change the vault format:** bump `VAULT_VERSION`, add a migration in
`WalletManager.unlock` (as `migrateV1` does), and add a migration test with a
literal old-format fixture.

**Add a network:** add it to `CHAINS` in `src/core/chains.ts`, with an explicit
`feeModel`. QRDX chains are `legacy`.

## Debugging

- **Web:** React DevTools; wallet state is in `localStorage['qrdx_wallet_state']`
  (encrypted parts are opaque by design).
- **Extension:** inspect the service worker from `chrome://extensions`. The
  popup and approval windows are normal pages (right-click → Inspect).
- **iPhone PWA:** Safari on a Mac → Develop → *your iPhone* → the web app.
- **Settings → Developer** shows platform, backend, vault version, passkey
  support and RPC status. You can copy it into bug reports; it contains no secrets.

## Trading screen and the trade API

The trading screen (and the swap's logos and USD estimates) read the trade API
of the active QRDX network:

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_QRDX_TRADE_URL` | `https://trade.qrdx.org` (mainnet `/api/v1`, testnet `/api/v1-test`) |
| `NEXT_PUBLIC_QRDX_TRADE_LOCAL_API` | `http://127.0.0.1:3100/api/v1-test`: qrdx-trade in development with `NEXT_PUBLIC_QRDX_TEST_NETWORK=local` |

The wallet checks that the API serves the chain it is on before showing
anything from it. Orders are built and signed in the wallet; the API only
supplies market data.
