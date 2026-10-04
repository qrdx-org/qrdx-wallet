'use client'

/**
 * Perpetuals overview (read-only).
 *
 * The node's perps clearinghouse is live but waiting on its bridged stablecoin
 * (qrdx-node docs/KNOWN_ISSUES.md), so the wallet shows real markets and the
 * account's perp position read from `perp_getMarkets` / `perp_getAccount`
 * rather than trading from here. Order entry belongs in a full trading UI,
 * which connects to the wallet through the extension provider
 * (`qrdx_sendExchangeTransaction`). The previous screen listed invented pairs.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, BarChart3, Loader2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'
import { getEvmProvider } from '@/src/core/ethereum'
import { ErrorBanner, Notice } from './flow/FlowKit'

interface TradeModalProps {
  onClose: () => void
}

interface PerpMarket {
  market_id: string
  oracle_price?: string
  mark_price?: string
  open_interest?: string
  funding_rate?: string
}

export function TradeModal({ onClose }: TradeModalProps) {
  const { activeChain, currentWallet } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const [markets, setMarkets] = useState<PerpMarket[] | null>(null)
  const [account, setAccount] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!qrdx) return
    const p = getEvmProvider(activeChain.id)
    p.rpc<PerpMarket[]>('perp_getMarkets').then(setMarkets, (e) =>
      setError(e instanceof Error ? e.message : 'Could not load markets')
    )
    if (currentWallet)
      p.rpc<Record<string, unknown>>('perp_getAccount', [currentWallet.pqAddress]).then(
        setAccount,
        () => setAccount(null)
      )
  }, [qrdx, activeChain.id, currentWallet])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
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
            <h1 className="text-base font-semibold">Perpetuals</h1>
            <p className="text-[10px] text-muted-foreground">Markets on the QRDX clearinghouse</p>
          </div>
        </div>
      </div>
      <div className="flex-1 px-4 py-3 space-y-3">
        {!qrdx ? (
          <div className="text-center py-12">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Perpetuals run on QRDX networks</p>
          </div>
        ) : (
          <>
            <Notice>
              Read-only preview. Trade from a QRDX trading app connected to this wallet; every order
              is approved here and signed with your quantum-safe key.
            </Notice>
            <ErrorBanner error={error} />
            {markets === null && !error && (
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            )}
            {markets?.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                No markets are open on {activeChain.name}.
              </p>
            )}
            {markets?.map((m) => (
              <div key={m.market_id} className="rounded-xl glass p-3 text-[12px]">
                <div className="font-semibold mb-1">{m.market_id}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                  {m.mark_price && (
                    <span>
                      Mark{' '}
                      <span className="text-foreground">
                        {Number(m.mark_price).toLocaleString()}
                      </span>
                    </span>
                  )}
                  {m.oracle_price && (
                    <span>
                      Oracle{' '}
                      <span className="text-foreground">
                        {Number(m.oracle_price).toLocaleString()}
                      </span>
                    </span>
                  )}
                  {m.open_interest && (
                    <span>
                      Open interest <span className="text-foreground">{m.open_interest}</span>
                    </span>
                  )}
                  {m.funding_rate && (
                    <span>
                      Funding <span className="text-foreground">{m.funding_rate}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {account && (
              <div className="rounded-xl glass p-3 text-[12px]">
                <div className="font-semibold mb-1">Your perp account</div>
                {['collateral', 'equity', 'withdrawable']
                  .filter((k) => account[k] !== undefined)
                  .map((k) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k}</span>
                      <span>{String(account[k])}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
