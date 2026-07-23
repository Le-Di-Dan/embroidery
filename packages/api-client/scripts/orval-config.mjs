import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Absolute path of the api-client package root. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Committed offline OpenAPI artifact — the only generation input. */
export const OPENAPI_ARTIFACT = path.resolve(
  PACKAGE_ROOT,
  '..',
  'contracts',
  'openapi',
  'openapi.generated.json',
);

/** Tracked generated output directory. */
export const GENERATED_DIR = path.join(PACKAGE_ROOT, 'src', 'generated');

/** Tracked handwritten Orval mutator (mirrored by the drift checker). */
export const MUTATOR_FILE = path.join(PACKAGE_ROOT, 'src', 'clients', 'api-request.mutator.ts');

/** The single declarative Orval config both scripts drive. */
export const ORVAL_CONFIG = path.join(PACKAGE_ROOT, 'orval.config.ts');

const require = createRequire(import.meta.url);
const ORVAL_BIN = path.join(
  path.dirname(require.resolve('orval/package.json')),
  'dist',
  'bin',
  'orval.mjs',
);

/**
 * Run Orval against the single `orval.config.ts`, cross-platform, always with
 * the package root as the working directory so the installed TypeScript
 * version (hence emitted helper types) is detected identically for real and
 * drift generation. Output target and mutator path are redirected via env for
 * the drift checker; both are absolute so files land in the temp mirror while
 * the generated mutator import stays byte-identical.
 */
export function runOrval({ outputTarget, mutatorPath } = {}) {
  const env = { ...process.env };
  if (outputTarget !== undefined) env.ORVAL_OUTPUT_TARGET = outputTarget;
  if (mutatorPath !== undefined) env.ORVAL_MUTATOR_PATH = mutatorPath;
  const result = spawnSync(process.execPath, [ORVAL_BIN, '--config', ORVAL_CONFIG], {
    cwd: PACKAGE_ROOT,
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `orval exited with code ${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
}
