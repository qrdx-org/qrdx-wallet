'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  RefreshCw,
  ShieldAlert,
  WifiOff,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain, type ChainConfig } from '@/src/core/chains'

/**
 * Network picker with live endpoint status.
 *
 * The status dot reflects a real `eth_chainId` probe rather than an assumption
 * that a configured network is reachable. The three failure-relevant states are
 * kept visually distinct because they need different user action:
 *
 *   • connected  — the node answered and its chain ID matches the registry.
 *   • mismatch   — the node answered with a *different* chain ID. Signing is
 *                  blocked; the user is shown both values and can accept the
 *                  reported one deliberately.
 *   • unreachable— nothing answered. Retrying is the only useful action.
 */
export function NetworkSelector() {
  const {
    activeChain,
    setActiveChain,
    chains,
    networkStatus,
    refreshNetworkStatus,
    trustActiveChainId,
    showTestnets,
    updateSettings,
  } = useWallet()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape so the dropdown never traps the user.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Testnets stay hidden unless enabled, but never hide the one in use —
  // otherwise the selector would show nothing for the active network.
  const { qrdxChains, otherChains } = useMemo(() => {
    const visible = chains.filter(
      c => !c.isTestnet || showTestnets || c.id === activeChain.id,
    )
    return {
      qrdxChains: visible.filter(isQrdxChain),
      otherChains: visible.filter(c => !isQrdxChain(c)),
    }
  }, [chains, showTestnets, activeChain.id])

  const dot =
    networkStatus.state === 'connected'
      ? 'bg-green-500'
      : networkStatus.state === 'mismatch'
        ? 'bg-amber-500'
        : networkStatus.state === 'unreachable'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40'

  const statusLabel =
    networkStatus.state === 'connected'
      ? `Chain ${networkStatus.chainId}`
      : networkStatus.state === 'mismatch'
        ? 'Chain ID mismatch'
        : networkStatus.state === 'unreachable'
          ? 'Unreachable'
          : networkStatus.state === 'checking'
            ? 'Connecting…'
            : ''

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/40 border border-border/50 hover:bg-accent/60 transition-colors"
      >
        {networkStatus.state === 'checking' ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${dot}`} />
        )}
        <span className="text-[10px] font-semibold">{activeChain.shortName}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-72 max-h-[26rem] overflow-y-auto rounded-xl glass-strong border border-border/60 shadow-lg z-50 p-1.5"
        >
          <ChainGroup
            label="QRDX"
            items={qrdxChains}
            activeId={activeChain.id}
            onSelect={id => {
              setActiveChain(id)
              setOpen(false)
            }}
          />
          {otherChains.length > 0 && (
            <ChainGroup
              label="EVM networks"
              items={otherChains}
              activeId={activeChain.id}
              onSelect={id => {
                setActiveChain(id)
                setOpen(false)
              }}
            />
          )}

          {/* Testnets are hidden by default so a production wallet does not
              present them as ordinary options, but the toggle lives here rather
              than only in Settings — developers switching to a local node
              should not have to hunt for it. */}
          <div className="border-t border-border/50 mt-1 pt-1">
            <label className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-accent/40 cursor-pointer">
              <span className="text-[11px] text-muted-foreground">
                Show test networks
              </span>
              <input
                type="checkbox"
                checked={showTestnets}
                onChange={e => {
                  void updateSettings({ showTestnets: e.target.checked })
                }}
                className="h-3.5 w-3.5 accent-primary"
              />
            </label>
          </div>
        </div>
      )}

      <span className="sr-only">{statusLabel}</span>
    </div>
  )
}

function ChainGroup({
  label,
  items,
  activeId,
  onSelect,
}: {
  label: string
  items: ChainConfig[]
  activeId: string
  onSelect: (id: string) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="mb-1 last:mb-0">
      <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </div>
      {items.map(chain => (
        <button
          key={chain.id}
          role="option"
          aria-selected={chain.id === activeId}
          onClick={() => onSelect(chain.id)}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${
            chain.id === activeId ? 'bg-accent/60' : 'hover:bg-accent/40'
          }`}
        >
          <span
            className={`h-6 w-6 rounded-lg bg-gradient-to-br ${chain.color} shrink-0`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-medium truncate">{chain.name}</span>
              {chain.isTestnet && (
                <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[8px] font-bold uppercase shrink-0">
                  Test
                </span>
              )}
            </span>
            <span className="block text-[10px] text-muted-foreground truncate">
              {chain.nativeCurrency.symbol} · chain {chain.chainId}
            </span>
          </span>
          {chain.id === activeId && (
            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Blocking network problems, rendered inline in the page flow.
 *
 * Deliberately not an overlay anchored to the selector: mismatch and
 * unreachable are persistent states, not transient popovers, and floating them
 * over the dashboard hid the balance card behind the warning. An inline banner
 * stays visible, pushes content down instead of obscuring it, and keeps the
 * remedial action next to the explanation.
 *
 * Renders nothing while the network is healthy, connecting, or idle.
 */
export function NetworkStatusBanner() {
  const { activeChain, networkStatus, refreshNetworkStatus, trustActiveChainId } =
    useWallet()

  if (networkStatus.state === 'mismatch') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <p className="font-semibold text-amber-500">Signing disabled</p>
            <p className="text-muted-foreground mt-1">
              {activeChain.name} is configured as chain{' '}
              <span className="font-mono">{networkStatus.configuredChainId}</span>,
              but the node reports{' '}
              <span className="font-mono">{networkStatus.liveChainId}</span>.
              Transactions signed now could be valid on a different chain.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2.5">
          <Button
            variant="outline"
            className="flex-1 h-7 text-[11px] glass"
            onClick={() => refreshNetworkStatus()}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Recheck
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-7 text-[11px] border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
            onClick={() => trustActiveChainId()}
          >
            Trust {networkStatus.liveChainId}
          </Button>
        </div>
      </div>
    )
  }

  if (networkStatus.state === 'unreachable') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-start gap-2">
          <WifiOff className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed min-w-0">
            <p className="font-semibold text-red-500">
              Can&apos;t reach {activeChain.name}
            </p>
            <p className="text-muted-foreground mt-1 break-words">
              {networkStatus.message}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full h-7 text-[11px] mt-2.5 glass"
          onClick={() => refreshNetworkStatus()}
        >
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    )
  }

  return null
}
