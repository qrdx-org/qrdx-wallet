'use client'

/**
 * Shield (classical → quantum-safe bridge).
 *
 * The node's consensus bridge (qrdx-node docs/BRIDGE.md) mints a bridged token when the
 * validators attest a deposit into the lockbox on its home chain, and burns it on
 * BRIDGE_WITHDRAW. Which assets a network bridges is its chain spec's BRIDGE_ASSETS, read
 * here with bridge_getAssets: the screen lists them, or says the network bridges none. It
 * also offers what works on every QRDX network: moving funds from the classic account to
 * the quantum-safe one.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, Shield, ShieldCheck, Send } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { getEvmProvider } from '@/src/core/ethereum'

/** bridge_getAssets (qrdx-node rpc/modules/bridge_ledger.py: BridgeAsset.summary() and the supply here). */
interface BridgeAsset {
  symbol: string
  /** The source chain's EIP-155 id. */
  chain: number
  source_token: string
  /** The bridged token on QRDX. */
  token_address: string
  decimals: number
  supply: string
}
import { Notice } from './flow/FlowKit'

interface ShieldModalProps {
  onClose: () => void
  /** Open the send screen (used to move classic funds to the quantum-safe account). */
  onSend?: () => void
}

export function ShieldModal({ onClose, onSend }: ShieldModalProps) {
  const { activeChain, currentWallet } = useWallet()
  const [fetched, setAssets] = useState<BridgeAsset[] | null | undefined>(undefined)
  const assets = isQrdxChain(activeChain) ? fetched : null
  useEffect(() => {
    if (!isQrdxChain(activeChain)) return
    let live = true
    getEvmProvider(activeChain.id)
      .rpc<BridgeAsset[]>('bridge_getAssets')
      .then((a) => live && setAssets(Array.isArray(a) ? a : []))
      .catch(() => live && setAssets(null))
    return () => {
      live = false
    }
  }, [activeChain.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="h-8 w-8 rounded-lg hover:bg-accent/50 flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Shield</h1>
            <p className="text-[10px] text-muted-foreground">
              Bring assets under post-quantum protection
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-foreground/10 items-center justify-center mb-3">
            <Shield className="h-7 w-7 text-foreground/70" />
          </div>
          <h2 className="text-base font-bold">
            {assets && assets.length ? `${activeChain.name} bridges ${assets.length} asset${assets.length === 1 ? '' : 's'}` : 'No bridged assets on this network yet'}
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">
            Shielding locks an asset in a lockbox on its home chain; QRDX validators attest the
            deposit and mint its quantum-safe twin on QRDX. Which assets a network bridges is set
            in its chain spec.
            {assets === null ? ' This node did not answer for its bridge.' : assets && !assets.length ? ` ${activeChain.name} bridges none so far.` : ''}
          </p>
          {assets && assets.length > 0 && (
            <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/70 text-left text-xs">
              {assets.map((a) => (
                <div key={a.token_address} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-semibold">{a.symbol}</span>
                    <span className="block text-[10px] text-muted-foreground">from chain {a.chain}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{Number(a.supply).toLocaleString('en-US')} on QRDX</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isQrdxChain(activeChain) && currentWallet && (
          <div className="rounded-xl glass p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1">
              <ShieldCheck className="h-4 w-4 text-primary" /> Protect your QRDX today
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Your classic (0x) account is secured by secp256k1, which a large quantum computer
              could break. Your quantum-safe account is secured by ML-DSA-65. Moving QRDX from the
              classic account to the quantum-safe one protects it now.
            </p>
            {onSend && (
              <button
                type="button"
                onClick={onSend}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" /> Send to my quantum-safe account
              </button>
            )}
            <p className="text-[10px] text-muted-foreground mt-2 font-mono break-all">
              {currentWallet.pqAddress}
            </p>
          </div>
        )}

        <Notice>
          The fee will be 0.1% (BRIDGE_FEE_BPS = 10), with confirmations required on the source
          chain (12 for Ethereum, 6 for Bitcoin). If the network’s quantum canary is ever drained,
          shielding stops and unshielding stays open so funds can always leave.
        </Notice>
      </div>
    </div>
  )
}
