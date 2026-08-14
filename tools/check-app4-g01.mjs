#!/usr/bin/env node
/**
 * `APP4-G01` — secure-access, verification and notification authority (IMP-D049).
 *
 * An authority gate does not fail by having its prose deleted. It fails by the
 * *next* checkpoint finding a shortcut: sharing one value between a hashing
 * pepper and the AEAD key, letting the encrypted `originNotificationIntentId`
 * stand in for the current intent (which works perfectly until the first
 * replay), giving the six secure-link rejection causes distinguishable answers,
 * resetting a `DEAD_LETTER` row instead of appending a new one, or installing a
 * crypto package because `node:crypto` felt low-level.
 *
 * So this gate asserts the **negations** as hard as the values, and recomputes
 * every fact from the file that owns it rather than from the completion report:
 * policy values from the seed dataset **and** the ADR fact table so a drift
 * between them is visible, the configured names from `.env.example`, and the
 * queue and linkage rulings from real repository source.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-g01.mjs [rootDir]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  APP4_ROUTES,
  CANONICAL_FILES,
  DECISION_ID,
  ENVELOPE_KEY_NAME,
  EXPECTED_FACTS,
  FORBIDDEN_PACKAGES,
  HASH_PEPPER_NAMES,
  MIGRATION_COUNT,
  POLICY,
  REPO_ROOT,
  ROOT_SCRIPT_COUNT,
  RULINGS,
  factTable,
  findLiteralSecrets,
  policyFactValue,
  read,
} from './check-app4-g01-authority.mjs';

export {
  CANONICAL_FILES,
  DECISION_ID,
  EXPECTED_FACTS,
  POLICY,
  REPO_ROOT,
  factTable,
  findLiteralSecrets,
};

/** 1 — the decision exists exactly once, is LOCKED and records every ruling. */
function checkDecision(register, fail) {
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length !== 1) {
    fail(
      `${CANONICAL_FILES.register}: ${DECISION_ID} appears ${String(rows.length)} time(s), expected 1`,
    );
    return;
  }
  const [row] = rows;
  for (const ruling of RULINGS) {
    if (!row.includes(`(${ruling})`)) {
      fail(`${CANONICAL_FILES.register}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) {
    fail(`${CANONICAL_FILES.register}: ${DECISION_ID} is not LOCKED`);
  }
  for (const [needle, complaint] of [
    [ENVELOPE_KEY_NAME, 'the envelope key name'],
    ['AES-256-GCM', 'the AEAD construction'],
    ['NOTIFICATION_INTENT', 'the outbox aggregate kind'],
    ['SECURE_LINK_UNAVAILABLE', 'the non-enumerating public code'],
    ['REISSUE_REQUIRED', 'the replay refusal code'],
    ['NO_APP4_MIGRATION', 'the migration verdict'],
  ]) {
    if (!row.includes(needle)) fail(`${DECISION_ID} does not record ${complaint}`);
  }
}

/** 2–13 and 20–26 — the ADR fact table reconciles exactly, policy included. */
function checkFacts(rootDir, fail) {
  const facts = factTable(read(rootDir, 'adr') ?? '');
  if (facts.size === 0) {
    fail(`${CANONICAL_FILES.adr}: §14.1 fact table is missing or unparseable`);
    return;
  }
  const expect = (key, value, label) => {
    const measured = facts.get(key);
    if (measured === undefined) fail(`${CANONICAL_FILES.adr} §14.1: ${label} "${key}" is missing`);
    else if (measured !== value) {
      fail(`${CANONICAL_FILES.adr} §14.1: ${label} "${key}" is "${measured}", expected "${value}"`);
    }
  };
  for (const [key, value] of Object.entries(EXPECTED_FACTS)) expect(key, value, 'fact');
  for (const [configKey, fields] of Object.entries(POLICY)) {
    for (const [field, value] of Object.entries(fields)) {
      expect(`${configKey}.${field}`, policyFactValue(value), 'policy');
    }
  }
}

/** 1, 2, 8, 9, 10 — the seed dataset holds every key at the locked value. */
function checkSeed(rootDir, fail) {
  const raw = read(rootDir, 'seed');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.seed} is missing`);
    return;
  }
  let seed;
  try {
    seed = JSON.parse(raw);
  } catch {
    fail(`${CANONICAL_FILES.seed} is not valid JSON`);
    return;
  }
  if (seed.tier !== 'SYSTEM_REFERENCE') {
    fail(`${CANONICAL_FILES.seed}: tier is "${String(seed.tier)}", expected SYSTEM_REFERENCE`);
  }
  if (seed.containsSecrets !== false) {
    fail(`${CANONICAL_FILES.seed}: containsSecrets must be declared false`);
  }
  if (seed.decisionId !== DECISION_ID) {
    fail(`${CANONICAL_FILES.seed}: decisionId is not ${DECISION_ID}`);
  }

  const entries = Array.isArray(seed.configurations) ? seed.configurations : [];
  const byKey = new Map(entries.map((entry) => [entry.configKey, entry]));
  if (byKey.size !== entries.length) {
    fail(`${CANONICAL_FILES.seed}: a config key is declared more than once`);
  }
  for (const [configKey, fields] of Object.entries(POLICY)) {
    const entry = byKey.get(configKey);
    if (entry === undefined) {
      fail(`${CANONICAL_FILES.seed}: policy key "${configKey}" is missing`);
      continue;
    }
    if (entry.valueSchemaVersion !== 1) {
      fail(`${CANONICAL_FILES.seed}: "${configKey}" is not at value schema version 1`);
    }
    for (const [field, value] of Object.entries(fields)) {
      const measured = entry.value?.[field];
      if (JSON.stringify(measured) !== JSON.stringify(value)) {
        fail(
          `${CANONICAL_FILES.seed}: "${configKey}.${field}" is ${JSON.stringify(measured)}, ` +
            `expected ${JSON.stringify(value)}`,
        );
      }
      // A unit is what stops the first consumer reading 600 as minutes.
      if (entry.units?.[field] === undefined) {
        fail(`${CANONICAL_FILES.seed}: "${configKey}.${field}" declares no unit`);
      }
    }
  }

  // 10 — the backoff schedule must stay one shorter than the attempt budget.
  const delivery = byKey.get('notification.delivery')?.value;
  if (
    delivery !== undefined &&
    Array.isArray(delivery.retryDelaysSeconds) &&
    delivery.retryDelaysSeconds.length !== delivery.maxAttempts - 1
  ) {
    fail(`${CANONICAL_FILES.seed}: retryDelaysSeconds must hold maxAttempts - 1 entries`);
  }
}

/** 13, 14, 15 — three configuration names, declared, empty and distinct. */
function checkEnvExample(rootDir, fail) {
  const env = read(rootDir, 'envExample');
  if (env === undefined) {
    fail(`${CANONICAL_FILES.envExample} is missing`);
    return;
  }
  const lines = env.split('\n');
  for (const name of [ENVELOPE_KEY_NAME, ...HASH_PEPPER_NAMES]) {
    const declarations = lines.filter((line) => line.trimStart().startsWith(`${name}=`));
    if (declarations.length !== 1) {
      fail(
        `${CANONICAL_FILES.envExample}: ${name} is declared ${String(declarations.length)} time(s), expected 1`,
      );
      continue;
    }
    if (declarations[0].trim() !== `${name}=`) {
      fail(`${CANONICAL_FILES.envExample}: ${name} must be declared with no value`);
    }
  }
  // 15 — the separation is the ruling: no name may alias another.
  if (new RegExp(`=\\$\\{?${ENVELOPE_KEY_NAME}`).test(env)) {
    fail(`${CANONICAL_FILES.envExample}: a pepper must not alias the envelope key`);
  }
  for (const pepper of HASH_PEPPER_NAMES) {
    if (new RegExp(`${ENVELOPE_KEY_NAME}=\\$\\{?${pepper}`).test(env)) {
      fail(`${CANONICAL_FILES.envExample}: the envelope key must not alias ${pepper}`);
    }
  }
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
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.push(full);
    }
  };
  walk(join(rootDir, relative));
  return found;
}

/** 16, 17 — nothing was created and no provider or crypto library was chosen. */
function checkNothingInstalled(rootDir, fail) {
  if (existsSync(join(rootDir, 'packages/notification-delivery'))) {
    fail('packages/notification-delivery exists; APP4-G01 names it, APP4-B01 creates it');
  }
  for (const key of ['rootManifest', 'apiManifest', 'workerManifest']) {
    const manifest = read(rootDir, key);
    if (manifest === undefined) continue;
    for (const name of FORBIDDEN_PACKAGES) {
      if (manifest.includes(`"${name}"`)) {
        fail(`${CANONICAL_FILES[key]} gained "${name}"; APP4-G01 selects no provider or crypto`);
      }
    }
  }
}

/** 18, 19, 20 — the queue and linkage rulings, measured against real source. */
function checkQueueAndLinkage(rootDir, fail) {
  const store = read(rootDir, 'outboxStore') ?? '';
  if (!store.includes('OUTBOX_AGGREGATE_KINDS')) {
    fail(`${CANONICAL_FILES.outboxStore}: the aggregate-kind write guard is gone`);
  }
  if (store.includes("'NOTIFICATION_INTENT'")) {
    fail(
      `${CANONICAL_FILES.outboxStore} already allows NOTIFICATION_INTENT; that extension is APP4-B01's`,
    );
  }

  // 19 — `NotificationIntentRepository.claimBatch` has no production caller.
  const declaring = [
    'apps/api/src/modules/notification/domain/repositories/notification-intent.repository.ts',
    'apps/api/src/modules/notification/infrastructure/persistence/drizzle-notification-intent.repository.ts',
  ];
  for (const file of sourceFiles(rootDir, 'apps/api/src')) {
    const shown = file
      .slice(rootDir.length + 1)
      .split('\\')
      .join('/');
    if (/\.(spec|bench)\.ts$/.test(shown) || shown.includes('/tests/')) continue;
    if (declaring.includes(shown)) continue;
    if (readFileSync(file, 'utf8').includes('claimBatch')) {
      fail(`${shown} calls claimBatch; the APP2 outbox runtime is the only queue`);
    }
  }
}

/** Nothing was implemented behind the gate, and nothing global moved. */
function checkNoImplementation(rootDir, fail) {
  for (const relative of [
    'apps/api/src/modules/customer/application',
    'apps/api/src/modules/notification/application',
    'apps/worker/src/jobs/notification-delivery',
  ]) {
    if (existsSync(join(rootDir, relative))) {
      fail(`${relative} exists; APP4-G01 implements no runtime feature`);
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`the repository has ${String(count)} migrations; APP4-G01 adds none`);
  }
  const manifest = read(rootDir, 'rootManifest');
  if (manifest !== undefined) {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {}).length;
    if (scripts !== ROOT_SCRIPT_COUNT) {
      fail(
        `the root package.json declares ${String(scripts)} scripts; GOV-Q01 fixed it at ${String(ROOT_SCRIPT_COUNT)}`,
      );
    }
  }
}

/** 27 — no production key, token or code literal in an APP4 authority document. */
function checkNoLiterals(rootDir, fail) {
  for (const key of ['adr', 'seed']) {
    const text = read(rootDir, key);
    if (text === undefined) continue;
    for (const finding of findLiteralSecrets(text)) {
      fail(`${CANONICAL_FILES[key]}:${String(finding.line)}: ${finding.kind}`);
    }
  }
}

/** 3 and the governance record. */
function checkGovernance(rootDir, fail) {
  for (const [key, needles, complaint] of [
    ['roadmap', [DECISION_ID, 'APP4-G01'], 'the checkpoint and its decision'],
    ['audit', ['APP4-D01', 'ADR-APP4-001'], 'the delivered gate and the next checkpoint'],
    ['commandIndex', ['CMD-CHECK-APP4-G01', 'CMD-TEST-APP4-G01'], 'both scoped commands'],
  ]) {
    const text = read(rootDir, key) ?? '';
    for (const needle of needles) {
      if (!text.includes(needle)) {
        fail(`${CANONICAL_FILES[key]} does not record ${complaint} (${needle})`);
      }
    }
  }
  // The routes must be stated in the ADR body, not only inside the fact table.
  const adr = read(rootDir, 'adr') ?? '';
  for (const route of APP4_ROUTES) {
    if (!adr.includes(route)) fail(`${CANONICAL_FILES.adr} does not state the route ${route}`);
  }
}

export function checkApp4G01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkDecision(read(rootDir, 'register') ?? '', fail);
  checkFacts(rootDir, fail);
  checkSeed(rootDir, fail);
  checkEnvExample(rootDir, fail);
  checkNothingInstalled(rootDir, fail);
  checkQueueAndLinkage(rootDir, fail);
  checkNoImplementation(rootDir, fail);
  checkNoLiterals(rootDir, fail);
  checkGovernance(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp4G01(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app4-g01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app4-g01 — ${DECISION_ID} locks APP4 secure-access authority: four policy keys ` +
      'agreeing between the seed dataset and the ADR fact table, six-digit unbiased CSPRNG codes ' +
      'and 256-bit base64url tokens persisted only as peppered HMAC digests, two hash peppers ' +
      `structurally separate from the fail-closed 32-byte ${ENVELOPE_KEY_NAME}, AES-256-GCM ` +
      'envelope version 1 from node:crypto with a fresh 96-bit nonce, the current intent read ' +
      'from the NOTIFICATION_INTENT aggregate linkage while the encrypted intent reference stays ' +
      'lineage-only, retry/replay/resend kept as three separate contracts with a deterministic ' +
      'SHA-256 replay key, one 404/SECURE_LINK_UNAVAILABLE answer to six causes and a ' +
      '409/REISSUE_REQUIRED refusal, and fragment-only secure-link transport on /truy-cap — ' +
      'while the repository gains no provider, no crypto dependency, no shared package yet, no ' +
      'runtime module, no migration and no root script',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
