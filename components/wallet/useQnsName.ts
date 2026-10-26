'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { reverseQns } from '@/src/core/qns'

/**
 * An address's primary QRDX name on the active network (its reverse record, only while the
 * name points back to it), or null. Cached per address for a few minutes (src/core/qns.ts).
 */
export function usePrimaryName(address: string | null | undefined): string | null {
  const { activeChain } = useWallet()
  const key = address ? `${activeChain.id}:${address.toLowerCase()}` : ''
  const [found, setFound] = useState<{ key: string; name: string | null } | null>(null)
  useEffect(() => {
    if (!address) return
    let live = true
    reverseQns(activeChain, address).then((name) => live && setFound({ key, name }))
    return () => {
      live = false
    }
  }, [activeChain, address, key])
  return found?.key === key ? found.name : null
}
