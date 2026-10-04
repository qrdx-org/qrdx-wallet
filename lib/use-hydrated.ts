import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * `false` during server rendering / static export and the first client render,
 * `true` afterwards. Use it to gate browser-only UI (wallet storage, user agent)
 * without a mount effect that sets state.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
