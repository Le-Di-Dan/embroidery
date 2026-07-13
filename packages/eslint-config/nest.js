import globals from 'globals';

import { baseConfig } from './base.js';

/**
 * Flat ESLint configuration for NestJS / Node applications.
 */
export const nestConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
