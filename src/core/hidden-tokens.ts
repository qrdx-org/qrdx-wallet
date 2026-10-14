/**
 * Tokens the user hid (spam, dust, anything they do not want listed), per network, in this
 * browser. Hidden tokens leave the dashboard and the token lists; their balances are
 * untouched, and "Show hidden" in All tokens lists them again. The native coin cannot be
 * hidden.
 */

const key = (chainId: string) => `qrdx_hidden_tokens:${chainId}`
const listeners = new Set<() => void>()
const cache = new Map<string, Set<string>>()

export function hiddenTokens(chainId: string): Set<string> {
  let set = cache.get(chainId)
  if (!set) {
    try {
      const raw = JSON.parse(localStorage.getItem(key(chainId)) ?? '[]')
      set = new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').map((x: string) => x.toLowerCase()) : [])
    } catch {
      set = new Set()
    }
    cache.set(chainId, set)
  }
  return set
}

export function setTokenHidden(chainId: string, address: string, hidden: boolean): void {
  if (!address) return
  const next = new Set(hiddenTokens(chainId))
  if (hidden) next.add(address.toLowerCase())
  else next.delete(address.toLowerCase())
  cache.set(chainId, next)
  try {
    localStorage.setItem(key(chainId), JSON.stringify([...next]))
  } catch {
    /* hidden for this page only */
  }
  listeners.forEach((l) => l())
}

export function onHiddenTokensChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
