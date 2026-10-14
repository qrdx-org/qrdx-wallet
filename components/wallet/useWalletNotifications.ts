'use client'

import { useEffect } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { crossedAlerts, notify, readNotifyPrefs, writeNotifyPrefs } from '@/src/core/notify'
import { formatFiat } from '@/src/core/fiat'

const seenKey = (accountId: string) => `qrdx_notify_seen:${accountId}`

/**
 * Notifications while the wallet is open (src/core/notify.ts): a received transfer, a send
 * that confirmed, a price alert that crossed. The first look at an account only records what
 * is there, so opening the wallet does not replay its history.
 */
export function useWalletNotifications() {
  const { transactions, prices, currentWallet, activeChain } = useWallet()

  useEffect(() => {
    if (!currentWallet || !transactions.length) return
    const prefs = readNotifyPrefs()
    let seen: Record<string, string> | null = null
    try {
      seen = JSON.parse(localStorage.getItem(seenKey(currentWallet.id)) ?? 'null')
    } catch {
      seen = null
    }
    const first = !seen || typeof seen !== 'object'
    const next: Record<string, string> = first ? {} : { ...seen! }
    for (const t of transactions) {
      const before = next[t.hash]
      next[t.hash] = t.status
      if (first || !prefs.transactions) continue
      const amount = t.tokenAmount ? `${t.tokenAmount} ${t.tokenSymbol ?? ''}`.trim() : t.value
      if (!before && t.type === 'receive') void notify(`Received ${amount}`, `On ${activeChain.name}, to ${currentWallet.name}.`, t.hash)
      else if (before === 'pending' && t.status === 'confirmed' && t.type !== 'receive') void notify(`Confirmed: ${amount}`, `Your ${t.type} on ${activeChain.name} is in a block.`, t.hash)
      else if (before === 'pending' && t.status === 'failed') void notify('Transaction failed', `Your ${t.type} of ${amount} on ${activeChain.name} failed.`, t.hash)
    }
    try {
      // Keep the newest few hundred: enough to recognise what was already announced.
      const entries = Object.entries(next).slice(-500)
      localStorage.setItem(seenKey(currentWallet.id), JSON.stringify(Object.fromEntries(entries)))
    } catch {
      /* storage unavailable */
    }
  }, [transactions, currentWallet?.id, activeChain.name]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prefs = readNotifyPrefs()
    if (!prefs.priceAlerts || !prefs.alerts.length || !prices.size) return
    const fired = crossedAlerts(prefs.alerts, prices)
    if (!fired.length) return
    for (const a of fired) {
      const now = prices.get(a.symbol.toUpperCase())?.usd ?? a.price
      void notify(`${a.symbol} is ${a.direction} ${formatFiat(a.price)}`, `${a.symbol} is at ${formatFiat(now)}.`, `alert:${a.id}`)
    }
    // An alert fires once; set it again to be told again.
    writeNotifyPrefs({ ...prefs, alerts: prefs.alerts.filter((a) => !fired.some((f) => f.id === a.id)) })
  }, [prices])
}
