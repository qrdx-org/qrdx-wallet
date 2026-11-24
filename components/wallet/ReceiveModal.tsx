'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check, Share2, Info } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import PixelSwap from '@/components/PixelSwap'
import { Segment } from '@/components/motion/Segment'
import { Select } from '@/components/motion/Select'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { chainFamily, isQrdxChain, looksLikeTestnet } from '@/src/core/chains'
import { NetworkLogo } from './CoinLogo'
import { usePrimaryName } from './useQnsName'
import { WEB_WALLET, paymentLink, paymentRequest } from '@/src/core/payment-uri'

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
  const { activeChain, activeAddress, balances, pqBalances } = useWallet()
  const family = chainFamily(activeChain)
  const qrdx = isQrdxChain(activeChain)
  // The account's primary QRDX name: senders on QRDX can type it instead of an address.
  const qnsName = usePrimaryName(qrdx ? pqAddress : '')
  const [kind, setKind] = useState<'pq' | 'eth'>(qrdx ? 'pq' : 'eth')
  const [copied, setCopied] = useState(false)

  const address = family !== 'evm' ? activeAddress : qrdx && kind === 'pq' ? pqAddress : ethAddress

  // Request an amount (EVM networks and QRDX): the QR becomes a payment request the payer's
  // wallet opens with the amount, its cost and a slide to pay (src/core/payment-uri.ts).
  const [requesting, setRequesting] = useState(false)
  const [reqAmount, setReqAmount] = useState('')
  const [reqToken, setReqToken] = useState('')
  const [reqNote, setReqNote] = useState('')
  const assets = (qrdx && kind === 'pq' ? pqBalances : balances).filter((b, i, all) => all.findIndex((x) => x.address === b.address) === i)
  const reqAsset = assets.find((b) => b.address === reqToken)
  const reqSymbol = reqAsset?.symbol ?? activeChain.nativeCurrency.symbol
  const amountOk = /^\d*\.?\d+$/.test(reqAmount.trim()) && Number(reqAmount) > 0
  const requestLink =
    requesting && amountOk && address && family === 'evm'
      ? paymentLink(
          paymentRequest({ to: address, chainId: activeChain.chainId, amount: reqAmount.trim(), token: reqToken || undefined, note: reqNote }),
          typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? `${location.origin}/wallet` : WEB_WALLET
        )
      : null
  const shared = requestLink ?? address
  // The last request stays on the code's far side, so clearing the amount dissolves it away.
  const [lastRequest, setLastRequest] = useState<string | null>(null)
  if (requestLink && requestLink !== lastRequest) setLastRequest(requestLink)
  const noun = family === 'bitcoin' ? 'Bitcoin' : family === 'solana' ? 'Solana' : qrdx && kind === 'pq' ? 'quantum-safe' : activeChain.name

  const handleCopy = () => {
    if (!shared) return
    navigator.clipboard.writeText(shared)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (!shared) return
    if (navigator.share) await navigator.share(requestLink ? { text: `Pay ${reqAmount.trim()} ${reqSymbol}`, url: requestLink } : { text: address! }).catch(() => undefined)
    else handleCopy()
  }

  const note =
    family === 'bitcoin'
      ? `Send only bitcoin${looksLikeTestnet(activeChain) ? ' on testnet4' : ''} to this address. This is a native SegWit (${activeChain.isTestnet ? 'tb1' : 'bc1'}…) address; any Bitcoin wallet can pay it.`
      : family === 'solana'
        ? `Send only SOL and Solana tokens${looksLikeTestnet(activeChain) ? ' on devnet' : ''} to this address.`
        : qrdx && kind === 'pq'
          ? 'Your quantum-safe address on QRDX. Trading, staking and swaps use it. Senders on QRDX can also use your QRDX name.'
          : qrdx
            ? 'Your classic address on QRDX. It signs with ECDSA; keep large amounts on your quantum-safe address.'
            : `Send only ${activeChain.name} assets to this address: ${activeChain.nativeCurrency.symbol} and tokens on ${activeChain.name}. The same address works on every EVM network, so check which network the sender uses.`

  return (
    <div className="min-h-screen wallet-screen">
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
          <Segment<'pq' | 'eth'>
            label="Address"
            size="md"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'pq', label: <>Quantum-safe <span className="font-mono text-[10px] font-normal opacity-60">0xPQ…</span></> },
              { value: 'eth', label: <>Classic <span className="font-mono text-[10px] font-normal opacity-60">0x…</span></> },
            ]}
          />
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
                {requestLink && (
                  <p className="mb-3 text-center text-2xl font-semibold tracking-tight tabular-nums">
                    {reqAmount.trim()} {reqSymbol}
                    {reqNote.trim() && <span className="block text-xs font-normal text-muted-foreground">“{reqNote.trim().slice(0, 140)}”</span>}
                  </p>
                )}
                <div className="relative p-3 bg-white rounded-2xl shadow-lg">
                  {/* The address's code dissolves, square by square, into the request's (and back). */}
                  <PixelSwap
                    trigger="none"
                    active={!!requestLink}
                    intro={false}
                    pattern="random"
                    pixelSize={16}
                    duration={520}
                    pixelDuration={260}
                    randomness={0.35}
                    aspectRatio="1 / 1"
                    style={{ width: 200 }}
                    firstContent={<QRCodeSVG value={address!} size={200} level="M" bgColor="#ffffff" fgColor="#000000" />}
                    secondContent={<QRCodeSVG value={lastRequest ?? address!} size={200} level="M" bgColor="#ffffff" fgColor="#000000" />}
                  />
                  {/* The code is always black on white, so its badge is too. */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-white p-1 text-black shadow-md">
                      <NetworkLogo chain={activeChain} size={30} className="bg-white text-black ring-black/10 [&>span]:bg-black" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 w-full">
                  {requestLink && <p className="mb-2 text-center text-[11px] text-muted-foreground">A payment request: scanned by QRDX Wallet (or a phone&apos;s camera), it opens with the amount and a slide to pay.</p>}
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
                    {requestLink ? 'Copy link' : 'Copy'}
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

        {address && family === 'evm' && (
          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <button type="button" onClick={() => setRequesting((v) => !v)} aria-expanded={requesting} className="flex w-full items-center justify-between text-sm font-semibold">
                Request an amount
                <span className="text-xs font-normal text-muted-foreground">{requesting ? 'Hide' : 'QR with an amount'}</span>
              </button>
              {requesting && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={reqAmount}
                      onChange={(e) => setReqAmount(e.target.value.replace(/[^\d.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Amount to request"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base tabular-nums outline-none focus:border-foreground/40"
                    />
                    <Select
                      label="In"
                      align="right"
                      value={reqToken}
                      onChange={setReqToken}
                      options={assets.length === 0 ? [{ value: '', label: activeChain.nativeCurrency.symbol }] : assets.map((b) => ({ value: b.address, label: b.symbol }))}
                      className="w-28 shrink-0"
                    />
                  </div>
                  <input
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value.slice(0, 140))}
                    placeholder="Note (optional): what it is for"
                    aria-label="Note"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {amountOk ? `The QR above now asks for ${reqAmount.trim()} ${reqSymbol} on ${activeChain.name}, paid to this address.` : 'Enter an amount and the QR above becomes a request for it.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <p className="px-1 text-[11px] text-muted-foreground text-center leading-relaxed">{note}</p>
      </div>
    </div>
  )
}
