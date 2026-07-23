import { baseConfig } from '@embroidery/eslint-config/base';

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
};

export default [
  // Orval-owned generated code is typechecked but not linted: it is never
  // hand-edited, and regenerating it must not have to satisfy style rules.
  { ignores: ['src/generated/**'] },
  ...baseConfig,
  {
    // Node ESM generation/drift scripts run outside the browser/test runtime.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
];
