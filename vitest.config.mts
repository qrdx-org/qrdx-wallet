import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const rootDir = import.meta.dirname

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests talk to a local QRDX node over HTTP and are slower
    // than the pure-crypto unit tests.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@core': resolve(rootDir,'src/core'),
      '@shared': resolve(rootDir,'src/shared'),
    },
  },
})
