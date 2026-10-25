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

const TOKEN_KEYS = ['token_in', 'token_out', 'token_address', 'token0', 'token1', 'asset'] as const
const isToken = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)

/** Every token address an operation's params mention (lower-case), a batch's actions included. */
export function tokenAddressesIn(params: Record<string, JsonValue>): string[] {
  const out = new Set<string>()
  for (const k of TOKEN_KEYS) {
    const v = params[k]
    if (isToken(v)) out.add(v.toLowerCase())
  }
  for (const key of ['pair', 'market'] as const) {
    const v = params[key]
    if (typeof v === 'string') for (const part of v.split(':')) if (isToken(part)) out.add(part.toLowerCase())
  }
  if (Array.isArray(params.path)) for (const t of params.path) if (isToken(t)) out.add(t.toLowerCase())
  if (Array.isArray(params.actions)) {
    for (const a of params.actions) {
      const inner = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, JsonValue>).params : undefined
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) for (const t of tokenAddressesIn(inner)) out.add(t)
    }
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
    // Native QRDX: spot names it "QRDX" (any casing) and settles it in account balances.
    if (a === 'qrdx') return 'QRDX'
    const t = ctx.tokens[a]
    if (t === null || t === undefined) {
      if (!warnings.some((w) => w.includes(a))) warnings.push(`Unknown token ${a}. The node has no record of it.`)
      return short(a)
    }
    return t.symbol
  }
  const tokenDetail = (label: string, address: string) => ({
    label,
    value: address.toLowerCase() === 'qrdx' ? 'QRDX · native' : `${sym(address)} · ${short(address.toLowerCase())}`,
  })

  switch (op) {
    case 'SWAP': {
      // A multi-hop swap names its route as `path` (up to 4 hops, all or nothing).
      const path = Array.isArray(params.path) ? params.path.map(String) : null
      const tin = path ? path[0] ?? '' : str(params.token_in)
      const tout = path ? path[path.length - 1] ?? '' : str(params.token_out)
      const min = str(params.min_amount_out)
      const details = [tokenDetail('Pay', tin), tokenDetail('Receive', tout)]
      if (path && path.length > 2) {
        details.push({ label: 'Route', value: `${path.map((t) => sym(t)).join(' → ')} (all or nothing)` })
      }
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
      const kind = str(params.order_type).toLowerCase()
      if (kind === 'stop_loss' || kind === 'take_profit' || kind === 'oco') {
        const trigger = str(params.trigger_price ?? params.stop_price)
        const word = kind === 'stop_loss' ? 'Stop' : kind === 'take_profit' ? 'Take profit' : 'Stop'
        details.push({ label: `${word} at`, value: `${groupDigits(trigger)} ${sym(quote)} (last trade price)` })
        if (kind === 'oco') details.push({ label: 'Take profit at', value: `${groupDigits(str(params.tp_price))} ${sym(quote)}` })
        details.push({ label: 'Then', value: price ? `a limit order at ${groupDigits(price)} ${sym(quote)}` : 'a market order, at most 10 % through the trigger' })
        details.push({ label: 'Locks now', value: side === 'Buy' ? `up to ${groupDigits(multiply(amount, price || trigger))} ${sym(quote)} (more without a limit)` : `${groupDigits(amount)} ${sym(base)}` })
        return {
          headline: `${kind === 'oco' ? 'Stop / take-profit' : word}: ${side.toLowerCase()} ${groupDigits(amount)} ${sym(base)} when the price reaches ${groupDigits(trigger)} ${sym(quote)}`,
          details,
          warnings,
        }
      }
      if (params.tif) details.push({ label: 'Time in force', value: TIF_LABEL[str(params.tif).toLowerCase()] ?? str(params.tif) })
      details.push(...orderExtras(params))
      for (const [k, label] of [['tp', 'Take profit'], ['sl', 'Stop loss']] as const) {
        const leg = params[k]
        if (leg && typeof leg === 'object' && !Array.isArray(leg)) {
          details.push({ label, value: `sell what this buys at ${triggerLeg(leg as Record<string, JsonValue>)}` })
        }
      }
      if (kind === 'market') {
        return {
          headline: `${side} ${groupDigits(amount)} ${sym(base)} at the market (${sym(quote)})`,
          details,
          warnings,
        }
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
      const tif = str(params.tif).toLowerCase()
      const ioc = tif === 'ioc' || tif === 'fok'
      const reduce = params.reduce_only === true
      const details = [
        { label: 'Time in force', value: TIF_LABEL[tif] ?? TIF_LABEL.gtc },
        { label: 'Reduce only', value: reduce ? 'Yes' : 'No' },
        ...orderExtras(params),
      ]
      for (const [k, label] of [['tp', 'Take profit'], ['sl', 'Stop loss']] as const) {
        const leg = params[k]
        if (leg && typeof leg === 'object' && !Array.isArray(leg)) {
          details.push({ label, value: triggerLeg(leg as Record<string, JsonValue>) })
        }
      }
      return {
        headline:
          `${reduce ? 'Close-only ' : ''}${side.toLowerCase()} ${groupDigits(str(params.size))} ` +
          `${str(params.market_id)} ${ioc ? 'at up to' : '@'} ${groupDigits(str(params.price))}`,
        details,
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

    case 'CREATE_MARKET': {
      const base = str(params.base_token)
      const quote = str(params.quote_token) || 'USD'
      const lev = str(params.max_leverage) || '20'
      warnings.push(`Anyone can create a market. It trades only once validators publish a ${base} price.`)
      return {
        headline: `Create the ${base}-${quote} perpetual market, up to ${lev}× leverage`,
        details: [
          { label: 'Market', value: `${base}-${quote}-PERP` },
          { label: 'Max leverage', value: `${lev}×` },
          { label: 'Initial / maintenance margin', value: `${trimTo(String(100 / Number(lev)), 2)}% / ${trimTo(String(50 / Number(lev)), 2)}%` },
        ],
        warnings,
      }
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
      // Token standard extensions (qrdx-node docs/NATIVE_TOKENS.md §7): fixed at creation.
      const flag = (k: string) => params[k] === true || ['1', 'true', 'yes', 'on'].includes(str(params[k]).toLowerCase())
      const extras: { label: string; value: string }[] = []
      if ('transfer_fee_bps' in params) {
        const bps = Number(str(params.transfer_fee_bps))
        extras.push({ label: 'Transfer fee', value: `${(bps / 100).toFixed(2)} %${params.max_transfer_fee ? `, at most ${str(params.max_transfer_fee)}` : ''}` })
        warnings.push(`${(bps / 100).toFixed(2)} % of every transfer of ${str(params.symbol)} is withheld for the fee authority. It cannot be pooled or traded on a book.`)
      }
      if (flag('non_transferable')) {
        extras.push({ label: 'Transfers', value: 'Never (soulbound)' })
      }
      if (flag('default_frozen')) {
        extras.push({ label: 'New accounts', value: 'Start frozen' })
        warnings.push(`Every account starts frozen: holders cannot move ${str(params.symbol)} until the freeze authority thaws them.`)
      }
      if (str(params.permanent_delegate)) {
        warnings.push(`${short(str(params.permanent_delegate))} will be able to move or burn anyone's ${str(params.symbol)} without permission.`)
      }
      if (flag('pausable')) {
        extras.push({ label: 'Pausable', value: `by ${short(str(params.pause_authority) || 'you')}` })
      }
      const ops = Array.isArray(params.default_operators) ? params.default_operators.length : str(params.default_operators).split(',').filter((o) => o.trim()).length
      if (ops) warnings.push(`${ops} default operator${ops === 1 ? '' : 's'} will be able to move every holder's ${str(params.symbol)} until the holder revokes them.`)
      if ('uri' in params || 'metadata' in params || 'metadata_authority' in params) {
        extras.push({ label: 'Metadata', value: `${str(params.uri) || 'fields only'}${params.metadata_authority === '' ? ' (locked)' : ' (editable)'}` })
      }
      if (flag('post_doomsday_trade')) extras.push({ label: 'Doomsday trading', value: 'Declared backed by locked classical assets' })
      return {
        headline: `Create token ${str(params.name)} (${str(params.symbol)}) with ${groupDigits(supply)} supply`,
        details: [
          { label: 'Decimals', value: str(params.decimals ?? 18) },
          { label: 'Supply', value: mint ? 'Mintable' : 'Fixed forever' },
          { label: 'Freezing', value: freeze ? 'Possible' : 'Never' },
          ...extras,
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
            value: pending(t) ? `${short(t.toLowerCase())} · not created yet` : t.toLowerCase() === 'qrdx' ? 'native' : short(t.toLowerCase()),
          })),
        ],
        warnings,
      }
    }

    case 'TOKEN_MINT': {
      const t = str(params.token_address)
      const to = str(params.to)
      return {
        headline: `Mint ${groupDigits(str(params.amount))} new ${sym(t)} to ${to ? short(to) : 'you'}`,
        details: [tokenDetail('Token', t), { label: 'To', value: to || 'Your account' }],
        warnings,
      }
    }

    case 'TOKEN_SET_AUTHORITY': {
      const t = str(params.token_address)
      const kind = str(params.authority).toLowerCase() === 'freeze' ? 'freeze' : 'mint'
      const next = str(params.new_authority).trim()
      if (!next) {
        warnings.push(
          kind === 'mint'
            ? `This cannot be undone: no one will ever be able to mint ${sym(t)} again.`
            : `This cannot be undone: no one will ever be able to freeze ${sym(t)} balances.`
        )
        return { headline: `Give up the ${kind} authority of ${sym(t)} for good`, details: [tokenDetail('Token', t)], warnings }
      }
      warnings.push(`${short(next)} will control ${kind === 'mint' ? 'minting' : 'freezing'} ${sym(t)}, and you will not.`)
      return {
        headline: `Hand the ${kind} authority of ${sym(t)} to ${short(next)}`,
        details: [tokenDetail('Token', t), { label: 'New authority', value: next }],
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

    case 'NFT_TRANSFER': {
      warnings.push('A transfer cannot be reversed.')
      return {
        headline: `Send NFT #${str(params.token_id)} to ${short(str(params.to))}`,
        details: [
          { label: 'Collection', value: str(params.collection) },
          { label: 'To', value: str(params.to) },
        ],
        warnings,
      }
    }

    case 'NFT_SET_APPROVAL_FOR_ALL': {
      const approved = params.approved === undefined || params.approved === true || str(params.approved).toLowerCase() === 'true'
      if (approved) warnings.push(`${short(str(params.operator))} will be able to move every NFT you own in this collection, now and later, until you revoke it.`)
      return {
        headline: approved ? `Let ${short(str(params.operator))} move your NFTs in this collection` : `Stop ${short(str(params.operator))} moving your NFTs in this collection`,
        details: [
          { label: 'Collection', value: str(params.collection) },
          { label: 'Operator', value: str(params.operator) },
        ],
        warnings,
      }
    }

    case 'NFT_APPROVE': {
      const spender = str(params.spender)
      if (spender) warnings.push(`${short(spender)} will be able to move NFT #${str(params.token_id)} until it is transferred or you clear the approval.`)
      return {
        headline: spender ? `Let ${short(spender)} move NFT #${str(params.token_id)}` : `Clear the approval on NFT #${str(params.token_id)}`,
        details: [
          { label: 'Collection', value: str(params.collection) },
          ...(spender ? [{ label: 'Approved account', value: spender }] : []),
        ],
        warnings,
      }
    }

    case 'NFT_CREATE_COLLECTION': {
      const bps = Number(str(params.royalty_bps) || 0)
      if (params.non_transferable === true) warnings.push('The collection is soulbound: its NFTs can never be transferred or sold.')
      return {
        headline: `Create NFT collection ${str(params.name)} (${str(params.symbol)})`,
        details: [
          { label: 'Metadata', value: str(params.uri) || 'none' },
          { label: 'Max supply', value: params.max_supply ? groupDigits(str(params.max_supply)) : 'Unlimited' },
          { label: 'Royalty', value: bps ? `${(bps / 100).toFixed(2)} % to ${short(str(params.royalty_recipient) || 'you')}` : 'None' },
          { label: 'Mint authority', value: 'mint_authority' in params ? short(str(params.mint_authority)) || 'nobody' : 'You' },
        ],
        warnings,
      }
    }

    case 'NFT_MINT':
      return {
        headline: `Mint ${str(params.name) || 'an NFT'}${params.token_id ? ` (#${str(params.token_id)})` : ''} to ${params.to ? short(str(params.to)) : 'you'}`,
        details: [
          { label: 'Collection', value: str(params.collection) },
          ...(params.uri ? [{ label: 'Metadata', value: str(params.uri) }] : []),
        ],
        warnings,
      }

    case 'NFT_BURN':
      warnings.push('Burning destroys the NFT for good.')
      return {
        headline: `Burn NFT #${str(params.token_id)}`,
        details: [{ label: 'Collection', value: str(params.collection) }],
        warnings,
      }

    // Delegation pools (qrdx-node docs/STAKING.md).
    case 'STAKE_DELEGATE': {
      const validator = str(params.validator)
      warnings.push('The QRDX joins the pool after a warm-up of a few epochs, and is slashed with the pool if the validator misbehaves.')
      warnings.push('Taking it back means undelegating, then waiting out unbonding and the withdrawal delay (about 3.9 days at the standard parameters).')
      return {
        headline: `Delegate ${groupDigits(str(params.amount))} QRDX to ${short(validator)}`,
        details: [{ label: 'Validator', value: validator }],
        warnings,
      }
    }
    case 'STAKE_UNDELEGATE': {
      const validator = str(params.validator)
      const shares = str(params.shares ?? 'all')
      warnings.push('The QRDX is paid after unbonding and the withdrawal delay (about 3.9 days at the standard parameters), and is slashed with the pool until then.')
      return {
        headline: shares.toLowerCase() === 'all' ? `Undelegate everything from ${short(validator)}` : `Undelegate ${groupDigits(shares)} pool shares from ${short(validator)}`,
        details: [{ label: 'Validator', value: validator }],
        warnings,
      }
    }
    case 'STAKE_SET_COMMISSION': {
      const bps = Number(str(params.commission_bps))
      return {
        headline: `Set your pool's commission to ${Number.isFinite(bps) ? (bps / 100).toFixed(2) : '?'}%`,
        details: [{ label: 'Takes effect', value: 'from the next epoch' }],
        warnings,
      }
    }

    // ── Trading features (qrdx-node docs/TRADING_FEATURES.md) ──────────────
    case 'PERP_TRIGGER': {
      const side = str(params.side).toLowerCase() === 'sell' ? 'sell' : 'buy'
      const kind = str(params.kind).toLowerCase() === 'tp' ? 'Take profit' : 'Stop loss'
      const whole = params.position === true
      const size = whole ? 'the whole position' : `${groupDigits(str(params.size))}`
      const makers = Number(str(params.max_makers) || 20)
      return {
        headline: `${kind} on ${str(params.market_id)}: ${side} ${size} when the mark reaches ${groupDigits(str(params.trigger_price))}`,
        details: [
          { label: 'Then', value: params.limit_price ? `a limit order at ${groupDigits(str(params.limit_price))}` : 'a market order, at most 10 % through the mark' },
          { label: 'Reduce only', value: params.reduce_only === true || whole ? 'Yes' : 'No' },
          { label: 'Prepaid matching', value: `up to ${makers} resting orders` },
        ],
        warnings,
      }
    }

    case 'CANCEL_ALL': {
      const scope = str(params.scope) || 'all'
      const market = str(params.market)
      return {
        headline: market
          ? `Cancel every order, trigger and TWAP on ${marketName(market, sym)}`
          : `Cancel every ${scope === 'spot' ? 'spot ' : scope === 'perps' ? 'perps ' : ''}order, trigger and TWAP`,
        details: [],
        warnings,
      }
    }

    case 'PERP_MODIFY': {
      const parts: string[] = []
      if (params.size !== undefined) parts.push(`size ${groupDigits(str(params.size))}`)
      if (params.price !== undefined) parts.push(`price ${groupDigits(str(params.price))}`)
      if (params.trigger_price !== undefined) parts.push(`trigger ${groupDigits(str(params.trigger_price))}`)
      if (params.limit_price !== undefined) parts.push(`limit ${groupDigits(str(params.limit_price))}`)
      return {
        headline: `Change ${str(params.market_id)} order ${short(str(params.order_id))}: ${parts.join(', ') || 'no change'}`,
        details: [{ label: 'Queue', value: 'Kept only when just the size goes down' }],
        warnings,
      }
    }

    case 'MODIFY_ORDER': {
      const [base, quote] = canonicalPair(str(params.pair))
      const parts: string[] = []
      if (params.amount !== undefined) parts.push(`${groupDigits(str(params.amount))} ${sym(base)} left`)
      if (params.price !== undefined) parts.push(`at ${groupDigits(str(params.price))} ${sym(quote)}`)
      return {
        headline: `Change order ${short(str(params.order_id))} on ${sym(base)}/${sym(quote)}: ${parts.join(' ') || 'no change'}`,
        details: [{ label: 'Queue', value: 'Kept only when just the amount goes down' }],
        warnings,
      }
    }

    case 'BATCH': {
      const actions = Array.isArray(params.actions) ? params.actions : []
      const details = actions.map((a, i) => {
        const action = (a && typeof a === 'object' && !Array.isArray(a) ? a : {}) as Record<string, JsonValue>
        const inner = (action.params && typeof action.params === 'object' && !Array.isArray(action.params) ? action.params : {}) as Record<string, JsonValue>
        const name = str(action.op) as ExchangeOpName
        const d = describeExchangeOp(name, inner, ctx)
        for (const w of d.warnings) if (!warnings.includes(w)) warnings.push(w)
        return { label: `${i + 1}`, value: d.headline }
      })
      return {
        headline: `${actions.length} operation${actions.length === 1 ? '' : 's'}, all or nothing`,
        details,
        warnings,
      }
    }

    case 'TWAP_ORDER': {
      const mins = Math.round(Number(str(params.duration)) / 60)
      const slices = str(params.slices)
      const slip = str(params.max_slippage) || '0.03'
      const detail = [
        { label: 'Over', value: `${mins} minute${mins === 1 ? '' : 's'}${slices ? `, ${slices} slices` : ''}` },
        { label: 'Each slice', value: `at most ${(Number(slip) * 100).toFixed(1)} % from the price` },
      ]
      if (params.market_id) {
        const side = str(params.side).toLowerCase() === 'sell' ? 'Sell' : 'Buy'
        return {
          headline: `TWAP: ${side.toLowerCase()} ${groupDigits(str(params.size))} ${str(params.market_id)}${params.reduce_only === true ? ' (reduce only)' : ''}`,
          details: detail,
          warnings,
        }
      }
      const tin = str(params.token_in)
      const tout = str(params.token_out)
      return {
        headline: `TWAP: swap ${groupDigits(str(params.amount_in))} ${sym(tin)} into ${sym(tout)}`,
        details: [...detail, { label: 'Locks now', value: `${groupDigits(str(params.amount_in))} ${sym(tin)}, returned unspent if cancelled` }],
        warnings,
      }
    }

    case 'TWAP_CANCEL':
      return { headline: `Stop TWAP ${short(str(params.twap_id))}`, details: [], warnings }

    case 'AGENT_APPROVE': {
      const agent = str(params.agent)
      const until = Number(str(params.valid_until) || 0)
      const limit = str(params.max_notional_per_day)
      warnings.push(
        'An agent key can trade everything in this account (never withdraw it). A stolen agent key can still lose your funds by trading at bad prices. Approve it as you would an exchange API key.'
      )
      if (!until) warnings.push('It never expires: it works until you revoke it.')
      return {
        headline: `Let ${params.name ? `"${str(params.name)}" (${short(agent)})` : short(agent)} trade for this account`,
        details: [
          { label: 'Agent', value: agent },
          { label: 'Until', value: until ? new Date(until * 1000).toLocaleString() : 'Revoked' },
          { label: 'Daily limit', value: limit ? `${groupDigits(limit)} placed a day` : 'None' },
        ],
        warnings,
      }
    }

    case 'AGENT_REVOKE':
      return { headline: `Revoke agent ${short(str(params.agent))}`, details: [{ label: 'Agent', value: str(params.agent) }], warnings }

    case 'SUBACCOUNT_CREATE':
      return { headline: `Create sub-account${params.name ? ` "${str(params.name)}"` : ''}`, details: [], warnings }

    case 'SUBACCOUNT_TRANSFER': {
      const asset = str(params.asset)
      const to = str(params.direction) === 'from_sub'
      return {
        headline: `Move ${groupDigits(str(params.amount))} ${sym(asset)} ${to ? 'from' : 'to'} sub-account ${short(str(params.subaccount))}`,
        details: [{ label: 'Sub-account', value: str(params.subaccount) }],
        warnings,
      }
    }

    case 'VAULT_CREATE': {
      const share = Number(str(params.profit_share) || '0.1') * 100
      warnings.push('You must keep at least 5 % of the shares while anyone else holds any.')
      return {
        headline: `Start the vault "${str(params.name) || 'unnamed'}" with ${groupDigits(str(params.amount))} collateral`,
        details: [{ label: 'Your profit share', value: `${share.toFixed(0)} % of depositors' gains` }],
        warnings,
      }
    }

    case 'REFERRAL_REGISTER':
      return { headline: `Take the referral code "${str(params.code)}"`, details: [], warnings }
    case 'REFERRAL_JOIN':
      warnings.push('You can join only one code, once.')
      return { headline: `Use the referral code "${str(params.code)}"`, details: [{ label: 'Discount', value: '4 % off fees on your first 25M of volume' }], warnings }

    case 'ACCOUNT_POLICY': {
      const action = str(params.action)
      switch (action) {
        case 'add_controller':
          warnings.push(`${short(str(params.controller))} will be able to sign anything for this account, withdrawals included.`)
          return { headline: `Bind ${short(str(params.controller))} as a controller of this account`, details: [{ label: 'Controller', value: str(params.controller) }], warnings }
        case 'remove_controller':
          return { headline: `Unbind controller ${short(str(params.controller))}`, details: [{ label: 'Controller', value: str(params.controller) }], warnings }
        case 'own_key': {
          const on = params.enabled === true
          if (!on) warnings.push("This account's own key will sign nothing: only its controllers can move its funds.")
          return { headline: on ? "Turn this account's own key back on" : "Turn this account's own key off", details: [], warnings }
        }
        case 'delay': {
          const secs = Number(str(params.seconds))
          return { headline: `Make changes signed by this key wait ${fmtDuration(secs)}`, details: [], warnings }
        }
        case 'guardians': {
          const g = Array.isArray(params.guardians) ? params.guardians.map(String) : []
          if (g.length) warnings.push(`${str(params.threshold)} of these guardians together can hand this account to a new controller after ${fmtDuration(Number(str(params.recovery_delay) || 604800))}, unless you cancel.`)
          return {
            headline: g.length ? `Name ${g.length} recovery guardian${g.length === 1 ? '' : 's'}` : 'Remove the recovery guardians',
            details: g.map((a, i) => ({ label: `Guardian ${i + 1}`, value: a })),
            warnings,
          }
        }
        case 'cancel':
          return { headline: `Cancel waiting change ${str(params.change_id)}`, details: [], warnings }
        default:
          return { headline: `Account policy: ${action}`, details: [], warnings }
      }
    }

    case 'ACCOUNT_RECOVER': {
      const next = str(params.new_controller)
      if (next) warnings.push(`With enough other guardians, ${short(next)} takes over ${short(str(params.account))} after the recovery delay.`)
      return {
        headline: next ? `Back ${short(next)} to recover ${short(str(params.account))}` : `Withdraw your recovery backing for ${short(str(params.account))}`,
        details: [{ label: 'Account', value: str(params.account) }],
        warnings,
      }
    }

    case 'QNS_REGISTER': {
      const years = Number(str(params.years) || 1)
      return {
        headline: `Register ${qnsName(str(params.name))} for ${years} year${years === 1 ? '' : 's'}`,
        details: [{ label: 'Resolves to', value: str(params.target) || 'This account' }],
        warnings,
      }
    }
    case 'QNS_RENEW': {
      const years = Number(str(params.years) || 1)
      return { headline: `Renew ${qnsName(str(params.name))} for ${years} year${years === 1 ? '' : 's'}`, details: [], warnings }
    }
    case 'QNS_SET_RECORD': {
      const key = str(params.key)
      const value = str(params.value)
      return {
        headline: key === 'address'
          ? value ? `Point ${qnsName(str(params.name))} at ${short(value)}` : `Clear where ${qnsName(str(params.name))} points`
          : `Set ${qnsName(str(params.name))}'s "${key}" record`,
        details: [{ label: key, value: value || '(cleared)' }],
        warnings,
      }
    }
    case 'QNS_SET_PRIMARY': {
      const name = str(params.name)
      return { headline: name ? `Show this account as ${qnsName(name)}` : 'Clear this account’s primary name', details: [], warnings }
    }

    case 'PERP_ISOLATED_MARGIN': {
      const amt = str(params.amount)
      const remove = amt.startsWith('-')
      return {
        headline: `${remove ? 'Remove' : 'Add'} ${groupDigits(remove ? amt.slice(1) : amt)} margin ${remove ? 'from' : 'to'} your isolated ${str(params.market_id)} position`,
        details: [],
        warnings,
      }
    }

    case 'SCHEDULE_CANCEL': {
      // No `time` clears it.
      const t = params.time === undefined || params.time === null ? 0 : Number(str(params.time))
      return {
        headline: t ? `Cancel all your orders, triggers and TWAPs at ${new Date(t * 1000).toLocaleString()} unless renewed` : "Turn off the dead man's switch",
        details: [],
        warnings,
      }
    }

    case 'APPROVE_BUILDER_FEE': {
      const rate = Number(str(params.max_fee_rate)) * 100
      if (rate > 0) warnings.push(`${short(str(params.builder))} may add up to ${rate.toFixed(3)} % to orders it sends for you.`)
      return {
        headline: rate > 0 ? `Let ${short(str(params.builder))} charge up to ${rate.toFixed(3)} % on your orders` : `Stop ${short(str(params.builder))} charging fees`,
        details: [{ label: 'Builder', value: str(params.builder) }],
        warnings,
      }
    }

    case 'DEPLOYER_BOND':
      warnings.push('The bond is slashed if validators find your markets mispriced, and takes a long unbonding to take back.')
      return { headline: `Bond ${groupDigits(str(params.amount))} QRDX as a market deployer${params.dex ? ` ("${str(params.dex)}")` : ''}`, details: [], warnings }
    case 'DEPLOYER_UNBOND':
      return { headline: params.claim === true ? 'Claim your unbonded deployer bond' : `Start unbonding ${groupDigits(str(params.amount))} QRDX of your deployer bond`, details: [], warnings }
    case 'DEPLOYER_SET_ORACLE':
      return { headline: `Set ${str(params.market_id)}'s oracle price to ${groupDigits(str(params.price))}`, details: [], warnings }
    case 'DEPLOYER_HALT':
      warnings.push('Every position in the market is settled at its oracle price. This cannot be undone.')
      return { headline: `Halt and settle ${str(params.market_id)}`, details: [], warnings }
    case 'TICKER_CLAIM': {
      const t = str(params.token_address)
      warnings.push('The price is burned.')
      return {
        headline: `Claim ${sym(t)} as this token's unique ticker`,
        details: [tokenDetail('Token', t), ...(params.max_price ? [{ label: 'Pay at most', value: `${groupDigits(str(params.max_price))} QRDX` }] : [])],
        warnings,
      }
    }

    default:
      for (const k of TOKEN_KEYS) if (typeof params[k] === 'string') sym(String(params[k]))
      return { headline: op.replace(/_/g, ' ').toLowerCase(), details: [], warnings }
  }
}

const TIF_LABEL: Record<string, string> = {
  gtc: 'Good till cancelled',
  ioc: 'Immediate or cancel',
  fok: 'Fill or kill',
  alo: 'Post only',
}

/** Hidden / iceberg / expiry details an order may carry. */
function orderExtras(params: Record<string, JsonValue>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (params.hidden === true) out.push({ label: 'Book', value: 'Hidden (not in the depth)' })
  if (params.display_size !== undefined) out.push({ label: 'Iceberg', value: `shows ${groupDigits(str(params.display_size))} at a time` })
  if (params.expires_at !== undefined) out.push({ label: 'Must land by', value: new Date(Number(str(params.expires_at)) * 1000).toLocaleString() })
  return out
}

function triggerLeg(leg: Record<string, JsonValue>): string {
  const at = groupDigits(str(leg.trigger_price))
  const limit = leg.limit_price ?? leg.price
  return limit !== undefined ? `${at}, then a limit at ${groupDigits(str(limit))}` : `${at}, then at the market`
}

function marketName(market: string, sym: (a: string) => string): string {
  if (!market.includes(':')) return market
  const [a, b] = canonicalPair(market)
  return `${sym(a)}/${sym(b)}`
}

function qnsName(name: string): string {
  const n = name.toLowerCase()
  return n.endsWith('.qrdx') ? n : `${n}.qrdx`
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'no time'
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
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
