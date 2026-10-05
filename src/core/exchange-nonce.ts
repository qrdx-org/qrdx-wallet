/**
 * Exchange nonces for transactions this wallet has submitted but no block has
 * included yet.
 *
 * `exchange_getNonce` answers from committed state only. QRDX blocks are ~180 s
 * apart, so a second operation in the same block window (an order, then a
 * cancel) would otherwise be signed with the same nonce and refused by the
 * node's mempool ("nonce N already queued for sender"). The tracker remembers
 * the nonces it handed out and returns the first free one at or above the
 * committed nonce.
 *
 * The node includes a sender's transactions only as a gap-free run from its
 * committed nonce (qrdx-node exchange/mempool.py `select_for_block`), so the
 * next nonce is the first hole in that run, not simply max + 1. Entries expire
 * after `ttlMs`: a transaction the node dropped must not hold its nonce forever.
 *
 * The tracker is a hint. A wallet that lost it (service-worker restart, another
 * device) recovers through the retry in tx-service, which marks a refused nonce
 * as taken and asks again.
 */

interface Entry {
  nonce: number
  at: number
}

export class ExchangeNonceTracker {
  private readonly pending = new Map<string, Entry[]>()

  constructor(
    private readonly ttlMs = 20 * 60_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  private key(chainId: string, sender: string) {
    return `${chainId}:${sender.toLowerCase()}`
  }

  private live(key: string, committed: number): Entry[] {
    const cutoff = this.now() - this.ttlMs
    const list = (this.pending.get(key) ?? []).filter((e) => e.nonce >= committed && e.at >= cutoff)
    if (list.length) this.pending.set(key, list)
    else this.pending.delete(key)
    return list
  }

  /** The nonce to sign with, given the node's committed next nonce. */
  next(chainId: string, sender: string, committed: number): number {
    const taken = new Set(this.live(this.key(chainId, sender), committed).map((e) => e.nonce))
    let n = committed
    while (taken.has(n)) n++
    return n
  }

  /** A nonce is in flight (submitted, or found already queued at the node). */
  record(chainId: string, sender: string, nonce: number): void {
    const key = this.key(chainId, sender)
    const list = (this.pending.get(key) ?? []).filter((e) => e.nonce !== nonce)
    list.push({ nonce, at: this.now() })
    this.pending.set(key, list)
  }

  /** Nonces currently held for a sender (for tests and diagnostics). */
  held(chainId: string, sender: string, committed = 0): number[] {
    return this.live(this.key(chainId, sender), committed)
      .map((e) => e.nonce)
      .sort((a, b) => a - b)
  }
}

/** Does this node refusal mean "that nonce is already used or queued"? */
export function isNonceConflict(message: string): boolean {
  return /already queued|nonce too low|duplicate/i.test(message)
}
