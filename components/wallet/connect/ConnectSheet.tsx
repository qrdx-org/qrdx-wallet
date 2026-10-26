'use client'

/**
 * "Connect to a site": scan a QRDX Connect code (camera), or paste its link,
 * and manage connected sites.
 *
 * Scanning: components/wallet/QrScanner.tsx.
 */

import { useCallback, useState } from 'react'
import { ArrowLeft, Camera, Globe, Link2, Smartphone, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorBanner, Notice, PrimaryButton } from '@/components/wallet/flow/FlowKit'
import { useRemoteConnect } from './RemoteConnect'
import { QrScanner } from '../QrScanner'

/** A QRDX Connect pairing code (a qrdx-connect: link, or one with ?connect=). */
const isConnectCode = (text: string) => /qrdx-connect|[?&]connect=/.test(text)

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
          <QrScanner accept={isConnectCode} onCode={(code) => void pair(code)} onCancel={() => setScanning(false)} onError={(m) => { setError(m); setScanning(false) }} />
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
