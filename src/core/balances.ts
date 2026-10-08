/**
 * One view of an account's holdings across its two credentials.
 *
 * On QRDX a wallet account is two ledger accounts: the classic 0x address and the
 * post-quantum 0xPQ address (keyed by its 20-byte account id). Exchange balances
 * (everything traded, pooled or launched) live in the PQ account, so a list built
 * from the classic balances alone shows every token at zero. This merges both,
 * per token, keeping each side so the UI can say where the funds are.
 */

import type { TokenBalance } from './ethereum'

export interface HeldBalance extends TokenBalance {
  /** In the classic 0x account, raw units. */
  classicRaw: bigint
  /** In the post-quantum account, raw units. */
  pqRaw: bigint
}

const key = (b: Pick<TokenBalance, 'address'>) => b.address.toLowerCase()

/**
 * Sum the two credentials' balances per token. The native coin (address '') is
 * always kept; other tokens only when either side holds some, unless `keepZero`
 * lists them (tokens the user chose to watch).
 */
export function mergeCredentialBalances(classic: TokenBalance[], pq: TokenBalance[], keepZero: Iterable<string> = []): HeldBalance[] {
  const keep = new Set([...keepZero].map((a) => a.toLowerCase()))
  const out = new Map<string, HeldBalance>()
  const add = (b: TokenBalance, side: 'classicRaw' | 'pqRaw') => {
    const k = key(b)
    const cur = out.get(k) ?? { ...b, rawBalance: 0n, formattedBalance: '0', classicRaw: 0n, pqRaw: 0n }
    cur[side] += b.rawBalance
    cur.rawBalance = cur.classicRaw + cur.pqRaw
    cur.formattedBalance = formatUnitsExact(cur.rawBalance, cur.decimals)
    out.set(k, cur)
  }
  for (const b of classic) add(b, 'classicRaw')
  for (const b of pq) add(b, 'pqRaw')
  return [...out.values()].filter((b) => b.address === '' || b.rawBalance > 0n || keep.has(key(b)))
}

/** Raw units as an exact decimal string, trailing zeros trimmed ("1234.5", "0"). */
export function formatUnitsExact(raw: bigint, decimals: number): string {
  const neg = raw < 0n
  const v = neg ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = decimals ? (v % base).toString().padStart(decimals, '0').replace(/0+$/, '') : ''
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

/**
 * For display: thousands separators, at most `places` decimals (truncated, never
 * rounded up past what is held), and "<0.0001" for a holding too small to show.
 */
export function formatAmount(raw: bigint, decimals: number, places = 4): string {
  if (raw === 0n) return '0'
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const scale = 10n ** BigInt(Math.max(0, decimals - places))
  const fracUnits = decimals > places ? (raw % base) / scale : (raw % base) * 10n ** BigInt(places - decimals)
  const frac = fracUnits.toString().padStart(places, '0').replace(/0+$/, '')
  if (whole === 0n && !frac) return `<0.${'0'.repeat(places - 1)}1`
  return `${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

/** The credential that holds funds: the post-quantum one on QRDX unless only the classic one holds anything. */
export function defaultCredential(classic: TokenBalance[], pq: TokenBalance[], qrdx: boolean): 'classic' | 'pq' {
  if (!qrdx) return 'classic'
  const holds = (list: TokenBalance[]) => list.filter((b) => b.rawBalance > 0n).length
  return holds(pq) === 0 && holds(classic) > 0 ? 'classic' : 'pq'
}
