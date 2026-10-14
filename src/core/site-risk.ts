/**
 * Warnings about the site asking for something, from its origin alone: a look-alike of a
 * well-known wallet, exchange or QRDX domain, internationalised (punycode) names that can
 * render as another name, bare IP addresses and plain HTTP.
 *
 * This is a heuristic on the name: no blocklist of known scam sites is consulted (there is
 * no such service for QRDX yet), so a site with an unremarkable name passes.
 */

/** Domains people are tricked into thinking they are on. Subdomains of these are genuine. */
export const KNOWN_DOMAINS = [
  'qrdx.org',
  'uniswap.org',
  'phantom.app',
  'phantom.com',
  'metamask.io',
  'opensea.io',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'ledger.com',
  'trezor.io',
  'etherscan.io',
  'walletconnect.com',
  'lido.fi',
  'aave.com',
  'curve.fi',
  'pancakeswap.finance',
  'sushi.com',
  '1inch.io',
] as const

export interface SiteRisk {
  level: 'none' | 'caution' | 'danger'
  warnings: string[]
}

export function assessOrigin(origin: string): SiteRisk {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return { level: 'caution', warnings: ['The site did not identify itself with a web address.'] }
  }
  const host = url.hostname.toLowerCase()
  const warnings: string[] = []
  let danger = false
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

  if (local) return { level: 'none', warnings: [] }
  if (url.protocol === 'http:') warnings.push('This site is not using HTTPS. Anyone on your network could alter what it asks you to sign.')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('This site is a bare IP address, not a named website.')

  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    danger = true
    warnings.push(`${host} uses international characters that can look like ordinary letters. Check the name letter by letter.`)
  }

  const site = registrable(host)
  if (!KNOWN_DOMAINS.includes(site as (typeof KNOWN_DOMAINS)[number])) {
    const look = KNOWN_DOMAINS.find((d) => looksLike(site, d) || containsBrand(host, d))
    if (look) {
      danger = true
      warnings.push(`${host} is not ${look}, but its name resembles it. Phishing sites copy well-known names.`)
    }
  }

  return { level: danger ? 'danger' : warnings.length ? 'caution' : 'none', warnings }
}

/** The last two labels ("app.uniswap.org" → "uniswap.org"); good enough for the domains above. */
export function registrable(host: string): string {
  const parts = host.split('.').filter(Boolean)
  return parts.slice(-2).join('.')
}

/** One or two edits apart, or the same name under another ending ("uniswap.com" for "uniswap.org"). */
function looksLike(site: string, known: string): boolean {
  const [name, tld] = [site.slice(0, site.lastIndexOf('.')), site.slice(site.lastIndexOf('.') + 1)]
  const [kName, kTld] = [known.slice(0, known.lastIndexOf('.')), known.slice(known.lastIndexOf('.') + 1)]
  if (name === kName && tld !== kTld) return true
  const unconfused = (s: string) => s.replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/rn/g, 'm').replace(/vv/g, 'w')
  if (unconfused(name) === unconfused(kName)) return name !== kName || tld !== kTld
  return kName.length >= 5 && editDistance(name, kName) <= (kName.length >= 8 ? 2 : 1)
}

/** The brand's name inside another domain ("uniswap-airdrop.xyz", "qrdx.claim-rewards.io"). */
function containsBrand(host: string, known: string): boolean {
  const brand = known.slice(0, known.lastIndexOf('.'))
  if (brand.length < 4 || /^\d/.test(brand)) return false
  return host.split(/[.-]/).some((label) => label === brand) || host.replace(/[.-]/g, '').includes(brand + 'airdrop') || host.includes(`${brand}-`)
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}
