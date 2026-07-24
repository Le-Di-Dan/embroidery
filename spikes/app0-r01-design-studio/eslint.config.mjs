import { nextConfig } from '@embroidery/eslint-config/next';

const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
};

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'results/**', 'bench-results/**', 'public/**'],
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: NODE_GLOBALS },
  },
];
