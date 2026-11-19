'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check, Share2, Info } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, isQrdxChain } from '@/src/core/chains'
import { NetworkLogo } from './CoinLogo'
import { usePrimaryName } from './useQnsName'

interface ReceiveModalProps {
  ethAddress: string
  pqAddress: string
  accountName: string
  onClose: () => void
}

/**
 * The address to receive on, for the selected network only: on QRDX the quantum-safe address
 * (or the classic one), on other EVM networks the 0x address, on Bitcoin and Solana their own.
 * Offering an address the network cannot use would invite a lost transfer.
 */
export function ReceiveModal({ ethAddress, pqAddress, accountName, onClose }: ReceiveModalProps) {
  const { activeChain, activeAddress } = useWallet()
  const family = chainFamily(activeChain)
  const qrdx = isQrdxChain(activeChain)
  // The account's primary QRDX name: senders on QRDX can type it instead of an address.
  const qnsName = usePrimaryName(qrdx ? pqAddress : '')
  const [kind, setKind] = useState<'pq' | 'eth'>(qrdx ? 'pq' : 'eth')
  const [copied, setCopied] = useState(false)

  const address = family !== 'evm' ? activeAddress : qrdx && kind === 'pq' ? pqAddress : ethAddress
  const noun = family === 'bitcoin' ? 'Bitcoin' : family === 'solana' ? 'Solana' : qrdx && kind === 'pq' ? 'quantum-safe' : activeChain.name

  const handleCopy = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (!address) return
    if (navigator.share) await navigator.share({ text: address }).catch(() => undefined)
    else handleCopy()
  }

  const note =
    family === 'bitcoin'
      ? `Send only bitcoin${activeChain.isTestnet ? ' on testnet4' : ''} to this address. This is a native SegWit (bc1…) address; any Bitcoin wallet can pay it.`
      : family === 'solana'
        ? `Send only SOL and Solana tokens${activeChain.isTestnet ? ' on devnet' : ''} to this address.`
        : qrdx && kind === 'pq'
          ? 'Your quantum-safe address on QRDX. Trading, staking and swaps use it. Senders on QRDX can also use your QRDX name.'
          : qrdx
            ? 'Your classic address on QRDX. It signs with ECDSA; keep large amounts on your quantum-safe address.'
            : `Send only ${activeChain.name} assets to this address: ${activeChain.nativeCurrency.symbol} and tokens on ${activeChain.name}. The same address works on every EVM network, so check which network the sender uses.`

  return (
    <div className="min-h-screen mono-backdrop">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50" onClick={onClose} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold">Receive on {activeChain.name}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {qrdx && (
          <div className="flex gap-1 p-1 bg-accent/30 rounded-xl" role="tablist">
            {(
              [
                ['pq', 'Quantum-safe', '0xPQ…'],
                ['eth', 'Classic', '0x…'],
              ] as const
            ).map(([k, label, hint]) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${kind === k ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label} <span className="font-mono text-[10px] font-normal text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        )}

        {!address ? (
          <Card className="glass border-border/50">
            <CardContent className="p-5 flex gap-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <p>
                {family === 'solana'
                  ? 'This account was imported from a private key, so it has no Solana address. Accounts from a recovery phrase have one.'
                  : 'Preparing your address…'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="glass border-border/50">
              <CardContent className="p-5 flex flex-col items-center">
                <div className="text-xs text-muted-foreground mb-3 font-medium text-center">
                  {accountName}
                  {qrdx && kind === 'pq' && qnsName && (
                    <span className="block mt-0.5 text-sm font-semibold text-foreground" title="Your QRDX name: anyone on QRDX can send to it">
                      {qnsName}
                    </span>
                  )}
                </div>
                <div className="relative p-3 bg-white rounded-2xl shadow-lg">
                  <QRCodeSVG value={address} size={180} level="M" bgColor="#ffffff" fgColor="#000000" />
                  {/* The code is always black on white, so its badge is too. */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-white p-1 text-black shadow-md">
                      <NetworkLogo chain={activeChain} size={30} className="bg-white text-black ring-black/10 [&>span]:bg-black" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 w-full">
                  <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your {noun} address</p>
                  <p className="text-center font-mono text-[11px] text-foreground/80 break-all px-2 leading-relaxed">{address}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleCopy} variant="outline" className="h-11 font-semibold glass hover:bg-accent/50 hover:border-primary/30">
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button onClick={handleShare} variant="outline" className="h-11 font-semibold glass hover:bg-accent/50 hover:border-primary/30">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </>
        )}

        <p className="px-1 text-[11px] text-muted-foreground text-center leading-relaxed">{note}</p>
      </div>
    </div>
  )
}
