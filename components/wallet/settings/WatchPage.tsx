'use client'

/**
 * Watched addresses: follow any address's portfolio, read-only (src/core/watch-list.ts). A
 * QRDX name (alice.qrdx) is resolved once, when it is added.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Eye, Trash2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { fetchPortfolio, portfolioChains, type Asset, type Portfolio } from '@/src/core/portfolio'
import { isQnsName, resolveQnsName } from '@/src/core/qns'
import { addWatched, onWatchChange, removeWatched, watchAccount, watchChains, watchedAddresses, watchKind, type WatchedAddress, type WatchKind } from '@/src/core/watch-list'
import { CopyButton, ErrorBanner, Notice, PrimaryButton, TextField } from '../flow/FlowKit'
import { AssetList, PortfolioSummary } from '../portfolio/PortfolioHome'
import { AssetPage } from '../portfolio/AssetPage'
import { Section, SettingsPage } from './shared'

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`
const KIND_LABEL: Record<WatchKind, string> = {
  evm: 'EVM networks and QRDX',
  pq: 'QRDX, quantum-safe',
  bitcoin: 'Bitcoin',
  'bitcoin-testnet': 'Bitcoin Testnet4',
  solana: 'Solana',
}
const EMPTY: WatchedAddress[] = []

function useWatched(): WatchedAddress[] {
  return useSyncExternalStore(onWatchChange, watchedAddresses, () => EMPTY)
}

export function WatchPage({ onBack }: { onBack: () => void }) {
  const { homeQrdxChain } = useWallet()
  const list = useWatched()
  const [open, setOpen] = useState<WatchedAddress | null>(null)
  const [input, setInput] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (open) return <WatchedPortfolio watched={open} onBack={() => setOpen(null)} />

  const add = async () => {
    setError(null)
    let address = input.trim()
    let name = label
    if (isQnsName(address)) {
      setBusy(true)
      try {
        const r = await resolveQnsName(homeQrdxChain, address)
        if (r.state !== 'resolved') throw new Error(r.state === 'unsupported' ? `${homeQrdxChain.name} does not resolve names` : `${r.name} is not registered`)
        name ||= r.name
        address = r.address
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not resolve the name')
        return
      } finally {
        setBusy(false)
      }
    }
    if (!watchKind(address)) return setError('Enter a 0x, 0xPQ, Bitcoin or Solana address, or a .qrdx name.')
    setOpen(addWatched(address, name))
    setInput('')
    setLabel('')
  }

  return (
    <SettingsPage title="Watched addresses" onBack={onBack}>
      <Notice icon={<Eye className="h-4 w-4" />}>
        Follow any address&apos;s portfolio: a cold wallet, a treasury, a friend&apos;s public address. The wallet only reads it; it cannot sign for it. Kept in this browser.
      </Notice>

      {list.length > 0 && (
        <Section title="Watching">
          {list.map((w) => (
            <div key={w.address} className="flex items-center gap-1">
              <button type="button" onClick={() => setOpen(w)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left hover:bg-accent/40">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Eye className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{w.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {short(w.address)} · {KIND_LABEL[watchKind(w.address)!]}
                  </div>
                </div>
              </button>
              <button type="button" onClick={() => removeWatched(w.address)} aria-label={`Stop watching ${w.label}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title="Watch an address">
        <div className="space-y-3 p-2">
          <TextField label="Address or .qrdx name" value={input} onChange={setInput} placeholder="0x…, 0xPQ…, bc1…, or alice.qrdx" />
          <TextField label="Name (optional)" value={label} onChange={setLabel} placeholder="Cold wallet" maxLength={40} />
          <ErrorBanner error={error} />
          <PrimaryButton onClick={add} loading={busy} disabled={!input.trim()}>
            Watch
          </PrimaryButton>
        </div>
      </Section>
    </SettingsPage>
  )
}

function WatchedPortfolio({ watched, onBack }: { watched: WatchedAddress; onBack: () => void }) {
  const { chains, homeQrdxChain, showTestnets } = useWallet()
  const networks = useMemo(() => watchChains(watched.address, portfolioChains(chains, homeQrdxChain, showTestnets)), [watched.address, chains, homeQrdxChain, showTestnets])
  const subject = useMemo(() => ({ id: `watch:${watched.address}`, ...watchAccount(watched.address) }), [watched.address])
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ version: number; portfolio: Portfolio | null } | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)

  useEffect(() => {
    let live = true
    fetchPortfolio({ chains: networks, account: subject.account, addresses: subject.addresses, extraTokens: () => Promise.resolve([]) })
      .then((p) => live && setResult({ version, portfolio: p }))
      .catch(() => live && setResult((r) => ({ version, portfolio: r?.portfolio ?? null })))
    return () => {
      live = false
    }
  }, [networks, subject, version])

  const portfolio = result?.portfolio ?? null
  const loading = result?.version !== version
  const load = () => setVersion((v) => v + 1)

  if (asset) return <AssetPage asset={asset} onClose={() => setAsset(null)} onSend={() => undefined} onReceive={() => undefined} onTrade={() => undefined} readOnly />

  return (
    <div className="min-h-screen mono-backdrop">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onBack} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{watched.label}</h1>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Eye className="h-3 w-3" /> Watching {short(watched.address)}
            </p>
          </div>
          <CopyButton text={watched.address} label="Copy address" />
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 pb-safe">
        <PortfolioSummary portfolio={portfolio} loading={loading} onRefresh={load} visible subject={subject} />
        <AssetList portfolio={portfolio} onOpen={setAsset} visible />
        <p className="px-1 text-[10px] text-muted-foreground">Read on {networks.map((c) => c.name).join(', ')}.</p>
      </div>
    </div>
  )
}
