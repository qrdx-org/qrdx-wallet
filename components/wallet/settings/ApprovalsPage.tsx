'use client'

/**
 * Token approvals across the account's networks: who may spend what from its 0x address, and
 * Revoke for each (src/core/approvals.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { portfolioChains } from '@/src/core/portfolio'
import { approvalsSupported, fetchApprovals, revokeCall, UNLIMITED, type Approval } from '@/src/core/approvals'
import { sendContractCall } from '@/src/core/tx-service'
import { formatAmount } from '@/src/core/balances'
import type { ChainConfig } from '@/src/core/chains'
import { useConfirm } from '../flow/ConfirmSheet'
import { ErrorBanner, Notice } from '../flow/FlowKit'
import { CoinLogo, NetworkLogo } from '../CoinLogo'
import { SettingsPage } from './shared'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const DOCS = 'https://docs.qrdx.org/docs/guides/wallet'

type NetworkState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; list: Approval[] }

function amountLabel(a: Approval): string {
  if (a.kind === 'all') return 'Every NFT'
  if (a.amount === undefined) return ''
  if (a.amount >= UNLIMITED) return 'Unlimited'
  return a.decimals === undefined ? `${a.amount} units` : formatAmount(a.amount, a.decimals)
}

export function ApprovalsPage({ onBack }: { onBack: () => void }) {
  const { currentWallet, chains, homeQrdxChain, showTestnets, backend } = useWallet()
  const networks = useMemo(() => portfolioChains(chains, homeQrdxChain, showTestnets).filter(approvalsSupported), [chains, homeQrdxChain, showTestnets])
  const owner = currentWallet?.ethAddress
  const [state, setState] = useState<Record<string, NetworkState>>({})
  const [revoked, setRevoked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { dialog, confirm } = useConfirm()

  const load = useCallback(
    (chain: ChainConfig) => {
      if (!owner) return
      setState((s) => ({ ...s, [chain.id]: { status: 'loading' } }))
      fetchApprovals(chain, owner)
        .then((list) => setState((s) => ({ ...s, [chain.id]: { status: 'done', list: list ?? [] } })))
        .catch((e) => setState((s) => ({ ...s, [chain.id]: { status: 'error', message: e instanceof Error ? e.message : 'Could not read it' } })))
    },
    [owner]
  )

  useEffect(() => {
    networks.forEach(load)
  }, [networks, load])

  const keyOf = (a: Approval) => `${a.chain.id}:${a.token}:${a.spender}:${a.kind}`

  const revoke = async (a: Approval) => {
    if (!currentWallet) return
    const what = a.kind === 'all' ? `every ${a.tokenSymbol ?? 'NFT'} you hold` : `your ${a.tokenSymbol ?? 'tokens'}`
    const ok = await confirm({
      title: 'Revoke this approval',
      message: (
        <>
          <strong className="text-foreground">{a.spenderName ?? short(a.spender)}</strong> can no longer move {what} on {a.chain.name}. Your 0x key signs one transaction
          and pays {a.chain.nativeCurrency.symbol} for gas. A site that needs it again will ask again.
        </>
      ),
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    const key = keyOf(a)
    setBusy(key)
    setError(null)
    try {
      const { hash } = await sendContractCall(backend, { chain: a.chain, account: currentWallet, ...revokeCall(a) })
      setRevoked((r) => ({ ...r, [key]: hash }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the transaction')
    } finally {
      setBusy(null)
    }
  }

  const loading = networks.some((c) => state[c.id]?.status === 'loading' || !state[c.id])
  const all = networks.flatMap((c) => (state[c.id]?.status === 'done' ? (state[c.id] as { list: Approval[] }).list : []))
  const scams = all.filter((a) => a.spenderScam && !revoked[keyOf(a)]).length

  return (
    <SettingsPage title="Token approvals" onBack={onBack}>
      {dialog}
      <Notice icon={<ShieldCheck className="h-4 w-4" />}>
        Approving a token lets a site&apos;s contract move it from your 0x address later, often with no limit. Revoke what you no longer use. Approvals given by signature
        (permits) are not listed.{' '}
        <a href={DOCS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          Learn more
        </a>
      </Notice>
      {scams > 0 && (
        <Notice tone="warning" icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}>
          {scams === 1 ? 'One approval goes' : `${scams} approvals go`} to a contract the explorer marks as a scam. Revoke {scams === 1 ? 'it' : 'them'}.
        </Notice>
      )}
      <ErrorBanner error={error} />

      {networks.length === 0 && <p className="px-1 text-xs text-muted-foreground">None of your networks has an explorer the wallet can read approvals from.</p>}

      {networks.map((chain) => {
        const s = state[chain.id]
        if (s?.status === 'done' && s.list.length === 0) return null
        return (
          <section key={chain.id}>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <NetworkLogo chain={chain} size={14} />
              <h2 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{chain.name}</h2>
              {s?.status !== 'loading' && s && (
                <button type="button" onClick={() => load(chain)} aria-label={`Read ${chain.name} again`} className="text-muted-foreground hover:text-foreground">
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="space-y-0.5 rounded-2xl glass p-1.5">
              {(!s || s.status === 'loading') && (
                <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your transactions…
                </p>
              )}
              {s?.status === 'error' && <p className="p-3 text-xs text-muted-foreground">Could not read {chain.name}&apos;s explorer: {s.message}</p>}
              {s?.status === 'done' &&
                s.list.map((a) => {
                  const key = keyOf(a)
                  const hash = revoked[key]
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-xl p-2.5">
                      <CoinLogo symbol={a.tokenSymbol ?? '?'} size={32} verified={chain.tokens.some((t) => t.address.toLowerCase() === a.token)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{a.tokenSymbol ?? short(a.token)}</span>
                          <span className="shrink-0 text-[11px] font-normal text-muted-foreground tabular-nums">{amountLabel(a)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {a.spenderScam && <span className="rounded bg-red-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-red-500">Scam</span>}
                          <a href={`${chain.explorerUrl}/address/${a.spender}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                            {a.spenderName ?? short(a.spender)}
                          </a>
                          {a.approvedAt > 0 && <span className="shrink-0">· {new Date(a.approvedAt * 1000).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      {hash ? (
                        <a href={`${chain.explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                          Revoke sent <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => revoke(a)}
                          disabled={!!busy}
                          className="flex h-8 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent/50 disabled:opacity-50"
                        >
                          {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke'}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          </section>
        )
      })}

      {!loading && networks.length > 0 && all.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">No open approvals on {networks.length === 1 ? networks[0].name : `your ${networks.length} networks`}.</p>
      )}
      {!loading && networks.length > 0 && (
        <p className="px-1 text-[10px] text-muted-foreground">
          Read from {networks.map((c) => c.name).join(', ')}. Networks without a keyless explorer, and QRDX, whose exchange needs no approvals, are not listed.
        </p>
      )}
    </SettingsPage>
  )
}
