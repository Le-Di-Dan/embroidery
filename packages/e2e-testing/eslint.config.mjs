import { baseConfig } from '@embroidery/eslint-config/base';

const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  Response: 'readonly',
};

export default [
  ...baseConfig,
  {
    // Plain-Node orchestration + CLI scripts, run directly with `node` and never
    // bundled into any application — the same class as the root `tools/*.mjs`.
    files: ['scripts/**/*.mjs', 'support/**/*.mjs'],
    languageOptions: {
      globals: NODE_GLOBALS,
    },
  },
];
