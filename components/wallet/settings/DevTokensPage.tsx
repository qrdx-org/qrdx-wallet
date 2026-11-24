'use client'

/**
 * Developer options → Your tokens: the native tokens this account deployed or holds an
 * authority over on the active QRDX network (src/core/dev-tokens.ts), the token contracts it
 * deployed in the EVM, and a form to create a token. Opening one runs it (DevTokenScreen).
 */

import { Chips } from '@/components/motion/Segment'
import { Loading } from '@/components/motion/Loading'
import { ScreenStack } from '@/components/motion/ScreenStack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ExternalLink, Plus } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isListedToken, isQrdxChain } from '@/src/core/chains'
import { exchange } from '@/src/core/exchange-client'
import { groupDigits } from '@/src/core/exchange-describe'
import { formatAmount } from '@/src/core/balances'
import { ethToWei } from '@/src/core/ethereum'
import type { IndexedTx } from '@/src/core/activity'
import type { JsonValue } from '@/src/core/exchange-tx'
import {
  accountRows,
  deployedTokenContracts,
  isTokenAmount,
  POWERS,
  readTokenContract,
  yourTokens,
  type ContractToken,
  type Holder,
  type TokenPower,
  type YourToken,
} from '@/src/core/dev-tokens'
import { SubmissionList, useTradeSubmit, type TradeRequest } from '../trade/submit'
import { CoinLogo } from '../CoinLogo'
import { Notice, PrimaryButton, Sheet, TextField } from '../flow/FlowKit'
import { DevTokenScreen, NAME_OK, SYMBOL_OK } from './DevTokenScreen'
import { Section, SettingsPage, Toggle } from './shared'

export function DevTokensPage({ onBack }: { onBack: () => void }) {
  const { activeChain, currentWallet, homeQrdxChain, setActiveChain } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const me = useMemo<Holder>(() => ({ pq: currentWallet?.pqAddress ?? '', classic: currentWallet?.ethAddress ?? '' }), [currentWallet?.pqAddress, currentWallet?.ethAddress])
  const evmIds = useMemo(() => [currentWallet?.pqAccountId ?? '', currentWallet?.ethAddress ?? ''].filter(Boolean), [currentWallet?.pqAccountId, currentWallet?.ethAddress])
  const { ask, sheet, submissions } = useTradeSubmit()

  // Read again once an operation lands (a mint changes the supply, a hand-over the authorities).
  const [version, setVersion] = useState(0)
  const send = useCallback(
    (req: TradeRequest) =>
      ask({
        ...req,
        onDone: () => {
          req.onDone?.()
          setTimeout(() => setVersion((v) => v + 1), 1500)
        },
      }),
    [ask]
  )

  const scope = `${activeChain.id}:${me.pq}`
  const [data, setData] = useState<{ scope: string; tokens: YourToken[]; rows: IndexedTx[]; contracts: ContractToken[] } | null>(null)
  const [failed, setFailed] = useState<{ scope: string; message: string } | null>(null)
  useEffect(() => {
    if (!qrdx || !me.pq) return
    let live = true
    Promise.all([exchange.tokens(activeChain), accountRows(activeChain, me)])
      .then(async ([all, rows]) => {
        const contracts = await Promise.all(deployedTokenContracts(rows).map((c) => readTokenContract(activeChain, c, evmIds)))
        if (!live) return
        setData({ scope, tokens: yourTokens(all, me), rows, contracts: contracts.filter((c): c is ContractToken => !!c) })
        setFailed(null)
      })
      .catch((e) => live && setFailed({ scope, message: e instanceof Error ? e.message : 'the node did not answer' }))
    return () => {
      live = false
    }
  }, [activeChain, me, evmIds, qrdx, scope, version])
  const shown = data?.scope === scope ? data : null

  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const entry = open ? shown?.tokens.find((y) => y.token.token_address === open) : undefined

  return (
    <>
      <ScreenStack id={entry ? entry.token.token_address : 'list'} depth={entry ? 1 : 0}>
        {entry && shown ? (
          <DevTokenScreen entry={entry} me={me} rows={shown.rows} version={version} ask={send} onBack={() => setOpen(null)}>
            <SubmissionList items={submissions} />
          </DevTokenScreen>
        ) : (
          <SettingsPage title="Your tokens" onBack={onBack}>
            {!qrdx ? (
              <>
                <Notice>Native tokens live on QRDX networks: {activeChain.name} has none to run.</Notice>
                <PrimaryButton onClick={() => setActiveChain(homeQrdxChain.id)}>Switch to {homeQrdxChain.name}</PrimaryButton>
              </>
            ) : !shown && failed?.scope === scope ? (
              <Notice tone="warning">Could not read the tokens on {activeChain.name}: {failed.message}.</Notice>
            ) : !shown ? (
              <p className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <Loading label={`Reading your tokens on ${activeChain.name}`} />
              </p>
            ) : (
              <>
                <Section
                  title={`On ${activeChain.name}`}
                  action={
                    <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline">
                      <Plus className="h-3 w-3" /> Create
                    </button>
                  }
                >
                  {shown.tokens.length === 0 ? (
                    <div className="space-y-3 p-3">
                      <p className="text-xs text-muted-foreground">
                        None yet. The tokens you deploy show here, with every token whose mint, freeze or other authority this account holds.
                      </p>
                      <PrimaryButton onClick={() => setCreating(true)}>Create a token</PrimaryButton>
                    </div>
                  ) : (
                    shown.tokens.map((y) => <TokenRow key={y.token.token_address} y={y} onOpen={() => setOpen(y.token.token_address)} />)
                  )}
                </Section>

                {shown.contracts.length > 0 && (
                  <Section title="Token contracts you deployed">
                    {shown.contracts.map((c) => (
                      <a
                        key={c.address}
                        href={`${activeChain.explorerUrl}/address/${c.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-xl p-3 hover:bg-accent/40"
                      >
                        <CoinLogo symbol={c.symbol} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <span className="truncate text-sm font-medium">{c.name}</span>
                            <span className="text-[11px] text-muted-foreground">{c.symbol}</span>
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            You hold {formatAmount(c.balance, c.decimals)} · block {c.height.toLocaleString('en-US')}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs tabular-nums">{formatAmount(c.totalSupply, c.decimals)}</span>
                          <span className="block text-[10px] text-muted-foreground">supply</span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      </a>
                    ))}
                    <p className="px-3 pb-2 text-[10px] leading-relaxed text-muted-foreground">
                      A contract&apos;s own code decides who may mint it. Send it from your tokens like any other.
                    </p>
                  </Section>
                )}

                <SubmissionList items={submissions} />
              </>
            )}
            {creating && (
              <CreateTokenSheet
                me={me}
                onClose={() => setCreating(false)}
                onCreate={(req) => {
                  setCreating(false)
                  send(req)
                }}
              />
            )}
          </SettingsPage>
        )}
      </ScreenStack>
      {sheet}
    </>
  )
}

const tag = 'rounded bg-foreground/[0.07] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'

function TokenRow({ y, onOpen }: { y: YourToken; onOpen: () => void }) {
  const { activeChain } = useWallet()
  const t = y.token
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-accent/40">
      <CoinLogo symbol={t.symbol} verified={isListedToken(activeChain, t.token_address)} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{t.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{t.symbol}</span>
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {y.creator && <span className={tag}>Creator</span>}
          {(Object.keys(y.powers) as TokenPower[]).map((p) => (
            <span key={p} className={tag}>
              {POWERS[p].label}
            </span>
          ))}
          {t.extensions?.pausable?.paused && <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-background">Paused</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs tabular-nums">{groupDigits(t.total_supply)}</span>
        <span className="block text-[10px] text-muted-foreground">supply</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  )
}

const DECIMALS = ['18', '9', '8', '6', '2', '0'] as const

/**
 * TOKEN_DEPLOY (qrdx-node docs/NATIVE_TOKENS.md §2): a name, a symbol, its decimals, a supply
 * credited to this account, and the authorities it keeps. Extensions beyond pausing and editable
 * details (transfer fees, soulbound, default operators) are the CLI's: `qrdx-wallet token deploy`.
 */
function CreateTokenSheet({ me, onClose, onCreate }: { me: Holder; onClose: () => void; onCreate: (req: TradeRequest) => void }) {
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimals, setDecimals] = useState<(typeof DECIMALS)[number]>('18')
  const [supply, setSupply] = useState('')
  const [mint, setMint] = useState(true)
  const [cap, setCap] = useState('')
  const [freeze, setFreeze] = useState(false)
  const [pause, setPause] = useState(false)
  const [editable, setEditable] = useState(true)
  const [uri, setUri] = useState('')
  const d = Number(decimals)
  const hasSupply = isTokenAmount(supply, d)
  const supplyOk = supply.trim() === '' || /^0*\.?0*$/.test(supply.trim()) || hasSupply
  const capOk = !mint || cap.trim() === '' || (isTokenAmount(cap, d) && (!hasSupply || ethToWei(supply.trim(), 18) <= ethToWei(cap.trim(), 18)))
  const problem = !NAME_OK.test(name.trim())
    ? name ? 'A name is 1–64 characters.' : null
    : !SYMBOL_OK.test(symbol.trim())
      ? symbol ? "A symbol is 1–16 characters, without spaces or ':'." : null
      : !supplyOk
        ? `The supply is a whole number or a decimal with at most ${d} places.`
        : !hasSupply && !mint
          ? 'A token needs an initial supply, or a mint authority to create it later.'
          : !capOk
            ? 'The cap is an amount no lower than the initial supply.'
            : null
  const ready = !problem && NAME_OK.test(name.trim()) && SYMBOL_OK.test(symbol.trim())

  const create = () => {
    const s = symbol.trim()
    const params: Record<string, JsonValue> = {
      name: name.trim(),
      symbol: s,
      decimals: d,
      initial_supply: hasSupply ? supply.trim() : '0',
      ...(mint ? { mint_authority: me.pq, ...(cap.trim() ? { max_supply: cap.trim() } : {}) } : {}),
      ...(freeze ? { freeze_authority: me.pq } : {}),
      ...(pause ? { pausable: true } : {}),
      ...(uri.trim() ? { uri: uri.trim() } : {}),
      // Details stay editable by this account, or are locked; a link alone would make the creator their authority.
      ...(editable ? { metadata_authority: me.pq } : uri.trim() ? { metadata_authority: '' } : {}),
    }
    onCreate({ op: 'TOKEN_DEPLOY', params, label: `Create ${s}` })
  }

  const option = (label: string, description: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[10px] leading-snug text-muted-foreground">{description}</span>
      </span>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  )

  return (
    <Sheet title="Create a token" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <TextField label="Name" value={name} onChange={setName} placeholder="Quantum Dollar" maxLength={64} autoFocus />
          <TextField label="Symbol" value={symbol} onChange={(v) => setSymbol(v.replace(/[\s:]/g, '').toUpperCase())} placeholder="QUSD" maxLength={16} />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Decimals</span>
          <Chips label="Decimals" value={decimals} options={DECIMALS.map((v) => ({ value: v, label: v }))} onChange={setDecimals} />
        </div>
        <TextField label="Initial supply, to you" value={supply} onChange={(v) => setSupply(v.replace(/[^0-9.]/g, ''))} placeholder={mint ? '0 (mint it later)' : '1000000'} />
        <div className="rounded-xl border border-border/60 px-3 py-2">
          {option('You can mint more', 'You hold the mint authority: hand it over or give it up later', mint, setMint)}
          {mint && (
            <div className="pb-2 pt-1">
              <TextField label="Most there can ever be (optional)" value={cap} onChange={(v) => setCap(v.replace(/[^0-9.]/g, ''))} placeholder="No cap" />
            </div>
          )}
          {option('You can freeze holders', 'A frozen holder cannot move it, and can still receive', freeze, setFreeze)}
          {option('You can pause it', 'Stop every transfer, mint and burn at once', pause, setPause)}
          {option('You can edit its details', 'Change its name, symbol and link later', editable, setEditable)}
        </div>
        <TextField label="Link (logo, site or metadata; optional)" value={uri} onChange={setUri} placeholder="https://… or ipfs://…" maxLength={256} />
        {problem && <p className="text-[11px] text-red-400">{problem}</p>}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Symbols are not unique: anyone can create one called USDC, so wallets tell tokens apart by address. Transfer fees, soulbound tokens and default operators are set
          with the CLI (qrdx-wallet token deploy).
        </p>
        <PrimaryButton disabled={!ready} onClick={create}>
          {symbol.trim() ? `Create ${symbol.trim()}` : 'Create'}
        </PrimaryButton>
      </div>
    </Sheet>
  )
}
