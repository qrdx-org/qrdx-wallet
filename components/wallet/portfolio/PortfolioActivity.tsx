'use client'

/**
 * Activity across networks: QRDX's (from its node) and that of every other network the account
 * holds something on, newest first, each marked with its network.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2, Repeat } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, isQrdxChain, type ChainConfig } from '@/src/core/chains'
import { fetchAllTransactionHistory, type TransactionHistoryItem } from '@/src/core/history'
import { addressOn, fetchOtherHistory } from '@/src/core/other-chains'
import type { Portfolio } from '@/src/core/portfolio'
import { NetworkLogo } from '../CoinLogo'
import { cn } from '@/lib/utils'

type Item = TransactionHistoryItem & { network: ChainConfig }

/** "0.0000044939956398901 ETH" → "0.000004494 ETH": four significant digits, never below a millionth. */
const short = (value: string) =>
  value.replace(/\d+\.\d+|\d+/, (n) => {
    const x = Number(n)
    if (x === 0) return '0'
    if (x < 0.000001) return '<0.000001'
    return x >= 1 ? x.toLocaleString('en-US', { maximumFractionDigits: 4 }) : x.toFixed(Math.min(12, 3 - Math.floor(Math.log10(x)))).replace(/0+$/, '')
  })

const ago = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t)
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`
}

export function PortfolioActivity({ portfolio }: { portfolio: Portfolio | null }) {
  const { transactions, activeChain, currentWallet, chainAddresses } = useWallet()
  const networks = useMemo(() => {
    const m = new Map<string, ChainConfig>()
    for (const a of portfolio?.assets ?? []) for (const h of a.holdings) if (!isQrdxChain(h.chain)) m.set(h.chain.id, h.chain)
    return [...m.values()]
  }, [portfolio])
  const [others, setOthers] = useState<{ key: string; items: Item[] } | null>(null)
  const key = networks.map((c) => c.id).join(',')

  useEffect(() => {
    if (!currentWallet) return
    let live = true
    Promise.all(
      networks.map(async (c) => {
        const items =
          chainFamily(c) === 'evm'
            ? await fetchAllTransactionHistory(currentWallet.ethAddress, c.id)
            : addressOn(c, chainAddresses)
              ? await fetchOtherHistory(c, addressOn(c, chainAddresses)!)
              : []
        return items.map((t) => ({ ...t, network: c }))
      }).map((p) => p.catch(() => [] as Item[]))
    ).then((lists) => live && setOthers({ key, items: lists.flat() }))
    return () => {
      live = false
    }
  }, [key, networks, currentWallet, chainAddresses])

  const items: Item[] = [
    ...(isQrdxChain(activeChain) ? transactions.map((t) => ({ ...t, network: activeChain })) : []),
    ...(others?.key === key ? others.items : []),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50)

  if (!items.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        {others?.key === key ? 'No activity yet.' : <><Loader2 className="h-4 w-4 animate-spin" /> Reading activity on every network…</>}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {items.map((t) => {
        const Icon = t.type === 'send' ? ArrowUpRight : t.type === 'receive' ? ArrowDownLeft : Repeat
        return (
          <a
            key={`${t.network.id}:${t.hash}`}
            href={t.explorerUrl ?? `${t.network.explorerUrl}/tx/${t.hash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-accent/30"
          >
            <span className="relative">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.07]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-px">
                <NetworkLogo chain={t.network} size={15} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.label ?? (t.type === 'send' ? 'Sent' : t.type === 'receive' ? 'Received' : 'Contract call')}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {t.network.name} · {t.status === 'pending' ? 'pending' : t.status === 'failed' ? 'failed' : ago(t.timestamp)}
              </span>
            </span>
            <span className={cn('shrink-0 text-right text-xs tabular-nums', t.type === 'receive' ? 'text-green-500' : '')}>
              {/* A failed send moved nothing: no sign. */}
              {t.status === 'failed' ? '' : t.type === 'send' ? '−' : t.type === 'receive' ? '+' : ''}
              {short(t.value)}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          </a>
        )
      })}
    </div>
  )
}
