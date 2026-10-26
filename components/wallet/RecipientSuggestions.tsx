'use client'

import { useMemo } from 'react'
import { BookUser, Clock, Wallet } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { shortenAddress } from '@/src/core/address'
import { usePrimaryName } from './useQnsName'
import { matchRecipients, recipientSuggestions, type RecipientKind, type RecipientSuggestion } from '@/src/core/recipients'

const HEADINGS: Record<RecipientKind, string> = { recent: 'Recent', account: 'Your accounts', contact: 'Address book' }
const ICONS = { recent: Clock, account: Wallet, contact: BookUser } as const

/**
 * Recipients to pick instead of paste (src/core/recipients.ts): recent ones, the wallet's
 * other accounts and contacts; what is typed filters them.
 */
export function RecipientSuggestions({ query, from, onPick }: { query: string; from: { eth: string; pq: string }; onPick: (address: string) => void }) {
  const { addressBook, allWallets, currentWallet, transactions, activeChain } = useWallet()
  const all = useMemo(
    () =>
      recipientSuggestions({
        contacts: addressBook,
        accounts: allWallets,
        transactions,
        self: { id: currentWallet?.id, addresses: [from.eth, from.pq] },
        qrdx: isQrdxChain(activeChain),
      }),
    [addressBook, allWallets, transactions, currentWallet?.id, from.eth, from.pq, activeChain]
  )
  const shown = matchRecipients(all, query).slice(0, query.trim() ? 6 : 12)
  if (!shown.length) return null

  const groups = (['recent', 'account', 'contact'] as const).map((k) => [k, shown.filter((s) => s.kind === k)] as const).filter(([, rows]) => rows.length)
  return (
    <div className="mt-2.5 space-y-2" role="listbox" aria-label="Suggested recipients">
      {groups.map(([kind, rows]) => (
        <div key={kind}>
          <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">{HEADINGS[kind]}</div>
          <div className="space-y-0.5">
            {rows.map((s) => (
              <Row key={`${kind}:${s.address}`} s={s} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Row({ s, onPick }: { s: RecipientSuggestion; onPick: (address: string) => void }) {
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
          {s.lastSentAt ? `${label ? ' · ' : ''}${s.sends && s.sends > 1 ? `${s.sends} sends, ` : ''}last ${ago(s.lastSentAt)}` : ''}
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
