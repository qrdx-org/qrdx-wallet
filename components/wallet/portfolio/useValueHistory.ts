'use client'

/** The portfolio's value history for a range (src/core/portfolio-history.ts), rebuilt when the portfolio changes. */

import { useEffect, useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { fetchValueHistory, type ValueHistory, type ValueRange } from '@/src/core/portfolio-history'
import type { Portfolio } from '@/src/core/portfolio'

export function useValueHistory(portfolio: Portfolio | null, range: ValueRange): { history: ValueHistory | null; loading: boolean } {
  const { currentWallet, chainAddresses } = useWallet()
  const key = portfolio && currentWallet ? `${currentWallet.id}:${portfolio.at}:${range}` : null
  const [state, setState] = useState<{ key: string; history: ValueHistory } | null>(null)

  useEffect(() => {
    if (!key || !portfolio || !currentWallet) return
    let live = true
    fetchValueHistory(portfolio, { account: currentWallet, addresses: chainAddresses, range })
      .then((history) => live && setState({ key, history }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const history = state?.key === key ? state.history : null
  return { history, loading: !!key && !history }
}
