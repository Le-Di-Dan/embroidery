import { baseConfig } from '@embroidery/eslint-config/base';

export default [
  ...baseConfig,
  {
    // DB6-S26 live-catalog verification scripts: plain Node CLI tooling, run
    // directly with `node`, never bundled into the application — same class
    // as the root-level `tools/*.mjs` scripts, just package-scoped because
    // they need this package's own `pg`/`drizzle-orm` dependencies.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];
