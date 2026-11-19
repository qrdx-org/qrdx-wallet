'use client'

/**
 * Coin and network logos, in one colour (public/logos/README.md).
 *
 * A verified coin (the network's own, or a token the wallet lists for that network by address)
 * shows its mark, drawn as a mask in the text colour so it reads in both themes. Anyone can name
 * a token "USDC", so a symbol alone never earns a mark: other tokens show the image their creator
 * published, in greyscale, or their initials. Paths are relative: the extension serves the
 * wallet from popup/.
 */

import { useState } from 'react'
import { isListedToken, type ChainConfig } from '@/src/core/chains'
import { cn } from '@/lib/utils'

const TOKENS = new Set(['qrdx', 'btc', 'eth', 'usdc', 'usdt', 'sol', 'bnb', 'avax', 'link', 'uni', 'ada', 'dot', 'pol', 'arb', 'op', 'dai', 'wbtc', 'aave', 'mnt', 'celo', 'jup', 'pyth', 'msol', 'gno'])

/** Symbols drawn with another coin's mark: wrapped and renamed coins. */
const ALIASES: Record<string, string> = {
  WETH: 'eth',
  MATIC: 'pol',
  WSOL: 'sol',
  XDAI: 'dai',
  WBNB: 'bnb',
  WAVAX: 'avax',
  'USDC.E': 'usdc',
}

/** Network marks, by chain id prefix. */
const NETWORKS: [RegExp, string][] = [
  [/^qrdx-/, 'qrdx'],
  [/^ethereum/, 'ethereum'],
  [/^polygon/, 'polygon'],
  [/^arbitrum/, 'arbitrum-one'],
  [/^optimism/, 'optimism'],
  [/^base/, 'base'],
  [/^avalanche/, 'avalanche'],
  [/^bsc/, 'binance-smart-chain'],
  [/^zksync/, 'zksync'],
  [/^linea/, 'linea'],
  [/^scroll/, 'scroll'],
  [/^mantle/, 'mantle'],
  [/^gnosis/, 'gnosis'],
  [/^celo/, 'celo'],
  [/^sonic/, 'sonic'],
  [/^unichain/, 'unichain'],
  [/^bitcoin/, 'bitcoin'],
  [/^solana/, 'solana'],
]

export function coinLogoPath(symbol: string): string | null {
  const s = symbol.toUpperCase()
  const name = ALIASES[s] ?? s.toLowerCase()
  if (TOKENS.has(name)) return `logos/tokens/${name}.svg`
  if (s === 'S') return 'logos/networks/sonic.svg'
  return null
}

export function networkLogoPath(chain: Pick<ChainConfig, 'id'>): string | null {
  const hit = NETWORKS.find(([re]) => re.test(chain.id))
  return hit ? `logos/networks/${hit[1]}.svg` : null
}

/** The network's own coin or a token its registry lists by address (chains.ts isListedToken). */
export const isVerifiedToken = isListedToken

function Mark({ path, size, label, className }: { path: string; size: number; label: string; className?: string }) {
  const mask = `url(${path}) center / contain no-repeat`
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] ring-1 ring-inset ring-border/60', className)}
      style={{ width: size, height: size }}
    >
      <span className="bg-foreground" style={{ width: size * 0.62, height: size * 0.62, mask, WebkitMask: mask }} />
    </span>
  )
}

function Initials({ text, size, className }: { text: string; size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] font-semibold text-foreground/80 ring-1 ring-inset ring-border/60', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.32) }}
    >
      {text}
    </span>
  )
}

export function CoinLogo({
  symbol,
  mark,
  verified = false,
  image,
  size = 36,
  network,
  className,
}: {
  symbol: string
  /** The coin whose mark to show, when not `symbol` (a QRDX qETH shows ETH's). */
  mark?: string
  /** The network's own coin or a token listed by address (see isVerifiedToken). */
  verified?: boolean
  /** An image the token's creator published. */
  image?: string | null
  size?: number
  /** Show this network's mark in the corner: for a token that is not the network's own coin. */
  network?: Pick<ChainConfig, 'id' | 'name'>
  className?: string
}) {
  const [broken, setBroken] = useState<string | null>(null)
  const path = verified ? coinLogoPath(mark ?? symbol) : null
  const label = symbol
  let body: React.ReactNode
  if (path) body = <Mark path={path} size={size} label={label} />
  else if (image && broken !== image) {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={label}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(image)}
        className="logo-mono shrink-0 rounded-full object-cover ring-1 ring-inset ring-border/60"
        style={{ width: size, height: size }}
      />
    )
  } else body = <Initials text={symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'} size={size} />

  const badge = network ? networkLogoPath(network) : null
  if (!badge) return <span className={cn('inline-flex shrink-0', className)}>{body}</span>
  const small = Math.round(size * 0.42)
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {body}
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-px" title={network!.name}>
        <Mark path={badge} size={small} label={network!.name} />
      </span>
    </span>
  )
}

/** A network's mark, or its initials for one the user added. */
export function NetworkLogo({ chain, size = 24, className }: { chain: Pick<ChainConfig, 'id' | 'name'>; size?: number; className?: string }) {
  const path = networkLogoPath(chain)
  return path ? (
    <Mark path={path} size={size} label={chain.name} className={className} />
  ) : (
    <Initials text={chain.name.slice(0, 2).toUpperCase()} size={size} className={className} />
  )
}
