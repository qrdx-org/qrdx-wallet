/**
 * Ask the browser not to evict wallet storage.
 *
 * The vault lives in localStorage on the web and in the PWA. Browsers may
 * clear script-writable storage under pressure, and Safari's tracking
 * prevention deletes it for sites not visited in seven days — **unless the
 * site is installed to the home screen**. Installed PWAs are exempt, so on iOS
 * installing is the real protection; `persist()` covers Chromium and Firefox.
 *
 * Never a substitute for the recovery phrase: the UI keeps telling users to
 * back it up regardless of what this returns.
 */
export type PersistenceState = 'persisted' | 'best-effort' | 'unsupported'

export async function requestPersistentStorage(): Promise<PersistenceState> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!s?.persist) return 'unsupported'
  try {
    if (await s.persisted()) return 'persisted'
    return (await s.persist()) ? 'persisted' : 'best-effort'
  } catch {
    return 'best-effort'
  }
}

export async function persistenceState(): Promise<PersistenceState> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!s?.persisted) return 'unsupported'
  try {
    return (await s.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'best-effort'
  }
}
