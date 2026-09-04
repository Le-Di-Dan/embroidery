/**
 * The worker runtime policy dataset reader against the **committed** dataset
 * (`APP12-H03-C1` §4).
 *
 * The first test reads the real file rather than a fixture, because the property
 * that matters is that the shipped JSON is the one the deployment publishes — a
 * fixture would prove the parser and nothing about what a cold cluster gets.
 *
 * No test here asserts a lease duration, a timeout or an attempt budget. Those
 * are the dataset's to state, and the *validator* is the worker's
 * (`parseWorkerRuntimePolicy`), which `worker-runtime-policy.spec.ts` runs
 * against these very values. Restating a number here would recreate, in a test
 * file, the second source of truth the dataset exists to prevent.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WORKER_RUNTIME_POLICY_DATASET_FILE,
  WORKER_RUNTIME_POLICY_DATASET_KEY,
  loadWorkerRuntimePolicyDataset,
} from './worker-runtime-policy-dataset';

const COMMITTED_PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

/** Writes a dataset into a throwaway package layout and returns its manifest path. */
function datasetIn(content: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'worker-runtime-policy-'));
  mkdirSync(join(root, 'seed'));
  writeFileSync(join(root, 'seed', WORKER_RUNTIME_POLICY_DATASET_FILE), JSON.stringify(content));
  const manifest = join(root, 'package.json');
  writeFileSync(manifest, '{}');
  return manifest;
}

/** A structurally valid entry. The `value` is deliberately meaningless. */
function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    configKey: WORKER_RUNTIME_POLICY_DATASET_KEY,
    description: 'a description',
    valueSchemaVersion: 1,
    value: { placeholder: true },
    ...overrides,
  };
}

describe('worker runtime policy dataset reader', () => {
  it('parses the committed dataset and declares exactly the one key', () => {
    const dataset = loadWorkerRuntimePolicyDataset(COMMITTED_PACKAGE_JSON);

    expect(dataset.configurations.map((configuration) => configuration.configKey)).toEqual([
      WORKER_RUNTIME_POLICY_DATASET_KEY,
    ]);
    expect(WORKER_RUNTIME_POLICY_DATASET_KEY).toBe('worker.runtime');
  });

  it('carries the marker that the file holds no secret', () => {
    // The values are lease durations and attempt budgets; the dataset says so,
    // and the repository's secret-disclosure gate reads that declaration.
    const raw: unknown = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'seed', WORKER_RUNTIME_POLICY_DATASET_FILE), 'utf8'),
    );

    expect((raw as Record<string, unknown>)['containsSecrets']).toBe(false);
  });

  it.each([
    ['a non-object file', 42],
    ['a file with no configurations array', { configurations: 'worker.runtime' }],
    ['an empty configurations array', { configurations: [] }],
    ['more than one configuration', { configurations: [entry(), entry()] }],
  ])('refuses %s', (_label, content) => {
    expect(() => loadWorkerRuntimePolicyDataset(datasetIn(content))).toThrow(
      WORKER_RUNTIME_POLICY_DATASET_FILE,
    );
  });

  it.each([
    ['an unknown config key', entry({ configKey: 'worker.runtime.v2' })],
    ['no schema version', entry({ valueSchemaVersion: undefined })],
    ['no value object', entry({ value: undefined })],
    ['a null value', entry({ value: null })],
    ['an empty description', entry({ description: '' })],
  ])('refuses a configuration with %s', (_label, configuration) => {
    expect(() =>
      loadWorkerRuntimePolicyDataset(datasetIn({ configurations: [configuration] })),
    ).toThrow(WORKER_RUNTIME_POLICY_DATASET_FILE);
  });
});
