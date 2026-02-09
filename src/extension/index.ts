/**
 * src/extension/ barrel export.
 *
 * The three entry points for the browser extension:
 *  - popup.tsx   → React UI rendered in the extension popup
 *  - background.ts → MV3 service worker / background script
 *  - content.ts   → Injected into web pages (window.qrdx provider)
 *
 * Each file is compiled individually by scripts/build-extension.js
 * using esbuild and output into dist/<browser>/.
 */
export {}
