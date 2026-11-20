'use client'

/**
 * Networks: pick the active one, show or hide test networks, and add or remove an EVM
 * network of your own (core/chains.ts CustomChain, kept in WalletSettings.customChains).
 * A network is added only after its RPC answers with the chain id it claims.
 */

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, customChainKey, isCustomChain, isQrdxChain, verifyCustomChain, type ChainConfig, type CustomChain } from '@/src/core/chains'
import { SettingsPage, Section } from './shared'
import { ErrorBanner, Notice, PrimaryButton, Sheet, TextField } from '../flow/FlowKit'
import { NetworkLogo } from '../CoinLogo'
import { useConfirm } from '../flow/ConfirmSheet'
import { useShowUnverified } from '../portfolio/PortfolioHome'
import { cn } from '@/lib/utils'

export function NetworksPage({ onBack }: { onBack: () => void }) {
  const { chains, activeChain, setActiveChain, showTestnets, updateSettings, state } = useWallet()
  const [showAll, setShowAll] = useShowUnverified()
  const [adding, setAdding] = useState(false)
  const { dialog, confirm } = useConfirm()
  const custom = state?.settings.customChains ?? []

  const visible = chains.filter((c) => !c.isTestnet || showTestnets || c.id === activeChain.id)
  const groups: [string, ChainConfig[]][] = [
    ['QRDX', visible.filter(isQrdxChain)],
    ['EVM networks', visible.filter((c) => c.isEvm && !isQrdxChain(c) && !isCustomChain(c))],
    ['Bitcoin and Solana', visible.filter((c) => chainFamily(c) !== 'evm')],
    ['Your networks', chains.filter(isCustomChain)],
  ]

  const remove = async (chain: ChainConfig) => {
    if (!(await confirm({ title: `Remove ${chain.name}`, message: 'It leaves your network list. Your funds on it are untouched; add it again any time.', confirmLabel: 'Remove' }))) return
    if (activeChain.id === chain.id) setActiveChain('qrdx-testnet')
    await updateSettings({ customChains: custom.filter((c) => customChainKey(c.chainId) !== chain.id) })
  }

  return (
    <SettingsPage title="Networks" onBack={onBack}>
      {dialog}
      {groups.map(([title, list]) =>
        list.length === 0 && title !== 'Your networks' ? null : (
          <Section
            key={title}
            title={title}
            action={
              title === 'Your networks' ? (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Add
                </button>
              ) : undefined
            }
          >
            {list.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Add any EVM network by its RPC address. Sites can also propose one; you approve it first.</p>
            ) : (
              list.map((c) => (
                <div key={c.id} className="flex items-center">
                  <button
                    type="button"
                    disabled={c.notLive}
                    onClick={() => setActiveChain(c.id)}
                    className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left', c.id === activeChain.id ? 'bg-accent/60' : 'hover:bg-accent/30', c.notLive && 'opacity-50')}
                  >
                    <NetworkLogo chain={c} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{c.name}</span>
                        {c.isTestnet && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-amber-500">Test</span>}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {c.notLive ? 'Not live yet' : c.isEvm ? `${c.nativeCurrency.symbol} · chain ${c.chainId}` : c.nativeCurrency.symbol}
                      </span>
                    </span>
                    {c.id === activeChain.id && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                  {isCustomChain(c) && (
                    <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c.name}`} className="p-3 text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </Section>
        )
      )}

      <Section>
        <label className="flex cursor-pointer items-center justify-between p-3">
          <span>
            <span className="block text-sm font-medium">Show test networks</span>
            <span className="block text-[10px] text-muted-foreground">QRDX Testnet, Sepolia, Bitcoin Testnet4, Solana Devnet and others</span>
          </span>
          <input type="checkbox" checked={showTestnets} onChange={(e) => void updateSettings({ showTestnets: e.target.checked })} className="h-4 w-4 accent-primary" />
        </label>
        <label className="flex cursor-pointer items-center justify-between border-t border-border/40 p-3">
          <span>
            <span className="block text-sm font-medium">Show unverified tokens</span>
            <span className="block text-[10px] text-muted-foreground">List every token you hold, not only verified ones and the ones you trust. They stay unpriced.</span>
          </span>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-primary" />
        </label>
      </Section>

      {adding && (
        <AddNetworkSheet
          onClose={() => setAdding(false)}
          onAdd={async (n) => {
            await updateSettings({ customChains: [...custom.filter((c) => c.chainId !== n.chainId), n] })
            setAdding(false)
            setActiveChain(customChainKey(n.chainId))
          }}
        />
      )}
    </SettingsPage>
  )
}

function AddNetworkSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (n: CustomChain) => Promise<void> }) {
  const { chains } = useWallet()
  const [rpcUrl, setRpcUrl] = useState('')
  const [name, setName] = useState('')
  const [chainId, setChainId] = useState('')
  const [symbol, setSymbol] = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')
  const [isTestnet, setIsTestnet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fill the chain id from the RPC itself, so a typo cannot add the wrong chain.
  const detect = async () => {
    if (!/^https?:\/\//.test(rpcUrl.trim()) || chainId) return
    try {
      const res = await fetch(rpcUrl.trim(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(8000),
      })
      setChainId(String(Number(BigInt((await res.json()).result))))
    } catch {
      /* the check on Add says what is wrong */
    }
  }

  const known = chainId ? chains.find((c) => c.isEvm && c.chainId === Number(chainId) && !isCustomChain(c)) : undefined

  const add = async () => {
    setBusy(true)
    setError(null)
    const network: CustomChain = {
      chainId: Number(chainId),
      name: name.trim(),
      rpcUrl: rpcUrl.trim(),
      symbol: symbol.trim().toUpperCase(),
      explorerUrl: explorerUrl.trim() || undefined,
      isTestnet,
    }
    try {
      await verifyCustomChain(network)
      await onAdd(network)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the network')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Add a network" onClose={onClose}>
      <div className="space-y-3">
        <div onBlur={detect}>
          <TextField label="RPC address" value={rpcUrl} onChange={(v) => (setRpcUrl(v), setChainId(''))} placeholder="https://…" autoFocus />
        </div>
        <TextField label="Chain id" value={chainId} onChange={(v) => setChainId(v.replace(/\D/g, ''))} placeholder="Filled in from the RPC" />
        {known && <Notice tone="warning">Chain {known.chainId} is {known.name}, which the wallet already has. Pick it from the list instead.</Notice>}
        <TextField label="Name" value={name} onChange={setName} placeholder="My network" maxLength={40} />
        <TextField label="Currency symbol" value={symbol} onChange={setSymbol} placeholder="ETH" maxLength={11} />
        <TextField label="Explorer (optional)" value={explorerUrl} onChange={setExplorerUrl} placeholder="https://…" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={isTestnet} onChange={(e) => setIsTestnet(e.target.checked)} className="accent-primary" /> It is a test network
        </label>
        <Notice>The RPC sees your address and what you look up, and could show you wrong balances. Add only one you trust.</Notice>
        <ErrorBanner error={error} />
        <PrimaryButton loading={busy} disabled={!rpcUrl || !chainId || !name || !symbol || !!known} onClick={add}>
          Check and add
        </PrimaryButton>
      </div>
    </Sheet>
  )
}
