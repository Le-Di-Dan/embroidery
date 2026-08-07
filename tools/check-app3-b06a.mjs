#!/usr/bin/env node
/**
 * `APP3-B06A` — the anonymous Design Session authorization foundation.
 *
 * The gate exists because every rule here is one that *works* when it is broken.
 * A verifier that compares digests with `===` authorizes correctly and leaks a
 * timing oracle; an unpeppered HMAC verifies every legitimate session; a cookie
 * found by scanning authorizes the right session until a customer opens two
 * designs; a refusal that says "expired" rather than "unauthorized" answers
 * every question an id-enumerator has. None of those fail a functional test, so
 * they are asserted structurally.
 *
 * The other half is scope. `APP3-B06A` may not mint a secret, set a success
 * cookie, publish an operation or touch an Asset — those belong to `APP3-B07`
 * and `APP3-B06B` — so the negations are checked as hard as the rulings.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b06a.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_FILES,
  checkAuthorization,
  checkCookieAuthority,
  checkContext,
  checkOriginPolicy,
  checkRateLimits,
  checkVerifier,
  code,
  ownedSources,
  read,
} from './check-app3-b06a-security.mjs';
import { checkApp3G03 } from './check-app3-g03.mjs';
import { checkApp3G08 } from './check-app3-g08.mjs';
import { checkApp3W01C } from './check-app3-w01c.mjs';
import { acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULE_DIR = 'apps/api/src/modules/design';

export { CANONICAL_FILES, code, read } from './check-app3-b06a-security.mjs';

const ROOT_SCRIPT_COUNT = 30;
const MIGRATION_COUNT = 34;
const OPENAPI_PATHS = 19;
const SOFT_CAP_CHECKER = 450;
const SOFT_CAP_TEST = 700;
const SOURCE_LIMIT = 400;
const TEST_LIMIT = 600;

/** Every `.ts` file under the design module, as source text. */
function moduleSources(rootDir) {
  const root = join(rootDir, MODULE_DIR);
  const files = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push([full, readFileSync(full, 'utf8')]);
    }
  };
  walk(root);
  return files;
}

/** 1 — the authority this checkpoint builds on is accepted. */
export function checkAuthority(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  // B06A recorded its successors as blocked on it. `APP3-B07` then shipped, so
  // exactly two consistent worlds are accepted — what stays fixed either way is
  // that G08 and W01C are accepted and B06A itself is complete.
  const afterB07 = /\nAPP3-B07 = COMPLETE/.test(phase);
  for (const line of [
    'APP3-G08 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01C = COMPLETE — REVIEW_ACCEPTED',
    ...(afterB07
      ? ['APP3-B06A = COMPLETE — REVIEW_ACCEPTED', 'APP3-B06B = READY — NOT STARTED']
      : [
          'APP3-B06A = COMPLETE — REVIEW_DELIVERED',
          'APP3-B07 = READY — NOT STARTED',
          'APP3-B06B = BLOCKED_BY_APP3-B07',
        ]),
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
}

/** 2, 20 — B07 keeps bootstrap, and neither successor has started. */
export function checkScope(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  const b07 = phase.split('\n').find((line) => /^\|\s*\d+\s*\|\s*`APP3-B07`/.test(line.trim()));
  if (b07 === undefined || !/session bootstrap/i.test(b07)) {
    fail(`${CANONICAL_FILES.phase}: APP3-B07 no longer owns session bootstrap`);
  }

  // No production controller may exist in the design module — until `APP3-B07`,
  // which owns the first two Session operations.
  const publishes = acceptedSurface(rootDir).designSessionRoutes;
  for (const [file, text] of moduleSources(rootDir)) {
    if (file.endsWith('.spec.ts') || publishes) continue;
    if (/@Controller\(/.test(code(text))) {
      fail(`${file}: APP3-B06A publishes no HTTP operation, but a controller exists`);
    }
  }
  const surface = acceptedSurface(rootDir);
  const openapi = read(rootDir, 'openapi') ?? '{}';
  if (!surface.designSessionRoutes && openapi.includes('/public/design-sessions')) {
    fail(`${CANONICAL_FILES.openapi}: a design-session route exists — B07/B06B started`);
  }
  const paths = Object.keys(JSON.parse(openapi).paths ?? {}).length;
  if (paths !== surface.paths) {
    fail(`${CANONICAL_FILES.openapi}: ${String(paths)} paths, expected ${String(surface.paths)}`);
  }
}

/**
 * 3 — issuance belongs to `APP3-B07`, and only to it.
 *
 * Two consistent worlds. Before B07 the design module mints nothing and sets no
 * cookie at all, which is what proved B06A had not overreached. After B07 it
 * mints in exactly one place — the issuer — and sets exactly one cookie, from
 * the same policy that clears it. Every mixture fails, and the clearing helper
 * is required in both.
 */
export function checkIssuesNothing(rootDir, fail) {
  const delivered = /\nAPP3-B07 = COMPLETE/.test(read(rootDir, 'phase') ?? '');
  const mayIssue = (file) =>
    file.includes('ephemeral-network-key') ||
    (delivered && (file.includes('secret.issuer') || file.includes('cookie.policy')));

  for (const [file, text] of ownedSources(rootDir)) {
    const body = code(text);
    if (/randomBytes\(/.test(body) && !mayIssue(file)) {
      fail(`${file}: mints random bytes — secret issuance belongs to APP3-B07`);
    }
    if (/serializeSessionCookie|issueCookie|Max-Age=\$\{/.test(body) && !mayIssue(file)) {
      fail(`${file}: issues a session cookie — that belongs to APP3-B07`);
    }
  }
  const cookies = code(read(rootDir, 'cookies') ?? '');
  if (!/serializeDeletionCookie/.test(cookies)) {
    fail(`${CANONICAL_FILES.cookies}: no cookie-clearing helper`);
  }
  if (!delivered && /Max-Age=\${/.test(cookies)) {
    fail(`${CANONICAL_FILES.cookies}: a variable Max-Age implies issuance, not clearing`);
  }
}

/** 4 — the module seam registers the foundation and exports its closure. */
export function checkModuleSeam(rootDir, fail) {
  const module = code(read(rootDir, 'module') ?? '');
  for (const provider of [
    'DESIGN_SESSION_AUTH_CONFIG',
    'DesignSessionSecretVerifier',
    'DesignSessionCookiePolicy',
    'DesignSessionOriginPolicy',
    'DesignSessionRateLimiter',
    'EphemeralNetworkKeyService',
    'AuthorizeDesignSessionService',
    'DesignSessionGuard',
  ]) {
    if (!module.includes(provider)) {
      fail(`${CANONICAL_FILES.module}: does not register ${provider}`);
    }
  }
  const exportsBlock = /exports:\s*\[([\s\S]*?)\]/.exec(module)?.[1] ?? '';
  // A consuming module names the guard in `@UseGuards`, so Nest instantiates it
  // in *that* scope and every collaborator must be exported too.
  for (const dependency of [
    'DesignSessionGuard',
    'DesignSessionOriginPolicy',
    'DesignSessionRateLimiter',
    'EphemeralNetworkKeyService',
    'AuthorizeDesignSessionService',
  ]) {
    if (!exportsBlock.includes(dependency)) {
      fail(`${CANONICAL_FILES.module}: does not export ${dependency} for a consuming module`);
    }
  }
}

/** 15 — the CAS seam exists, mirrors the accepted contract, and advances once. */
export function checkRevisionSeam(rootDir, fail) {
  const port = code(read(rootDir, 'port') ?? '');
  if (!/advanceRevision\(input: AdvanceRevisionInput\): Promise<DesignSession>/.test(port)) {
    fail(`${CANONICAL_FILES.port}: no reusable expected-revision seam`);
  }
  if (!/expectedRevision/.test(port)) {
    fail(`${CANONICAL_FILES.port}: the seam takes no expected revision`);
  }
  const repository = code(read(rootDir, 'repository') ?? '');
  const method = /async advanceRevision\([\s\S]*?\n  \}/.exec(repository)?.[0] ?? '';
  if (method === '') {
    fail(`${CANONICAL_FILES.repository}: advanceRevision is not implemented`);
    return;
  }
  for (const [pattern, what] of [
    [/autosaveRevision: input\.expectedRevision \+ 1/, 'advancing the revision by exactly one'],
    [/eq\(designSessions\.autosaveRevision, input\.expectedRevision\)/, 'the revision predicate'],
    [/eq\(designSessions\.status, 'ACTIVE'\)/, 'the ACTIVE predicate'],
    [/gt\(designSessions\.expiresAt/, 'the expiry predicate'],
    [/'STALE_WRITE'/, 'the stale-write verdict'],
    [/requireTransaction\('advanceRevision'\)/, 'the transaction requirement'],
  ]) {
    if (!pattern.test(method)) {
      fail(`${CANONICAL_FILES.repository}: advanceRevision is missing ${what}`);
    }
  }
  // The guard must never call it: authorization is not a mutation.
  if (/advanceRevision/.test(code(read(rootDir, 'guard') ?? ''))) {
    fail(`${CANONICAL_FILES.guard}: the guard advances the revision`);
  }
}

/** 17 — no Asset, upload, association or event behaviour lives here yet. */
export function checkNoAssetBehaviour(rootDir, fail) {
  for (const [file, text] of ownedSources(rootDir)) {
    const body = code(text);
    for (const [pattern, what] of [
      [/busboy|multipart/i, 'upload parsing'],
      [/ObjectStorage|putObjectStream|presign/i, 'object storage'],
      [/asset\.(inspection|normalization)\.requested/, 'an event append'],
      [/attachAsset\(/, 'an association write'],
    ]) {
      if (pattern.test(body)) {
        fail(`${file}: contains ${what}, which belongs to APP3-B06B`);
      }
    }
  }
}

/** 18, 19 — nothing outside the API module moved. */
export function checkBoundary(rootDir, fail) {
  const manifest = read(rootDir, 'rootManifest');
  if (manifest === undefined) {
    fail('package.json: missing');
  } else {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPT_COUNT) {
      fail(`package.json: ${String(scripts.length)} root scripts, expected ${ROOT_SCRIPT_COUNT}`);
    }
    if (scripts.some((name) => name.includes('b06a'))) {
      fail('package.json: APP3-B06A added a root script');
    }
  }
  const api = read(rootDir, 'apiManifest');
  if (api !== undefined) {
    const parsed = JSON.parse(api);
    const deps = { ...parsed.dependencies, ...parsed.devDependencies };
    for (const name of Object.keys(deps)) {
      if (/cookie|csrf|rate-limit|throttler|helmet/i.test(name)) {
        fail(`apps/api/package.json: a security dependency was added (${name})`);
      }
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  if (existsSync(migrations)) {
    const count = readdirSync(migrations).filter((name) => name.endsWith('.sql')).length;
    if (count !== MIGRATION_COUNT) {
      fail(
        `packages/database/migrations: ${String(count)} migrations, expected ${String(MIGRATION_COUNT)}`,
      );
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-B06A',
    'CMD-TEST-APP3-B06A',
    'CMD-TEST-APP3-B06A-API',
    'CMD-TEST-APP3-B06A-INTEGRATION',
  ]) {
    if (!index.includes(`\`${id}\``)) {
      fail(`${CANONICAL_FILES.commandIndex}: ${id} is not indexed`);
    }
  }
}

/** 21 — application and tooling line limits. */
export function checkFileSizes(rootDir, fail) {
  for (const [key, cap] of [
    ['config', SOURCE_LIMIT],
    ['verifier', SOURCE_LIMIT],
    ['cookies', SOURCE_LIMIT],
    ['origins', SOURCE_LIMIT],
    ['service', SOURCE_LIMIT],
    ['guard', SOURCE_LIMIT],
    ['unitSpec', TEST_LIMIT],
    ['integrationSpec', TEST_LIMIT],
    ['tools/check-app3-b06a.mjs', SOFT_CAP_CHECKER],
    ['tools/check-app3-b06a-security.mjs', SOFT_CAP_CHECKER],
    ['tools/check-app3-b06a.test.mjs', SOFT_CAP_TEST],
  ]) {
    const text = read(rootDir, key);
    if (text === undefined) {
      fail(`${CANONICAL_FILES[key] ?? key}: missing`);
      continue;
    }
    const lines = text.split('\n').length;
    if (lines > cap) {
      fail(
        `${CANONICAL_FILES[key] ?? key}: ${String(lines)} lines, above the ${String(cap)} limit`,
      );
    }
  }
}

/** 22, 23 — the report carries its ledger and its budget accounting. */
export function checkLedger(rootDir, fail) {
  const report = read(rootDir, 'report');
  if (report === undefined) return; // Commit A runs before the report exists.
  for (const [pattern, what] of [
    [/command ledger/i, 'the command ledger'],
    [/consumed/i, 'the consumed/max budget table'],
  ]) {
    if (!pattern.test(report)) {
      fail(`${CANONICAL_FILES.report}: does not record ${what}`);
    }
  }
}

/** Accepted predecessors still pass. */
function checkPredecessors(rootDir, fail) {
  for (const [label, run] of [
    ['APP3-W01C', checkApp3W01C],
    ['APP3-G08', checkApp3G08],
    ['APP3-G03', checkApp3G03],
  ]) {
    for (const violation of run(rootDir)) {
      fail(`${label} regression: ${violation}`);
    }
  }
}

export function checkApp3B06A(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkAuthority(rootDir, fail);
  checkScope(rootDir, fail);
  checkIssuesNothing(rootDir, fail);
  checkModuleSeam(rootDir, fail);
  checkCookieAuthority(rootDir, fail);
  checkVerifier(rootDir, fail);
  checkAuthorization(rootDir, fail);
  checkOriginPolicy(rootDir, fail);
  checkRateLimits(rootDir, fail);
  checkContext(rootDir, fail);
  checkRevisionSeam(rootDir, fail);
  checkNoAssetBehaviour(rootDir, fail);
  checkBoundary(rootDir, fail);
  checkFileSizes(rootDir, fail);
  checkLedger(rootDir, fail);
  checkPredecessors(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3B06A(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b06a — ${String(failures.length)} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b06a — anonymous Session ownership is the pair and nothing less: the cookie name ' +
      'is derived from the path id so a neighbour session can never authorize this one, the ' +
      'secret is verified as a peppered HMAC compared in constant time at a fixed width, and ' +
      'liveness is checked after the secret so status is no oracle; every refusal collapses to ' +
      'one public outcome while a dead credential — and only a dead one — is cleared; Origin and ' +
      'Sec-Fetch-Site are both required with no absent-is-fine branch and are checked before any ' +
      'cookie is read; the ruled 30/minute and 10/15-minute limits run on the existing sliding ' +
      'window that staff login still shares, keyed without a secret or digest; the request ' +
      'context carries an id and a revision and nothing else; the CAS seam mirrors the accepted ' +
      'contract and advances exactly once, while authorization itself writes nothing; and no ' +
      'secret is minted, no success cookie set, no Asset touched, no operation published and no ' +
      'migration, dependency or root script added',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
