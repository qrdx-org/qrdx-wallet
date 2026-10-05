/**
 * Human-readable descriptions of native exchange operations, for the approval
 * window. A dApp sends `{ op, params }` with token ADDRESSES; this turns them
 * into "Buy 0.5 qBTC at 85,000 qUSDC" so the user approves what they mean to.
 *
 * Token symbols come from the node (`exchange_getToken`) and are never trusted
 * alone: anyone can deploy a token under any symbol, so every token is shown
 * with its address, and an address the node does not know is a warning.
 *
 * Semantics follow qrdx-node docs/PERPS_API.md:
 *  - a spot pair is keyed by the SORTED pair; `side` and `amount` refer to the
 *    lower address (token0, the base) and `price` is token1 per token0;
 *  - perps: `size` in the market's base, `price` in its quote, `tif: "ioc"`
 *    fills immediately or not at all.
 */

import type { ExchangeOpName, JsonValue } from './exchange-tx'

export interface TokenInfo {
  symbol: string
  name?: string
}

export interface ExchangeSummary {
  headline: string
  details: { label: string; value: string }[]
  warnings: string[]
}

export interface DescribeContext {
  /** Lower-case token address → info; null = the node does not know it. */
  tokens: Record<string, TokenInfo | null>
  /** For liquidity operations: the pool's tokens and what the deposit costs. */
  pool?: { token0: string; token1: string; price?: string } | null
  liquidityCost?: { amount0: string; amount1: string } | null
}

const TOKEN_KEYS = ['token_in', 'token_out', 'token_address', 'token0', 'token1'] as const

/** Every token address an operation's params mention (lower-case). */
export function tokenAddressesIn(params: Record<string, JsonValue>): string[] {
  const out = new Set<string>()
  for (const k of TOKEN_KEYS) {
    const v = params[k]
    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) out.add(v.toLowerCase())
  }
  if (typeof params.pair === 'string') {
    for (const part of params.pair.split(':')) if (/^0x[0-9a-fA-F]{40}$/.test(part)) out.add(part.toLowerCase())
  }
  return [...out]
}

/** "1234567.50" → "1,234,567.5". Exact: no float conversion. */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim())
  if (!m) return value
  // The node writes 18-place decimals ("1000.000000000000000000"); trailing zeros say nothing.
  const frac = (m[3] ?? '').replace(/\.?0+$/, '')
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + frac
}

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a)
const str = (v: JsonValue | undefined) => (v === undefined || v === null ? '' : String(v))

/** The canonical (sorted) pair, as the node keys books and pools. */
export function canonicalPair(pair: string): [string, string] {
  const [a, b] = pair.split(':')
  return a > b ? [b, a] : [a, b]
}

export function describeExchangeOp(
  op: ExchangeOpName,
  params: Record<string, JsonValue>,
  ctx: DescribeContext
): ExchangeSummary {
  const warnings: string[] = []
  const sym = (address: string | undefined | null) => {
    if (!address) return '?'
    const a = address.toLowerCase()
    const t = ctx.tokens[a]
    if (t === null || t === undefined) {
      if (!warnings.some((w) => w.includes(a))) warnings.push(`Unknown token ${a}. The node has no record of it.`)
      return short(a)
    }
    return t.symbol
  }
  const tokenDetail = (label: string, address: string) => ({
    label,
    value: `${sym(address)} · ${short(address.toLowerCase())}`,
  })

  switch (op) {
    case 'SWAP': {
      const tin = str(params.token_in)
      const tout = str(params.token_out)
      const min = str(params.min_amount_out)
      const details = [tokenDetail('Pay', tin), tokenDetail('Receive', tout)]
      if (params.venue) details.push({ label: 'Venue', value: str(params.venue) })
      if (params.deadline) {
        details.push({ label: 'Expires', value: new Date(Number(params.deadline) * 1000).toLocaleString() })
      }
      if (!min || Number(min) === 0) {
        warnings.push('No minimum output: this swap accepts any price it is given.')
      }
      return {
        headline:
          `Swap ${groupDigits(str(params.amount_in))} ${sym(tin)} for ` +
          (min && Number(min) > 0 ? `at least ${groupDigits(min)} ${sym(tout)}` : `${sym(tout)} at any price`),
        details,
        warnings,
      }
    }

    case 'PLACE_ORDER': {
      const [base, quote] = canonicalPair(str(params.pair))
      const side = str(params.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy'
      const amount = str(params.amount)
      const price = str(params.price)
      const details = [
        tokenDetail('Base', base),
        tokenDetail('Quote', quote),
        { label: 'Type', value: `${str(params.order_type) || 'limit'}` },
      ]
      // The same order read from the other token's side, which is how the app
      // the user is on may have shown it (e.g. "Buy qETH" on an ETH/USDC page).
      const inverse = invert(price)
      if (inverse) {
        details.push({
          label: 'Same as',
          value:
            `${side === 'Buy' ? 'Sell' : 'Buy'} ${groupDigits(trimTo(multiply(amount, price), 8))} ${sym(quote)} ` +
            `at ${groupDigits(trimTo(inverse, 8))} ${sym(base)}`,
        })
      }
      details.push({
        label: side === 'Buy' ? 'Locks up to' : 'Locks',
        value:
          side === 'Buy'
            ? `${groupDigits(multiply(amount, price))} ${sym(quote)} while it rests`
            : `${groupDigits(amount)} ${sym(base)} while it rests`,
      })
      return {
        headline: `${side} ${groupDigits(amount)} ${sym(base)} at ${groupDigits(price)} ${sym(quote)}`,
        details,
        warnings,
      }
    }

    case 'CANCEL_ORDER': {
      const pair = str(params.pair)
      const [base, quote] = pair ? canonicalPair(pair) : ['', '']
      return {
        headline: `Cancel order ${str(params.order_id)}` + (pair ? ` on ${sym(base)}/${sym(quote)}` : ''),
        details: [],
        warnings,
      }
    }

    case 'ADD_LIQUIDITY': {
      const pool = ctx.pool
      const details = [
        { label: 'Pool', value: str(params.pool_id) },
        { label: 'Range (ticks)', value: `${str(params.tick_lower)} to ${str(params.tick_upper)}` },
        { label: 'Liquidity', value: groupDigits(str(params.amount)) },
      ]
      if (pool && ctx.liquidityCost) {
        details.push({
          label: 'Deposit',
          value:
            `${groupDigits(ctx.liquidityCost.amount0)} ${sym(pool.token0)} + ` +
            `${groupDigits(ctx.liquidityCost.amount1)} ${sym(pool.token1)}`,
        })
      } else {
        warnings.push('Could not read the pool to show the deposit. Check the amounts in the app.')
      }
      return {
        headline: pool ? `Add liquidity to ${sym(pool.token0)}/${sym(pool.token1)}` : 'Add liquidity',
        details,
        warnings,
      }
    }

    case 'REMOVE_LIQUIDITY': {
      const pool = ctx.pool
      const all = params.amount === undefined
      return {
        headline:
          (str(params.amount) === '0' ? 'Collect fees' : all ? 'Remove all liquidity' : 'Remove liquidity') +
          (pool ? ` from ${sym(pool.token0)}/${sym(pool.token1)}` : ''),
        details: [
          { label: 'Pool', value: str(params.pool_id) },
          { label: 'Position', value: str(params.position_id) },
          ...(all ? [] : [{ label: 'Liquidity', value: groupDigits(str(params.amount)) }]),
        ],
        warnings,
      }
    }

    case 'PERP_ORDER': {
      const side = str(params.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy'
      const ioc = str(params.tif).toLowerCase() === 'ioc'
      const reduce = params.reduce_only === true
      return {
        headline:
          `${reduce ? 'Close-only ' : ''}${side.toLowerCase()} ${groupDigits(str(params.size))} ` +
          `${str(params.market_id)} ${ioc ? 'at up to' : '@'} ${groupDigits(str(params.price))}`,
        details: [
          { label: 'Time in force', value: ioc ? 'Immediate or cancel' : 'Good till cancelled' },
          { label: 'Reduce only', value: reduce ? 'Yes' : 'No' },
        ],
        warnings,
      }
    }

    case 'PERP_CANCEL':
      return { headline: `Cancel ${str(params.market_id)} order ${str(params.order_id)}`, details: [], warnings }

    case 'PERP_SET_LEVERAGE':
      return {
        headline: `Set ${str(params.market_id)} leverage to ${str(params.leverage)}×` +
          (params.mode ? ` (${str(params.mode)})` : ''),
        details: [],
        warnings,
      }

    case 'PERP_DEPOSIT':
      return { headline: `Deposit ${groupDigits(str(params.amount))} perps collateral`, details: [], warnings }
    case 'PERP_WITHDRAW':
      return { headline: `Withdraw ${groupDigits(str(params.amount))} perps collateral`, details: [], warnings }
    case 'VAULT_DEPOSIT':
      return { headline: `Deposit ${groupDigits(str(params.amount))} into the perps vault`, details: [], warnings }
    case 'VAULT_WITHDRAW':
      return { headline: `Withdraw ${groupDigits(str(params.shares))} vault shares`, details: [], warnings }

    case 'TOKEN_DEPLOY': {
      const supply = str(params.initial_supply ?? params.total_supply ?? '0')
      const mint = str(params.mint_authority)
      const freeze = str(params.freeze_authority)
      if (mint) warnings.push(`${short(mint)} will be able to mint more ${str(params.symbol)}${params.max_supply ? `, up to ${groupDigits(str(params.max_supply))}` : ''}.`)
      if (freeze) warnings.push(`${short(freeze)} will be able to freeze holders' ${str(params.symbol)}.`)
      return {
        headline: `Create token ${str(params.name)} (${str(params.symbol)}) with ${groupDigits(supply)} supply`,
        details: [
          { label: 'Decimals', value: str(params.decimals ?? 18) },
          { label: 'Supply', value: mint ? 'Mintable' : 'Fixed forever' },
          { label: 'Freezing', value: freeze ? 'Possible' : 'Never' },
          { label: 'Initial supply goes to', value: 'You' },
        ],
        warnings,
      }
    }

    case 'CREATE_POOL': {
      const t0 = str(params.token0)
      const t1 = str(params.token1)
      // A token deployed earlier in this same block does not exist yet when this is read:
      // name it by address, and say so once, rather than warn that it is unknown.
      const pending = (a: string) => ctx.tokens[a.toLowerCase()] === null
      const name = (a: string) => (pending(a) ? short(a.toLowerCase()) : sym(a))
      const [a, b] = t0 < t1 ? [t0, t1] : [t1, t0]
      // initial_price is token1 per token0 of the sorted pair, i.e. b per a.
      const price = str(params.initial_price)
      const inverse = invert(price)
      const stake = str(params.stake_amount)
      const type = str(params.pool_type).toUpperCase()
      const burn = type === 'SUBSIDIZED' || type === '2'
      warnings.push(
        burn
          ? `${groupDigits(stake)} QRDX is burned. You cannot get it back.`
          : `${groupDigits(stake)} QRDX is staked in the pool, refunded only if you remove the pool once all its liquidity is gone.`
      )
      return {
        headline: `Create pool ${name(a)}/${name(b)}: 1 ${name(a)} = ${groupDigits(trimTo(price, 8))} ${name(b)}`,
        details: [
          ...(inverse ? [{ label: 'Same as', value: `1 ${name(b)} = ${groupDigits(trimTo(inverse, 8))} ${name(a)}` }] : []),
          { label: 'Fee', value: `${Number(params.fee_tier) / 10_000}%` },
          { label: burn ? 'Burns' : 'Stakes', value: `${groupDigits(stake)} QRDX` },
          ...[a, b].map((t) => ({
            label: name(t),
            value: pending(t) ? `${short(t.toLowerCase())} · not created yet` : short(t.toLowerCase()),
          })),
        ],
        warnings,
      }
    }

    case 'TOKEN_TRANSFER': {
      const t = str(params.token_address)
      return {
        headline: `Send ${groupDigits(str(params.amount))} ${sym(t)} to ${short(str(params.to))}`,
        details: [tokenDetail('Token', t), { label: 'To', value: str(params.to) }],
        warnings,
      }
    }

    case 'TOKEN_APPROVE': {
      const t = str(params.token_address)
      warnings.push(`${short(str(params.spender))} will be able to move this much of your ${sym(t)}.`)
      return {
        headline: `Allow ${short(str(params.spender))} to spend ${groupDigits(str(params.amount))} ${sym(t)}`,
        details: [tokenDetail('Token', t), { label: 'Spender', value: str(params.spender) }],
        warnings,
      }
    }

    default:
      for (const k of TOKEN_KEYS) if (typeof params[k] === 'string') sym(String(params[k]))
      return { headline: op.replace(/_/g, ' ').toLowerCase(), details: [], warnings }
  }
}

/** 1 / x to 18 places, or null for zero / unparseable input. */
function invert(x: string): string | null {
  try {
    const [w, f = ''] = x.split('.')
    const n = BigInt((w || '0') + f)
    if (n === 0n) return null
    // 1 / (n / 10^d) = 10^d / n, scaled by 10^18.
    const q = (10n ** BigInt(f.length + 18)) / n
    const digits = q.toString().padStart(19, '0')
    return `${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/0+$/, '').replace(/\.$/, '')
  } catch {
    return null
  }
}

/**
 * Round for display: `significant` decimals for numbers ≥ 1, or that many digits
 * past the leading zeros below 1. Half-up, trailing zeros dropped.
 */
function trimTo(x: string, significant: number): string {
  const [w, f = ''] = x.split('.')
  if (!f) return w
  const places = w !== '0' && w !== '' ? significant : f.match(/^0*/)![0].length + significant
  if (f.length <= places) return `${w}.${f}`.replace(/\.?0+$/, '')
  let n = BigInt(w + f.slice(0, places))
  if (Number(f[places]) >= 5) n += 1n
  const digits = n.toString().padStart(places + 1, '0')
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '')
}

/** Exact product of two decimal strings (for "locks up to" on buy orders). */
function multiply(a: string, b: string): string {
  const parse = (s: string) => {
    const [w, f = ''] = s.split('.')
    return { n: BigInt((w || '0') + f), d: f.length }
  }
  try {
    const x = parse(a)
    const y = parse(b)
    const digits = (x.n * y.n).toString().padStart(x.d + y.d + 1, '0')
    const places = x.d + y.d
    const out = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits
    return out.includes('.') ? out.replace(/0+$/, '').replace(/\.$/, '') : out
  } catch {
    return '?'
  }
}
