'use client'

import { useEffect, useRef } from 'react'
import jsQR from 'jsqr'
import { Button } from '@/components/ui/button'

/**
 * Camera QR scanner. Calls `onCode` once with the first code `accept` takes. Uses
 * BarcodeDetector where the browser has it and jsQR elsewhere (iOS Safari and the iPhone PWA
 * have no BarcodeDetector).
 */
export function QrScanner({
  accept: wanted,
  onCode,
  onCancel,
  onError,
  hint,
}: {
  accept: (text: string) => boolean
  onCode: (code: string) => void
  onCancel: () => void
  onError: (m: string) => void
  /** Under the viewfinder, e.g. what to point it at. */
  hint?: string
}) {
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
      if (!text || found.current || !wanted(text)) return false
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
      .catch(() => onError('The camera is not available. Allow camera access, or paste it instead.'))
    if (!navigator.mediaDevices) onError('This browser cannot use the camera here. Paste it instead.')

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode, onError, wanted])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />
      </div>
      {hint && <p className="text-center text-[11px] text-muted-foreground">{hint}</p>}
      <Button variant="outline" className="w-full rounded-xl" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
