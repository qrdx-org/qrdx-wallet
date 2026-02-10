'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAddress } from '@/lib/utils'

interface ReceiveModalProps {
  ethAddress: string
  pqAddress: string
  accountName: string
  onClose: () => void
}

export function ReceiveModal({ ethAddress, pqAddress, accountName, onClose }: ReceiveModalProps) {
  const [addressType, setAddressType] = useState<'eth' | 'pq'>('eth')
  const [copied, setCopied] = useState(false)

  const activeAddress = addressType === 'eth' ? ethAddress : pqAddress

  const handleCopy = () => {
    navigator.clipboard.writeText(activeAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ text: activeAddress })
    } else {
      handleCopy()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="glass-strong sticky top-0 z-20">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent/50"
              onClick={onClose}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold">Receive</h1>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Address type toggle */}
        <div className="flex gap-1 p-1 bg-accent/30 rounded-xl">
          <button
            onClick={() => setAddressType('eth')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              addressType === 'eth'
                ? 'bg-background shadow-sm text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
              addressType === 'eth' ? 'bg-blue-500/20' : ''
            }`}>
              ETH
            </span>
            EVM Address
          </button>
          <button
            onClick={() => setAddressType('pq')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              addressType === 'pq'
                ? 'bg-background shadow-sm text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
              addressType === 'pq' ? 'bg-primary/20' : ''
            }`}>
              PQ
            </span>
            Quantum Address
          </button>
        </div>

        {/* QR Code */}
        <Card className="glass border-border/50">
          <CardContent className="p-5 flex flex-col items-center">
            <div className="text-xs text-muted-foreground mb-3 font-medium">{accountName}</div>
            <div className="relative p-3 bg-white rounded-2xl shadow-lg">
              <QRCodeSVG
                value={activeAddress}
                size={180}
                level="M"
                bgColor="#ffffff"
                fgColor={addressType === 'eth' ? '#3b82f6' : '#8A50FF'}
                imageSettings={{
                  src: '',
                  height: 0,
                  width: 0,
                  excavate: false,
                }}
              />
              {/* Center badge */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-md ${
                  addressType === 'eth'
                    ? 'bg-blue-500'
                    : 'bg-primary'
                }`}>
                  {addressType === 'eth' ? 'ETH' : 'PQ'}
                </div>
              </div>
            </div>

            {/* Address display */}
            <div className="mt-4 w-full">
              <div className="flex items-center gap-2 justify-center mb-2">
                <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  addressType === 'eth'
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-primary/15 text-primary'
                }`}>
                  {addressType === 'eth' ? 'EVM' : 'PQ'}
                </span>
              </div>
              <div className="text-center font-mono text-[11px] text-muted-foreground break-all px-2 leading-relaxed">
                {activeAddress}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={handleCopy}
            variant="outline"
            className="h-11 font-semibold glass hover:bg-accent/50 hover:border-primary/30"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>
          <Button
            onClick={handleShare}
            variant="outline"
            className="h-11 font-semibold glass hover:bg-accent/50 hover:border-primary/30"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        {/* Info note */}
        <div className="px-1 py-1">
          <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed">
            {addressType === 'eth'
              ? 'Send only EVM-compatible tokens (ETH, ERC-20) to this address. Sending other assets may result in permanent loss.'
              : 'This is your quantum-resistant address. Use it for QRDX chain native transfers with Dilithium/SPHINCS+ security.'
            }
          </p>
        </div>
      </div>
    </div>
  )
}
