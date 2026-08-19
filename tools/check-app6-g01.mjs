#!/usr/bin/env node
/**
 * `APP6-G01` — design review, approval and quotation authority gate (`IMP-D051`).
 *
 * An authority checkpoint does not fail by having its prose deleted. It fails by
 * the *next* checkpoint finding a shortcut that looks reasonable in review:
 * giving a customer-owned product a borrowed `product_id` so four `NOT NULL`
 * columns stop complaining, reading a COP's nullable item dimensions as the
 * embroidery bounds, adding `QUOTED` to an Admin transition dropdown, letting a
 * quotation stay acceptable past `valid_until` because the sweep has not run, or
 * approving against an agreement set the customer was never shown.
 *
 * So this gate asserts the **negations** as hard as the values, and recomputes
 * every fact from the file that owns it rather than from the completion report:
 * policy values from the seed dataset **and** the ADR fact table, so a drift
 * between them is visible from either side; nullability from the schema source;
 * and the artifact counts from the committed artifacts themselves.
 *
 * Read-only. No network, no database, no generation. Cross-platform pure Node.
 *
 * Usage: node tools/check-app6-g01.mjs [rootDir]
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import {
  CANONICAL_FILES,
  DECISION_ID,
  FROZEN,
  POLICY_KEYS,
  REPO_ROOT,
  RULINGS,
  SCHEMA_CONTRACT,
  SYSTEM_TARGETS,
  TRANSITIONS,
  dataset,
  declaresNotNull,
  factTable,
  factValue,
  figmaApp06References,
  migrationCount,
  openapiCounts,
  read,
  rootScriptCount,
  valueEntries,
} from './check-app6-g01-authority.mjs';

export { CANONICAL_FILES, DECISION_ID, REPO_ROOT };

/** 1 — the decision exists exactly once, is LOCKED and records every ruling. */
function checkDecision(rootDir, fail) {
  const register = read(rootDir, 'register');
  if (register === undefined) {
    fail(`${CANONICAL_FILES.register} is missing`);
    return;
  }
  const rows = register.split('\n').filter((line) => line.startsWith(`| ${DECISION_ID} |`));
  if (rows.length !== 1) {
    fail(`${DECISION_ID} appears ${String(rows.length)} time(s) in the register, expected 1`);
    return;
  }
  const [row] = rows;
  for (const ruling of RULINGS) {
    if (!row.includes(`(${ruling})`)) fail(`${DECISION_ID} does not record ruling ${ruling}`);
  }
  if (!row.trimEnd().endsWith('| LOCKED |')) fail(`${DECISION_ID} is not LOCKED`);
  for (const [needle, complaint] of [
    [SCHEMA_CONTRACT, 'the DB01 schema contract'],
    ['PAYMENT_POLICY', 'the required agreement types'],
    ['RETURN_POLICY', 'the required agreement types'],
    ['REQUEST_ACCESS', 'the reused grant scope'],
    ['SECURE_LINK_UNAVAILABLE', 'the non-enumerating public code'],
    ['GRD-005', 'the digitizing guard'],
    ['INV-13', 'the never-a-SKU invariant'],
  ]) {
    if (!row.includes(needle)) fail(`${DECISION_ID} does not record ${complaint} (${needle})`);
  }
}

/** 2 — the ADR is accepted, owns the decision and publishes the contract. */
function checkAdr(adr, fail) {
  if (adr === undefined) {
    fail(`${CANONICAL_FILES.adr} is missing`);
    return;
  }
  if (!/^- Status: Accepted$/m.test(adr)) fail(`${CANONICAL_FILES.adr} is not Accepted`);
  if (!adr.includes(DECISION_ID)) fail(`${CANONICAL_FILES.adr} does not declare ${DECISION_ID}`);
  if (!adr.includes(`DB01_SCHEMA_CONTRACT = ${SCHEMA_CONTRACT}`)) {
    fail(`${CANONICAL_FILES.adr} does not publish DB01_SCHEMA_CONTRACT = ${SCHEMA_CONTRACT}`);
  }
}

/** 3 — the ADR fact table and the seed dataset reconcile exactly, both ways. */
function checkFacts(rootDir, adr, fail) {
  if (adr === undefined) return;
  const facts = factTable(adr);
  if (facts.size === 0) {
    fail(`${CANONICAL_FILES.adr} publishes no fact table`);
    return;
  }
  let data;
  try {
    data = dataset(rootDir);
  } catch (error) {
    fail(String(error.message));
    return;
  }
  const seen = new Set();
  for (const configuration of data.configurations ?? []) {
    for (const [key, value] of valueEntries(configuration)) {
      seen.add(key);
      const expected = factValue(value);
      const actual = facts.get(key);
      if (actual === undefined) {
        fail(`${CANONICAL_FILES.adr}: fact table does not carry "${key}"`);
      } else if (actual !== expected) {
        fail(`"${key}" is \`${expected}\` in the dataset but \`${actual}\` in the ADR fact table`);
      }
    }
  }
  for (const key of facts.keys()) {
    if (!seen.has(key)) fail(`${CANONICAL_FILES.adr}: fact "${key}" has no dataset value`);
  }
}

/** 4 — the dataset is the APP6-G01 dataset, and carries exactly its three keys. */
function checkDataset(rootDir, fail) {
  let data;
  try {
    data = dataset(rootDir);
  } catch (error) {
    fail(String(error.message));
    return;
  }
  if (data.checkpoint !== 'APP6-G01') fail(`dataset checkpoint is "${String(data.checkpoint)}"`);
  if (data.decisionId !== DECISION_ID) fail(`dataset decisionId is "${String(data.decisionId)}"`);
  if (data.containsSecrets !== false) fail('dataset does not declare containsSecrets: false');

  const keys = (data.configurations ?? []).map((configuration) => configuration.configKey);
  for (const key of POLICY_KEYS) {
    if (!keys.includes(key)) fail(`dataset is missing "${key}"`);
  }
  for (const key of keys) {
    if (!POLICY_KEYS.includes(key)) fail(`dataset carries an unknown config key "${String(key)}"`);
  }
  if (new Set(keys).size !== keys.length) fail('dataset declares a config key more than once');

  for (const configuration of data.configurations ?? []) {
    const key = String(configuration.configKey);
    if (typeof configuration.description !== 'string' || configuration.description === '') {
      fail(`dataset: "${key}" has no description`);
    }
    if (typeof configuration.valueSchemaVersion !== 'number') {
      fail(`dataset: "${key}" has no value schema version`);
    }
    if (typeof configuration.value !== 'object' || configuration.value === null) {
      fail(`dataset: "${key}" has no value object`);
    }
    for (const [name] of valueEntries(configuration)) {
      if (/password|passwd|secret|token|credential|private/i.test(name)) {
        fail(`dataset: "${key}.${name}" names secret-bearing material`);
      }
    }
  }
}

/** 5 — every APP6 transition is mapped, and the four projections stay projections. */
function checkTransitions(authority, fail) {
  if (authority === undefined) {
    fail(`${CANONICAL_FILES.authority} is missing`);
    return;
  }
  for (const [transition, actor] of TRANSITIONS) {
    const row = authority
      .split('\n')
      .find((line) => line.startsWith('|') && line.includes(`\`${transition}\``));
    if (row === undefined) {
      fail(`${CANONICAL_FILES.authority} does not map ${transition}`);
      continue;
    }
    if (!new RegExp(`\\*\\*${actor}\\*\\*`).test(row)) {
      fail(`${transition} is not recorded as **${actor}**`);
    }
    const commandable = /\|\s*\*\*Yes[^|]*\|/.test(row);
    if (actor === 'system' && commandable) {
      fail(`${transition} is a system projection but is recorded as directly commandable`);
    }
    if (actor === 'admin' && !commandable) {
      fail(`${transition} is the admin command but is not recorded as directly commandable`);
    }
  }
  for (const needle of [
    'no follow-up "sync state" API',
    'No generic "set request state" use case',
  ]) {
    if (!authority.toLowerCase().includes(needle.toLowerCase())) {
      fail(`${CANONICAL_FILES.authority} does not forbid: ${needle}`);
    }
  }
  for (const target of SYSTEM_TARGETS) {
    if (!authority.includes(target)) fail(`${CANONICAL_FILES.authority} never names ${target}`);
  }
}

/** 6 — the anti-fabrication prohibition is stated where implementers will read it. */
function checkProhibitions(adr, authority, fail) {
  const rules = [
    [adr, CANONICAL_FILES.adr, 'never fabricated', 'the COP branch may not fabricate placement'],
    [adr, CANONICAL_FILES.adr, 'INV-13', 'the never-a-SKU invariant'],
    [adr, CANONICAL_FILES.adr, 'copied from', 'COP item dimensions may not become bounds'],
    [authority, CANONICAL_FILES.authority, 'REQUEST_ACCESS', 'the reused grant scope'],
    [authority, CANONICAL_FILES.authority, 'SECURE_LINK_UNAVAILABLE', 'the uniform failure code'],
    [authority, CANONICAL_FILES.authority, 'now >= valid_until', 'effective expiry'],
    [authority, CANONICAL_FILES.authority, 'no APP6 server-side design', 'the no-raster ruling'],
  ];
  for (const [text, file, needle, complaint] of rules) {
    if (text === undefined) continue;
    if (!text.toLowerCase().includes(needle.toLowerCase())) {
      fail(`${file} does not state ${complaint} ("${needle}")`);
    }
  }
}

/** 7 — the negations: an authority checkpoint that changed any of these overreached. */
function checkNegations(rootDir, fail) {
  const migrations = migrationCount(rootDir);
  if (migrations !== FROZEN.migrations) {
    fail(`migration count is ${String(migrations)}, expected ${String(FROZEN.migrations)} — APP6-G01 writes no SQL`);
  }
  const scripts = rootScriptCount(rootDir);
  if (scripts !== FROZEN.rootScripts) {
    fail(`root script count is ${String(scripts)}, expected ${String(FROZEN.rootScripts)}`);
  }
  const counts = openapiCounts(rootDir);
  if (counts === undefined) {
    fail(`${CANONICAL_FILES.openapi} is missing`);
  } else if (
    counts.paths !== FROZEN.openapiPaths ||
    counts.operations !== FROZEN.openapiOperations ||
    counts.schemas !== FROZEN.openapiSchemas
  ) {
    fail(
      `OpenAPI is ${String(counts.paths)}/${String(counts.operations)}/${String(counts.schemas)}, expected ` +
        `${String(FROZEN.openapiPaths)}/${String(FROZEN.openapiOperations)}/${String(FROZEN.openapiSchemas)} — APP6-G01 publishes no operation`,
    );
  }
  const figma = figmaApp06References(rootDir);
  if (figma !== FROZEN.figmaApp06References) {
    fail(`the Figma registry carries ${String(figma)} APP_06 reference(s) — APP6-G01 draws nothing`);
  }
  for (const key of ['designVersions', 'approvalSnapshots']) {
    const source = read(rootDir, key);
    if (source === undefined) {
      fail(`${CANONICAL_FILES[key]} is missing`);
      continue;
    }
    for (const column of ['product_id', 'product_variant_id', 'product_side_id', 'embroidery_area_id']) {
      if (!declaresNotNull(source, column)) {
        fail(`${CANONICAL_FILES[key]}: ${column} is no longer NOT NULL — that is APP6-DB01's change, not APP6-G01's`);
      }
    }
    if (source.includes('customer_owned_product_id')) {
      fail(`${CANONICAL_FILES[key]} already carries customer_owned_product_id — APP6-DB01 was executed early`);
    }
  }
  // The quotation module itself is delivered persistence (APP6-R00 §4); what
  // must still be absent is its application and HTTP layer, and the dataset
  // reader APP6-B01 owns.
  for (const [path, complaint] of [
    ['apps/api/src/modules/quotation/application', 'an APP6 quotation application layer'],
    ['apps/api/src/modules/quotation/infrastructure/http', 'an APP6 quotation HTTP surface'],
    ['packages/database/src/seed/app6-policy-dataset.ts', 'the APP6 dataset reader (owned by APP6-B01)'],
    ['apps/api/src/platform/policy/publish-app6-policy.use-case.ts', 'the APP6 policy publisher (owned by APP6-B01)'],
  ]) {
    if (existsSync(join(rootDir, path))) fail(`${path} exists — APP6-G01 must not create ${complaint}`);
  }
}

/** 8 — the phase roadmap records the checkpoint's own outcome. */
function checkPhase(rootDir, fail) {
  const phase = read(rootDir, 'phase');
  if (phase === undefined) {
    fail(`${CANONICAL_FILES.phase} is missing`);
    return;
  }
  if (!/\|\s*`APP6-G01`\s*\|\s*`COMPLETE`\s*\|/.test(phase)) {
    fail(`${CANONICAL_FILES.phase} does not record APP6-G01 as COMPLETE`);
  }
  if (!phase.includes('NEXT CHECKPOINT = APP6-DB01')) {
    fail(`${CANONICAL_FILES.phase} does not record APP6-DB01 as the next checkpoint`);
  }
  if (!phase.includes(SCHEMA_CONTRACT)) {
    fail(`${CANONICAL_FILES.phase} does not carry the DB01 schema contract`);
  }
}

/** Runs every rule against `rootDir` and returns the failures. */
export function runChecks(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const adr = read(rootDir, 'adr');
  const authority = read(rootDir, 'authority');

  checkDecision(rootDir, fail);
  checkAdr(adr, fail);
  checkFacts(rootDir, adr, fail);
  checkDataset(rootDir, fail);
  checkTransitions(authority, fail);
  checkProhibitions(adr, authority, fail);
  checkNegations(rootDir, fail);
  checkPhase(rootDir, fail);
  return failures;
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('check-app6-g01.mjs');
if (invokedDirectly) {
  const rootDir = process.argv[2] ?? REPO_ROOT;
  const failures = runChecks(rootDir);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL  ${failure}`);
    console.error(`\nAPP6-G01 gate: ${String(failures.length)} failure(s).`);
    process.exit(1);
  }
  console.log('APP6-G01 gate: OK');
}
