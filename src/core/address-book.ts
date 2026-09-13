/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Address Book
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Persisted recipient list, stored through the platform `IStorage` abstraction
 *  so the extension, web app, and mobile app share one implementation.
 *
 *  Entries are validated on write rather than on read. A saved contact is used
 *  to populate a send form, so an unvalidated entry would let a malformed
 *  address reach a transfer; rejecting at the boundary keeps everything
 *  downstream able to trust the stored value.
 *
 *  Addresses are stored in checksummed form and compared case-insensitively,
 *  because the same address arrives from RPC, dApps, and paste buffers with
 *  different casing.
 */

import type { IStorage } from './storage'
import { validateAddress, addressesEqual, type AddressKind } from './address'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AddressBookEntry {
  /** Stable identifier, generated on create. */
  id: string
  /** User-supplied label. */
  name: string
  /** Checksummed address. */
  address: string
  /** Which address scheme this is, derived from the address itself. */
  addressType: AddressKind
  /**
   * Registry slug of the chain this contact is for (see `chains.ts`), or
   * `undefined` for a contact that is not chain-specific.
   */
  chainId?: string
  isFavorite: boolean
  /** Free-text note. */
  notes?: string
  createdAt: number
  updatedAt: number
}

/** Fields a caller supplies when creating an entry. */
export interface AddressBookInput {
  name: string
  address: string
  chainId?: string
  isFavorite?: boolean
  notes?: string
}

const STORAGE_KEY = 'qrdx_address_book'
const MAX_NAME_LENGTH = 64
const MAX_NOTES_LENGTH = 280

/** Raised when an entry fails validation. Message is safe to show the user. */
export class AddressBookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AddressBookError'
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

export class AddressBook {
  constructor(private readonly storage: IStorage) {}

  /** All entries, favourites first then most recently updated. */
  async list(): Promise<AddressBookEntry[]> {
    const entries = (await this.storage.get<AddressBookEntry[]>(STORAGE_KEY)) ?? []
    return [...entries].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }

  /** Look up a saved contact by address, ignoring casing. */
  async findByAddress(address: string): Promise<AddressBookEntry | null> {
    const entries = await this.list()
    return entries.find(e => addressesEqual(e.address, address)) ?? null
  }

  /**
   * Add a contact.
   *
   * @throws {AddressBookError} if the name is empty, the address is invalid, or
   *         the address is already saved — a duplicate would make the label
   *         shown for an address ambiguous.
   */
  async add(input: AddressBookInput): Promise<AddressBookEntry> {
    const name = input.name.trim()
    if (name === '') {
      throw new AddressBookError('Name is required')
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new AddressBookError(`Name must be ${MAX_NAME_LENGTH} characters or fewer`)
    }

    const validation = validateAddress(input.address)
    if (!validation.valid || !validation.normalized || !validation.kind) {
      throw new AddressBookError(validation.error ?? 'Invalid address')
    }

    const notes = input.notes?.trim()
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      throw new AddressBookError(`Note must be ${MAX_NOTES_LENGTH} characters or fewer`)
    }

    const entries = (await this.storage.get<AddressBookEntry[]>(STORAGE_KEY)) ?? []
    if (entries.some(e => addressesEqual(e.address, validation.normalized!))) {
      throw new AddressBookError('That address is already in your address book')
    }

    const now = Date.now()
    const entry: AddressBookEntry = {
      id: cryptoRandomId(),
      name,
      address: validation.normalized,
      addressType: validation.kind,
      chainId: input.chainId,
      isFavorite: input.isFavorite ?? false,
      notes: notes || undefined,
      createdAt: now,
      updatedAt: now,
    }

    await this.storage.set(STORAGE_KEY, [...entries, entry])
    return entry
  }

  /**
   * Update an existing contact. Only the supplied fields change.
   *
   * @throws {AddressBookError} if the entry does not exist, or a supplied field
   *         is invalid.
   */
  async update(
    id: string,
    changes: Partial<AddressBookInput>,
  ): Promise<AddressBookEntry> {
    const entries = (await this.storage.get<AddressBookEntry[]>(STORAGE_KEY)) ?? []
    const index = entries.findIndex(e => e.id === id)
    if (index === -1) {
      throw new AddressBookError('Contact not found')
    }

    const current = entries[index]
    const next: AddressBookEntry = { ...current, updatedAt: Date.now() }

    if (changes.name !== undefined) {
      const name = changes.name.trim()
      if (name === '') throw new AddressBookError('Name is required')
      if (name.length > MAX_NAME_LENGTH) {
        throw new AddressBookError(`Name must be ${MAX_NAME_LENGTH} characters or fewer`)
      }
      next.name = name
    }

    if (changes.address !== undefined) {
      const validation = validateAddress(changes.address)
      if (!validation.valid || !validation.normalized || !validation.kind) {
        throw new AddressBookError(validation.error ?? 'Invalid address')
      }
      const clash = entries.some(
        e => e.id !== id && addressesEqual(e.address, validation.normalized!),
      )
      if (clash) {
        throw new AddressBookError('That address is already in your address book')
      }
      next.address = validation.normalized
      next.addressType = validation.kind
    }

    if (changes.chainId !== undefined) next.chainId = changes.chainId
    if (changes.isFavorite !== undefined) next.isFavorite = changes.isFavorite

    if (changes.notes !== undefined) {
      const notes = changes.notes.trim()
      if (notes.length > MAX_NOTES_LENGTH) {
        throw new AddressBookError(`Note must be ${MAX_NOTES_LENGTH} characters or fewer`)
      }
      next.notes = notes || undefined
    }

    const updated = [...entries]
    updated[index] = next
    await this.storage.set(STORAGE_KEY, updated)
    return next
  }

  /** Remove a contact. Removing an absent id is not an error. */
  async remove(id: string): Promise<void> {
    const entries = (await this.storage.get<AddressBookEntry[]>(STORAGE_KEY)) ?? []
    await this.storage.set(
      STORAGE_KEY,
      entries.filter(e => e.id !== id),
    )
  }

  /** Toggle the favourite flag and return the new value. */
  async toggleFavorite(id: string): Promise<boolean> {
    const entries = (await this.storage.get<AddressBookEntry[]>(STORAGE_KEY)) ?? []
    const entry = entries.find(e => e.id === id)
    if (!entry) throw new AddressBookError('Contact not found')

    const next = await this.update(id, { isFavorite: !entry.isFavorite })
    return next.isFavorite
  }

  /** Remove every contact. */
  async clear(): Promise<void> {
    await this.storage.set(STORAGE_KEY, [])
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate an identifier, preferring the platform CSPRNG.
 *
 * These ids are not security-sensitive (they only key local records), but
 * `crypto.randomUUID` is available in every target runtime the wallet ships to
 * and avoids collisions that `Date.now()` alone can produce when entries are
 * added in the same millisecond.
 */
function cryptoRandomId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}
