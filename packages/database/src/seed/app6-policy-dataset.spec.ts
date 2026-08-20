/**
 * The `APP6-G01` dataset reader against the **committed** dataset (`APP6-B01`).
 *
 * The first test reads the real file rather than a fixture, because the property
 * that matters is that the shipped JSON is the one the runtime expects — a
 * fixture would prove the parser and nothing about what is deployed.
 *
 * No test asserts a validity window, a deposit share or an agreement type. Those
 * are the dataset's to state; restating one here would recreate, in a test file,
 * exactly the second source of truth the dataset exists to prevent.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  APP6_POLICY_DATASET_FILE,
  APP6_POLICY_KEYS,
  loadApp6PolicyDataset,
} from './app6-policy-dataset';

const COMMITTED_PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

/** Writes a dataset into a throwaway package layout and returns its manifest path. */
function datasetIn(content: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'app6-policy-'));
  mkdirSync(join(root, 'seed'));
  writeFileSync(join(root, 'seed', APP6_POLICY_DATASET_FILE), JSON.stringify(content));
  const manifest = join(root, 'package.json');
  writeFileSync(manifest, '{}');
  return manifest;
}

/** A structurally valid entry. The `value` is deliberately meaningless. */
function entry(configKey: string): Record<string, unknown> {
  return {
    configKey,
    description: `${configKey} description`,
    valueSchemaVersion: 1,
    value: { placeholder: true },
  };
}

describe('APP6 policy dataset reader', () => {
  it('parses the committed dataset and declares exactly the three APP6 keys', () => {
    const dataset = loadApp6PolicyDataset(COMMITTED_PACKAGE_JSON);

    expect(dataset.configurations.map((configuration) => configuration.configKey)).toEqual([
      ...APP6_POLICY_KEYS,
    ]);
    expect(APP6_POLICY_KEYS).toHaveLength(3);
  });

  it('gives every configuration a description, a schema version and an object value', () => {
    const dataset = loadApp6PolicyDataset(COMMITTED_PACKAGE_JSON);

    for (const configuration of dataset.configurations) {
      expect(configuration.description).not.toBe('');
      expect(typeof configuration.valueSchemaVersion).toBe('number');
      expect(typeof configuration.value).toBe('object');
      expect(Object.keys(configuration.value).length).toBeGreaterThan(0);
    }
  });

  it('restates no value: the reader module carries no policy number', () => {
    // The dataset is the value source. A constant here would let the runtime
    // disagree with the published policy without either side changing.
    const source = readFileSync(join(__dirname, 'app6-policy-dataset.ts'), 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(withoutComments).not.toMatch(/\bdepositPercent\b/);
    expect(withoutComments).not.toMatch(/\bvalidityDays\b/);
    expect(withoutComments).not.toMatch(/\brequiredAgreementTypes\b/);
  });

  it('rejects a dataset that is missing one of the three keys', () => {
    const manifest = datasetIn({ configurations: [entry(APP6_POLICY_KEYS[0])] });

    expect(() => loadApp6PolicyDataset(manifest)).toThrow(/is missing/);
  });

  it('rejects a key the reader does not know', () => {
    const manifest = datasetIn({
      configurations: [...APP6_POLICY_KEYS.map(entry), entry('quotation.something_else')],
    });

    expect(() => loadApp6PolicyDataset(manifest)).toThrow(/unknown config key/);
  });

  it('rejects a key declared twice', () => {
    const manifest = datasetIn({
      configurations: [...APP6_POLICY_KEYS.map(entry), entry(APP6_POLICY_KEYS[1])],
    });

    expect(() => loadApp6PolicyDataset(manifest)).toThrow(/more than once/);
  });

  it('rejects an entry with no value object', () => {
    const broken = { ...entry(APP6_POLICY_KEYS[2]), value: null };
    const manifest = datasetIn({
      configurations: [entry(APP6_POLICY_KEYS[0]), entry(APP6_POLICY_KEYS[1]), broken],
    });

    expect(() => loadApp6PolicyDataset(manifest)).toThrow(/has no value object/);
  });

  it('rejects a file that is not a dataset at all', () => {
    expect(() => loadApp6PolicyDataset(datasetIn({}))).toThrow(/no configurations array/);
  });
});
