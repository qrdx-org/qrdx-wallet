'use client'

/**
 * Getting crypto into the wallet, by the routes that exist. There is no card on-ramp for
 * QRDX: mainnet has not launched, and testnet QRDX has no value and no public faucet
 * (qrdx.org/wallet/funding). The screen says that, and offers what works today: receiving
 * from someone who has it, and swapping what the account already holds.
 */

import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ExternalLink, Info } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { isQrdxChain } from '@/src/core/chains'

interface BuyModalProps {
  onClose: () => void
  /** Open the receive screen (address and QR code). */
  onReceive?: () => void
  /** Open the swap screen. */
  onSwap?: () => void
}

const FUNDING_URL = 'https://qrdx.org/wallet/funding'

export function BuyModal({ onClose, onReceive, onSwap }: BuyModalProps) {
  const { activeChain } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const symbol = activeChain.nativeCurrency.symbol

  return (
    <div className="min-h-screen mono-backdrop flex flex-col">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent/50">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">Get {symbol}</h1>
            <p className="text-[10px] text-muted-foreground">Ways to fund this account on {activeChain.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-4">
        <Option
          icon={<ArrowDownLeft className="h-5 w-5" />}
          title={`Receive ${symbol}`}
          text="Show your address or QR code to someone who holds it, or to an exchange you withdraw from. Use the post-quantum address on QRDX."
          action="Show my address"
          onClick={onReceive}
        />
        <Option
          icon={<ArrowLeftRight className="h-5 w-5" />}
          title="Swap a token you hold"
          text={qrdx ? `Trade any token in this account for ${symbol} on QRDX's exchange, at the best of its pools and order books.` : `Swap tokens you hold for ${symbol}.`}
          action="Open swap"
          onClick={onSwap}
        />

        <div className="flex items-start gap-2.5 rounded-xl border border-border/70 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            {qrdx ? (
              activeChain.isTestnet ? (
                <>
                  There is no card purchase for QRDX: testnet QRDX has no value, and there is no public faucet. Testnet QRDX comes from someone who already has some, such as the
                  QRDX team.
                </>
              ) : (
                <>There is no card purchase for QRDX yet: QRDX mainnet has not launched.</>
              )
            ) : (
              <>This wallet does not sell crypto. Buy {symbol} on an exchange and withdraw it to your address.</>
            )}
            <a href={FUNDING_URL} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 font-medium text-foreground hover:underline">
              How to get QRDX <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function Option({ icon, title, text, action, onClick }: { icon: React.ReactNode; title: string; text: string; action: string; onClick?: () => void }) {
  return (
    <div className="rounded-xl glass p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
      <button type="button" onClick={onClick} disabled={!onClick} className="mt-3 h-10 w-full rounded-xl bg-foreground text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40">
        {action}
      </button>
    </div>
  )
}
