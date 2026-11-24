'use client'

import { useMemo } from 'react'
import { BookUser, Clock, History, User, Wallet } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { shortenAddress } from '@/src/core/address'
import { sameAccount } from '@/src/core/account-id'
import { usePrimaryName } from './useQnsName'
import { knownName, matchRecipients, recipientSuggestions, type RecipientKind, type RecipientSuggestion } from '@/src/core/recipients'

const HEADINGS: Record<RecipientKind, string> = { self: 'This account', previous: 'Before', recent: 'Recent', account: 'Your accounts', contact: 'Address book' }
const ICONS = { self: User, previous: History, recent: Clock, account: Wallet, contact: BookUser } as const

/**
 * Recipients to pick instead of paste (src/core/recipients.ts): recent ones, the wallet's
 * other accounts and contacts; what is typed filters them. An action with its own history (a
 * token's mints) lists where it went before first, and one that may go to the account itself
 * (minting to yourself; never a send) offers its addresses.
 */
export function RecipientSuggestions({
  query,
  from,
  onPick,
  previous,
  includeSelf,
}: {
  query: string
  from: { eth: string; pq: string }
  onPick: (address: string) => void
  /** Where this action went before, most recent first; `noun` counts them ("2 mints, last 1h ago"). */
  previous?: { heading: string; noun: string; items: { address: string; at: number; times: number }[] }
  includeSelf?: boolean
}) {
  const { addressBook, allWallets, currentWallet, transactions, activeChain } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const all = useMemo(() => {
    const sources = { contacts: addressBook, accounts: allWallets }
    const own: RecipientSuggestion[] = includeSelf
      ? [
          ...(qrdx && from.pq ? [{ kind: 'self' as const, address: from.pq, label: `${currentWallet?.name ?? 'This account'} · quantum-safe` }] : []),
          ...(from.eth ? [{ kind: 'self' as const, address: from.eth, label: `${currentWallet?.name ?? 'This account'} · classic` }] : []),
        ]
      : []
    // The account itself is offered above already, whatever it received before.
    const before: RecipientSuggestion[] = (previous?.items ?? [])
      .filter((p) => !own.some((o) => sameAccount(o.address, p.address)))
      .map((p) => ({ kind: 'previous', address: p.address, label: knownName(p.address, sources), lastSentAt: p.at || undefined, sends: p.times }))
    const seen = new Set([...own, ...before].map((s) => s.address.toLowerCase()))
    const rest = recipientSuggestions({
      ...sources,
      transactions,
      self: { id: currentWallet?.id, addresses: [from.eth, from.pq] },
      qrdx,
    }).filter((s) => !seen.has(s.address.toLowerCase()))
    return [...own, ...before, ...rest]
  }, [addressBook, allWallets, transactions, currentWallet?.id, currentWallet?.name, from.eth, from.pq, qrdx, includeSelf, previous])
  const shown = matchRecipients(all, query).slice(0, query.trim() ? 6 : 12 + all.filter((s) => s.kind === 'self').length)
  if (!shown.length) return null

  const groups = (['self', 'previous', 'recent', 'account', 'contact'] as const).map((k) => [k, shown.filter((s) => s.kind === k)] as const).filter(([, rows]) => rows.length)
  return (
    <div className="mt-2.5 space-y-2" role="listbox" aria-label="Suggested recipients">
      {groups.map(([kind, rows]) => (
        <div key={kind}>
          <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">{kind === 'previous' && previous ? previous.heading : HEADINGS[kind]}</div>
          <div className="space-y-0.5">
            {rows.map((s) => (
              <Row key={`${kind}:${s.address}`} s={s} noun={kind === 'previous' && previous ? previous.noun : 'send'} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Row({ s, noun, onPick }: { s: RecipientSuggestion; noun: string; onPick: (address: string) => void }) {
  const Icon = ICONS[s.kind]
  // A recent recipient with no label shows its primary QRDX name, when it has one.
  const named = usePrimaryName(s.label ? null : s.address)
  const label = s.label ?? named
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onPick(s.address)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
      title={s.address}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{label ?? shortenAddress(s.address, 6)}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {label ? shortenAddress(s.address, 6) : ''}
          {s.lastSentAt ? `${label ? ' · ' : ''}${s.sends && s.sends > 1 ? `${s.sends} ${noun}s, ` : ''}last ${ago(s.lastSentAt)}` : ''}
        </span>
      </span>
    </button>
  )
}

function ago(sec: number): string {
  const d = Date.now() / 1000 - sec
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}
