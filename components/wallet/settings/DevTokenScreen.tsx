'use client'

/**
 * One native token this account runs (Developer options → Your tokens): what it is, and what
 * the account's authorities over it allow. Minting comes first, to an account picked like a
 * send's recipient: where it minted before, this account, recent recipients, the wallet's other
 * accounts and contacts. Every action goes through the review sheet (trade/submit.tsx), which
 * describes it with the approval window's decoder before the post-quantum key signs it.
 */

import { BubblePanel } from '@/components/gfx/Bubble'
import { HoldConfirm } from '@/components/motion/HoldConfirm'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, ExternalLink, Flame, Pause, PencilLine, Percent, Play, Snowflake } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { exchange, type ExchangeToken } from '@/src/core/exchange-client'
import { groupDigits } from '@/src/core/exchange-describe'
import type { ExchangeOpName, JsonValue } from '@/src/core/exchange-tx'
import type { IndexedTx } from '@/src/core/activity'
import { isListedToken } from '@/src/core/chains'
import { ethToWei } from '@/src/core/ethereum'
import { formatUnitsExact } from '@/src/core/balances'
import { shortenAddress } from '@/src/core/address'
import { sameAccount } from '@/src/core/account-id'
import { authorities, isTokenAmount, mintable, pastMintRecipients, POWERS, whichOf, withinCap, yourTokens, type Holder, type TokenPower, type YourToken } from '@/src/core/dev-tokens'
import type { TradeRequest } from '../trade/submit'
import { AddressField, useAddressCheck, type AddressCheck } from '../AddressField'
import { CoinLogo } from '../CoinLogo'
import { CopyButton, Notice, PrimaryButton, Sheet, TextField } from '../flow/FlowKit'
import { Row, Section, SettingsPage } from './shared'

type Ask = (req: TradeRequest) => void
type Account = { balance: string; frozen: boolean } | null
type Open = null | 'burn' | 'freeze' | 'metadata' | 'fee' | 'withdraw' | { handOver: TokenPower } | { giveUp: TokenPower }

/** Decimal token amounts, added exactly (the node's are 18-place decimals). */
const add = (a: string, b: string) => formatUnitsExact(ethToWei(a || '0', 18) + ethToWei(b || '0', 18), 18)
const atMost = (a: string, b: string) => ethToWei(a.trim(), 18) <= ethToWei(b || '0', 18)
/** What a valid account check is called in a label: yourself, its name, or its short address. */
const nameOf = (c: Extract<AddressCheck, { state: 'valid' }>) => (c.self ? 'yourself' : (c.viaName ?? c.known ?? shortenAddress(c.address, 4)))

export function DevTokenScreen({
  entry,
  me,
  rows,
  version,
  ask,
  onBack,
  children,
}: {
  entry: YourToken
  me: Holder
  /** The account's indexed history: where it minted before. */
  rows: IndexedTx[]
  /** Bumped after an operation lands: read the token again. */
  version: number
  ask: Ask
  onBack: () => void
  /** The page's submissions, followed under the actions. */
  children?: ReactNode
}) {
  const { activeChain } = useWallet()
  const address = entry.token.token_address
  const feeToken = !!entry.token.extensions?.transfer_fee
  const [fresh, setFresh] = useState<{ version: number; token: ExchangeToken | null; pq: Account; classic: Account; withheld: string | null } | null>(null)
  useEffect(() => {
    let live = true
    const account = (a: string) => (a ? exchange.tokenAccount(activeChain, address, a).catch(() => null) : Promise.resolve(null))
    Promise.all([
      exchange.token(activeChain, address).catch(() => null),
      account(me.pq),
      account(me.classic),
      // Withheld transfer fees are the balance of the token's own address.
      feeToken ? exchange.tokenBalance(activeChain, address, address).catch(() => null) : Promise.resolve(null),
    ]).then(([token, pq, classic, withheld]) => live && setFresh({ version, token, pq, classic, withheld }))
    return () => {
      live = false
    }
  }, [activeChain, address, me.pq, me.classic, version, feeToken])

  const t = fresh?.token ?? entry.token
  const powers = useMemo(() => yourTokens([t], me)[0]?.powers ?? {}, [t, me])
  const [open, setOpen] = useState<Open>(null)
  const paused = !!t.extensions?.pausable?.paused
  const pqBalance = fresh?.pq?.balance ?? '0'
  const held = add(pqBalance, fresh?.classic?.balance ?? '0')
  const symbols = { [address]: t.symbol }

  /** Ask to sign an operation on this token, for the address that holds `power`. */
  const act = (power: TokenPower | null, op: ExchangeOpName, params: Record<string, JsonValue>, label: string, onDone?: () => void) => {
    setOpen(null)
    ask({ op, params: { token_address: address, ...params }, label, symbols, actAs: power && powers[power] === 'classic' ? me.classic : undefined, onDone })
  }

  const fee = t.extensions?.transfer_fee
  const about: [string, string][] = [
    ['Decimals', String(t.decimals)],
    ['Created', t.created_height != null ? `block ${t.created_height.toLocaleString('en-US')}` : '—'],
    ['Creator', whichOf(t.creator, me) ? 'You' : shortenAddress(t.creator, 4)],
    ...(fee ? [['Transfer fee', `${(fee.bps / 100).toFixed(2)} %${fee.max_fee ? `, at most ${groupDigits(fee.max_fee)}` : ''}${fee.pending ? ` (${(fee.pending.bps / 100).toFixed(2)} % from block ${fee.pending.from_height.toLocaleString('en-US')})` : ''}`] as [string, string]] : []),
    ...(t.extensions?.non_transferable ? [['Transfers', 'Never (soulbound)'] as [string, string]] : []),
    ...(t.extensions?.default_frozen ? [['New accounts', 'Start frozen'] as [string, string]] : []),
    ...(t.extensions?.default_operators?.length ? [['Default operators', String(t.extensions.default_operators.length)] as [string, string]] : []),
    ...(t.extensions?.metadata?.uri ? [['Link', t.extensions.metadata.uri] as [string, string]] : []),
    ...Object.entries(t.extensions?.metadata?.fields ?? {}),
    ...(t.extensions?.post_doomsday_trade ? [['After Doomsday', 'Declared backed by locked classical assets'] as [string, string]] : []),
  ]

  return (
    <SettingsPage title={t.symbol} onBack={onBack}>
      <BubblePanel className="rounded-2xl glass p-4" radius={20}>
        <div className="flex items-center gap-3">
          <CoinLogo symbol={t.symbol} verified={isListedToken(activeChain, address)} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{t.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{shortenAddress(address, 6)}</p>
          </div>
          {paused && <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">Paused</span>}
        </div>
        <div className="mt-3 flex items-center gap-4">
          <CopyButton text={address} label="Copy address" />
          <a href={`${activeChain.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Explorer
          </a>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat k="Supply" v={`${groupDigits(t.total_supply)}`} />
          <Stat k="Max supply" v={t.max_supply ? groupDigits(t.max_supply) : t.mint_authority ? 'No cap' : 'Fixed'} />
          <Stat k="You hold" v={fresh ? groupDigits(held) : '…'} />
          <Stat k="Frozen holders" v={t.frozen_accounts != null ? String(t.frozen_accounts) : '—'} />
        </div>
      </BubblePanel>

      {powers.mint ? (
        <MintPanel key={address} token={t} rows={rows} classic={powers.mint === 'classic'} paused={paused} onMint={(amount, to, toName) => act('mint', 'TOKEN_MINT', { amount, to }, `Mint ${amount} ${t.symbol} to ${toName}`)} />
      ) : (
        <Notice>{t.mint_authority ? `Only its mint authority, ${shortenAddress(t.mint_authority, 4)}, mints ${t.symbol}.` : `${t.symbol}'s supply is fixed: no one can mint more.`}</Notice>
      )}

      <Section title="Manage">
        {ethToWei(pqBalance, 18) > 0n && <Row icon={<Flame className="h-4 w-4" />} label="Burn" description={`Destroy some of your ${t.symbol}: the supply falls by as much`} onClick={() => setOpen('burn')} />}
        {powers.freeze && <Row icon={<Snowflake className="h-4 w-4" />} label="Freeze or thaw a holder" description="A frozen holder cannot move its balance, but can still receive" onClick={() => setOpen('freeze')} />}
        {powers.pause && (
          <Row
            icon={paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            label={paused ? 'Resume transfers' : 'Pause transfers'}
            description={paused ? `${t.symbol} is paused: nothing moves, mints or burns` : 'Stop every transfer, mint and burn until you resume'}
            onClick={() => act('pause', paused ? 'TOKEN_RESUME' : 'TOKEN_PAUSE', {}, `${paused ? 'Resume' : 'Pause'} ${t.symbol}`)}
          />
        )}
        {powers.metadata && <Row icon={<PencilLine className="h-4 w-4" />} label="Edit name, symbol and link" description={`${t.name} · ${t.symbol}`} onClick={() => setOpen('metadata')} />}
        {powers.fee && fee && <Row icon={<Percent className="h-4 w-4" />} label="Transfer fee" description={`${(fee.bps / 100).toFixed(2)} % now; a change applies 100 blocks later`} onClick={() => setOpen('fee')} />}
        {powers.withdraw && fee && <Row icon={<Download className="h-4 w-4" />} label="Withdraw withheld fees" description={`${groupDigits(fresh?.withheld ?? '0')} ${t.symbol} waiting`} onClick={() => setOpen('withdraw')} />}
        {!powers.freeze && !powers.pause && !powers.metadata && !powers.fee && !powers.withdraw && ethToWei(pqBalance, 18) === 0n && (
          <p className="p-3 text-[11px] text-muted-foreground">Nothing else to do here: you hold none of it, and none of its other authorities.</p>
        )}
      </Section>

      <Section title="Authorities">
        {(Object.entries(authorities(t)) as [TokenPower, string | null][]).map(([power, holder]) => {
          const mine = powers[power]
          return (
            <div key={power} className="rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{POWERS[power].label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{!holder ? 'Nobody: given up' : mine ? `You${mine === 'classic' ? ' · classic address' : ''}` : shortenAddress(holder, 4)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{POWERS[power].what}</p>
              {mine && (
                <div className="mt-2 flex gap-1.5">
                  <Chip onClick={() => setOpen({ handOver: power })}>Hand over</Chip>
                  <Chip onClick={() => setOpen({ giveUp: power })}>Give up</Chip>
                </div>
              )}
            </div>
          )
        })}
      </Section>

      <Section title="About">
        <div className="space-y-1.5 p-2 text-[11px]">
          {about.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">{k}</span>
              <span className="min-w-0 break-all text-right">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      {children}

      {open === 'burn' && <BurnSheet token={t} balance={pqBalance} onClose={() => setOpen(null)} onBurn={(amount) => act(null, 'TOKEN_BURN', { amount }, `Burn ${amount} ${t.symbol}`)} />}
      {open === 'freeze' && (
        <FreezeSheet
          token={t}
          onClose={() => setOpen(null)}
          onSet={(account, freeze, name) => act('freeze', freeze ? 'TOKEN_FREEZE' : 'TOKEN_THAW', { account }, `${freeze ? 'Freeze' : 'Thaw'} the ${t.symbol} of ${name}`)}
        />
      )}
      {open === 'metadata' && <MetadataSheet token={t} onClose={() => setOpen(null)} onSave={(params) => act('metadata', 'TOKEN_UPDATE_METADATA', params, `Update ${t.symbol}'s details`)} />}
      {open === 'fee' && fee && (
        <FeeSheet
          token={t}
          onClose={() => setOpen(null)}
          onSet={(bps, cap) => act('fee', 'TOKEN_SET_TRANSFER_FEE', { transfer_fee_bps: bps, ...(cap ? { max_transfer_fee: cap } : {}) }, `Set ${t.symbol}'s transfer fee to ${(bps / 100).toFixed(2)} %`)}
        />
      )}
      {open === 'withdraw' && (
        <WithdrawSheet token={t} withheld={fresh?.withheld ?? '0'} self={me.pq} onClose={() => setOpen(null)} onWithdraw={(to, name) => act('withdraw', 'TOKEN_WITHDRAW_FEES', { to }, `Withdraw ${t.symbol}'s fees to ${name}`)} />
      )}
      {open && typeof open === 'object' && 'handOver' in open && (
        <HandOverSheet
          token={t}
          power={open.handOver}
          holder={authorities(t)[open.handOver] ?? ''}
          onClose={() => setOpen(null)}
          onHandOver={(to, name) => act(open.handOver, 'TOKEN_SET_AUTHORITY', { authority: open.handOver, new_authority: to }, `Hand ${t.symbol}'s ${POWERS[open.handOver].label.toLowerCase()} authority to ${name}`)}
        />
      )}
      {open && typeof open === 'object' && 'giveUp' in open && (
        <Sheet title={`Give up the ${POWERS[open.giveUp].label.toLowerCase()} authority`} onClose={() => setOpen(null)}>
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{GONE[open.giveUp](t)} No one can take this authority up again.</p>
            <HoldConfirm className="w-full" onConfirm={() => act(open.giveUp, 'TOKEN_SET_AUTHORITY', { authority: open.giveUp, new_authority: '' }, `Give up ${t.symbol}'s ${POWERS[open.giveUp].label.toLowerCase()} authority`)}>
              Hold to give it up
            </HoldConfirm>
          </div>
        </Sheet>
      )}
    </SettingsPage>
  )
}

/** What giving up each authority leaves behind, for good. */
const GONE: Record<TokenPower, (t: ExchangeToken) => string> = {
  mint: (t) => `No one will ever mint ${t.symbol} again: its supply stays ${groupDigits(t.total_supply)}, less what holders burn.`,
  freeze: (t) => `No one will ever freeze a holder's ${t.symbol} again.`,
  pause: (t) => `No one will ever pause ${t.symbol} again.`,
  metadata: (t) => `${t.symbol}'s name, symbol and link stay as they are.`,
  fee: (t) => `${t.symbol}'s transfer fee stays as it is.`,
  withdraw: (t) => `The fees ${t.symbol} withholds can never be withdrawn.`,
  permanent_delegate: (t) => `No one will ever move or burn a holder's ${t.symbol} without it.`,
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.04] px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{k}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{v}</p>
    </div>
  )
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border px-2.5 py-1 text-[11px] font-medium hover:bg-accent/50">
      {children}
    </button>
  )
}

/** An amount of the token, with the symbol beside it and an optional fill-in for the most there is. */
function AmountField({ label, value, onChange, token, max, maxLabel = 'Max' }: { label: string; value: string; onChange: (v: string) => void; token: ExchangeToken; max?: string | null; maxLabel?: string }) {
  const bad = value.trim() !== '' && !isTokenAmount(value, token.decimals)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {max != null && (
          <button type="button" onClick={() => onChange(formatUnitsExact(ethToWei(max, 18), 18))} className="rounded-md bg-foreground/[0.07] px-2 py-0.5 text-[10px] font-semibold hover:bg-foreground/[0.12]">
            {maxLabel}
          </button>
        )}
      </div>
      <div className="flex items-center rounded-xl border border-border/50 bg-background/60 pr-3 focus-within:ring-1 focus-within:ring-primary/50">
        <input
          inputMode="decimal"
          aria-label={label}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-lg font-semibold tabular-nums focus:outline-none"
        />
        <span className="text-sm font-medium text-muted-foreground">{token.symbol}</span>
      </div>
      {bad && <p className="mt-1 text-[10px] text-red-400">A positive amount, with at most {Math.min(token.decimals, 18)} decimal places.</p>}
    </div>
  )
}

function MintPanel({ token, rows, classic, paused, onMint }: { token: ExchangeToken; rows: IndexedTx[]; classic: boolean; paused: boolean; onMint: (amount: string, to: string, toName: string) => void }) {
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const check = useAddressCheck(to)
  const previous = useMemo(() => ({ heading: 'Minted to before', noun: 'mint', items: pastMintRecipients(rows, token.token_address) }), [rows, token.token_address])
  const left = mintable(token)
  const amountOk = isTokenAmount(amount, token.decimals)
  const capOk = amountOk && withinCap(token, amount)
  const ready = amountOk && capOk && check.state === 'valid' && !paused
  return (
    <Section title="Mint" action={<span className="text-[10px] text-muted-foreground">{left === null ? 'No cap' : `Up to ${groupDigits(left)} more`}</span>}>
      <div className="space-y-3 p-2">
        <AmountField label="Amount" value={amount} onChange={setAmount} token={token} max={left} maxLabel="All that is left" />
        {amountOk && !capOk && <p className="text-[10px] text-red-400">That is more than the cap allows: {groupDigits(left ?? '0')} {token.symbol} at most.</p>}
        <AddressField label="To" value={to} onChange={setTo} check={check} previous={previous} />
        {classic && <p className="text-[10px] leading-relaxed text-muted-foreground">Your classic address holds this authority: your quantum-safe key signs for it as its controller.</p>}
        {paused && <p className="text-[10px] text-muted-foreground">{token.symbol} is paused: resume it to mint.</p>}
        <PrimaryButton
          disabled={!ready}
          onClick={() => {
            if (check.state !== 'valid') return
            onMint(amount.trim(), check.address, nameOf(check))
            setAmount('')
            setTo('')
          }}
        >
          {ready && check.state === 'valid' ? `Mint ${groupDigits(amount.trim())} ${token.symbol} to ${nameOf(check)}` : `Mint ${token.symbol}`}
        </PrimaryButton>
      </div>
    </Section>
  )
}

function BurnSheet({ token, balance, onClose, onBurn }: { token: ExchangeToken; balance: string; onClose: () => void; onBurn: (amount: string) => void }) {
  const [amount, setAmount] = useState('')
  const ok = isTokenAmount(amount, token.decimals) && atMost(amount, balance)
  return (
    <Sheet title={`Burn ${token.symbol}`} onClose={onClose}>
      <div className="space-y-3">
        <AmountField label="Amount" value={amount} onChange={setAmount} token={token} max={balance} />
        <p className="text-[11px] text-muted-foreground">
          From your quantum-safe address, which holds {groupDigits(balance)} {token.symbol}. Burnt tokens are gone for good.
        </p>
        <PrimaryButton disabled={!ok} onClick={() => onBurn(amount.trim())}>
          {ok ? `Burn ${groupDigits(amount.trim())} ${token.symbol}` : 'Burn'}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function FreezeSheet({ token, onClose, onSet }: { token: ExchangeToken; onClose: () => void; onSet: (account: string, freeze: boolean, name: string) => void }) {
  const { activeChain } = useWallet()
  const [who, setWho] = useState('')
  const check = useAddressCheck(who)
  const target = check.state === 'valid' ? check.address : null
  // Where the holder stands now, so the one button does what it can.
  const [status, setStatus] = useState<{ address: string; account: Account } | null>(null)
  useEffect(() => {
    if (!target) return
    let live = true
    exchange
      .tokenAccount(activeChain, token.token_address, target)
      .then((account) => live && setStatus({ address: target, account }))
      .catch(() => live && setStatus({ address: target, account: null }))
    return () => {
      live = false
    }
  }, [activeChain, token.token_address, target])
  const now = target && status?.address === target ? status.account : undefined
  return (
    <Sheet title="Freeze or thaw a holder" onClose={onClose}>
      <div className="space-y-3">
        <AddressField label="Holder" value={who} onChange={setWho} check={check} includeSelf={false} />
        {target && (
          <p className="text-[11px] text-muted-foreground">
            {now === undefined ? 'Reading the holder…' : now ? `Holds ${groupDigits(now.balance)} ${token.symbol} · ${now.frozen ? 'frozen' : 'not frozen'}` : 'Could not read the holder.'}
          </p>
        )}
        <PrimaryButton disabled={!target || !now || check.state !== 'valid'} onClick={() => check.state === 'valid' && now && onSet(check.address, !now.frozen, nameOf(check))}>
          {now?.frozen ? 'Thaw' : 'Freeze'}
          {check.state === 'valid' && now ? ` ${nameOf(check)}` : ''}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

/** qrdx-node exchange/tokens.py: a name of 1–64 characters, a symbol of 1–16 printable ones without spaces or ':'. */
export const NAME_OK = /^.{1,64}$/u
export const SYMBOL_OK = /^[^\s:\p{C}]{1,16}$/u

function MetadataSheet({ token, onClose, onSave }: { token: ExchangeToken; onClose: () => void; onSave: (params: Record<string, JsonValue>) => void }) {
  const [name, setName] = useState(token.name)
  const [symbol, setSymbol] = useState(token.symbol)
  const [uri, setUri] = useState(token.extensions?.metadata?.uri ?? '')
  const changes: Record<string, JsonValue> = {
    ...(name.trim() !== token.name ? { name: name.trim() } : {}),
    ...(symbol.trim() !== token.symbol ? { symbol: symbol.trim() } : {}),
    ...(uri.trim() !== (token.extensions?.metadata?.uri ?? '') ? { uri: uri.trim() } : {}),
  }
  const valid = NAME_OK.test(name.trim()) && SYMBOL_OK.test(symbol.trim()) && uri.trim().length <= 256
  return (
    <Sheet title={`Edit ${token.symbol}`} onClose={onClose}>
      <div className="space-y-3">
        <TextField label="Name" value={name} onChange={setName} maxLength={64} />
        <TextField label="Symbol" value={symbol} onChange={(v) => setSymbol(v.replace(/[\s:]/g, ''))} maxLength={16} />
        <TextField label="Link (logo, site or metadata)" value={uri} onChange={setUri} placeholder="https://… or ipfs://…" maxLength={256} />
        <p className="text-[11px] text-muted-foreground">Symbols are not unique: wallets and the explorer tell tokens apart by address.</p>
        <PrimaryButton disabled={!valid || Object.keys(changes).length === 0} onClick={() => onSave(changes)}>
          Save
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function FeeSheet({ token, onClose, onSet }: { token: ExchangeToken; onClose: () => void; onSet: (bps: number, cap: string) => void }) {
  const fee = token.extensions!.transfer_fee!
  const [percent, setPercent] = useState(String(fee.bps / 100))
  const [cap, setCap] = useState(fee.max_fee ?? '')
  const bps = Math.round(Number(percent) * 100)
  const ok = /^\d+(\.\d{1,2})?$/.test(percent.trim()) && bps >= 0 && bps <= 10_000 && (cap.trim() === '' || isTokenAmount(cap, token.decimals))
  return (
    <Sheet title="Transfer fee" onClose={onClose}>
      <div className="space-y-3">
        <TextField label="Fee, in percent of each transfer" value={percent} onChange={(v) => setPercent(v.replace(/[^0-9.]/g, ''))} placeholder="0.25" />
        <AmountField label="Most it takes from one transfer (optional)" value={cap} onChange={setCap} token={token} />
        <p className="text-[11px] text-muted-foreground">Withheld from what the recipient gets, and held at the token&apos;s address until withdrawn. A new fee applies 100 blocks after it executes.</p>
        <PrimaryButton disabled={!ok} onClick={() => onSet(bps, cap.trim())}>
          {ok ? `Set the fee to ${(bps / 100).toFixed(2)} %` : 'Set the fee'}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function WithdrawSheet({ token, withheld, self, onClose, onWithdraw }: { token: ExchangeToken; withheld: string; self: string; onClose: () => void; onWithdraw: (to: string, name: string) => void }) {
  const [to, setTo] = useState(self)
  const check = useAddressCheck(to)
  return (
    <Sheet title="Withdraw withheld fees" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm font-semibold tabular-nums">
          {groupDigits(withheld)} {token.symbol}
        </p>
        <AddressField label="To" value={to} onChange={setTo} check={check} />
        <PrimaryButton disabled={check.state !== 'valid' || ethToWei(withheld, 18) === 0n} onClick={() => check.state === 'valid' && onWithdraw(check.address, nameOf(check))}>
          {check.state === 'valid' ? `Withdraw to ${nameOf(check)}` : 'Withdraw'}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}

function HandOverSheet({ token, power, holder, onClose, onHandOver }: { token: ExchangeToken; power: TokenPower; holder: string; onClose: () => void; onHandOver: (to: string, name: string) => void }) {
  const [to, setTo] = useState('')
  const check = useAddressCheck(to)
  const same = check.state === 'valid' && !!holder && sameAccount(check.address, holder)
  return (
    <Sheet title={`Hand over ${POWERS[power].label.toLowerCase()}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {POWERS[power].what} for {token.symbol} passes to the account you choose, and only it can hand it on or give it up. You keep nothing of it.
        </p>
        <AddressField label="New authority" value={to} onChange={setTo} check={check} />
        {same && <p className="text-[10px] text-red-400">That address already holds it.</p>}
        <PrimaryButton disabled={check.state !== 'valid' || same} onClick={() => check.state === 'valid' && onHandOver(check.address, nameOf(check))}>
          {check.state === 'valid' && !same ? `Hand it to ${nameOf(check)}` : 'Hand over'}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}
