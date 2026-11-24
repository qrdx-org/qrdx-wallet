'use client'

/**
 * An account to act on, typed, scanned or picked: who a token is minted to, which holder is
 * frozen, who takes over an authority. The same checks as Send's recipient: a QRDX name is
 * resolved as typed and the address it points to is what is used; a protocol holder (a pool,
 * an escrow) is refused; contacts and the wallet's accounts are named. Unlike a send, it may
 * be the account itself.
 */

import { Spinner } from '@/components/motion/Loading'
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ScanLine } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { shortenAddress, validateAddress } from '@/src/core/address'
import { sameAccount } from '@/src/core/account-id'
import { resolveRecipient } from '@/src/core/tx-service'
import { isQrdxChain } from '@/src/core/chains'
import { isQnsName, resolveQnsName, type QnsResolution } from '@/src/core/qns'
import { knownName } from '@/src/core/recipients'
import { parsePaymentQr } from '@/src/core/payment-uri'
import { RecipientSuggestions } from './RecipientSuggestions'
import { usePrimaryName } from './useQnsName'
import { QrScanner } from './QrScanner'
import { cn } from '@/lib/utils'

export type AddressCheck =
  | { state: 'empty' }
  | { state: 'resolving'; name: string }
  | { state: 'invalid'; message: string }
  | { state: 'valid'; address: string; viaName?: string; known?: string; self: 'pq' | 'classic' | null }

/** Check what was typed: an address, or a QRDX name resolved to one. */
export function useAddressCheck(raw: string): AddressCheck {
  const { activeChain, addressBook, allWallets, currentWallet } = useWallet()
  const typed = isQrdxChain(activeChain) && isQnsName(raw) ? raw.trim().toLowerCase() : null
  const [qns, setQns] = useState<QnsResolution | { state: 'error'; name: string } | null>(null)
  useEffect(() => {
    if (!typed) return
    let live = true
    const t = setTimeout(() => {
      resolveQnsName(activeChain, typed)
        .then((r) => live && setQns(r))
        .catch(() => live && setQns({ state: 'error', name: typed }))
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [typed, activeChain])

  let address = raw.trim()
  if (!address) return { state: 'empty' }
  let viaName: string | undefined
  if (typed) {
    const r = qns?.name === typed ? qns : null
    if (!r) return { state: 'resolving', name: typed }
    if (r.state === 'unsupported') return { state: 'invalid', message: 'This network does not resolve .qrdx names yet' }
    if (r.state === 'error') return { state: 'invalid', message: `Could not look up ${typed}` }
    if (r.state === 'unregistered') return { state: 'invalid', message: `${typed} is not registered, or points nowhere` }
    address = r.address
    viaName = typed
  }
  const v = validateAddress(address)
  if (!v.valid && v.kind !== null) return { state: 'invalid', message: v.error ?? 'Invalid address' }
  try {
    resolveRecipient(activeChain, address)
  } catch (e) {
    return { state: 'invalid', message: e instanceof Error ? e.message : 'Invalid address' }
  }
  const shown = v.normalized ?? address
  const self = currentWallet?.pqAddress && sameAccount(shown, currentWallet.pqAddress) ? 'pq' : currentWallet?.ethAddress && sameAccount(shown, currentWallet.ethAddress) ? 'classic' : null
  return { state: 'valid', address: shown, viaName, known: knownName(shown, { contacts: addressBook, accounts: allWallets }), self }
}

export function AddressField({
  label,
  value,
  onChange,
  check,
  previous,
  includeSelf = true,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  check: AddressCheck
  /** Where this went before (a token's past mints), offered first. */
  previous?: { heading: string; noun: string; items: { address: string; at: number; times: number }[] }
  /** Offer the account's own addresses. */
  includeSelf?: boolean
}) {
  const { activeChain, currentWallet } = useWallet()
  const qrdx = isQrdxChain(activeChain)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const primary = usePrimaryName(check.state === 'valid' && !check.viaName && !check.known && !check.self ? check.address : null)
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => {
            setScanError(null)
            setScanning((v) => !v)
          }}
          aria-label={scanning ? 'Stop scanning' : 'Scan a QR code'}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <ScanLine className="h-3.5 w-3.5" /> {scanning ? 'Cancel' : 'Scan'}
        </button>
      </div>
      {scanning && (
        <div className="mb-2">
          <QrScanner
            accept={(text) => parsePaymentQr(text) !== null}
            onCode={(code) => {
              const p = parsePaymentQr(code)
              if (!p) return
              setScanning(false)
              onChange(p.to)
            }}
            onCancel={() => setScanning(false)}
            onError={(m) => {
              setScanError(m)
              setScanning(false)
            }}
            hint="Point it at an address, a name.qrdx or a payment QR code"
          />
        </div>
      )}
      {scanError && <p className="mb-1.5 text-[10px] text-red-400">{scanError}</p>}
      <input
        type="text"
        aria-label={label}
        placeholder={qrdx ? '0x…, 0xPQ… or name.qrdx' : '0x… address'}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-xl border bg-background/60 px-3 py-2.5 font-mono text-sm transition-all placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1',
          check.state === 'invalid' ? 'border-red-500/50 focus:ring-red-500/40' : check.state === 'valid' ? 'border-foreground/30 focus:ring-foreground/30' : 'border-border/50 focus:ring-primary/50'
        )}
      />
      {check.state === 'resolving' && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Spinner size={12} className="shrink-0" /> Looking up {check.name}
        </p>
      )}
      {check.state === 'invalid' && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-red-400">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" /> {check.message}
        </p>
      )}
      {check.state === 'valid' && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-foreground/80">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {check.viaName
            ? `${check.viaName} points to ${shortenAddress(check.address, 8)}`
            : check.self
              ? `This account's ${check.self === 'pq' ? 'quantum-safe' : 'classic'} address`
              : (check.known ?? primary ?? 'Valid address')}
        </p>
      )}
      {check.state !== 'valid' && (
        <RecipientSuggestions
          query={value}
          from={{ eth: currentWallet?.ethAddress ?? '', pq: currentWallet?.pqAddress ?? '' }}
          onPick={onChange}
          previous={previous}
          includeSelf={includeSelf}
        />
      )}
    </div>
  )
}
