import { baseConfig } from '@embroidery/eslint-config/base';

/**
 * Node globals for the author-time schema generator (`APP3-B08-C1`).
 *
 * The same shape `@embroidery/api-client` already uses for its generation and
 * drift scripts: the package's runtime is browser-safe, so the base config
 * rightly knows nothing about `console` or `process`, but `scripts/` is not the
 * runtime — it never ships and never enters the module graph.
 */
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
};

export default [
  ...baseConfig,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
];
