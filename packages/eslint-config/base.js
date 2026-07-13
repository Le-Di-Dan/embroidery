import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Base flat ESLint configuration for every TypeScript workspace.
 *
 * Type-aware rules use the TypeScript project service, so each consuming
 * workspace only needs a valid tsconfig.json next to its sources.
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '.next/**', 'coverage/**', '.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@embroidery/*/src/*', '@embroidery/*/dist/*'],
              message:
                'Deep imports into another workspace package are prohibited. Use the package public entry point.',
            },
          ],
        },
      ],
    },
  },
  {
    // Plain JS config files do not participate in type-aware linting.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
