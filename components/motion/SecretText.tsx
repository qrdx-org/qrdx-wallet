'use client'

import DecryptedText from '@/components/DecryptedText'
import { cn } from '@/lib/utils'

const ALPHABET = {
  words: 'abcdefghijklmnopqrstuvwxyz',
  hex: '0123456789abcdef',
} as const

/**
 * A secret the user asked to see (a recovery word, a private key), decrypting into place as it
 * appears: DecryptedText (React Bits, components/DecryptedText.jsx), its characters cycling
 * through the secret's own alphabet before each settles, left to right. Screen readers and
 * copying get the real text from the start.
 */
export function SecretText({ text, alphabet = 'words', className }: { text: string; alphabet?: keyof typeof ALPHABET; className?: string }) {
  return (
    <DecryptedText
      text={text}
      animateOn="view"
      sequential
      revealDirection="start"
      speed={alphabet === 'hex' ? 14 : 45}
      maxIterations={8}
      characters={ALPHABET[alphabet]}
      encryptedClassName="opacity-50"
      parentClassName={cn('secret-text', alphabet === 'hex' && 'secret-text--break', className)}
    />
  )
}
