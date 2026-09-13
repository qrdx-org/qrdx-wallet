/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Per-Origin dApp Permissions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  The authority for what a connected site is allowed to do. Both the Settings
 *  UI ("Connected sites") and the extension's provider request router read from
 *  here, so revoking access in the UI immediately changes what the injected
 *  provider will answer.
 *
 *  Design rules, in order of importance:
 *
 *   1. **Permissions are keyed by origin, never by URL or page title.** Origin
 *      (`https://app.example.com`) is the security boundary the browser
 *      enforces; a path or title is attacker-controlled decoration. Anything
 *      that cannot be parsed into a normalised origin is refused outright.
 *
 *   2. **Capabilities are explicit and additive.** Granting account visibility
 *      never implies permission to request a signature. A dApp that wants to
 *      sign must have been granted `signMessage`/`sendTransaction` separately.
 *
 *   3. **Absence means denial.** An origin with no record has no permissions.
 *      There is no implicit or wildcard grant.
 *
 *  This module stores *authorisation state only*. It never holds keys, and
 *  granting a capability is not the same as approving an individual request —
 *  the request router is still responsible for prompting per signature where
 *  the product calls for it.
 */

import type { IStorage } from './storage'
import { addressesEqual, normalizeAddress } from './address'

// ─── Capabilities ───────────────────────────────────────────────────────────

/**
 * A discrete thing a site may be permitted to do.
 *
 * Kept coarse enough to be explainable in an approval prompt — a permission a
 * user cannot understand is not meaningful consent.
 */
export type SiteCapability =
  /** See which account addresses are selected. */
  | 'viewAccounts'
  /** Ask the wallet to sign an arbitrary message (personal_sign / typed data). */
  | 'signMessage'
  /** Ask the wallet to sign and broadcast a transaction. */
  | 'sendTransaction'
  /** Read chain/network metadata and request a network switch. */
  | 'manageChain'
  /** Suggest a token for the user to track (`wallet_watchAsset`). */
  | 'watchAsset'
  /** Use QRDX post-quantum signing methods. */
  | 'postQuantum'

/** Human-readable labels for approval prompts and the settings list. */
export const CAPABILITY_LABELS: Record<SiteCapability, string> = {
  viewAccounts: 'View your account addresses',
  signMessage: 'Request message signatures',
  sendTransaction: 'Request transactions',
  manageChain: 'Read and switch networks',
  watchAsset: 'Suggest tokens to track',
  postQuantum: 'Use post-quantum signing',
}

/**
 * What a site gets on a plain "connect" with no further negotiation.
 *
 * Read-only by design: connecting reveals an address and lets the dApp see
 * which network it is on. Signing and spending are deliberately excluded, so
 * they require a separate, visible grant.
 */
export const DEFAULT_CONNECT_CAPABILITIES: SiteCapability[] = [
  'viewAccounts',
  'manageChain',
]

// ─── Records ────────────────────────────────────────────────────────────────

export interface SitePermission {
  /** Normalised origin, e.g. `https://app.uniswap.org`. The primary key. */
  origin: string
  /** Display name from the page, treated as untrusted decoration. */
  name?: string
  /** Favicon URL, treated as untrusted decoration. */
  favicon?: string
  /** Capabilities currently granted. */
  capabilities: SiteCapability[]
  /**
   * Checksummed addresses this origin may see. Empty means "no accounts
   * exposed" even when `viewAccounts` is granted.
   */
  accounts: string[]
  connectedAt: number
  lastUsedAt: number
}

const STORAGE_KEY = 'qrdx_site_permissions'

/** Raised for a malformed origin or unknown site. Safe to surface to the user. */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

// ─── Origin handling ────────────────────────────────────────────────────────

/**
 * Reduce a URL or origin string to a bare, comparable origin.
 *
 * Rejects anything that is not an http(s) origin. `file:`, `data:`, and
 * extension-internal schemes are refused because they do not identify a
 * distinct, attributable party the user could meaningfully grant access to.
 *
 * @throws {PermissionError} when the input cannot be parsed or uses a
 *         disallowed scheme.
 */
export function normalizeOrigin(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new PermissionError(`Not a valid site origin: ${input}`)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new PermissionError(
      `Unsupported scheme "${url.protocol}" — only http and https sites can be granted access`,
    )
  }

  // URL.origin already drops path, query, fragment, and credentials, and
  // normalises the default port away.
  return url.origin
}

// ─── Store ──────────────────────────────────────────────────────────────────

export class SitePermissions {
  constructor(private readonly storage: IStorage) {}

  private async readAll(): Promise<SitePermission[]> {
    return (await this.storage.get<SitePermission[]>(STORAGE_KEY)) ?? []
  }

  private async writeAll(records: SitePermission[]): Promise<void> {
    await this.storage.set(STORAGE_KEY, records)
  }

  /** Every connected site, most recently used first. */
  async list(): Promise<SitePermission[]> {
    const records = await this.readAll()
    return [...records].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  }

  /** The record for an origin, or `null` if it has never been granted access. */
  async get(origin: string): Promise<SitePermission | null> {
    const normalized = normalizeOrigin(origin)
    const records = await this.readAll()
    return records.find(r => r.origin === normalized) ?? null
  }

  /**
   * Whether an origin currently holds a capability.
   *
   * The single question the provider router should ask before honouring a
   * request. Returns `false` for unknown origins — absence is denial.
   */
  async can(origin: string, capability: SiteCapability): Promise<boolean> {
    let record: SitePermission | null
    try {
      record = await this.get(origin)
    } catch {
      // An unparseable origin can never hold a permission.
      return false
    }
    return record?.capabilities.includes(capability) ?? false
  }

  /**
   * Grant capabilities to an origin, creating the record if needed.
   *
   * Capabilities and accounts are merged with any existing grant, so calling
   * this to add one capability never silently drops another.
   */
  async grant(
    origin: string,
    options: {
      capabilities?: SiteCapability[]
      accounts?: string[]
      name?: string
      favicon?: string
    } = {},
  ): Promise<SitePermission> {
    const normalized = normalizeOrigin(origin)
    const records = await this.readAll()
    const existing = records.find(r => r.origin === normalized)
    const now = Date.now()

    const capabilities = options.capabilities ?? DEFAULT_CONNECT_CAPABILITIES
    const accounts = (options.accounts ?? []).map(a => normalizeAddress(a))

    const merged: SitePermission = existing
      ? {
          ...existing,
          name: options.name ?? existing.name,
          favicon: options.favicon ?? existing.favicon,
          capabilities: unique([...existing.capabilities, ...capabilities]),
          accounts: uniqueAddresses([...existing.accounts, ...accounts]),
          lastUsedAt: now,
        }
      : {
          origin: normalized,
          name: options.name,
          favicon: options.favicon,
          capabilities: unique(capabilities),
          accounts: uniqueAddresses(accounts),
          connectedAt: now,
          lastUsedAt: now,
        }

    const next = existing
      ? records.map(r => (r.origin === normalized ? merged : r))
      : [...records, merged]

    await this.writeAll(next)
    return merged
  }

  /**
   * Remove specific capabilities from an origin, leaving the rest intact.
   *
   * Revoking every capability leaves a record with none rather than deleting
   * it, so the site still appears in Settings as explicitly disconnected. Use
   * {@link revokeAll} to forget it entirely.
   */
  async revoke(origin: string, capabilities: SiteCapability[]): Promise<void> {
    const normalized = normalizeOrigin(origin)
    const records = await this.readAll()

    await this.writeAll(
      records.map(r =>
        r.origin === normalized
          ? {
              ...r,
              capabilities: r.capabilities.filter(c => !capabilities.includes(c)),
              lastUsedAt: Date.now(),
            }
          : r,
      ),
    )
  }

  /** Forget an origin entirely. Disconnecting an unknown origin is not an error. */
  async revokeAll(origin: string): Promise<void> {
    const normalized = normalizeOrigin(origin)
    const records = await this.readAll()
    await this.writeAll(records.filter(r => r.origin !== normalized))
  }

  /** Forget every connected site. */
  async revokeEverything(): Promise<void> {
    await this.writeAll([])
  }

  /**
   * Replace the accounts an origin can see.
   *
   * Called when the user switches accounts: a site must not keep visibility of
   * an account the user has moved away from unless it was granted that account.
   */
  async setAccounts(origin: string, accounts: string[]): Promise<void> {
    const normalized = normalizeOrigin(origin)
    const records = await this.readAll()
    const next = accounts.map(a => normalizeAddress(a))

    await this.writeAll(
      records.map(r =>
        r.origin === normalized
          ? { ...r, accounts: uniqueAddresses(next), lastUsedAt: Date.now() }
          : r,
      ),
    )
  }

  /**
   * The accounts an origin may see, filtered to those the wallet still holds.
   *
   * A removed account must stop being reported to dApps even if a stale grant
   * still names it, so the caller passes the current wallet addresses.
   */
  async visibleAccounts(origin: string, walletAddresses: string[]): Promise<string[]> {
    const record = await this.get(origin).catch(() => null)
    if (!record || !record.capabilities.includes('viewAccounts')) return []

    return record.accounts.filter(granted =>
      walletAddresses.some(owned => addressesEqual(owned, granted)),
    )
  }

  /** Record that an origin made a request, for the "last used" column. */
  async touch(origin: string): Promise<void> {
    let normalized: string
    try {
      normalized = normalizeOrigin(origin)
    } catch {
      return
    }

    const records = await this.readAll()
    if (!records.some(r => r.origin === normalized)) return

    await this.writeAll(
      records.map(r =>
        r.origin === normalized ? { ...r, lastUsedAt: Date.now() } : r,
      ),
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function uniqueAddresses(addresses: string[]): string[] {
  const seen: string[] = []
  for (const address of addresses) {
    if (!seen.some(existing => addressesEqual(existing, address))) {
      seen.push(address)
    }
  }
  return seen
}
