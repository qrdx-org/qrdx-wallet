/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QRDX Wallet — Biometric unlock with passkeys (WebAuthn PRF)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Face ID / Touch ID / Windows Hello unlock without ever storing the password.
 *
 *  A passkey created with the WebAuthn **PRF extension** can produce a 32-byte
 *  secret that only that authenticator can compute, and only after the user
 *  verifies with biometrics. The wallet derives a key from that secret and
 *  wraps the vault's data key with it (src/core/vault.ts). Unlocking replays
 *  the assertion, gets the same secret, unwraps the data key.
 *
 *  What this deliberately does NOT do: store the password (or any key) in
 *  localStorage "protected" by a WebAuthn assertion. An assertion without PRF
 *  proves presence but yields no secret, so such a scheme would leave the key
 *  readable by anyone with access to storage. If the platform lacks PRF,
 *  biometric unlock is simply unavailable.
 *
 *  Support: Safari/iOS 18+ with iCloud Keychain passkeys, Chrome with Google
 *  Password Manager or a platform authenticator that implements PRF. The
 *  capability is detected at runtime; see docs/PLATFORMS.md.
 *
 *  No server is involved — challenges are random and only the PRF output is
 *  used, so there is nothing to verify remotely.
 */

import { bytesToHex, hexToBytes } from '../core/crypto'

export type PasskeySupport = 'supported' | 'unsupported' | 'unknown'

export class PasskeyError extends Error {
  constructor(
    message: string,
    readonly code: 'UNSUPPORTED' | 'CANCELLED' | 'NO_PRF' | 'FAILED' = 'FAILED'
  ) {
    super(message)
    this.name = 'PasskeyError'
  }
}

const b64url = {
  encode(bytes: Uint8Array): string {
    let s = ''
    bytes.forEach((b) => (s += String.fromCharCode(b)))
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s: string): Uint8Array {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
  },
}

const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

type PrfResults = { enabled?: boolean; results?: { first?: ArrayBuffer } }

function prfFrom(cred: PublicKeyCredential): PrfResults | undefined {
  return (cred.getClientExtensionResults() as { prf?: PrfResults }).prf
}

function mapError(err: unknown): never {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError')
    throw new PasskeyError('Biometric check was cancelled', 'CANCELLED')
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    throw new PasskeyError('This browser cannot use passkeys here', 'UNSUPPORTED')
  }
  throw new PasskeyError(err instanceof Error ? err.message : 'Passkey operation failed')
}

/** Best-effort capability check before offering biometric unlock. */
export async function passkeySupport(): Promise<PasskeySupport> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials)
    return 'unsupported'
  try {
    const PKC = window.PublicKeyCredential as typeof PublicKeyCredential & {
      getClientCapabilities?: () => Promise<Record<string, boolean>>
    }
    const platform = await PKC.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false)
    if (PKC.getClientCapabilities) {
      const caps = await PKC.getClientCapabilities().catch(() => null)
      if (caps && 'extension:prf' in caps)
        return caps['extension:prf'] ? 'supported' : 'unsupported'
    }
    // No capability API: PRF may still work (enrolment verifies it).
    return platform ? 'unknown' : 'unsupported'
  } catch {
    return 'unknown'
  }
}

export interface CreatedPasskey {
  credentialId: string
  rpId: string
  prfSalt: string
  prfOutput: string
}

async function evaluate(
  credentialIds: string[],
  salts: Record<string, string>,
  rpId?: string
): Promise<{ credentialId: string; prfOutput: string }> {
  let assertion: PublicKeyCredential | null
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: ab(random(32)),
        rpId,
        allowCredentials: credentialIds.map((id) => ({
          type: 'public-key' as const,
          id: ab(b64url.decode(id)),
        })),
        userVerification: 'required',
        timeout: 60_000,
        extensions: {
          prf: {
            evalByCredential: Object.fromEntries(
              credentialIds.map((id) => [id, { first: ab(hexToBytes(salts[id])) }])
            ),
          },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (err) {
    mapError(err)
  }
  if (!assertion) throw new PasskeyError('No passkey was used', 'CANCELLED')
  const first = prfFrom(assertion)?.results?.first
  if (!first)
    throw new PasskeyError('This passkey cannot produce an unlock secret on this device', 'NO_PRF')
  return {
    credentialId: b64url.encode(new Uint8Array(assertion.rawId)),
    prfOutput: bytesToHex(new Uint8Array(first)),
  }
}

/**
 * Create a passkey bound to this wallet and obtain its PRF secret.
 * Some platforms (iOS) return PRF results only on assertion, so a second
 * biometric prompt may follow creation.
 */
export async function createPasskey(userLabel: string): Promise<CreatedPasskey> {
  if ((await passkeySupport()) === 'unsupported')
    throw new PasskeyError('Biometric unlock is not available on this device', 'UNSUPPORTED')
  const prfSalt = random(32)
  const rpId = location.hostname
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'QRDX Wallet' },
        user: { id: ab(random(16)), name: userLabel, displayName: userLabel },
        challenge: ab(random(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        timeout: 60_000,
        extensions: {
          prf: { eval: { first: ab(prfSalt) } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (err) {
    mapError(err)
  }
  if (!cred) throw new PasskeyError('Passkey creation was cancelled', 'CANCELLED')

  const credentialId = b64url.encode(new Uint8Array(cred.rawId))
  const prf = prfFrom(cred)
  if (prf?.enabled === false)
    throw new PasskeyError(
      'Your device created a passkey but cannot use it to unlock the wallet',
      'NO_PRF'
    )

  const saltHex = bytesToHex(prfSalt)
  const first = prf?.results?.first
  const prfOutput = first
    ? bytesToHex(new Uint8Array(first))
    : (await evaluate([credentialId], { [credentialId]: saltHex })).prfOutput
  return { credentialId, rpId, prfSalt: saltHex, prfOutput }
}

/** Ask the user's authenticator for the unlock secret of any enrolled passkey. */
export async function unlockSecret(
  passkeys: { credentialId: string; prfSalt: string; rpId: string }[]
): Promise<{ credentialId: string; prfOutput: string }> {
  const usable = passkeys.filter(
    (p) => typeof location === 'undefined' || p.rpId === location.hostname
  )
  if (!usable.length)
    throw new PasskeyError('No biometric unlock is set up for this device', 'UNSUPPORTED')
  return evaluate(
    usable.map((p) => p.credentialId),
    Object.fromEntries(usable.map((p) => [p.credentialId, p.prfSalt]))
  )
}

/** A label for the passkey list, e.g. "iPhone · Safari". */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This device'
  const ua = navigator.userAgent
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'This device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  return `${device} · ${browser}`
}
