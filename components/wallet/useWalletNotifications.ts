'use client'

import { useEffect } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { crossedAlerts, notify, readNotifyPrefs, securityEvents, snapshotOf, writeNotifyPrefs, type AuthoritySnapshot } from '@/src/core/notify'
import { formatFiat } from '@/src/core/fiat'
import { isQrdxChain } from '@/src/core/chains'
import { accountAuthority } from '@/src/core/qns'

const seenKey = (accountId: string) => `qrdx_notify_seen:${accountId}`
const authorityKey = (chainId: string, address: string) => `qrdx_notify_authority:${chainId}:${address.toLowerCase()}`
/** How often the open wallet looks at who may sign for the account. */
const AUTHORITY_POLL_MS = 60_000

/**
 * Notifications while the wallet is open (src/core/notify.ts): a received transfer, a send
 * that confirmed, a price alert that crossed, a change to who may sign for the account. The
 * first look at an account only records what is there, so opening the wallet does not replay
 * its history.
 */
export function useWalletNotifications() {
  const { transactions, prices, currentWallet, activeChain } = useWallet()

  // Both of the account's addresses: a waiting change or a recovery is the moment to act.
  useEffect(() => {
    if (!currentWallet || !isQrdxChain(activeChain)) return
    const watched = [
      { address: currentWallet.pqAddress, label: currentWallet.name },
      { address: currentWallet.ethAddress, label: `${currentWallet.name}'s classic address` },
    ]
    let live = true
    const look = async () => {
      if (!readNotifyPrefs().security) return
      for (const w of watched) {
        const auth = await accountAuthority(activeChain, w.address).catch(() => null)
        if (!live || !auth) continue
        const key = authorityKey(activeChain.id, w.address)
        let before: AuthoritySnapshot | null = null
        try {
          before = JSON.parse(localStorage.getItem(key) ?? 'null')
        } catch {
          before = null
        }
        if (before && Array.isArray(before.controllers) && Array.isArray(before.pending)) {
          for (const e of securityEvents(w.label, before, auth)) void notify(e.title, e.body, e.tag)
        }
        try {
          localStorage.setItem(key, JSON.stringify(snapshotOf(auth)))
        } catch {
          /* storage unavailable */
        }
      }
    }
    void look()
    const t = setInterval(look, AUTHORITY_POLL_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [currentWallet?.id, activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
