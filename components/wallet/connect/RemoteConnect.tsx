'use client'

/**
 * QRDX Connect in the web wallet and the iPhone PWA: sites connected by QR
 * code (src/shared/remote-sessions.ts). This provider owns the sessions, shows
 * their requests with the same approval screen the extension uses, and pairs
 * from a ?connect= link (a QR scanned with the phone camera opens one).
 *
 * In the extension it renders its children and nothing else: there, sites use
 * the injected provider.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApprovalScreen } from '@/components/wallet/approval/ApprovalScreen'
import { createDefaultStorage } from '@/src/core/storage'
import type { ApprovalRequest, ApprovalResult } from '@/src/extension/provider/router'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { RemoteSessions, type SessionView } from '@/src/shared/remote-sessions'

interface PendingApproval {
  request: ApprovalRequest
  resolve: (r: ApprovalResult) => void
}

interface RemoteConnectState {
  available: boolean
  sessions: SessionView[]
  /** Join the session a scanned code or pasted link describes. */
  pair: (input: string) => Promise<SessionView>
  disconnect: (topic: string) => Promise<void>
  /** A pairing started from a ?connect= link, and how it went. */
  linkPairing: { state: 'pairing' | 'done' | 'failed'; message: string } | null
  dismissLinkPairing: () => void
}

const Ctx = createContext<RemoteConnectState | null>(null)

export function useRemoteConnect(): RemoteConnectState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRemoteConnect outside RemoteConnectProvider')
  return v
}

/** The pairing link this page was opened with, if any. */
function connectParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).has('connect') ? window.location.href : null
}

export function RemoteConnectProvider({ children }: { children: React.ReactNode }) {
  const w = useWallet()
  const manager = w.backend.kind === 'local' ? w.backend.manager : undefined
  const available = !!manager
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [queue, setQueue] = useState<PendingApproval[]>([])
  const [linkPairing, setLinkPairing] = useState<RemoteConnectState['linkPairing']>(null)
  const pendingLink = useRef<string | null>(connectParam())
  const ref = useRef<RemoteSessions | null>(null)

  // An unlock request is satisfied by unlocking: the wallet's own unlock screen shows
  // meanwhile, so these wait outside the queue and resolve when the wallet unlocks.
  const unlockWaiters = useRef(new Set<(r: ApprovalResult) => void>())
  const lockedRef = useRef(w.locked)
  useEffect(() => {
    lockedRef.current = w.locked
    if (!w.locked) {
      for (const resolve of unlockWaiters.current) resolve({ approved: true })
      unlockWaiters.current.clear()
    }
  }, [w.locked])

  // Everything else: one approval at a time, in arrival order, as the extension does.
  const requestApproval = useCallback(
    (request: ApprovalRequest) =>
      new Promise<ApprovalResult>((resolve) => {
        if (request.kind === 'unlock') {
          if (!lockedRef.current) return resolve({ approved: true })
          unlockWaiters.current.add(resolve)
          return
        }
        setQueue((q) => [...q, { request, resolve }])
      }),
    []
  )

  useEffect(() => {
    if (!manager || !w.initialized) return
    const rs = new RemoteSessions({ manager, storage: createDefaultStorage(), requestApproval })
    ref.current = rs
    const off = rs.subscribe(() => setSessions(rs.list()))
    void rs.start().then(() => setSessions(rs.list()))
    const wake = () => {
      if (document.visibilityState === 'visible') rs.wake()
    }
    document.addEventListener('visibilitychange', wake)
    return () => {
      off()
      document.removeEventListener('visibilitychange', wake)
      rs.stop()
      ref.current = null
    }
  }, [manager, w.initialized, requestApproval])

  const pair = useCallback(async (input: string) => {
    if (!ref.current) throw new Error('The wallet is not ready yet.')
    return ref.current.pair(input)
  }, [])

  const disconnect = useCallback(async (topic: string) => {
    await ref.current?.disconnect(topic)
  }, [])

  // Opened from a scanned QR (…/wallet?connect=…): pair once the wallet is unlocked.
  useEffect(() => {
    const link = pendingLink.current
    if (!link || !ref.current || w.locked || !w.initialized) return
    pendingLink.current = null
    const url = new URL(window.location.href)
    url.searchParams.delete('connect')
    window.history.replaceState(null, '', url.toString())
    void (async () => {
      await Promise.resolve()
      setLinkPairing({ state: 'pairing', message: 'Connecting…' })
      try {
        const s = await pair(link)
        setLinkPairing({ state: 'done', message: `Connected to ${new URL(s.origin).host}. Approve its request to continue.` })
      } catch (e) {
        setLinkPairing({ state: 'failed', message: (e as Error).message })
      }
    })()
  }, [w.locked, w.initialized, sessions, pair])

  const head = queue[0]

  const resolveHead = useCallback(
    (r: ApprovalResult) => {
      head?.resolve(r)
      setQueue((q) => q.slice(1))
    },
    [head]
  )

  const value = useMemo<RemoteConnectState>(
    () => ({ available, sessions, pair, disconnect, linkPairing, dismissLinkPairing: () => setLinkPairing(null) }),
    [available, sessions, pair, disconnect, linkPairing]
  )

  const showApproval = head && !w.locked
  return (
    <Ctx.Provider value={value}>
      {showApproval ? (
        <ApprovalScreen key={queue.length + ':' + head.request.kind} request={head.request} onResolve={resolveHead} remote />
      ) : (
        children
      )}
    </Ctx.Provider>
  )
}
