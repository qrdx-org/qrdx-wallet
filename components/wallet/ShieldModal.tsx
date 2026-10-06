'use client'

/**
 * Shield (classical → quantum-safe bridge).
 *
 * The node implements the shielding protocol (qrdx/bridge/shielding.py) but
 * exposes no user-callable shield/unshield transaction or RPC yet, and its
 * bridge RPC module is not registered. The previous screen simulated a
 * three-step bridge with timers, which told users funds had moved when
 * nothing happened. Until the node ships the endpoint this screen explains
 * the feature and offers the part that already works: moving funds from the
 * classic account to the quantum-safe account on QRDX.
 */

import { ArrowLeft, Shield, ShieldCheck, Send } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { Notice } from './flow/FlowKit'

interface ShieldModalProps {
  onClose: () => void
  /** Open the send screen (used to move classic funds to the quantum-safe account). */
  onSend?: () => void
}

export function ShieldModal({ onClose, onSend }: ShieldModalProps) {
  const { activeChain, currentWallet } = useWallet()
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
          <h2 className="text-base font-bold">Cross-chain shielding is not live yet</h2>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">
            Shielding locks ETH, BTC or USDC on their home chains and mints quantum-safe qETH, qBTC
            or qUSDC on QRDX. The QRDX network does not accept shielding transactions yet; this
            screen will enable itself when it does.
          </p>
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
