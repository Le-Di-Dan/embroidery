/**
 * Guards the transitional boundary with `@embroidery/contracts` (APP0-B03).
 *
 * That package still resolves to TypeScript source (`main: ./src/index.ts`) and
 * has no build output, so under IMP-D018 the compiled API cannot `require` it:
 * `node dist/main.js` would fail at load with a syntax error, and it would fail
 * in the container rather than in any test. The API therefore imports the
 * canonical envelope types with `import type`, which TypeScript erases.
 *
 * This asserts the erasure actually happened. A future `import { something }`
 * (dropping `type`) compiles and unit-tests perfectly well, and this is the
 * check that catches it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { findRepositoryRoot } from '../../openapi/openapi-artifact';

/**
 * Matches an actual module load, not any mention of the name — `tsc` preserves
 * JSDoc into the emitted JavaScript, so a doc comment explaining this very
 * boundary would otherwise fail the check.
 */
const CONTRACTS_IMPORT = /(?:require\(|from\s*)["']@embroidery\/contracts["']/;

function collectJsFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

describe('compiled API and the contracts package', () => {
  const distDirectory = join(findRepositoryRoot(__dirname), 'apps', 'api', 'dist');

  it('has a build to inspect', () => {
    // `pnpm --filter @embroidery/api build` (and every openapi script) produces
    // this; if it is missing the assertion below would vacuously pass.
    expect(existsSync(distDirectory)).toBe(true);
  });

  it('never requires the contracts package at runtime', () => {
    const offenders = collectJsFiles(distDirectory).filter((file) =>
      CONTRACTS_IMPORT.test(readFileSync(file, 'utf8')),
    );

    expect(offenders.map((file) => file.replace(dirname(distDirectory), ''))).toEqual([]);
  });
});
