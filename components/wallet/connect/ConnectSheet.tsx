'use client'

/**
 * "Connect to a site": scan a QRDX Connect code (camera), or paste its link,
 * and manage connected sites.
 *
 * Scanning uses BarcodeDetector where the browser has it and jsQR elsewhere
 * (iOS Safari and the iPhone PWA have no BarcodeDetector).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { ArrowLeft, Camera, Globe, Link2, Smartphone, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorBanner, Notice, PrimaryButton } from '@/components/wallet/flow/FlowKit'
import { useRemoteConnect } from './RemoteConnect'

export function ConnectSheet({ onClose }: { onClose: () => void }) {
  const rc = useRemoteConnect()
  const [scanning, setScanning] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const pair = useCallback(
    async (input: string) => {
      setBusy(true)
      setError(null)
      setDone(null)
      try {
        const s = await rc.pair(input)
        setDone(`Connected to ${new URL(s.origin).host}. Its connect request appears next.`)
        setLink('')
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
        setScanning(false)
      }
    },
    [rc]
  )

  return (
    <div className="min-h-screen mono-backdrop">
      <div className="glass-strong sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-accent/50" onClick={onClose} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-semibold">Connect to a site</h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          On a site such as QRDX Trade, choose <b>Connect → QRDX Wallet on your phone</b> and scan the code it shows. You
          approve every order here, on this device; keep the app open while you trade.
        </p>

        {scanning ? (
          <Scanner onCode={(code) => void pair(code)} onCancel={() => setScanning(false)} onError={(m) => { setError(m); setScanning(false) }} />
        ) : (
          <PrimaryButton onClick={() => { setError(null); setScanning(true) }} loading={busy}>
            <Camera className="mr-2 h-4 w-4" /> Scan QR code
          </PrimaryButton>
        )}

        <div className="flex gap-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Or paste the connection link"
            className="h-10 flex-1 rounded-xl border bg-background px-3 text-sm"
            aria-label="Connection link"
          />
          <Button variant="outline" className="h-10 rounded-xl" disabled={!link.trim() || busy} onClick={() => void pair(link)} aria-label="Connect with this link">
            <Link2 className="h-4 w-4" />
          </Button>
        </div>

        {error && <ErrorBanner error={error} />}
        {done && <Notice tone="success" icon={<Smartphone className="h-4 w-4 text-green-500" />}>{done}</Notice>}

        <ConnectedSites />
      </div>
    </div>
  )
}

export function ConnectedSites({ compact }: { compact?: boolean }) {
  const rc = useRemoteConnect()
  if (!rc.sessions.length) return compact ? null : <p className="text-xs text-muted-foreground">No sites connected by QR code.</p>
  return (
    <div className="space-y-2">
      {!compact && <h2 className="text-sm font-semibold">Connected sites</h2>}
      {rc.sessions.map((s) => (
        <div key={s.topic} className="flex items-center gap-3 rounded-xl glass p-3">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{new URL(s.origin).host}</div>
            <div className="text-[11px] text-muted-foreground">
              {s.peerOnline ? 'Site open' : 'Site closed'} · relay {s.status}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void rc.disconnect(s.topic)}>
            <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
          </Button>
        </div>
      ))}
    </div>
  )
}

/** Camera QR scanner. Calls onCode once with the first QRDX Connect code it sees. */
function Scanner({ onCode, onCancel, onError }: { onCode: (code: string) => void; onCancel: () => void; onError: (m: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const found = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
    const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const detector = BD ? new BD({ formats: ['qr_code'] }) : null

    const accept = (text: string | undefined) => {
      if (!text || found.current || !/qrdx-connect|[?&]connect=/.test(text)) return false
      found.current = true
      onCode(text)
      return true
    }

    const tick = async () => {
      if (stopped || !video.current) return
      const v = video.current
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const codes = await detector.detect(v)
            if (codes.some((c) => accept(c.rawValue))) return
          } else if (ctx) {
            const scale = Math.min(1, 640 / v.videoWidth)
            canvas.width = Math.round(v.videoWidth * scale)
            canvas.height = Math.round(v.videoHeight * scale)
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            if (accept(jsQR(img.data, img.width, img.height)?.data)) return
          }
        } catch {
          /* a frame that could not be read */
        }
      }
      raf = requestAnimationFrame(() => void tick())
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        raf = requestAnimationFrame(() => void tick())
      })
      .catch(() => onError('The camera is not available. Allow camera access, or paste the link instead.'))
    if (!navigator.mediaDevices) onError('This browser cannot use the camera here. Paste the link instead.')

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode, onError])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />
      </div>
      <Button variant="outline" className="w-full rounded-xl" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
