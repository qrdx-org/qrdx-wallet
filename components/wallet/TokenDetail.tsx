'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, EyeOff, Eye, ExternalLink } from 'lucide-react'
import { hiddenTokens, setTokenHidden } from '@/src/core/hidden-tokens'
import { useConfirm } from './flow/ConfirmSheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { fetchPriceHistory, symbolToCoingeckoId, type PriceHistoryPoint } from '@/src/core/prices'
import { formatFiat as formatUsd } from '@/src/core/fiat'
import { tokenPriceHistory, type HistoryRange } from '@/src/core/trade/prices'
import { formatAmount } from '@/src/core/balances'
import { getEvmProvider } from '@/src/core/ethereum'
import { cn, formatAddress } from '@/lib/utils'
import { PortfolioChart } from './PortfolioChart'
import type { Token } from './TokenList'

const RANGES: HistoryRange[] = ['1H', '1D', '1W', '1M']
const RANGE_DAYS: Record<HistoryRange, number> = { '1H': 1, '1D': 1, '1W': 7, '1M': 30 }

/** exchange_getToken (qrdx-node exchange/views.py token). */
interface NodeToken {
  token_address: string
  name: string
  symbol: string
  decimals: number
  total_supply: string
  max_supply: string | null
  mint_authority: string | null
  freeze_authority: string | null
  creator: string
  created_height: number
}

/**
 * One holding: its price and chart, what the account holds (USD first, split by address),
 * what the token is, and the account's activity in it. Send, receive and swap start here.
 */
export function TokenDetail({ token, onClose, onAction }: { token: Token; onClose: () => void; onAction: (action: 'send' | 'receive' | 'swap', token: Token) => void }) {
  const { activeChain, prices, balances, pqBalances, transactions } = useWallet()
  const [range, setRange] = useState<HistoryRange>('1D')
  // The history read for one range and token; while another is loading, there is none.
  const [loaded, setLoaded] = useState<{ key: string; points: PriceHistoryPoint[] } | null>(null)
  const historyKey = `${activeChain.id}:${token.contractAddress ?? token.symbol}:${range}`
  const history = loaded?.key === historyKey ? loaded.points : null
  const [info, setInfo] = useState<NodeToken | null>(null)
  const qrdx = isQrdxChain(activeChain)
  const isNative = !token.contractAddress
  const price = prices.get(token.symbol.toUpperCase())
  const { dialog: confirmDialog, confirm } = useConfirm()
  const [hidden, setHidden] = useState(() => !!token.contractAddress && hiddenTokens(activeChain.id).has(token.contractAddress.toLowerCase()))
  const toggleHidden = async () => {
    if (!token.contractAddress) return
    if (!hidden && !(await confirm({ title: `Hide ${token.symbol}`, message: `${token.symbol} leaves your token lists on ${activeChain.name}; the balance is untouched. Show it again from All tokens → Show hidden.`, confirmLabel: 'Hide' }))) return
    setTokenHidden(activeChain.id, token.contractAddress, !hidden)
    setHidden(!hidden)
  }

  useEffect(() => {
    let live = true
    const load = async (): Promise<PriceHistoryPoint[]> => {
      if (qrdx) return tokenPriceHistory(activeChain, isNative ? 'qrdx' : token.contractAddress!, range)
      const id = symbolToCoingeckoId(token.symbol)
      if (!id) return []
      const points = await fetchPriceHistory(id, RANGE_DAYS[range])
      return range === '1H' ? points.filter((p) => p.timestamp >= Date.now() - 3_600_000) : points
    }
    load()
      .then((h) => live && setLoaded({ key: historyKey, points: h }))
      .catch(() => live && setLoaded({ key: historyKey, points: [] }))
    return () => {
      live = false
    }
  }, [range, token.symbol, token.contractAddress, activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!qrdx || isNative) return
    let live = true
    getEvmProvider(activeChain.id)
      .rpc<NodeToken | null>('exchange_getToken', [token.contractAddress])
      .then((t) => live && setInfo(t))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [qrdx, isNative, token.contractAddress, activeChain.id])

  // The change over the range shown, from the chart; the 24 h figure without one.
  const rangeChange = useMemo(() => {
    if (history && history.length > 1 && history[0].price > 0) return ((history[history.length - 1].price - history[0].price) / history[0].price) * 100
    return range === '1D' ? token.change24h : null
  }, [history, range, token.change24h])

  const key = (token.contractAddress ?? '').toLowerCase()
  const classic = balances.find((b) => b.address.toLowerCase() === key)
  const pq = pqBalances.find((b) => b.address.toLowerCase() === key)
  const activity = transactions.filter((t) => (isNative ? !t.tokenSymbol : t.tokenSymbol?.toUpperCase() === token.symbol.toUpperCase())).slice(0, 8)

  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      {confirmDialog}
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Avatar className="h-8 w-8">
            <AvatarImage src={token.icon} alt={token.symbol} referrerPolicy="no-referrer" className="logo-mono object-cover" />
            <AvatarFallback className="bg-accent text-xs font-bold">{token.symbol.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{token.name}</h1>
            <p className="text-[10px] text-muted-foreground">{token.symbol}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-3">
        <div>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{price ? formatUsd(price.usd) : '—'}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {rangeChange != null ? `${rangeChange >= 0 ? '+' : ''}${rangeChange.toFixed(2)}% · ${range}` : price ? 'no change data' : 'No USD price for this token'}
          </p>
          <PortfolioChart data={history ?? []} change24h={rangeChange ?? 0} changeLabel={range} />
          <div className="mt-2 flex gap-1 rounded-xl bg-accent/30 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn('flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors', range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {r}
              </button>
            ))}
          </div>
          {history !== null && history.length === 0 && <p className="mt-1 text-center text-[10px] text-muted-foreground">No market chart for {token.symbol} on {activeChain.name} yet.</p>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            ['send', 'Send', ArrowUpRight],
            ['receive', 'Receive', ArrowDownLeft],
            ['swap', 'Swap', ArrowLeftRight],
          ] as const).map(([action, label, Icon]) => (
            <button key={action} type="button" onClick={() => onAction(action, token)} className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 py-3 text-xs font-medium hover:bg-accent/40">
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <section className="rounded-xl glass p-3">
          <p className="mb-2 text-xs font-semibold">Your balance</p>
          <p className="text-xl font-bold tabular-nums">{token.value || `${token.balance} ${token.symbol}`}</p>
          {token.value && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {token.balance} {token.symbol}
            </p>
          )}
          {qrdx && (
            <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px] tabular-nums">
              <Row k="Post-quantum address" v={`${pq ? formatAmount(pq.rawBalance, pq.decimals) : '0'} ${token.symbol}`} />
              <Row k="EVM address" v={`${classic ? formatAmount(classic.rawBalance, classic.decimals) : '0'} ${token.symbol}`} />
            </div>
          )}
        </section>

        <section className="rounded-xl glass p-3 text-[11px]">
          <p className="mb-2 text-xs font-semibold">About</p>
          <div className="space-y-1.5 tabular-nums">
            <Row k="Network" v={activeChain.name} />
            <Row k="Decimals" v={String(token.decimals)} />
            {isNative && <Row k="Type" v={`${activeChain.name}'s native coin`} />}
            {info && (
              <>
                <Row k="Total supply" v={`${Number(info.total_supply).toLocaleString('en-US')} ${info.symbol}`} />
                <Row k="Max supply" v={info.max_supply ? Number(info.max_supply).toLocaleString('en-US') : 'none (mintable)'} />
                <Row k="Mint authority" v={info.mint_authority ? formatAddress(info.mint_authority, 6) : 'renounced: fixed supply'} />
                <Row k="Freeze authority" v={info.freeze_authority ? formatAddress(info.freeze_authority, 6) : 'none'} />
                <Row k="Creator" v={formatAddress(info.creator, 6)} />
              </>
            )}
            {token.contractAddress && <Row k="Address" v={formatAddress(token.contractAddress, 8)} />}
          </div>
          {token.contractAddress && (
            <button type="button" onClick={() => void toggleHidden()} className="mt-3 flex items-center gap-1.5 text-xs font-medium hover:underline">
              {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {hidden ? 'Show this token again' : 'Hide token'}
            </button>
          )}
          {token.contractAddress && (
            <a href={`${activeChain.explorerUrl}/address/${token.contractAddress}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-xs font-medium hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> View on the explorer
            </a>
          )}
        </section>

        <section className="rounded-xl glass p-3">
          <p className="mb-2 text-xs font-semibold">Activity</p>
          {activity.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No {token.symbol} activity on this account yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {activity.map((t) => (
                <a key={t.hash} href={t.explorerUrl ?? `${activeChain.explorerUrl}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-2 text-[11px] hover:opacity-80">
                  <span className="flex items-center gap-2">
                    {t.type === 'receive' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    <span className="capitalize">{t.type}</span>
                    <span className="text-muted-foreground">{new Date(t.timestamp * 1000).toLocaleDateString()}</span>
                  </span>
                  <span className="tabular-nums">{t.tokenAmount ? `${t.tokenAmount} ${t.tokenSymbol}` : t.value}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="min-w-0 truncate text-right">{v}</span>
    </div>
  )
}
