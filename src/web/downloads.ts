/**
 * Where the landing page sends people for the browser extension. CI builds both browsers
 * on every push to main and publishes them to the `extension` release
 * (.github/workflows/ci.yml, job publish-extension), replacing the files in place, so
 * these URLs always serve main's latest build.
 */

export const REPO_URL = 'https://github.com/qrdx-org/qrdx-wallet'

const RELEASE = `${REPO_URL}/releases/download/extension`

export const DOWNLOADS = {
  chrome: `${RELEASE}/qrdx-wallet-chrome.zip`,
  firefox: `${RELEASE}/qrdx-wallet-firefox.zip`,
  checksums: `${RELEASE}/SHA256SUMS`,
  /** The release page: notes, the commit it was built from, both files. */
  release: `${REPO_URL}/releases/tag/extension`,
  /** Every CI run, each with its own `qrdx-wallet-chrome` / `qrdx-wallet-firefox` artifacts. */
  ciRuns: `${REPO_URL}/actions/workflows/ci.yml?query=branch%3Amain`,
} as const
