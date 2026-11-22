'use client'

/** The portfolio's value history for a range (src/core/portfolio-history.ts), rebuilt when the portfolio changes. */

import { useEffect, useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { fetchValueHistory, type ValueHistory, type ValueRange } from '@/src/core/portfolio-history'
import type { Portfolio } from '@/src/core/portfolio'
import type { WalletAccount } from '@/src/core/types'
import type { ChainAddresses } from '@/src/core/other-chains'

/** Whose history: the open account by default, or a watched address (src/core/watch-list.ts). */
export interface HistorySubject {
  id: string
  account: WalletAccount
  addresses: ChainAddresses | null
}

export function useValueHistory(portfolio: Portfolio | null, range: ValueRange, subject?: HistorySubject): { history: ValueHistory | null; loading: boolean } {
  const { currentWallet, chainAddresses } = useWallet()
  const who: HistorySubject | null = subject ?? (currentWallet ? { id: currentWallet.id, account: currentWallet, addresses: chainAddresses } : null)
  const key = portfolio && who ? `${who.id}:${portfolio.at}:${range}` : null
  const [state, setState] = useState<{ key: string; history: ValueHistory } | null>(null)

  useEffect(() => {
    if (!key || !portfolio || !who) return
    let live = true
    fetchValueHistory(portfolio, { account: who.account, addresses: who.addresses, range })
      .then((history) => live && setState({ key, history }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const history = state?.key === key ? state.history : null
  return { history, loading: !!key && !history }
}
