#!/usr/bin/env node
/**
 * `APP3-B07` — anonymous Design Session bootstrap, clone and resume.
 *
 * The rules worth a gate are the ones a passing test suite does not notice. A
 * clone that kept a live reference still opens correctly until a Template is
 * republished. A rotation that forgot the old-digest predicate still resumes
 * fine until two tabs race. A resume that extended the TTL looks like a feature.
 * A Design module that imported the controller-bearing placement module works
 * perfectly and quietly inverts an ownership boundary. So the negations are
 * asserted as hard as the rulings.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b07.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { B06B_DELIVERED_STATUS } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, code, read, requireAll } from './check-app3-b07-files.mjs';
import { checkApp3B06A } from './check-app3-b06a.mjs';
import { checkRequestContract, checkSurface } from './check-app3-b07-contract.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export { CANONICAL_FILES, code, read } from './check-app3-b07-files.mjs';

const [ROOT_SCRIPTS, MIGRATIONS] = [30, 34];
const [SOFT_CHECKER, SOFT_TEST, SRC_LIMIT, TEST_LIMIT] = [450, 700, 400, 600];

/** 1 — predecessors accepted and B07 recorded. */
function checkStatus(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  // Two worlds: B07 at the frontier, and B07 accepted with `APP3-B06B` shipped
  // on top of it. What stays fixed either way is that B06A is accepted, B07 is
  // complete, and B08 has not started.
  const afterB06B = /\nAPP3-B06B = COMPLETE/.test(phase);
  for (const line of [
    'APP3-B06A = COMPLETE — REVIEW_ACCEPTED',
    afterB06B ? 'APP3-B07 = COMPLETE — REVIEW_ACCEPTED' : 'APP3-B07 = COMPLETE — REVIEW_DELIVERED',
    afterB06B ? B06B_DELIVERED_STATUS : 'APP3-B06B = READY — NOT STARTED',
    'APP3-B08 = READY — NOT STARTED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
}

/** 6, 7, 8 — bootstrap authority: TTL, P01/P02, Studio eligibility, clone rules. */
function checkBootstrapAuthority(rootDir, fail) {
  requireAll(
    rootDir,
    'openUseCase',
    [
      [/SESSION_TTL_DAYS = 30/, 'the 30-day TTL is not fixed'],
      [
        /published\.template\.productId === scope\.productId/,
        'clone scope equality on Product is gone',
      ],
      [
        /published\.template\.productSideId === scope\.productSideId/,
        'clone scope equality on Side is gone',
      ],
      [
        /published\.template\.embroideryAreaId === scope\.embroideryAreaId/,
        'clone scope equality on Area is gone',
      ],
      [/loadPublished\(/, 'the published-version read is gone'],
      [/documents\.validate\(/, 'the document is not validated'],
      [/secrets\.issue\(\)/, 'the secret is not minted through the issuer'],
    ],
    fail,
  );
  // No fallback from clone to blank.
  const open = code(read(rootDir, 'openUseCase') ?? '');
  if (/catch[\s\S]{0,200}openBlank\(/.test(open)) {
    fail(`${CANONICAL_FILES.openUseCase}: falls back to a blank session when a clone fails`);
  }

  requireAll(
    rootDir,
    'documentAuthority',
    [
      ['@embroidery/design-document', 'P01 is not the document authority'],
      ['@embroidery/design-engine', 'P02 is not the geometry authority'],
      [/validateDesignDocumentStructure\(/, 'P01 structure validation is gone'],
      [/validatePlacementSnapshot\(/, 'P02 placement validation is gone'],
      [/validateDocumentWithinEmbroideryArea\(/, 'P02 containment validation is gone'],
    ],
    fail,
  );
  requireAll(
    rootDir,
    'scopeResolver',
    [
      [/manifest\.studioEligible/, 'Studio eligibility is not required'],
      [/publicRead\(/, 'the public publication authority is not used'],
    ],
    fail,
  );
  if (/\bselect\b|drizzle|schema\./i.test(code(read(rootDir, 'scopeResolver') ?? ''))) {
    fail(`${CANONICAL_FILES.scopeResolver}: issues its own catalog query`);
  }
}

/** 9, 10 — secret issuance, HMAC-only persistence, cookie attributes. */
function checkCredential(rootDir, fail) {
  requireAll(
    rootDir,
    'issuer',
    [
      [/randomBytes/, 'the secret is not CSPRNG'],
      [/SESSION_SECRET_BYTES = 32/, 'the secret is not 256 bits'],
      [/verifier\.digest\(rawSecret\)/, 'the digest is not the B06A verifier'],
    ],
    fail,
  );
  requireAll(
    rootDir,
    'cookies',
    [
      [/serializeSessionCookie/, 'there is no issuance helper'],
      [/expiresAt\.getTime\(\) - now\.getTime\(\)/, 'Max-Age is not derived from the expiry'],
      [/'HttpOnly'/, 'HttpOnly is gone'],
      [/'SameSite=Lax'/, 'SameSite=Lax is gone'],
      [/__Host-nettheu_ds_/, 'the locked prefix is gone'],
    ],
    fail,
  );
  if (/Domain=/.test(code(read(rootDir, 'cookies') ?? ''))) {
    fail(`${CANONICAL_FILES.cookies}: a Domain attribute breaks the __Host- prefix`);
  }
  // The snapshot must never carry the credential.
  const snapshot = code(read(rootDir, 'snapshot') ?? '');
  for (const leak of ['secret', 'Hash', 'pepper', 'cookie']) {
    if (new RegExp(`readonly [a-zA-Z]*${leak}`, 'i').test(snapshot)) {
      fail(`${CANONICAL_FILES.snapshot}: the returned snapshot exposes ${leak}`);
    }
  }
}

/** 11 — rotation is atomic, and changes neither TTL nor revision. */
function checkRotation(rootDir, fail) {
  const repository = code(read(rootDir, 'repository') ?? '');
  const method = /async rotateSecret\([\s\S]*?\n  \}/.exec(repository)?.[0] ?? '';
  if (method === '') {
    fail(`${CANONICAL_FILES.repository}: rotateSecret is not implemented`);
    return;
  }
  for (const [pattern, what] of [
    [/eq\(designSessions\.sessionSecretHash, input\.expectedSecretHash\)/, 'the old-digest guard'],
    [/eq\(designSessions\.status, 'ACTIVE'\)/, 'the ACTIVE predicate'],
    [/gt\(designSessions\.expiresAt/, 'the expiry predicate'],
    [/sessionSecretHash: input\.nextSecretHash/, 'the replacement digest'],
  ]) {
    if (!pattern.test(method))
      fail(`${CANONICAL_FILES.repository}: rotateSecret is missing ${what}`);
  }
  // The SET must not touch the TTL or the document.
  const set = /\.set\(\{[\s\S]*?\}\)/.exec(method)?.[0] ?? '';
  for (const forbidden of ['expiresAt', 'autosaveRevision', 'designDocument']) {
    if (set.includes(forbidden)) {
      fail(`${CANONICAL_FILES.repository}: rotateSecret writes ${forbidden}`);
    }
  }
  requireAll(
    rootDir,
    'resumeUseCase',
    [
      [/rotateSecret\(/, 'resume does not rotate'],
      [
        /expectedSecretHash: current\.sessionSecretHash/,
        'rotation is not guarded on the current digest',
      ],
    ],
    fail,
  );
}

/** 12 — the Catalog read boundary, and Design's side of it. */
function checkBoundary(rootDir, fail) {
  const designModule = code(read(rootDir, 'designModule') ?? '');
  const readModule = code(read(rootDir, 'readModule') ?? '');
  const placementModule = code(read(rootDir, 'placementModule') ?? '');

  if (/\bCatalogPlacementModule\b/.test(designModule)) {
    fail(`${CANONICAL_FILES.designModule}: imports the controller-bearing placement module`);
  }
  if (!/CatalogPlacementReadModule/.test(designModule)) {
    fail(`${CANONICAL_FILES.designModule}: does not import the provider-only read module`);
  }
  if (!/CatalogPlacementReadModule/.test(placementModule)) {
    fail(`${CANONICAL_FILES.placementModule}: does not import the read module`);
  }
  if (/controllers\s*:|@Controller\(/.test(readModule)) {
    fail(`${CANONICAL_FILES.readModule}: the read boundary must have no controller`);
  }
  for (const leaked of ['IdentityModule', 'AuditModule', 'AssetModule', 'DesignModule']) {
    if (new RegExp(`\\b${leaked}\\b`).test(readModule)) {
      fail(`${CANONICAL_FILES.readModule}: leaks ${leaked} into the read boundary`);
    }
  }
  if (!/exports:[\s\S]*ProductPlacementQuery/.test(readModule)) {
    fail(`${CANONICAL_FILES.readModule}: does not export the placement query`);
  }
  // Exactly one query authority: the placement module must no longer provide it.
  if (/providers:[\s\S]*\bProductPlacementQuery\b[\s\S]*?\]/.test(placementModule)) {
    fail(`${CANONICAL_FILES.placementModule}: still provides a second placement query`);
  }
  const query = code(read(rootDir, 'placementQuery') ?? '');
  if (!/async publicRead\(slug: string\)/.test(query)) {
    fail(`${CANONICAL_FILES.placementQuery}: the public read semantics changed`);
  }
}

/** 13 — wiring, environment and the boundaries B07 must not cross. */
function checkWiringAndBoundaries(rootDir, fail) {
  if (!/DesignModule/.test(code(read(rootDir, 'appModule') ?? ''))) {
    fail(`${CANONICAL_FILES.appModule}: DesignModule is not composed`);
  }
  if (!/DESIGN_SESSION_SECRET_PEPPER/.test(read(rootDir, 'envExample') ?? '')) {
    fail(`${CANONICAL_FILES.envExample}: the pepper variable is not documented`);
  }
  if (!/applyGenerationDesignSessionEnv/.test(code(read(rootDir, 'generationEnv') ?? ''))) {
    fail(`${CANONICAL_FILES.generationEnv}: the generation placeholder wiring is gone`);
  }

  // No Asset, upload, event or autosave behaviour anywhere in the B07 files.
  for (const key of [
    'controller',
    'openUseCase',
    'resumeUseCase',
    'scopeResolver',
    'documentAuthority',
  ]) {
    const body = code(read(rootDir, key) ?? '');
    for (const [pattern, what] of [
      [/busboy|multipart/i, 'upload parsing'],
      [/ObjectStorage|presign/i, 'object storage'],
      [/outbox|\.requested'/i, 'an event append'],
      [/saveDocument\(/, 'autosave'],
    ]) {
      if (pattern.test(body)) fail(`${CANONICAL_FILES[key]}: contains ${what}`);
    }
  }

  const manifest = read(rootDir, 'rootManifest');
  if (manifest !== undefined) {
    const scripts = Object.keys(JSON.parse(manifest).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts.length} root scripts, expected ${ROOT_SCRIPTS}`);
    }
  }
  const api = read(rootDir, 'apiManifest');
  if (api !== undefined) {
    const deps = JSON.parse(api).dependencies ?? {};
    if (deps['@embroidery/design-document'] !== 'workspace:*') {
      fail('apps/api/package.json: the design-document workspace link is missing');
    }
    for (const name of Object.keys(deps)) {
      if (!name.startsWith('@embroidery/') && /cookie|csrf|uuid|nanoid/i.test(name)) {
        fail(`apps/api/package.json: an external dependency was added (${name})`);
      }
    }
  }
  const migrations = join(rootDir, 'packages/database/migrations');
  if (existsSync(migrations)) {
    const count = readdirSync(migrations).filter((name) => name.endsWith('.sql')).length;
    if (count !== MIGRATIONS) {
      fail(`packages/database/migrations: ${count} migrations, expected ${MIGRATIONS}`);
    }
  }
  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-B07',
    'CMD-TEST-APP3-B07',
    'CMD-TEST-APP3-B07-API',
    'CMD-TEST-APP3-B07-INTEGRATION',
  ]) {
    if (!index.includes(`\`${id}\``)) {
      fail(`${CANONICAL_FILES.commandIndex}: ${id} is not indexed`);
    }
  }
}

/** 14 — evidence exists and file sizes hold. */
function checkEvidence(rootDir, fail) {
  for (const key of ['unitSpec', 'liveSpec', 'boundarySpec']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }
  for (const [key, cap] of [
    ['controller', SRC_LIMIT],
    ['openUseCase', SRC_LIMIT],
    ['request', SRC_LIMIT],
    ['unitSpec', TEST_LIMIT],
    ['liveSpec', TEST_LIMIT],
    ['tools/check-app3-b07.mjs', SOFT_CHECKER],
    ['tools/check-app3-b07.test.mjs', SOFT_TEST],
  ]) {
    const text = read(rootDir, key);
    if (text === undefined) {
      fail(`${CANONICAL_FILES[key] ?? key}: missing`);
      continue;
    }
    const lines = text.split('\n').length;
    if (lines > cap) fail(`${CANONICAL_FILES[key] ?? key}: ${lines} lines, above ${cap}`);
  }
  const report = read(rootDir, 'report');
  if (report !== undefined) {
    for (const [pattern, what] of [
      [/command ledger/i, 'the command ledger'],
      [/openapi:generate/i, 'the canonical generation count'],
      [/API_DESIGN_DOCUMENT_WORKSPACE_LINK/, 'the retained deviations'],
    ]) {
      if (!pattern.test(report)) fail(`${CANONICAL_FILES.report}: does not record ${what}`);
    }
  }
}

export function checkApp3B07(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkStatus(rootDir, fail);
  checkSurface(rootDir, fail);
  checkRequestContract(rootDir, fail);
  checkBootstrapAuthority(rootDir, fail);
  checkCredential(rootDir, fail);
  checkRotation(rootDir, fail);
  checkBoundary(rootDir, fail);
  checkWiringAndBoundaries(rootDir, fail);
  checkEvidence(rootDir, fail);
  for (const violation of checkApp3B06A(rootDir)) fail(`APP3-B06A regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3B07(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b07 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b07 — a Design Session opens on an exactly-resolved public placement and nowhere ' +
      'else: Studio eligibility is required rather than mere publication, the scope comes from the ' +
      'one Catalog query authority through a provider-only read boundary that Design imports ' +
      'without ever importing the controller-bearing module, and the blank document is validated ' +
      'by P01 and P02 rather than trusted for being empty; a clone is a deep copy of a published ' +
      'version scoped to that same triple, with lineage stamped and no live reference, and there ' +
      'is no fallback to blank; the secret is 256 CSPRNG bits digested by the B06A verifier, ' +
      'persisted only as an HMAC and returned only in a __Host- cookie whose Max-Age tracks the ' +
      'fixed 30-day expiry; resume rotates under an old-digest guard so exactly one racing caller ' +
      'wins and the loser is refused, writing neither the TTL nor the document; and no Asset, ' +
      'upload, event, autosave, migration, external dependency or root script was added',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
