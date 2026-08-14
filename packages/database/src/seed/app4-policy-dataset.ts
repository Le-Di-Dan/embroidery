/**
 * Reader for the `APP4-G01` policy dataset (`APP4-B01-C1`).
 *
 * The JSON at `packages/database/seed/app4-policy-configuration.seed.json`
 * stays the **single source** of every APP4 policy value. This module reads it
 * and validates its shape; it restates no value, and adding a default here would
 * defeat the reason the dataset exists.
 *
 * The folder is resolved from a caller-supplied `package.json` path, exactly as
 * `migrationsFolderFrom` does and for the same reason: resolving it from
 * `import.meta.url` would make this module ESM-only, and the CommonJS NestJS
 * applications could then not import `@embroidery/database` at all (found in
 * DB7-CP1). ESM callers pass
 * `fileURLToPath(new URL('../package.json', import.meta.url))`; CommonJS callers
 * pass `require.resolve('@embroidery/database/package.json')`.
 *
 * This is a reader, not a seed framework. It knows one dataset, applies no
 * ordering, opens no connection and writes nothing — publication is the API
 * bootstrap's, because only that side holds an Admin identity.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The dataset file name. The value source, and the only one. */
export const APP4_POLICY_DATASET_FILE = 'app4-policy-configuration.seed.json';

/** The four `APP4-G01` configuration keys, in dataset order. */
export const APP4_POLICY_KEYS = [
  'verification.challenge',
  'secure_grant',
  'notification.delivery',
  'secure_link.resolve',
] as const;

export type App4PolicyKey = (typeof APP4_POLICY_KEYS)[number];

export type App4PolicyConfiguration = {
  readonly configKey: App4PolicyKey;
  readonly description: string;
  readonly valueSchemaVersion: number;
  readonly value: Record<string, unknown>;
};

export type App4PolicyDataset = {
  readonly seedId: string;
  readonly tier: string;
  readonly decisionId: string;
  readonly configurations: readonly App4PolicyConfiguration[];
};

/** The seed directory, given the path of this package's `package.json`. */
export function seedFolderFrom(packageJsonPath: string): string {
  return join(dirname(packageJsonPath), 'seed');
}

/**
 * Reads and validates the dataset.
 *
 * The validation is structural rather than exhaustive: it proves the file is the
 * dataset this reader expects — four known keys, each with a schema version and
 * an object value — without asserting any particular number, which would be
 * restating the values it exists to avoid duplicating.
 */
export function loadApp4PolicyDataset(packageJsonPath: string): App4PolicyDataset {
  const file = join(seedFolderFrom(packageJsonPath), APP4_POLICY_DATASET_FILE);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${APP4_POLICY_DATASET_FILE} is not an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const configurations = record['configurations'];
  if (!Array.isArray(configurations)) {
    throw new Error(`${APP4_POLICY_DATASET_FILE} has no configurations array.`);
  }

  const seen = new Set<string>();
  for (const entry of configurations) {
    const configuration = entry as Partial<App4PolicyConfiguration>;
    const key = configuration.configKey;
    if (key === undefined || !(APP4_POLICY_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `${APP4_POLICY_DATASET_FILE} carries an unknown config key "${String(key)}".`,
      );
    }
    if (seen.has(key)) {
      throw new Error(`${APP4_POLICY_DATASET_FILE} declares "${key}" more than once.`);
    }
    seen.add(key);
    if (typeof configuration.valueSchemaVersion !== 'number') {
      throw new Error(`${APP4_POLICY_DATASET_FILE}: "${key}" has no value schema version.`);
    }
    if (typeof configuration.value !== 'object' || configuration.value === null) {
      throw new Error(`${APP4_POLICY_DATASET_FILE}: "${key}" has no value object.`);
    }
    if (typeof configuration.description !== 'string' || configuration.description === '') {
      throw new Error(`${APP4_POLICY_DATASET_FILE}: "${key}" has no description.`);
    }
  }
  for (const key of APP4_POLICY_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`${APP4_POLICY_DATASET_FILE} is missing "${key}".`);
    }
  }

  return parsed as App4PolicyDataset;
}
