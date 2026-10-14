'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Plus, Settings2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { getEvmProvider } from '@/src/core/ethereum'
import { isQrdxChain } from '@/src/core/chains'
import { formatAmount } from '@/src/core/balances'
import { formatFiat as formatUsd } from '@/src/core/fiat'
import { cn, formatAddress } from '@/lib/utils'
import { Sheet } from './flow/FlowKit'

/** Initials on a monochrome tile, the account's avatar everywhere in the wallet. */
export function AccountAvatar({ name, size = 36, active = false }: { name: string; size?: number; active?: boolean }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-xl font-bold', active ? 'bg-foreground text-background' : 'bg-accent text-foreground')}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/**
 * Every account in the wallet with its value on the active network (native coin on both its
 * addresses, priced in USD), the current one marked. Tap to switch; add an account or
 * open account management.
 */
export function AccountSwitcher({ onClose, onManage }: { onClose: () => void; onManage: () => void }) {
  const { allWallets, currentWallet, switchWallet, addAccount, activeChain, prices } = useWallet()
  const [values, setValues] = useState<Record<string, bigint | null>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const accounts = allWallets.filter((a) => !a.hidden || a.id === currentWallet?.id)
  const native = activeChain.nativeCurrency
  const price = prices.get(native.symbol.toUpperCase())?.usd

  useEffect(() => {
    let cancelled = false
    const provider = getEvmProvider(activeChain.id)
    for (const a of accounts) {
      const addrs = [a.ethAddress ?? a.address, isQrdxChain(activeChain) ? a.pqAddress : null].filter(Boolean) as string[]
      Promise.all(addrs.map((x) => provider.getBalance(x).catch(() => null)))
        .then((parts) => {
          if (cancelled) return
          const known = parts.filter((p): p is bigint => p !== null)
          setValues((v) => ({ ...v, [a.id]: known.length ? known.reduce((s, p) => s + p, 0n) : null }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (id: string) => {
    if (id === currentWallet?.id) return onClose()
    setBusy(id)
    setError(null)
    try {
      await switchWallet(id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch account')
    } finally {
      setBusy(null)
    }
  }

  const add = async () => {
    setBusy('add')
    setError(null)
    try {
      const created = await addAccount()
      await switchWallet(created.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add an account')
    } finally {
      setBusy(null)
    }
  }

  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Sheet title="Accounts" onClose={onClose}>
      <div className="space-y-1.5">
        {accounts.map((a) => {
          const active = a.id === currentWallet?.id
          const wei = values[a.id]
          const nativeAmount = wei == null ? null : Number(formatAmount(wei, native.decimals, 6).replace(/,/g, '').replace(/^</, ''))
          return (
            <div key={a.id} className={cn('flex items-center gap-3 rounded-xl border p-2.5 transition-colors', active ? 'border-foreground/40 bg-foreground/5' : 'border-border/60 hover:bg-accent/40')}>
              <button type="button" onClick={() => void pick(a.id)} disabled={!!busy} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Switch to ${a.name}`}>
                <AccountAvatar name={a.name} active={active} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{a.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    {busy === a.id && <span className="text-[10px] font-normal text-muted-foreground">switching…</span>}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{formatAddress(a.pqAddress || a.ethAddress, 6)}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  {wei === undefined ? (
                    <span className="text-muted-foreground">…</span>
                  ) : wei === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <span className="block font-semibold">{price != null && nativeAmount != null ? formatUsd(nativeAmount * price) : `${formatAmount(wei, native.decimals, 4)} ${native.symbol}`}</span>
                      {price != null && <span className="block text-[10px] text-muted-foreground">{formatAmount(wei, native.decimals, 4)} {native.symbol}</span>}
                    </>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => copy(a.pqAddress || a.ethAddress, a.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                aria-label={`Copy ${a.name}'s address`}
              >
                {copied === a.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-3 text-xs text-foreground">{error}</p>}
      <p className="mt-2 text-[10px] text-muted-foreground">Values are the native {native.symbol} on {activeChain.name}, both addresses together.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void add()} disabled={!!busy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">
          <Plus className="h-4 w-4" /> {busy === 'add' ? 'Adding…' : 'Add account'}
        </button>
        <button type="button" onClick={onManage} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-accent/50">
          <Settings2 className="h-4 w-4" /> Manage
        </button>
      </div>
    </Sheet>
  )
}
