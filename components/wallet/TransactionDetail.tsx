'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, FastForward, Repeat, UserPlus, XCircle } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import type { TransactionHistoryItem } from '@/src/core/history'
import { canReplace } from '@/src/core/tx-service'
import { isQrdxChain } from '@/src/core/chains'
import { shortenAddress, addressesEqual } from '@/src/core/address'
import { sameAccount } from '@/src/core/account-id'
import { weiToEth } from '@/src/core/ethereum'
import { formatFiat } from '@/src/core/fiat'
import { cn } from '@/lib/utils'
import { usePrimaryName } from './useQnsName'
import { Sheet } from './flow/FlowKit'
import { ConfirmSheet } from './flow/ConfirmSheet'

/**
 * One transaction: what moved, between whom (named from the address book and the wallet's own
 * accounts), when, at what fee, and its status. A send can be repeated; an unknown counterparty
 * saved as a contact; a pending EVM transaction sped up or cancelled.
 */
export function TransactionDetail({ tx, onClose, onSendAgain }: { tx: TransactionHistoryItem; onClose: () => void; onSendAgain?: (to: string, token?: string) => void }) {
  const { activeChain, addressBook, allWallets, currentWallet, prices, addContact, replaceTransaction } = useWallet()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [replacing, setReplacing] = useState<'speedup' | 'cancel' | null>(null)
  const [busy, setBusy] = useState(false)
  const [replaceError, setReplaceError] = useState<string | null>(null)
  const [replacedBy, setReplacedBy] = useState<string | null>(null)

  const nameOf = (address: string): string | null => {
    if (!address) return null
    const contact = addressBook.find((c) => addressesEqual(c.address, address))
    if (contact) return contact.name
    const own = allWallets.find((a) => [a.ethAddress, a.address, a.pqAddress].some((x) => x && (x.toLowerCase() === address.toLowerCase() || sameAccount(x, address))))
    return own ? (own.id === currentWallet?.id ? `${own.name} (this account)` : own.name) : null
  }

  const counterparty = tx.type === 'receive' ? tx.from : tx.to
  // Primary QRDX names of the two sides, shown where no contact or own account names them.
  const fromName = usePrimaryName(tx.from)
  const toName = usePrimaryName(tx.to)
  const counterpartyName = tx.type === 'receive' ? fromName : toName
  const known = nameOf(counterparty)
  const symbol = tx.tokenSymbol ?? activeChain.nativeCurrency.symbol
  const amount = tx.tokenAmount ? `${tx.tokenAmount} ${tx.tokenSymbol}` : tx.value
  const amountNum = Number((tx.tokenAmount ?? tx.value).split(' ')[0])
  const price = prices.get(symbol.toUpperCase())?.usd
  const fee = tx.fee ?? (tx.gasUsed && tx.gasPrice ? weiToEth(BigInt(tx.gasUsed) * BigInt(tx.gasPrice), activeChain.nativeCurrency.decimals) : null)
  const replaceable = tx.status === 'pending' && !!currentWallet && canReplace(activeChain, currentWallet, tx.from)
  const explorer = tx.explorerUrl ?? `${activeChain.explorerUrl}/tx/${tx.hash}`
  const verb = tx.label ?? (tx.type === 'send' ? 'Sent' : tx.type === 'receive' ? 'Received' : tx.type === 'swap' ? 'Swapped' : 'Contract call')

  const copy = () => {
    void navigator.clipboard?.writeText(tx.hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const save = async () => {
    setSaveError(null)
    try {
      await addContact({ name: name.trim(), address: counterparty, qnsName: counterpartyName ?? undefined })
      setSaving(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the contact')
    }
  }

  const replace = async () => {
    if (!replacing) return
    setBusy(true)
    setReplaceError(null)
    try {
      const r = await replaceTransaction(tx.hash, replacing)
      setReplacedBy(r.hash)
      setReplacing(null)
    } catch (e) {
      setReplaceError(e instanceof Error ? e.message : 'The network refused the replacement')
    } finally {
      setBusy(false)
    }
  }

  if (replacing)
    return (
      <ConfirmSheet
        title={replacing === 'speedup' ? 'Speed up transaction' : 'Cancel transaction'}
        headline={replacing === 'speedup' ? `Resend with a higher fee` : 'Replace it with an empty transaction'}
        rows={[
          { label: 'Original', value: shortHash(tx.hash) },
          { label: 'Nonce', value: 'same as the original' },
          { label: 'Gas price', value: 'at least 12% above the original, or the network price if higher' },
          ...(replacing === 'cancel' ? [{ label: 'Sends', value: `0 ${activeChain.nativeCurrency.symbol} to yourself` }] : [{ label: 'Sends', value: amount }]),
          { label: 'Network', value: activeChain.name },
        ]}
        warnings={[
          replacing === 'cancel'
            ? 'Cancelling only works if the replacement is mined first. If the original confirms first, it stands and the replacement is dropped; you pay a fee either way.'
            : 'Whichever is mined first wins; the other is dropped.',
        ]}
        confirmLabel={replacing === 'speedup' ? 'Speed up' : 'Cancel transaction'}
        danger={replacing === 'cancel'}
        busy={busy}
        error={replaceError}
        onConfirm={() => void replace()}
        onCancel={() => setReplacing(null)}
      />
    )

  return (
    <Sheet title="Transaction" onClose={onClose}>
      <div className="mb-4">
        <p className="text-lg font-semibold tracking-tight">
          {verb} {amount}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {price && Number.isFinite(amountNum) ? `${formatFiat(amountNum * price)} at today's price · ` : ''}
          {new Date(tx.timestamp * 1000).toLocaleString()}
        </p>
      </div>

      <div className="divide-y divide-border/60 rounded-xl border border-border/70 text-xs">
        <Row k="Status">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tx.status === 'confirmed' ? 'bg-foreground text-background' : 'border border-border')}>
            {tx.status === 'confirmed' ? 'Confirmed' : tx.status === 'failed' ? 'Failed' : 'Pending'}
          </span>
        </Row>
        <Row k="From" sub={nameOf(tx.from) || fromName ? shortenAddress(tx.from, 6) : undefined}>
          {nameOf(tx.from) ?? fromName ?? shortenAddress(tx.from, 6)}
        </Row>
        {tx.to && (
          <Row k="To" sub={nameOf(tx.to) || toName ? shortenAddress(tx.to, 6) : undefined}>
            {nameOf(tx.to) ?? toName ?? shortenAddress(tx.to, 6)}
          </Row>
        )}
        <Row k="Network">{activeChain.name}</Row>
        {fee && (
          <Row k="Network fee">
            {fee} {activeChain.nativeCurrency.symbol}
          </Row>
        )}
        {tx.blockNumber > 0 && <Row k="Block">{tx.blockNumber.toLocaleString()}</Row>}
        <Row k="Hash">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-mono hover:underline" aria-label="Copy transaction hash">
            {shortHash(tx.hash)} {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </Row>
      </div>

      {replacedBy && (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Replacement sent: <span className="font-mono">{shortHash(replacedBy)}</span>. It shows in your activity until one of the two confirms.
        </p>
      )}

      {tx.status === 'pending' && !replacedBy && (
        replaceable ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setReplacing('speedup')} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium hover:bg-accent/50">
              <FastForward className="h-3.5 w-3.5" /> Speed up
            </button>
            <button type="button" onClick={() => setReplacing('cancel')} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium hover:bg-accent/50">
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        ) : isQrdxChain(activeChain) ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            QRDX blocks come every 250 ms, so this should confirm within seconds. QRDX nodes keep one transaction per account and nonce, so it cannot be sped up or cancelled.
          </p>
        ) : null
      )}

      {saving ? (
        <div className="mt-3 space-y-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" aria-label="Contact name" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
          {saveError && <p className="text-[11px] text-foreground">{saveError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSaving(false)} className="h-10 rounded-xl border border-border text-xs font-medium">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={!name.trim()} className="h-10 rounded-xl bg-foreground text-xs font-semibold text-background disabled:opacity-40">
              Save contact
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {tx.type === 'send' && onSendAgain && tx.to && (
            <button type="button" onClick={() => onSendAgain(tx.to, tx.tokenSymbol)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium hover:bg-accent/50">
              <Repeat className="h-3.5 w-3.5" /> Send again
            </button>
          )}
          {counterparty && !known && (
            <button type="button" onClick={() => {
              setSaving(true)
              // A named account starts with its name as the contact's.
              if (!name && counterpartyName) setName(counterpartyName.replace(/\.qrdx$/, ''))
            }} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium hover:bg-accent/50">
              <UserPlus className="h-3.5 w-3.5" /> Save contact
            </button>
          )}
          <a href={explorer} target="_blank" rel="noreferrer" className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-foreground text-xs font-semibold text-background">
            <ExternalLink className="h-3.5 w-3.5" /> View on the explorer
          </a>
        </div>
      )}
    </Sheet>
  )
}

function Row({ k, sub, children }: { k: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words text-right tabular-nums">
        {children}
        {sub && <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{sub}</span>}
      </span>
    </div>
  )
}

function shortHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash
}
