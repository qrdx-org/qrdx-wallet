import { describe, it, expect, beforeEach } from 'vitest'
import { AddressBook, AddressBookError } from '../../src/core/address-book'
import type { IStorage } from '../../src/core/storage'

class MemoryStorage implements IStorage {
  private data = new Map<string, string>()
  async get<T>(key: string): Promise<T | null> {
    const raw = this.data.get(key)
    return raw === undefined ? null : (JSON.parse(raw) as T)
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value))
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
  async clear(): Promise<void> {
    this.data.clear()
  }
}

const ETH = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'
const PQ =
  '0xPQ8d30632d776eC1b311f674aE80ECd06d04df27f4bb0f6BEE32693cAFb5AC59D6'

let book: AddressBook
let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  book = new AddressBook(storage)
})

describe('add', () => {
  it('stores a contact with the checksummed address and derived type', async () => {
    const entry = await book.add({ name: 'Faucet', address: ETH.toLowerCase() })

    expect(entry.address).toBe(ETH)
    expect(entry.addressType).toBe('eth')
    expect(entry.name).toBe('Faucet')
  })

  it('derives the post-quantum type from the address', async () => {
    const entry = await book.add({ name: 'Validator', address: PQ })
    expect(entry.addressType).toBe('pq')
  })

  it('rejects an invalid address rather than storing it', async () => {
    await expect(book.add({ name: 'Bad', address: '0xnope' })).rejects.toThrow(
      AddressBookError,
    )
    expect(await book.list()).toEqual([])
  })

  it('requires a name', async () => {
    await expect(book.add({ name: '   ', address: ETH })).rejects.toThrow(/name/i)
  })

  it('rejects a duplicate address regardless of casing', async () => {
    await book.add({ name: 'Faucet', address: ETH })
    await expect(
      book.add({ name: 'Same again', address: ETH.toLowerCase() }),
    ).rejects.toThrow(/already/i)
  })
})

describe('update', () => {
  it('changes only the supplied fields', async () => {
    const entry = await book.add({ name: 'Faucet', address: ETH, notes: 'test' })
    const updated = await book.update(entry.id, { name: 'Renamed' })

    expect(updated.name).toBe('Renamed')
    expect(updated.address).toBe(ETH)
    expect(updated.notes).toBe('test')
  })

  it('validates a replacement address', async () => {
    const entry = await book.add({ name: 'Faucet', address: ETH })
    await expect(book.update(entry.id, { address: 'nope' })).rejects.toThrow(
      AddressBookError,
    )
  })

  it('rejects an update that would duplicate another contact', async () => {
    await book.add({ name: 'A', address: ETH })
    const b = await book.add({ name: 'B', address: PQ })

    await expect(book.update(b.id, { address: ETH })).rejects.toThrow(/already/i)
  })

  it('reports a missing contact', async () => {
    await expect(book.update('nope', { name: 'x' })).rejects.toThrow(/not found/i)
  })
})

describe('list ordering', () => {
  it('puts favourites first', async () => {
    await book.add({ name: 'Plain', address: ETH })
    await book.add({ name: 'Starred', address: PQ, isFavorite: true })

    expect((await book.list()).map(e => e.name)).toEqual(['Starred', 'Plain'])
  })
})

describe('lookup and removal', () => {
  it('finds a contact by address ignoring casing', async () => {
    await book.add({ name: 'Faucet', address: ETH })
    const found = await book.findByAddress(ETH.toLowerCase())

    expect(found?.name).toBe('Faucet')
  })

  it('returns null for an unknown address', async () => {
    expect(await book.findByAddress(ETH)).toBeNull()
  })

  it('removes a contact and tolerates removing it twice', async () => {
    const entry = await book.add({ name: 'Faucet', address: ETH })

    await book.remove(entry.id)
    await book.remove(entry.id)
    expect(await book.list()).toEqual([])
  })

  it('toggles the favourite flag', async () => {
    const entry = await book.add({ name: 'Faucet', address: ETH })

    expect(await book.toggleFavorite(entry.id)).toBe(true)
    expect(await book.toggleFavorite(entry.id)).toBe(false)
  })
})

describe('persistence', () => {
  it('survives reopening over the same storage', async () => {
    await book.add({ name: 'Faucet', address: ETH })

    const reopened = new AddressBook(storage)
    expect((await reopened.list()).map(e => e.name)).toEqual(['Faucet'])
  })
})
