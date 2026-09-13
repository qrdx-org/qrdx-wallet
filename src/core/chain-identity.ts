/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Live Chain Identity Reconciliation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  A wallet must sign EIP-155 transactions with the chain ID the node actually
 *  reports. Signing with a stale or guessed value produces a signature that
 *  recovers to a different sender address: the node rejects it, or — worse — a
 *  replay-protected transaction lands on a chain the user did not intend.
 *
 *  QRDX makes this concrete. Four sources in this codebase disagree about the
 *  QRDX chain IDs:
 *
 *    • `qrdx-explorer/components/NetworkSwitcher.tsx` — 1337 / 31337
 *    • `qrdx-chain/qrdx/rpc/modules/eth.py`           — 88888 (module default)
 *    • `qrdx-chain/scripts/testnet.sh`                — 9999 (local testnet)
 *    • `qrdx-chain/config.example.toml`               — 1
 *
 *  Rather than pick a winner and hope, the registry values in `chains.ts` are
 *  treated as an *expectation* and the node's `eth_chainId` as the *truth*.
 *  Before anything is signed we probe the endpoint and compare. On agreement we
 *  sign with the live value. On disagreement we refuse and surface the conflict,
 *  because a mismatch means the wallet's idea of which network it is talking to
 *  is wrong — exactly the situation where signing is dangerous.
 *
 *  A user who knowingly runs a node on a non-standard chain ID can record that
 *  decision with {@link trustChainId}, which is scoped to a single chain entry
 *  and never applied implicitly.
 *
 *  This module deliberately performs its own `fetch` instead of depending on
 *  `ethereum.ts`: the provider consults this module before signing, and routing
 *  the dependency the other way would create an import cycle.
 */

import type { ChainConfig } from './chains'

// ─── Types ──────────────────────────────────────────────────────────────────

/** The outcome of probing a chain's RPC endpoint for its identity. */
export interface ChainIdentity {
  /** Registry slug the probe was performed for. */
  chainSlug: string
  /** Chain ID the node reported via `eth_chainId`. */
  liveChainId: number
  /** Chain ID the registry expected. */
  configuredChainId: number
  /** Whether the node agrees with the registry. */
  matches: boolean
  /** Whether the live value has been explicitly trusted despite a mismatch. */
  trusted: boolean
  /** The endpoint that answered. */
  rpcUrl: string
  /** `Date.now()` when the probe completed. */
  observedAt: number
}

/**
 * Raised when a chain's live identity cannot be established, or conflicts with
 * the registry and has not been explicitly trusted. Callers should surface
 * `message` to the user rather than retrying blindly.
 */
export class ChainIdentityError extends Error {
  readonly chainSlug: string
  readonly configuredChainId: number
  readonly liveChainId: number | null

  constructor(
    message: string,
    chainSlug: string,
    configuredChainId: number,
    liveChainId: number | null,
  ) {
    super(message)
    this.name = 'ChainIdentityError'
    this.chainSlug = chainSlug
    this.configuredChainId = configuredChainId
    this.liveChainId = liveChainId
  }
}

// ─── Probe cache ────────────────────────────────────────────────────────────

/**
 * How long a successful probe stays fresh. A chain ID is a near-immutable
 * property of a network, so this only exists to catch an endpoint being
 * repointed at a different chain — not to track a value that legitimately
 * changes.
 */
const IDENTITY_TTL_MS = 5 * 60 * 1000

/** Per-request timeout for the `eth_chainId` probe. */
const PROBE_TIMEOUT_MS = 10_000

const identityCache = new Map<string, ChainIdentity>()

/** In-flight probes, so concurrent callers share one request per chain. */
const inFlight = new Map<string, Promise<ChainIdentity>>()

// ─── Trusted overrides ──────────────────────────────────────────────────────

/**
 * Chain slug → chain ID the user has explicitly accepted despite it differing
 * from the registry. Held in memory; the app layer is responsible for
 * persisting and restoring it via {@link getTrustedChainIds} /
 * {@link setTrustedChainIds} so this module stays free of storage dependencies.
 */
const trustedChainIds = new Map<string, number>()

/**
 * Record that the user accepts `chainId` for `chainSlug` even though it differs
 * from the registry. Scoped to that one chain, and cleared by
 * {@link untrustChainId}.
 */
export function trustChainId(chainSlug: string, chainId: number): void {
  trustedChainIds.set(chainSlug, chainId)
  // A previously cached mismatch is now stale.
  identityCache.delete(chainSlug)
}

/** Withdraw a previously recorded trust decision. */
export function untrustChainId(chainSlug: string): void {
  trustedChainIds.delete(chainSlug)
  identityCache.delete(chainSlug)
}

/** Snapshot the trust decisions, for persistence by the app layer. */
export function getTrustedChainIds(): Record<string, number> {
  return Object.fromEntries(trustedChainIds)
}

/** Restore persisted trust decisions at startup. Replaces any existing set. */
export function setTrustedChainIds(entries: Record<string, number>): void {
  trustedChainIds.clear()
  for (const [slug, id] of Object.entries(entries)) {
    if (Number.isSafeInteger(id) && id > 0) trustedChainIds.set(slug, id)
  }
  identityCache.clear()
}

// ─── Probing ────────────────────────────────────────────────────────────────

/**
 * Ask a single endpoint for its chain ID.
 *
 * @throws if the endpoint is unreachable, times out, returns a JSON-RPC error,
 *         or answers with something that is not a positive integer.
 */
async function probeEndpoint(rpcUrl: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }

    const json = (await res.json()) as {
      result?: string
      error?: { code: number; message: string }
    }

    if (json.error) {
      throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
    }
    if (typeof json.result !== 'string') {
      throw new Error('eth_chainId returned no result')
    }

    const parsed = Number(BigInt(json.result))
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`eth_chainId returned an unusable value: ${json.result}`)
    }
    return parsed
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Determine a chain's live identity, trying its primary endpoint then each
 * fallback in turn.
 *
 * Results are cached for {@link IDENTITY_TTL_MS}; pass `forceRefresh` to
 * re-probe immediately (for example, after the user edits an RPC URL).
 *
 * A resolved value does **not** imply the chain is safe to sign on — the caller
 * must check `matches`/`trusted`, or use {@link resolveSigningChainId}, which
 * enforces that for them.
 *
 * @throws {ChainIdentityError} if no endpoint answers.
 */
export async function probeChainIdentity(
  chain: ChainConfig,
  forceRefresh = false,
): Promise<ChainIdentity> {
  if (!forceRefresh) {
    const cached = identityCache.get(chain.id)
    if (cached && Date.now() - cached.observedAt < IDENTITY_TTL_MS) {
      return cached
    }
    const pending = inFlight.get(chain.id)
    if (pending) return pending
  }

  const probe = (async (): Promise<ChainIdentity> => {
    const endpoints = [chain.rpcUrl, ...(chain.rpcFallbacks ?? [])]
    const failures: string[] = []

    for (const rpcUrl of endpoints) {
      try {
        const liveChainId = await probeEndpoint(rpcUrl)
        const trustedFor = trustedChainIds.get(chain.id)
        const identity: ChainIdentity = {
          chainSlug: chain.id,
          liveChainId,
          configuredChainId: chain.chainId,
          matches: liveChainId === chain.chainId,
          trusted: trustedFor === liveChainId,
          rpcUrl,
          observedAt: Date.now(),
        }
        identityCache.set(chain.id, identity)
        return identity
      } catch (err) {
        failures.push(`${rpcUrl}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    throw new ChainIdentityError(
      `Could not reach any RPC endpoint for ${chain.name}. ` +
        `Tried ${endpoints.length}: ${failures.join('; ')}`,
      chain.id,
      chain.chainId,
      null,
    )
  })()

  inFlight.set(chain.id, probe)
  try {
    return await probe
  } finally {
    inFlight.delete(chain.id)
  }
}

/**
 * Resolve the chain ID to sign with, enforcing that the node agrees with the
 * registry.
 *
 * This is the only function transaction signing should use to obtain a chain
 * ID. It returns the *live* value, so a node whose ID matches the registry is
 * signed for correctly even if the registry entry is later edited.
 *
 * @throws {ChainIdentityError} if the endpoint is unreachable, or reports a
 *         chain ID that differs from the registry and has not been trusted.
 */
export async function resolveSigningChainId(chain: ChainConfig): Promise<number> {
  const identity = await probeChainIdentity(chain)

  if (!identity.matches && !identity.trusted) {
    throw new ChainIdentityError(
      `Refusing to sign for ${chain.name}: the node at ${identity.rpcUrl} reports ` +
        `chain ID ${identity.liveChainId}, but this network is configured as ` +
        `${identity.configuredChainId}. Signing now could produce a transaction ` +
        `valid on a different chain. Verify the RPC endpoint, or explicitly ` +
        `trust chain ID ${identity.liveChainId} for this network if that is intended.`,
      chain.id,
      identity.configuredChainId,
      identity.liveChainId,
    )
  }

  return identity.liveChainId
}

/**
 * Read a cached identity without triggering a probe.
 *
 * Intended for render paths that want to show a connection or mismatch badge
 * without performing network I/O. Returns `null` when nothing has been probed
 * yet or the entry has expired.
 */
export function getCachedChainIdentity(chainSlug: string): ChainIdentity | null {
  const cached = identityCache.get(chainSlug)
  if (!cached) return null
  if (Date.now() - cached.observedAt >= IDENTITY_TTL_MS) return null
  return cached
}

/**
 * Drop cached probes. Call after changing RPC endpoints or network settings.
 * Trust decisions survive; use {@link untrustChainId} to clear those.
 */
export function clearChainIdentityCache(chainSlug?: string): void {
  if (chainSlug) {
    identityCache.delete(chainSlug)
  } else {
    identityCache.clear()
  }
}
