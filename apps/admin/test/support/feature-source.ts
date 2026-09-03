/**
 * Read one Admin feature's whole source as a single string.
 *
 * Delivered by `APP12-H01` (FU-APP12-A01-01) for the boundary checks that say
 * "this screen cannot reach operation X". Several of those were written when X
 * was absent from `@embroidery/api-client` altogether and so asserted against
 * the shared package — which stopped being the right subject the moment another
 * app or another screen became X's approved consumer and X crossed the boundary
 * legitimately (`APP3-S02`, `APP5-B04`, `APP11-B04`).
 *
 * The claim those checks are making has always been about the *feature*, and
 * this is what makes it checkable there: an import of X anywhere under the
 * feature directory fails, whatever the shared package happens to export. That
 * is narrower than the old assertion in one respect and stricter in another —
 * it no longer breaks when an unrelated checkpoint publishes a consumer, and it
 * now covers every file in the feature rather than one curated list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FEATURES_DIR = join(__dirname, '..', '..', 'src', 'features');

/** Every file beneath `dir`, depth-first and in a stable order. */
function walk(dir: string): readonly string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

/**
 * @param featureName directory name under `src/features`, e.g.
 * `'custom-request-queue'`.
 */
export function readFeatureSource(featureName: string): string {
  const files = walk(join(FEATURES_DIR, featureName));
  // A feature with no files would make every `not.toContain` pass vacuously,
  // which is the one way this helper could silently stop checking anything.
  if (files.length === 0) {
    throw new Error(`No source found for feature "${featureName}".`);
  }
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}
