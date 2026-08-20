/**
 * Reader for the `APP6-G01` policy dataset (`APP6-B01`).
 *
 * The JSON at `packages/database/seed/app6-policy-configuration.seed.json`
 * stays the **single source** of every APP6 policy value. This module reads it
 * and validates its shape; it restates no value, and adding a default here would
 * defeat the reason the dataset exists — `APP6-G01` §6.5 shipped data only and
 * routed the reader and the publishing caller to this checkpoint, exactly as
 * `APP4-G01` shipped its dataset and `APP4-B01-C1` shipped the reader.
 *
 * The folder is resolved from a caller-supplied `package.json` path for the
 * reason `loadApp4PolicyDataset` records: resolving it from `import.meta.url`
 * would make this module ESM-only, and the CommonJS NestJS applications could
 * then not import `@embroidery/database` at all. The path helper is shared with
 * that reader rather than re-derived.
 *
 * This is a reader, not a seed framework. It knows one dataset, applies no
 * ordering, opens no connection and writes nothing — publication is the API
 * bootstrap's, because only that side holds an Admin identity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { seedFolderFrom } from './app4-policy-dataset';

/** The dataset file name. The value source, and the only one. */
export const APP6_POLICY_DATASET_FILE = 'app6-policy-configuration.seed.json';

/** The three `APP6-G01` configuration keys, in dataset order. */
export const APP6_POLICY_KEYS = [
  'quotation.validity',
  'quotation.deposit',
  'design_approval.agreements',
] as const;

export type App6PolicyKey = (typeof APP6_POLICY_KEYS)[number];

export type App6PolicyConfiguration = {
  readonly configKey: App6PolicyKey;
  readonly description: string;
  readonly valueSchemaVersion: number;
  readonly value: Record<string, unknown>;
};

export type App6PolicyDataset = {
  readonly seedId: string;
  readonly tier: string;
  readonly decisionId: string;
  readonly configurations: readonly App6PolicyConfiguration[];
};

/**
 * Reads and validates the dataset.
 *
 * The validation is structural rather than exhaustive: it proves the file is the
 * dataset this reader expects — three known keys, each with a schema version and
 * an object value — without asserting any particular number, which would be
 * restating the values it exists to avoid duplicating. In particular it does not
 * know how many days a quotation is valid for, what share a deposit is, or which
 * agreement types design approval requires; each consumer parses the one value
 * it needs at its own point of use.
 */
export function loadApp6PolicyDataset(packageJsonPath: string): App6PolicyDataset {
  const file = join(seedFolderFrom(packageJsonPath), APP6_POLICY_DATASET_FILE);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${APP6_POLICY_DATASET_FILE} is not an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const configurations = record['configurations'];
  if (!Array.isArray(configurations)) {
    throw new Error(`${APP6_POLICY_DATASET_FILE} has no configurations array.`);
  }

  const seen = new Set<string>();
  for (const entry of configurations) {
    const configuration = entry as Partial<App6PolicyConfiguration>;
    const key = configuration.configKey;
    if (key === undefined || !(APP6_POLICY_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `${APP6_POLICY_DATASET_FILE} carries an unknown config key "${String(key)}".`,
      );
    }
    if (seen.has(key)) {
      throw new Error(`${APP6_POLICY_DATASET_FILE} declares "${key}" more than once.`);
    }
    seen.add(key);
    if (typeof configuration.valueSchemaVersion !== 'number') {
      throw new Error(`${APP6_POLICY_DATASET_FILE}: "${key}" has no value schema version.`);
    }
    if (typeof configuration.value !== 'object' || configuration.value === null) {
      throw new Error(`${APP6_POLICY_DATASET_FILE}: "${key}" has no value object.`);
    }
    if (typeof configuration.description !== 'string' || configuration.description === '') {
      throw new Error(`${APP6_POLICY_DATASET_FILE}: "${key}" has no description.`);
    }
  }
  for (const key of APP6_POLICY_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`${APP6_POLICY_DATASET_FILE} is missing "${key}".`);
    }
  }

  return parsed as App6PolicyDataset;
}
