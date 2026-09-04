/**
 * Reader for the worker runtime policy dataset (`APP12-H03-C1`).
 *
 * The JSON at `packages/database/seed/worker-runtime-policy.seed.json` is the
 * **single source** of the ten `worker.runtime` values. This module reads it and
 * validates its shape; it restates no value, and adding a default here would
 * defeat the reason the dataset exists — and would put a second definition of
 * "expired" one import away from the one the worker enforces.
 *
 * ### Why this dataset exists at all
 *
 * `APP2-I02` made `worker.runtime` a versioned policy rather than environment
 * variables, and shipped the consumer (`WorkerPolicyService`). It shipped no
 * publisher: every environment that ever had the policy got it from a test
 * fixture or from the `APP2-E01` smoke tool. A cold deployed worker therefore
 * found nothing, logged `WORKER_POLICY_MISSING` and claimed no job for the life
 * of the pod — which `APP12-H03` observed in a production-like cluster and
 * `APP12-H03-C1` corrects by giving the policy the same dataset → reader →
 * bootstrap publisher path `APP4-G01` and `APP6-G01` already use.
 *
 * ### What this reader deliberately does not validate
 *
 * The ten values' *semantics* — the bounds and the four relations between them —
 * belong to `parseWorkerRuntimePolicy` in the worker, which is the runtime that
 * has to survive them. Restating them here would be a second validator that can
 * disagree with the first. The structural check below proves the file is this
 * dataset; `worker-runtime-policy.spec.ts` proves the shipped values satisfy the
 * runtime validator, which is the assertion that actually matters.
 *
 * The folder is resolved from a caller-supplied `package.json` path for the
 * reason `loadApp4PolicyDataset` records: resolving it from `import.meta.url`
 * would make this module ESM-only, and the CommonJS NestJS applications could
 * then not import `@embroidery/database` at all. The path helper is shared with
 * that reader rather than re-derived.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { seedFolderFrom } from './app4-policy-dataset';

/** The dataset file name. The value source, and the only one. */
export const WORKER_RUNTIME_POLICY_DATASET_FILE = 'worker-runtime-policy.seed.json';

/**
 * The one configuration key this dataset carries.
 *
 * Deliberately restated here rather than imported from the worker: this package
 * is a dependency *of* the worker, so importing the worker's constant would
 * invert the dependency. `worker-runtime-policy.spec.ts` asserts the two agree.
 */
export const WORKER_RUNTIME_POLICY_DATASET_KEY = 'worker.runtime';

export type WorkerRuntimePolicyConfiguration = {
  readonly configKey: typeof WORKER_RUNTIME_POLICY_DATASET_KEY;
  readonly description: string;
  readonly valueSchemaVersion: number;
  readonly value: Record<string, unknown>;
};

export type WorkerRuntimePolicyDataset = {
  readonly seedId: string;
  readonly tier: string;
  readonly decisionId: string;
  readonly configurations: readonly WorkerRuntimePolicyConfiguration[];
};

/** Reads and validates the dataset. */
export function loadWorkerRuntimePolicyDataset(
  packageJsonPath: string,
): WorkerRuntimePolicyDataset {
  const file = join(seedFolderFrom(packageJsonPath), WORKER_RUNTIME_POLICY_DATASET_FILE);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${WORKER_RUNTIME_POLICY_DATASET_FILE} is not an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const configurations = record['configurations'];
  if (!Array.isArray(configurations) || configurations.length !== 1) {
    throw new Error(
      `${WORKER_RUNTIME_POLICY_DATASET_FILE} must declare exactly one configuration.`,
    );
  }

  const configuration = configurations[0] as Partial<WorkerRuntimePolicyConfiguration>;
  if (configuration.configKey !== WORKER_RUNTIME_POLICY_DATASET_KEY) {
    throw new Error(
      `${WORKER_RUNTIME_POLICY_DATASET_FILE} carries an unknown config key ` +
        `"${String(configuration.configKey)}".`,
    );
  }
  if (typeof configuration.valueSchemaVersion !== 'number') {
    throw new Error(`${WORKER_RUNTIME_POLICY_DATASET_FILE} has no value schema version.`);
  }
  if (typeof configuration.value !== 'object' || configuration.value === null) {
    throw new Error(`${WORKER_RUNTIME_POLICY_DATASET_FILE} has no value object.`);
  }
  if (typeof configuration.description !== 'string' || configuration.description === '') {
    throw new Error(`${WORKER_RUNTIME_POLICY_DATASET_FILE} has no description.`);
  }

  return parsed as WorkerRuntimePolicyDataset;
}
