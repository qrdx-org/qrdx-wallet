/**
 * Messages between an approval window (an extension page) and the background.
 * Kept in their own module so the UI can import them without pulling in the
 * background's router.
 */
import type { ApprovalRequest, ApprovalResult } from './router'

export const APPROVAL_GET = 'QRDX_APPROVAL_GET'
export const APPROVAL_RESOLVE = 'QRDX_APPROVAL_RESOLVE'

export interface ApprovalGetMessage {
  type: typeof APPROVAL_GET
  id: string
}

export interface ApprovalResolveMessage {
  type: typeof APPROVAL_RESOLVE
  id: string
  result: ApprovalResult
}

export type { ApprovalRequest, ApprovalResult }

/** The approval id in the window's URL hash (`#approval=<id>`), if any. */
export function approvalIdFromLocation(): string | null {
  if (typeof location === 'undefined') return null
  const m = /(?:^#|&)approval=([0-9a-f-]{36})/.exec(location.hash)
  return m ? m[1] : null
}

function send<T>(msg: object): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      msg,
      (res: { ok: boolean; value?: T; error?: { message: string } } | undefined) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (!res?.ok) return reject(new Error(res?.error?.message ?? 'No response'))
        resolve(res.value as T)
      }
    )
  })
}

export const approvals = {
  get: (id: string) =>
    send<ApprovalRequest>({ type: APPROVAL_GET, id } satisfies ApprovalGetMessage),
  resolve: (id: string, result: ApprovalResult) =>
    send<null>({ type: APPROVAL_RESOLVE, id, result } satisfies ApprovalResolveMessage),
}
