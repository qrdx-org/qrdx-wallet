'use client'

import { useState } from 'react'
import { parsePaymentQr, type ScannedPayment } from '@/src/core/payment-uri'
import { CtaButton } from '@/components/motion/CtaButton'
import { QrScanner } from '../QrScanner'
import { Sheet, TextField } from '../flow/FlowKit'

type Request = ScannedPayment & { amount: string }
/** A payment request: a payment code that names an amount. */
const asRequest = (text: string): Request | null => {
  const p = parsePaymentQr(text)
  return p?.amount ? (p as Request) : null
}

/**
 * Scan to pay: the camera (or a pasted link) for a payment request, which then opens its Pay sheet.
 * A code with no amount is an address, not a request: Send takes those.
 */
export function PayScanner({ onRequest, onClose }: { onRequest: (r: Request) => void; onClose: () => void }) {
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const pastedRequest = pasted.trim() ? asRequest(pasted) : null

  return (
    <Sheet title="Scan to pay" onClose={onClose}>
      <div className="space-y-3">
        {scanning ? (
          <QrScanner
            accept={(t) => !!asRequest(t)}
            onCode={(code) => onRequest(asRequest(code)!)}
            onCancel={() => setScanning(false)}
            onError={(m) => {
              setError(m)
              setScanning(false)
            }}
            hint="Point at a payment request's QR code"
          />
        ) : (
          <button type="button" onClick={() => (setError(null), setScanning(true))} className="w-full rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-accent/50">
            Scan with the camera
          </button>
        )}
        {error && <p className="text-xs text-muted-foreground">{error}</p>}
        <TextField label="Or paste a payment link" value={pasted} onChange={setPasted} placeholder="https://wallet.qrdx.org/wallet?pay=… or qrdx:…" />
        {pasted.trim() && !pastedRequest && <p className="text-[11px] text-muted-foreground">That is not a payment request with an amount.</p>}
        <CtaButton disabled={!pastedRequest} onClick={() => pastedRequest && onRequest(pastedRequest)} className="h-12 w-full text-base">
          Review payment
        </CtaButton>
      </div>
    </Sheet>
  )
}
