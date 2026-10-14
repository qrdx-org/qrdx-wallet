'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { useWallet } from '@/src/shared/contexts/WalletContext'
import { getEvmProvider } from '@/src/core/ethereum'
import { isQrdxChain } from '@/src/core/chains'
import { sameAccount } from '@/src/core/account-id'
import { validateAddress } from '@/src/core/address'
import { waitForExchangeReceipt } from '@/src/core/exchange-client'
import { cn, formatAddress } from '@/lib/utils'
import { Sheet, TextField } from './flow/FlowKit'
import { ConfirmSheet } from './flow/ConfirmSheet'

/** exchange_getNftsOf (qrdx-node qrdx/exchange/views.py nfts_of). */
interface NodeNft {
  collection: string
  token_id: string
  owner: string
  uri: string
  name: string
  symbol: string
  collection_name: string
  minted_height: number | null
}

interface Metadata {
  image: string | null
  description: string | null
  attributes: { trait_type?: string; value?: unknown }[]
}

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/'
const toHttp = (uri: string) => (uri.startsWith('ipfs://') ? IPFS_GATEWAY + uri.slice('ipfs://'.length).replace(/^ipfs\//, '') : uri)
const metadataCache = new Map<string, Promise<Metadata>>()

/**
 * An NFT's metadata from its URI: a JSON document (image, description, attributes, as
 * ERC-721 metadata), or the image itself. A URI that cannot be read gives no image.
 */
function readMetadata(uri: string): Promise<Metadata> {
  if (!uri) return Promise.resolve({ image: null, description: null, attributes: [] })
  let p = metadataCache.get(uri)
  if (!p) {
    p = (async (): Promise<Metadata> => {
      const url = toHttp(uri)
      if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url) || url.startsWith('data:image/')) return { image: url, description: null, attributes: [] }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        const type = res.headers.get('content-type') ?? ''
        if (type.startsWith('image/')) return { image: url, description: null, attributes: [] }
        const json = (await res.json()) as Record<string, unknown>
        const image = typeof json.image === 'string' ? toHttp(json.image) : typeof json.image_url === 'string' ? toHttp(json.image_url) : null
        return {
          image,
          description: typeof json.description === 'string' ? json.description : null,
          attributes: Array.isArray(json.attributes) ? (json.attributes as Metadata['attributes']) : [],
        }
      } catch {
        return { image: null, description: null, attributes: [] }
      }
    })()
    metadataCache.set(uri, p)
  }
  return p
}

function useMetadata(uri: string): Metadata | null {
  const [m, setM] = useState<Metadata | null>(null)
  useEffect(() => {
    let live = true
    readMetadata(uri).then((x) => live && setM(x))
    return () => {
      live = false
    }
  }, [uri])
  return m
}

function NftImage({ nft, className }: { nft: NodeNft; className?: string }) {
  const meta = useMetadata(nft.uri)
  const [broken, setBroken] = useState(false)
  if (meta?.image && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={meta.image} alt={nft.name || `${nft.symbol} #${nft.token_id}`} onError={() => setBroken(true)} className={cn('h-full w-full object-cover', className)} />
  return (
    <span className={cn('flex h-full w-full flex-col items-center justify-center gap-1 bg-accent/60 text-muted-foreground', className)}>
      {meta === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageOff className="h-4 w-4" />}
      <span className="font-mono text-[10px]">
        {nft.symbol} #{nft.token_id}
      </span>
    </span>
  )
}

/** The account's NFTs on the active QRDX network (both its addresses), by collection. */
export function NftGallery({ onCount }: { onCount?: (n: number) => void }) {
  const { currentWallet, activeChain } = useWallet()
  const [nfts, setNfts] = useState<NodeNft[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<NodeNft | null>(null)
  const [nonce, setNonce] = useState(0)
  const qrdx = isQrdxChain(activeChain)

  useEffect(() => {
    if (!qrdx || !currentWallet) return
    let cancelled = false
    const provider = getEvmProvider(activeChain.id)
    const owners = [...new Set([currentWallet.pqAddress, currentWallet.ethAddress].filter(Boolean))]
    Promise.all(owners.map((o) => provider.rpc<NodeNft[]>('exchange_getNftsOf', [o, null, 500])))
      .then((lists) => {
        if (cancelled) return
        const seen = new Set<string>()
        const all = lists.flat().filter((n) => {
          const k = `${n.collection}:${n.token_id}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        setNfts(all)
        setError(null)
        onCount?.(all.length)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not read NFTs'))
    return () => {
      cancelled = true
    }
  }, [qrdx, currentWallet?.id, activeChain.id, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, NodeNft[]>()
    for (const n of nfts ?? []) m.set(n.collection, [...(m.get(n.collection) ?? []), n])
    return [...m.values()]
  }, [nfts])

  if (!qrdx) return <Empty title="NFTs live on QRDX networks" text="Switch to a QRDX network to see your collectibles." />
  if (error && !nfts) return <Empty title="Could not read your NFTs" text={error} />
  if (!nfts)
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your NFTs…
      </p>
    )
  if (!nfts.length) return <Empty title="No NFTs yet" text={`NFTs this account owns on ${activeChain.name} show up here.`} />

  return (
    <div className="space-y-4 p-1">
      {groups.map((items) => (
        <section key={items[0].collection}>
          <p className="mb-2 flex items-baseline justify-between px-1 text-xs font-semibold">
            <span className="truncate">{items[0].collection_name || items[0].symbol}</span>
            <span className="text-[10px] font-normal text-muted-foreground">{items.length}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {items.map((n) => (
              <button key={n.token_id} type="button" onClick={() => setOpen(n)} className="overflow-hidden rounded-xl border border-border/60 text-left transition-colors hover:border-foreground/30">
                <span className="block aspect-square overflow-hidden">
                  <NftImage nft={n} />
                </span>
                <span className="block truncate px-2 py-1.5 text-[11px] font-medium">{n.name || `${n.symbol} #${n.token_id}`}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {open && <NftDetail nft={open} onClose={() => setOpen(null)} onSent={() => (setOpen(null), setNonce((x) => x + 1))} />}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/50">
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">{text}</p>
    </div>
  )
}

/** One NFT: image, details, traits, and sending it (NFT_TRANSFER, reviewed first). */
function NftDetail({ nft, onClose, onSent }: { nft: NodeNft; onClose: () => void; onSent: () => void }) {
  const { currentWallet, activeChain, submitExchangeOp } = useWallet()
  const meta = useMetadata(nft.uri)
  const [sending, setSending] = useState(false)
  const [to, setTo] = useState('')
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Exchange operations are signed by the post-quantum key: only an NFT that account owns can be sent from here.
  const sendable = !!currentWallet?.pqAddress && sameAccount(nft.owner, currentWallet.pqAddress)
  const check = to.trim() ? validateAddress(to.trim()) : null
  const toValid = !!check && check.valid !== false && !sameAccount(to.trim(), nft.owner)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const { txHash } = await submitExchangeOp('NFT_TRANSFER', { collection: nft.collection, token_id: nft.token_id, to: to.trim() })
      const r = await waitForExchangeReceipt(activeChain, txHash, 60_000, 1_000)
      if (!r.success) throw new Error(r.error || 'The network refused the transfer')
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={nft.name || `${nft.symbol} #${nft.token_id}`} onClose={onClose}>
      <div className="aspect-square overflow-hidden rounded-xl border border-border/60">
        <NftImage nft={nft} />
      </div>
      {meta?.description && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>}
      <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/70 text-xs">
        <Line k="Collection" v={nft.collection_name || nft.symbol} />
        <Line k="Token ID" v={`#${nft.token_id}`} />
        <Line k="Owner" v={formatAddress(nft.owner, 6)} />
        {nft.minted_height != null && <Line k="Minted at block" v={nft.minted_height.toLocaleString()} />}
      </div>
      {!!meta?.attributes.length && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {meta.attributes.slice(0, 12).map((a, i) => (
            <div key={i} className="rounded-lg border border-border/60 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.trait_type ?? 'Trait'}</p>
              <p className="truncate text-xs font-medium">{String(a.value ?? '')}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={`${activeChain.explorerUrl}/address/${nft.collection}`}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-accent/50"
        >
          <ExternalLink className="h-4 w-4" /> Explorer
        </a>
        <button
          type="button"
          disabled={!sendable}
          onClick={() => setSending(true)}
          title={sendable ? undefined : 'Only NFTs held by the post-quantum account can be sent from here'}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          <ArrowUpRight className="h-4 w-4" /> Send
        </button>
      </div>
      {sending && (
        <div className="mt-4 space-y-2">
          <TextField label="Recipient address" value={to} onChange={setTo} placeholder="0xPQ… or 0x…" />
          {check && !toValid && <p className="text-[11px] text-foreground">{check.valid === false ? check.error ?? 'Not a valid address' : 'That is the current owner'}</p>}
          <button type="button" disabled={!toValid} onClick={() => setReview(true)} className="h-11 w-full rounded-xl bg-foreground text-sm font-semibold text-background disabled:opacity-40">
            Review transfer
          </button>
        </div>
      )}
      {review && (
        <ConfirmSheet
          title="Review NFT transfer"
          headline={`Send ${nft.name || `${nft.symbol} #${nft.token_id}`}`}
          rows={[
            { label: 'NFT', value: `${nft.collection_name || nft.symbol} #${nft.token_id}` },
            { label: 'To', value: formatAddress(to.trim(), 8), sub: to.trim() },
            { label: 'From', value: `${currentWallet?.name ?? 'Account'} · post-quantum`, sub: formatAddress(currentWallet?.pqAddress ?? '', 6) },
            { label: 'Network', value: activeChain.name },
          ]}
          warnings={['A transfer cannot be reversed. Check the address.']}
          confirmLabel="Send NFT"
          busy={busy}
          error={error}
          onConfirm={() => void send()}
          onCancel={() => setReview(false)}
        />
      )}
    </Sheet>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="min-w-0 truncate text-right font-medium">{v}</span>
    </div>
  )
}
