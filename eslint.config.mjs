// ESLint 9 flat config. Replaces .eslintrc.js, which ESLint 9 no longer reads
// (and `next lint` was removed in Next 16), so linting had silently stopped.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Node build scripts and tool configs are CommonJS.
    files: ['scripts/**/*.js', '*.config.js', 'tests/**/*.mjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'node_modules/**',
    'ref/**',
    'next-env.d.ts',
    // Legacy Expo app — not a shipping target (docs/PLATFORMS.md).
    'src/mobile/**',
    'App.tsx',
    'metro.config.js',
    'app.config.js',
    // Installed from ReactDrops with shadcn (soap-bubble, liquid-glass-logo): kept as delivered.
    'components/soap-bubble/**',
    'components/liquid-glass-logo*',
    // Installed from React Bits with shadcn: kept as delivered (typed by their .d.ts files).
    'components/LatticeLoader.jsx',
    'components/SlideCommit.jsx',
    'components/SpecularButton.jsx',
    'components/ReflectiveCard.jsx',
    'components/SquishSwitch.jsx',
    'components/RubberSegment.jsx',
    'components/JellyRadio.jsx',
    'components/HoldButton.jsx',
    'components/StatusMark.jsx',
    'components/SpringCheck.jsx',
    'components/GlideSelect.jsx',
    'components/FuseButton.jsx',
    'components/PulseHeart.jsx',
    'components/DecryptedText.jsx',
    'components/PixelSwap.jsx',
    'components/ElasticSlider.jsx',
    'components/WarmTooltip.jsx',
  ]),
])
