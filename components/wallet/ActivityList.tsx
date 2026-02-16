'use client'

import { ArrowUpRight, ArrowDownLeft, RefreshCw, FileCode2, Loader2, ExternalLink } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import type { TransactionHistoryItem } from '@/src/core/history'

function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000

  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`

  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatValue(value: string): string {
  const parts = value.split(' ')
  if (parts.length !== 2) return value
  const num = parseFloat(parts[0])
  if (isNaN(num)) return value
  if (num === 0) return `0 ${parts[1]}`
  if (num < 0.0001) return `<0.0001 ${parts[1]}`
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${parts[1]}`
}

export function ActivityList() {
  const { transactions, transactionsLoading, refreshTransactions, currentWallet } = useWallet()

  const getIcon = (type: TransactionHistoryItem['type']) => {
    switch (type) {
      case 'send':
        return <ArrowUpRight className="h-4 w-4" />
      case 'receive':
        return <ArrowDownLeft className="h-4 w-4" />
      case 'swap':
        return <RefreshCw className="h-4 w-4" />
      case 'contract':
        return <FileCode2 className="h-4 w-4" />
    }
  }

  const getIconStyle = (type: TransactionHistoryItem['type']) => {
    switch (type) {
      case 'send':
        return 'text-red-500 bg-red-500/10'
      case 'receive':
        return 'text-green-500 bg-green-500/10'
      case 'swap':
        return 'text-primary bg-primary/10'
      case 'contract':
        return 'text-blue-400 bg-blue-400/10'
    }
  }

  const getAmountColor = (type: TransactionHistoryItem['type']) => {
    switch (type) {
      case 'send':
        return 'text-red-500'
      case 'receive':
        return 'text-green-500'
      case 'swap':
      case 'contract':
        return 'text-foreground'
    }
  }

  const getAmountPrefix = (type: TransactionHistoryItem['type']) => {
    switch (type) {
      case 'send':
        return '-'
      case 'receive':
        return '+'
      default:
        return ''
    }
  }

  const getStatusBadge = (status: TransactionHistoryItem['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">
            Pending
          </span>
        )
      case 'failed':
        return (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
            Failed
          </span>
        )
      default:
        return null
    }
  }

  if (transactionsLoading && transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mb-2 opacity-50" />
        <p className="text-sm">Loading activity...</p>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <RefreshCw className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">No activity yet</p>
        <p className="text-[10px] opacity-60 mt-1">Transactions will appear here</p>
        <button
          onClick={() => refreshTransactions()}
          className="mt-3 text-[10px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
        >
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="px-1 mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Recent Activity</h3>
        <button
          onClick={() => refreshTransactions()}
          disabled={transactionsLoading}
          className="text-[10px] text-primary font-medium hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          {transactionsLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            'Refresh'
          )}
        </button>
      </div>
      {transactions.slice(0, 20).map((tx, index) => (
        <a
          key={`${tx.hash}-${tx.tokenSymbol ?? ''}`}
          href={tx.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-all cursor-pointer group animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${getIconStyle(tx.type)}`}>
              {tx.status === 'pending' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                getIcon(tx.type)
              )}
            </div>
            <div>
              <div className="font-medium text-sm capitalize flex items-center gap-1.5">
                {tx.type}
                {getStatusBadge(tx.status)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTimestamp(tx.timestamp)}
              </div>
            </div>
          </div>
          <div className="text-right flex items-center gap-2">
            <div>
              <div className={`font-semibold text-sm ${getAmountColor(tx.type)}`}>
                {getAmountPrefix(tx.type)}{formatValue(tx.value)}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {tx.hash.slice(0, 8)}...{tx.hash.slice(-4)}
              </div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
          </div>
        </a>
      ))}
    </div>
  )
}
