/**
 * `APP4-B01-C1` — the APP4 policy publication seam.
 *
 * A separate half because it is a separate responsibility: the B01 gate proves
 * the envelope and the intake, this one proves the G01 dataset actually reaches
 * `policy_configurations`. It exists because B01 first reported the seam open and
 * routed it away, and "routed to a later checkpoint" is exactly the outcome a
 * gate should be able to refuse.
 *
 * The failure it guards against is duplication: copying the four policy values
 * into a TypeScript constant, a second JSON file or a worker module is easier
 * than reading the dataset, and it silently creates a second source of truth
 * that drifts.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATASET_FILE = 'packages/database/seed/app4-policy-configuration.seed.json';
export const DATASET_READER = 'packages/database/src/seed/app4-policy-dataset.ts';
export const PUBLISHER = 'apps/api/src/platform/policy/publish-app4-policy.use-case.ts';
export const STAFF_BOOTSTRAP = 'apps/api/src/cli/staff-bootstrap.ts';

/** The four `APP4-G01` keys. Names only — never their values. */
export const APP4_POLICY_KEYS = Object.freeze([
  'verification.challenge',
  'secure_grant',
  'notification.delivery',
  'secure_link.resolve',
]);

/** Value field names that must appear in the dataset and nowhere in source. */
const POLICY_VALUE_FIELDS = Object.freeze([
  'ttlSeconds',
  'codeAlphabet',
  'maxIssuesPerTargetPerWindow',
  'standardTtlSeconds',
  'stepUpWindowSeconds',
  'retryDelaysSeconds',
  'maxRequestsPerIpPerMinute',
]);

function read(rootDir, relative) {
  const path = join(rootDir, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function sourceFiles(rootDir, relative) {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.push(full);
    }
  };
  walk(join(rootDir, relative));
  return found;
}

const shown = (rootDir, file) =>
  file
    .slice(rootDir.length + 1)
    .split('\\')
    .join('/');

/**
 * Asserts the publication seam is closed.
 *
 * `stripComments` is injected rather than re-implemented so both halves of the
 * gate read code the same way — the B01 checker learned that lesson by flagging
 * seventeen of its own doc comments.
 */
export function checkPolicyPublication(rootDir, stripComments, fail) {
  // 1 — the dataset exists exactly once, with all four keys.
  const datasetRaw = read(rootDir, DATASET_FILE);
  if (datasetRaw === undefined) {
    fail(`${DATASET_FILE} is missing; it is the single APP4 policy value source`);
    return;
  }
  let dataset;
  try {
    dataset = JSON.parse(datasetRaw);
  } catch {
    fail(`${DATASET_FILE} is not valid JSON`);
    return;
  }
  const declared = (dataset.configurations ?? []).map((entry) => entry.configKey);
  for (const key of APP4_POLICY_KEYS) {
    if (!declared.includes(key)) fail(`${DATASET_FILE} is missing the "${key}" configuration`);
  }
  if (declared.length !== APP4_POLICY_KEYS.length) {
    fail(`${DATASET_FILE} declares ${String(declared.length)} configurations, expected 4`);
  }
  for (const entry of dataset.configurations ?? []) {
    if (entry.valueSchemaVersion !== 1) {
      fail(`${DATASET_FILE}: "${String(entry.configKey)}" is not at value schema version 1`);
    }
  }

  // A second dataset file would be a second source of truth.
  const seedDir = join(rootDir, 'packages/database/seed');
  const seedFiles = existsSync(seedDir) ? readdirSync(seedDir) : [];
  const app4Datasets = seedFiles.filter((name) => name.includes('app4-policy'));
  if (app4Datasets.length !== 1) {
    fail(`packages/database/seed holds ${String(app4Datasets.length)} APP4 policy datasets`);
  }

  // 2, 3, 4 — one publisher, using the repository, covering the dataset.
  const publisherRaw = read(rootDir, PUBLISHER);
  if (publisherRaw === undefined) {
    fail(`${PUBLISHER} is missing; APP4-B01-C1 owns publication on the API side`);
    return;
  }
  const publisher = stripComments(publisherRaw);
  for (const [pattern, complaint] of [
    [/PolicyConfigurationRepository/, 'does not use PolicyConfigurationRepository'],
    [/\.ensureKey\(/, 'never calls ensureKey'],
    [/\.currentValue\(/, 'never reads currentValue, so it cannot be idempotent'],
    [/\.publishVersion\(/, 'never calls publishVersion'],
    [/loadApp4PolicyDataset\(/, 'does not read the G01 dataset'],
  ]) {
    if (!pattern.test(publisher)) fail(`${PUBLISHER} ${complaint}`);
  }
  if (/execute\(|sql`/.test(publisher)) {
    fail(`${PUBLISHER} issues raw SQL; publication goes through the repository`);
  }

  // 5 — no duplicated policy values anywhere in source.
  const roots = [
    'apps/api/src',
    'apps/worker/src',
    'packages/database/src',
    'packages/persistence/src',
  ];
  for (const root of roots) {
    for (const file of sourceFiles(rootDir, root)) {
      const path = shown(rootDir, file);
      if (/\.(spec|test|bench)\.ts$/.test(path) || path.includes('/tests/')) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const field of POLICY_VALUE_FIELDS) {
        if (new RegExp(`${field}\\s*[:=]`).test(source)) {
          fail(`${path} restates the policy value "${field}"; the dataset is the only source`);
        }
      }
    }
  }

  // 6, 7 — the publisher takes the bootstrap Admin id, and bootstrap calls it.
  if (!/publish\(\s*adminId/.test(publisher)) {
    fail(`${PUBLISHER} does not take an Admin id`);
  }
  for (const pattern of [/findFirst|first\(\)|limit\(1\)/, /ADMIN_ID|POLICY_ADMIN/]) {
    if (pattern.test(publisher)) {
      fail(`${PUBLISHER} resolves an Admin of its own; it must reuse the bootstrap Admin`);
    }
  }
  const bootstrapRaw = read(rootDir, STAFF_BOOTSTRAP);
  const bootstrap = stripComments(bootstrapRaw ?? '');
  if (
    !/PublishApp4PolicyUseCase/.test(bootstrap) ||
    !/\.publish\(\s*result\.adminId/.test(bootstrap)
  ) {
    fail(`${STAFF_BOOTSTRAP} does not publish APP4 policy with the resolved Admin id`);
  }

  // 8 — no worker-side publication in production code.
  //
  // Worker *test contexts* legitimately seed `worker.runtime` for their own
  // suites (they predate APP4 and have nothing to do with this seam), so the
  // rule is scoped to production source. Flagging a fixture here would be the
  // same false-positive class the B01 half already learned to avoid.
  for (const file of sourceFiles(rootDir, 'apps/worker/src')) {
    const path = shown(rootDir, file);
    if (/\.(spec|test|bench)\.ts$/.test(path) || path.includes('/tests/')) continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    if (/\.publishVersion\(|loadApp4PolicyDataset\(/.test(source)) {
      fail(`${path} publishes policy; publication is the API bootstrap's`);
    }
  }

  // 9, 10 — no seed framework, no migration.
  const rootManifest = read(rootDir, 'package.json');
  if (rootManifest !== undefined) {
    const scripts = JSON.parse(rootManifest).scripts ?? {};
    for (const name of Object.keys(scripts)) {
      if (/seed/i.test(name))
        fail(`root package.json gained a "${name}" script; no seed framework`);
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== 34) {
    fail(`the repository has ${String(count)} migrations; APP4-B01-C1 adds none`);
  }

  // 11 — the reader restates nothing.
  const readerRaw = read(rootDir, DATASET_READER);
  if (readerRaw === undefined) {
    fail(`${DATASET_READER} is missing`);
  } else if (/\b(600|604800|900|300|60|30)\b/.test(stripComments(readerRaw))) {
    fail(`${DATASET_READER} carries a policy value; it must only read the dataset`);
  }
}
