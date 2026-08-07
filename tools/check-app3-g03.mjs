#!/usr/bin/env node
/**
 * `APP3-G03` — anonymous Design Session ownership, transport and retention (IMP-D043).
 *
 * The table, its repository and LC-07 existed before this gate; what did not was
 * any statement of *how an anonymous visitor proves the session is theirs*.
 * `session_secret_hash` was `NOT NULL` and `UNIQUE` with no rule for what fills
 * it, and `expires_at` was `NOT NULL` with a duration deferred to `O-008`. So
 * this gate asserts the three things such an authority most easily loses:
 * **both halves always** (ownership is the pair *(public id, secret)*, not
 * whichever one a lookup happens to accept), **a TTL that does not slide** (one
 * edit turns absolute-from-`created_at` back into last-activity-based, which is
 * what the old documents said), and **nothing implemented yet** (no Session
 * operation in the committed OpenAPI, no Session HTTP surface in the API).
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app3-g03.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { boundedTable, checkApp3G02, sectionBody } from './check-app3-g02.mjs';
import { parseTransitions } from './check-app3-g02-lifecycle.mjs';
import { CLOSURE_COMMIT } from './check-app3-g01.mjs';
import { checkNextPhaseChronology } from './check-app2-closure-artifacts.mjs';
import { SECURITY_FACTS, checkSecurityAuthority } from './check-app3-g03-security.mjs';
import { acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  spec: 'docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md',
  security: 'docs/09-SECURITY-AND-ABUSE-PREVENTION.md',
  decisionLog: 'docs/12-DECISION-LOG.md',
  durability: 'docs/database/DB10_DURABILITY_PARAMETER_REGISTRY.md',
  retentionMap: 'docs/database/DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md',
  durabilityMatrix: 'docs/database/DB10_DATA_DURABILITY_MATRIX.md',
  sessionSchema: 'packages/database/src/schema/design/design-sessions.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

export const DECISION_ID = 'IMP-D043';
export const DESIGN_MODULE_DIR = 'apps/api/src/modules/design';

/** PO-01 … PO-10, each of which the decision row must record by id. */
export const RULINGS = Object.freeze(
  Array.from({ length: 10 }, (_, i) => `PO-${String(i + 1).padStart(2, '0')}`),
);

/** Ownership, retention, concurrency and boundary facts (§6.6.1). */
export const OWNERSHIP_FACTS = Object.freeze({
  'Session ownership requirement': 'SESSION_ID_AND_SECRET',
  'Session public handle': 'design_sessions.id',
  'Session persisted verifier': 'session_secret_hash',
  'Session id alone authorizes': 'NO',
  'Session secret alone authorizes': 'NO',
  SESSION_TTL_DAYS: '30',
  'Session ttl basis': 'ABSOLUTE_FROM_CREATED_AT',
  'Session ttl sliding': 'NONE',
  'Session expires_at write': 'SET_AT_CREATION_NEVER_EXTENDED',
  'Session expiry transition': 'TR-LC07-04',
  'Session expiry sweep interval': 'HOURLY',
  'Session purge transition': 'TR-LC07-05',
  'Session purge grace hours': '24',
  'Session purge scope': 'EXCLUSIVELY_OWNED_SESSION_FAMILY',
  'Session purge shared authority': 'NEVER_DELETED',
  'Session restore after expiry': 'NONE',
  'Session submitted retention owner': 'APP5',
  'Session mutation revision requirement': 'EXPECTED_REVISION',
  'Session revision column': 'autosave_revision',
  'Session stale write result': 'STALE_WRITE',
  'Session stale write mutation': 'NONE',
  'Session retry policy': 'REFETCH_BEFORE_RETRY',
  'Session blind replay loop': 'FORBIDDEN',
  'Session idempotency table': 'NONE',
  'Session customer identity in APP3': 'NONE',
  'Session contact collection in APP3': 'NONE',
  'Session ownership transfer owner': 'APP5',
  'Session submit transition owner': 'APP5',
  G03_DB_CONTRIBUTION: 'NONE',
});

/** Every fact the gate recomputes, across both responsibility halves. */
export const EXPECTED_FACTS = Object.freeze({ ...OWNERSHIP_FACTS, ...SECURITY_FACTS });

/**
 * Dependency statuses this gate reconciles (§6.6.4), keyed `id :: portion` —
 * three checkpoints are only *partly* unblocked, so the portion is part of the
 * identity and one row each would have to drop half the fact.
 */
export const EXPECTED_DEPENDENCIES = Object.freeze({
  'APP3-G01 :: whole checkpoint': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G02 :: whole checkpoint': 'COMPLETE — REVIEW_ACCEPTED',
  'APP3-G03 :: whole checkpoint': 'COMPLETE — REVIEW_DELIVERED',
  'APP3-G04 :: whole checkpoint': 'READY — NOT STARTED',
  'APP3-P01 :: whole checkpoint': 'READY — NOT STARTED',
  'APP3-P02 :: whole checkpoint': 'READY — NOT STARTED',
  'APP3-DB01 :: whole checkpoint': 'REQUIRED — AWAITING_G04_CONTRIBUTION',
  'APP3-B07 :: identity and transport': 'UNBLOCKED_BY_G03',
  'APP3-B07 :: overall': 'BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION',
  'APP3-B08 :: session concurrency': 'UNBLOCKED_BY_G03',
  'APP3-B08 :: overall': 'BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION',
  'APP3-W01 :: expiry authority': 'UNBLOCKED_BY_G03',
  'APP3-W01 :: overall': 'BLOCKED_BY_DB_DISPOSITION',
  'APP3-S11 :: conflict/reload UX authority': 'UNBLOCKED_BY_G03',
  'O-008 :: session TTL': 'CLOSED_BY_IMP-D043',
  'DP-RET-01 :: design_sessions': 'CLOSED_BY_IMP-D043',
});

/** LC-07 is preserved, not extended: the same four states, the same five ids. */
export const EXPECTED_SESSION_TRANSITIONS = Object.freeze({
  'TR-LC07-01': '(start)→ACTIVE',
  'TR-LC07-02': 'ACTIVE→ACTIVE (autosave)',
  'TR-LC07-03': 'ACTIVE→SUBMITTED',
  'TR-LC07-04': 'ACTIVE→EXPIRED',
  'TR-LC07-05': 'EXPIRED→DELETED',
});

/** Declarations PO-10 measured as already present, matched on the declaration. */
export const REQUIRED_SCHEMA = Object.freeze({
  session_secret_hash: /sessionSecretHash:\s*text\('session_secret_hash'\)\.notNull\(\)/,
  'unique session_secret_hash': /unique\('uq_design_sessions__session_secret_hash'\)/,
  expires_at: /expiresAt:\s*instant\('expires_at'\)\.notNull\(\)/,
  created_at: /createdAt:\s*createdAt\(\)/,
  status: /status:\s*stateColumn\(\)\.notNull\(\)/,
  'LC-07 status check': /stateCheck\(t\.status,\s*DESIGN_SESSION_STATES\)/,
  autosave_revision: /autosaveRevision:\s*integer\('autosave_revision'\)\.notNull\(\)/,
  'non-negative revision': /autosaveRevision\}?\s*>=\s*0/,
});

/** No identity may attach to an anonymous session (PO-01, PO-09). */
const FORBIDDEN_SCHEMA_COLUMNS = /'([a-z_]*(customer|email|phone|fingerprint|ip_address)[a-z_]*)'/g;

/** A Design Session operation must not exist while this is an authority gate. */
const SESSION_PATH_RE = /design-sessions?|thiet-ke/i;
const SESSION_OPERATION_RE = /^designSession/;

function read(root, key) {
  const abs = join(root, CANONICAL_FILES[key]);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
}

/** The body between two headings, for bounded prose assertions. */
function section(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start < 0) return '';
  const rest = text.slice(start);
  const end = rest.indexOf(endHeading, startHeading.length);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Markdown hard-wraps, so a claim split across two lines would read as absent. */
export function flatten(text) {
  return text.replace(/\s+/g, ' ');
}

/**
 * `| \`ID\` | portion | \`STATUS\` |` rows of §6.6.4, keyed `id :: portion`.
 *
 * Bounded at §6.6.4's own end (`FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01`). The
 * retired form ended at the literal `## 7. `, which was correct only while
 * §6.6.4 was the last subsection before §7; once `APP3-G04` added §6.6.5 and
 * §6.7 — and `APP3-DB01` §6.8 — every later dependency table fell inside this
 * range, and because `Map` keeps the *last* duplicate key, a later gate's status
 * would silently become the value this gate asserts. Same defect and same repair
 * as `check-app3-g02.mjs`.
 */
export function dependencyTable(phaseText) {
  return new Map(
    sectionBody(phaseText, '### 6.6.4 ')
      .split(/\r?\n/)
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [`${m[1]} :: ${m[2]}`, m[3]]),
  );
}

function decisionRows(register) {
  return register.split(/\r?\n/).filter((line) => line.startsWith(`| ${DECISION_ID} |`));
}

function checkDecision(rows, fail) {
  const where = CANONICAL_FILES.register;
  if (rows.length !== 1) {
    fail(`${where}: ${DECISION_ID} appears ${String(rows.length)} times, expected 1`);
    return;
  }
  for (const ruling of RULINGS) {
    if (!rows[0].includes(ruling)) {
      fail(`${where}: ${DECISION_ID} does not record ruling ${ruling}`);
    }
  }
  if (!rows[0].trimEnd().endsWith('| LOCKED |')) {
    fail(`${where}: ${DECISION_ID} is not LOCKED`);
  }
}

function checkFacts(phase, fail) {
  const facts = boundedTable(phase, '### 6.6.1 ', '### 6.6.2 ');
  for (const [key, expected] of Object.entries(EXPECTED_FACTS)) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: machine-checked session fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
}

function checkDependencies(phase, fail) {
  const rows = dependencyTable(phase);
  for (const [id, expected] of Object.entries(EXPECTED_DEPENDENCIES)) {
    const actual = rows.get(id);
    if (actual === undefined) {
      fail(`${CANONICAL_FILES.phase}: dependency row for \`${id}\` is missing`);
    } else if (actual !== expected) {
      fail(`${CANONICAL_FILES.phase}: \`${id}\` is "${actual}", expected "${expected}"`);
    }
  }
}

/** LC-07 keeps its five ids and four states; `ABANDONED` stays eliminated. */
function checkSessionLifecycle(spec, fail) {
  const where = CANONICAL_FILES.spec;
  const transitions = parseTransitions(spec, 'LC-07');
  if (transitions === null) {
    fail(`${where}: no "## LC-07" section found`);
    return;
  }
  const seen = new Map(transitions.map((t) => [t.id, `${t.from}→${t.to}`]));
  for (const [id, arrow] of Object.entries(EXPECTED_SESSION_TRANSITIONS)) {
    const actual = seen.get(id);
    if (actual === undefined) {
      fail(`${where}: LC-07 is missing ${id} (${arrow})`);
    } else if (actual !== arrow) {
      fail(`${where}: LC-07 ${id} is ${actual}, expected ${arrow}`);
    }
  }
  const expected = Object.keys(EXPECTED_SESSION_TRANSITIONS).length;
  if (transitions.length !== expected) {
    fail(
      `${where}: LC-07 defines ${String(transitions.length)} transitions, expected ${String(expected)}`,
    );
  }
  const body = flatten(section(spec, '## LC-07 ', '## LC-08 '));
  // Anchored on the canonical sentence: "there is an `eliminated` somewhere in
  // the section" would be satisfied by this gate's own note about it.
  if (!/`ABANDONED` eliminated \(merged into EXPIRED\)/.test(body)) {
    fail(`${where}: LC-07 no longer states that ABANDONED is eliminated`);
  }
  for (const [label, pattern] of [
    ['the 30-day absolute TTL', /created_at` \+ 30 days|30 days/],
    ['the 24-hour purge grace', /\*\*24-hour\*\*|24-hour/],
    ['that SUBMITTED belongs to APP5', /APP5/],
  ]) {
    if (!pattern.test(body)) fail(`${where}: LC-07 no longer records ${label}`);
  }
}

/**
 * `O-008` and the `design_sessions` half of `DP-RET-01` are closed, and the
 * documents that used to say `last_activity_at + TTL` no longer say it live.
 */
function checkRetentionClosure(root, fail) {
  const needles = {
    decisionLog: ['CLOSED', '30 days', DECISION_ID],
    durability: ['30 days', 'APP3-G03'],
    retentionMap: ['30 days', 'IMP-D043'],
    durabilityMatrix: ['30 days', 'IMP-D043'],
  };
  for (const [key, required] of Object.entries(needles)) {
    const text = read(root, key);
    if (text === undefined) {
      fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
      continue;
    }
    for (const needle of required) {
      if (!text.includes(needle)) {
        fail(`${CANONICAL_FILES[key]}: the session retention closure no longer states "${needle}"`);
      }
    }
  }
  // The superseded basis may remain as history, but never as the live rule.
  for (const key of ['retentionMap', 'durabilityMatrix']) {
    for (const line of (read(root, key) ?? '').split(/\r?\n/)) {
      if (!/design_sessions/.test(line) || !/last_activity_at/.test(line)) continue;
      if (!line.includes('~~')) {
        fail(
          `${CANONICAL_FILES[key]}: a design_sessions row still states last_activity_at + TTL as the live basis`,
        );
      }
    }
  }
}

/** PO-10: every field exists already, and no identity column does. */
function checkSchema(root, fail) {
  const where = CANONICAL_FILES.sessionSchema;
  const source = read(root, 'sessionSchema');
  if (source === undefined) {
    fail(`${where}: session schema file is missing`);
    return;
  }
  for (const [label, pattern] of Object.entries(REQUIRED_SCHEMA)) {
    if (!pattern.test(source)) {
      fail(
        `${where}: required declaration \`${label}\` is gone; G03_DB_CONTRIBUTION = NONE no longer holds`,
      );
    }
  }
  const states =
    /DESIGN_SESSION_STATES\s*=\s*\['ACTIVE',\s*'SUBMITTED',\s*'EXPIRED',\s*'DELETED'\]/;
  if (!states.test(source)) {
    fail(`${where}: DESIGN_SESSION_STATES is no longer the LC-07 four`);
  }
  for (const match of source.matchAll(FORBIDDEN_SCHEMA_COLUMNS)) {
    fail(
      `${where}: identity-bearing column \`${match[1]}\` exists; an anonymous session carries no customer identity`,
    );
  }
}

/** No Session operation and no Session HTTP surface may exist yet. */
function checkNoImplementation(root, fail) {
  const where = CANONICAL_FILES.openapi;
  const raw = read(root, 'openapi');
  if (raw === undefined) {
    fail(`${where}: OpenAPI artifact is missing`);
  } else {
    const b07 = acceptedSurface(root).designSessionRoutes;
    for (const [path, methods] of Object.entries(JSON.parse(raw).paths ?? {})) {
      if (b07 && path.includes('/design-sessions')) continue;
      if (SESSION_PATH_RE.test(path)) {
        fail(`${where}: Design Session path "${path}" exists, but no APP3 backend checkpoint ran`);
      }
      for (const operation of Object.values(methods ?? {})) {
        const id = operation?.operationId;
        if (typeof id === 'string' && SESSION_OPERATION_RE.test(id)) {
          fail(
            `${where}: Design Session operation "${id}" exists, but no APP3 backend checkpoint ran`,
          );
        }
      }
    }
  }
  // A *surface* is a controller, not a directory name. `APP3-B06A` delivers the
  // reusable authorization foundation — guards, policies and a request context —
  // which legitimately lives in `application/` and `presentation/` while
  // publishing no operation at all. Keying on the folder would have made the
  // ruling "no Session operation exists" unimplementable without an odd layout,
  // so it keys on what the ruling actually forbids.
  // `APP3-B07` then delivered the two Session operations the ruling deferred, so
  // from that point a controller is what the plan asked for, not a violation.
  if (acceptedSurface(root).designSessionRoutes) return;
  const moduleDir = join(root, DESIGN_MODULE_DIR);
  if (!existsSync(moduleDir)) return;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        const source = readFileSync(full, 'utf8').replace(/^\s*(\/\*|\*|\/\/).*$/gm, '');
        if (/@Controller\(/.test(source)) {
          fail(`${full}: a Design HTTP controller exists, but no APP3 backend checkpoint ran`);
        }
      }
    }
  };
  walk(moduleDir);
}

/** Every APP3-G03 invariant, as a list of failure strings. */
export function checkApp3G03(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const texts = {};
  for (const key of ['phase', 'register', 'spec', 'security']) {
    texts[key] = read(rootDir, key);
    if (texts[key] === undefined) fail(`${CANONICAL_FILES[key]}: canonical file is missing`);
  }
  if (Object.values(texts).some((text) => text === undefined)) return failures;

  const rows = decisionRows(texts.register);
  checkDecision(rows, fail);
  checkFacts(texts.phase, fail);
  checkDependencies(texts.phase, fail);
  checkSessionLifecycle(texts.spec, fail);
  checkRetentionClosure(rootDir, fail);
  checkSchema(rootDir, fail);
  checkNoImplementation(rootDir, fail);
  checkSecurityAuthority({
    rulings: flatten(section(texts.phase, '### 6.6.2 ', '### 6.6.3 ')),
    register: rows[0] ?? '',
    security: flatten(texts.security),
    files: CANONICAL_FILES,
    fail,
  });

  const chronology = checkNextPhaseChronology({ repoRoot: rootDir, closureCommit: CLOSURE_COMMIT });
  for (const violation of chronology.violations ?? []) fail(`APP2 chronology: ${violation}`);
  for (const violation of checkApp3G02(rootDir)) fail(`APP3-G02 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3G03();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-g03 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-g03 — Anonymous session authority locked (${DECISION_ID}; ownership = ` +
      'id + secret, HMAC-SHA-256 under a runtime pepper, secret only in ' +
      `${SECURITY_FACTS['Session cookie name']}; TTL ${OWNERSHIP_FACTS.SESSION_TTL_DAYS} days ` +
      `absolute with a ${OWNERSHIP_FACTS['Session purge grace hours']}-hour purge grace; ` +
      'LC-07 preserved at 5 transitions; O-008 and DP-RET-01 closed; ' +
      `G03_DB_CONTRIBUTION = ${OWNERSHIP_FACTS.G03_DB_CONTRIBUTION}; no Session operation exists)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
