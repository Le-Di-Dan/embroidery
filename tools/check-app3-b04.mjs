#!/usr/bin/env node
/**
 * `APP3-B04` — the three LC-24 Design Template lifecycle transitions.
 *
 * The rules worth a machine are the ones that stay green while being wrong: a
 * publish guard quietly reduced to the checks that were easy, a `published_at`
 * rewritten on republication, an archive that deletes, a transition that creates
 * a version, a restore route smuggled in, or a read-then-update where a
 * compare-and-set belongs. Every one of those ships a working system.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptedSurface, isB05Delivered, publicTemplatePaths } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';
const BASE = '/api/admin/design-templates/{templateId}';

/** The three, and only three, operations this checkpoint publishes. */
export const OPERATIONS = Object.freeze({
  [`${BASE}/publish`]: 'adminDesignTemplate_publish',
  [`${BASE}/unpublish`]: 'adminDesignTemplate_unpublish',
  [`${BASE}/archive`]: 'adminDesignTemplate_archive',
});

/** `TR-LC24-06`. Routed to `APP3-B04A` before B04 began, and not delivered here. */
export const RESTORE_ROUTE = `${BASE}/restore`;

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  rootPackage: 'package.json',
  useCase: `${DESIGN}/application/design-template-lifecycle.use-case.ts`,
  guard: `${DESIGN}/application/template-publication.authority.ts`,
  recorder: `${DESIGN}/application/design-template-audit.recorder.ts`,
  request: `${DESIGN}/presentation/schemas/admin-design-template.request.ts`,
  controller: `${DESIGN}/presentation/admin-design-template.controller.ts`,
  repository: `${DESIGN}/domain/repositories/design-template.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-design-template.repository.ts`,
  module: `${DESIGN}/design-template-admin.module.ts`,
  unitSpec: `${DESIGN}/design-template-lifecycle.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-template-lifecycle.integration.spec.ts',
});

const MIGRATIONS = 'packages/database/migrations';
const EXPECTED_MIGRATIONS = 34;
const ROOT_SCRIPTS = 30;

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** Predecessors, and the routing ruling that kept this at three operations. */
function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B03A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G04 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'B04_LIFECYCLE_ROUTING_RULING = RESTORE_SPLIT_TO_APP3_B04A',
    'APP3-B04 CONCURRENCY_TOKEN = expectedCurrentVersion',
    'APP3-B04 PUBLISHED_AT = SET_ONCE_NEVER_REWRITTEN',
    'APP3-B04 VERSIONS_CREATED = NONE',
    'APP3-B04A OPERATION_ID = adminDesignTemplate_restore',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  // The successor must be recorded and unstarted: this gate proves B04 in a
  // world where restore does not exist.
  if (!/\nAPP3-B04A = (READY|BLOCKED_BY_APP3-B04) — NOT STARTED\n/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-B04A is not recorded as an unstarted successor`);
  }
}

/** Exactly three new operations, and no restore. */
export function checkSurface(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }

  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {}).length;
  const operations = Object.values(document.paths ?? {}).reduce(
    (total, methods) => total + Object.keys(methods).length,
    0,
  );
  const schemas = Object.keys(document.components?.schemas ?? {}).length;

  if (paths !== surface.paths) {
    fail(`${CANONICAL_FILES.openapi}: ${paths} paths, expected ${surface.paths}`);
  }
  if (operations !== surface.operations) {
    fail(`${CANONICAL_FILES.openapi}: ${operations} operations, expected ${surface.operations}`);
  }
  if (surface.schemas !== undefined && schemas !== surface.schemas) {
    fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${surface.schemas}`);
  }

  for (const [route, operationId] of Object.entries(OPERATIONS)) {
    const published = document.paths?.[route]?.post?.operationId;
    if (published !== operationId) {
      fail(
        `${CANONICAL_FILES.openapi}: ${route} publishes "${published}", expected "${operationId}"`,
      );
    }
    const success = document.paths?.[route]?.post?.responses?.['200'];
    const schema = JSON.stringify(success?.content?.['application/json']?.schema ?? {});
    if (!schema.includes('AdminDesignTemplateDetailResponse')) {
      fail(`${CANONICAL_FILES.openapi}: ${route} does not answer with the Admin detail projection`);
    }
  }

  if (document.paths?.[RESTORE_ROUTE] !== undefined) {
    fail(`${CANONICAL_FILES.openapi}: publishes ${RESTORE_ROUTE}, which belongs to APP3-B04A`);
  }

  const templateOperations = Object.entries(document.paths ?? {})
    .filter(([route]) => route.startsWith('/api/admin/design-templates'))
    .flatMap(([, methods]) => Object.keys(methods));
  // Three from B03, one from B03A, three here. An eighth is scope creep.
  if (templateOperations.length !== 7) {
    fail(
      `${CANONICAL_FILES.openapi}: ${templateOperations.length} admin design-template operations, expected 7`,
    );
  }

  // `APP3-B05`'s two public reads, asserted in both directions rather than
  // banned outright. Before B05 neither may exist; once the phase records it
  // accepted, a *missing* one is the failure — a flat ban would have this gate
  // refusing a route the phase already signed off, which is precisely the proxy
  // decay `APP3-B06B` recorded and `APP3-B04` had to repair.
  const publicDelivered = isB05Delivered(rootDir);
  for (const route of publicTemplatePaths()) {
    const routePublished = document.paths?.[route] !== undefined;
    if (routePublished === publicDelivered) continue;
    fail(
      routePublished
        ? `${CANONICAL_FILES.openapi}: publishes ${route}, which belongs to APP3-B05`
        : `${CANONICAL_FILES.openapi}: APP3-B05 is delivered but ${route} is missing`,
    );
  }
}

/** The bodies: one token on all three, a bounded reason on archive alone. */
export function checkRequestContract(rootDir, fail) {
  const request = read(rootDir, 'request') ?? '';

  if (!/expectedCurrentVersion: z\.number\(\)\.int\(\)\.min\(0\)/.test(request)) {
    fail(`${CANONICAL_FILES.request}: the lifecycle bodies take no non-negative expected version`);
  }
  const archiveBody = /archiveDesignTemplateBodySchema = ([\s\S]*?)\n\nexport class/.exec(request);
  if (archiveBody === null) {
    fail(`${CANONICAL_FILES.request}: the archive body schema is no longer identifiable`);
  } else {
    // Trimmed and non-empty: a blank reason satisfies "required" and none of its
    // purpose.
    if (!/reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(/.test(archiveBody[1])) {
      fail(`${CANONICAL_FILES.request}: archive does not require a bounded non-blank reason`);
    }
  }
  const lifecycleBody = /lifecycleTemplateBodySchema = ([\s\S]*?)\n\nexport class/.exec(request);
  if (lifecycleBody !== null && /reason/.test(lifecycleBody[1])) {
    // PO-03 requires a reason for archive and restore only; one on publish would
    // be evidence the server invented.
    fail(`${CANONICAL_FILES.request}: publish or unpublish accepts a reason`);
  }
  if ((request.match(/\.strict\(\)/g) ?? []).length < 5) {
    fail(`${CANONICAL_FILES.request}: a request schema stopped rejecting unknown fields`);
  }

  const document = openapi(rootDir);
  const clientSchemas = read(rootDir, 'clientSchemas') ?? '';
  if (document !== undefined) {
    for (const alias of [
      'AdminDesignTemplatePublish200',
      'AdminDesignTemplateUnpublish200',
      'AdminDesignTemplateArchive200',
    ]) {
      const match = new RegExp(`export type ${alias} = ([^;]+);`).exec(clientSchemas);
      if (match === null) {
        fail(`${CANONICAL_FILES.clientSchemas}: no generated type ${alias}`);
      } else if (/\b(void|any|unknown|object)\b|Record<string, unknown>/.test(match[1])) {
        fail(`${CANONICAL_FILES.clientSchemas}: ${alias} generates as "${match[1].trim()}"`);
      }
    }
  }
}

/** `GRD-T01` composed whole, from the authorities that own each clause. */
export function checkPublishGuard(rootDir, fail) {
  const guard = read(rootDir, 'guard') ?? '';

  for (const [call, clause] of [
    ['readSchemaVersion(', 'the document schema version'],
    ['prepareDesignDocument(', 'document structure and complexity'],
    ['validatePlacementSnapshot(', 'placement agreement'],
    ['validateDocumentWithinEmbroideryArea(', 'containment in the embroidery area'],
    ['findPlacement(', 'the product/side/area chain'],
    ['contextFor(', 'template asset eligibility'],
  ]) {
    if (!guard.includes(call)) {
      fail(`${CANONICAL_FILES.guard}: does not check ${clause} — GRD-T01 may not be reduced`);
    }
  }
  // A fresh publication must satisfy today's geometry, not the laxer rules a
  // historical render is allowed.
  if (!/'NEW_EDITING'/.test(guard)) {
    fail(`${CANONICAL_FILES.guard}: does not validate placement in NEW_EDITING mode`);
  }
  for (const [pattern, complaint] of [
    [/retiredAt !== undefined/, 'does not refuse a retired Side or Area'],
    [
      /productSideId !== side\.id|area\.productSideId !== side\.id/,
      'does not bind the Area to the Side',
    ],
  ]) {
    if (!pattern.test(guard)) fail(`${CANONICAL_FILES.guard}: ${complaint}`);
  }
  // Read-only: a guard that repairs is not a guard.
  for (const [pattern, complaint] of [
    [/\.set\(|\.insert\(|\.update\(/, 'writes'],
    [/saveDraftVersion\(|publishCurrentVersion\(/, 'performs a transition'],
    [/ObjectStorage|presign|getObject|storageKey/, 'reaches object storage'],
  ]) {
    if (pattern.test(guard)) fail(`${CANONICAL_FILES.guard}: ${complaint}`);
  }
}

/** The compare-and-set, the set-once stamp and what each transition preserves. */
export function checkTransitions(rootDir, fail) {
  const adapter = read(rootDir, 'adapter') ?? '';
  const repository = read(rootDir, 'repository') ?? '';
  const useCase = read(rootDir, 'useCase') ?? '';

  for (const method of ['publishCurrentVersion', 'unpublish', 'archive']) {
    if (!new RegExp(`${method}\\s*\\(`).test(repository)) {
      fail(`${CANONICAL_FILES.repository}: no ${method} seam is declared`);
    }
  }

  // Source state and token in the predicate, never read-then-update — and read
  // from the lifecycle `transition` body alone. `APP3-B03A`'s `saveDraftVersion`
  // carries the same token predicate, so a whole-file scan would stay green
  // while this checkpoint's own compare-and-set was removed.
  const transition = /private async transition\(([\s\S]*?)\n  }\n/.exec(adapter);
  if (transition === null) {
    fail(`${CANONICAL_FILES.adapter}: the shared lifecycle transition is no longer identifiable`);
  } else {
    if (!/inArray\(designTemplates\.status, \[\.\.\.from\]\)/.test(transition[1])) {
      fail(`${CANONICAL_FILES.adapter}: a transition does not constrain the source state`);
    }
    if (
      !/eq\(designTemplates\.currentVersion, input\.expectedCurrentVersion\)/.test(transition[1])
    ) {
      fail(`${CANONICAL_FILES.adapter}: a transition does not compare-and-set on current_version`);
    }
  }
  if (!/'STALE_WRITE'/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: a lost transition does not raise STALE_WRITE`);
  }

  // The set-once stamp, as a predicate rather than a read-and-branch.
  if (!/isNull\(designTemplateVersions\.publishedAt\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: published_at is not stamped under an IS NULL predicate`);
  }
  const publishBlock = /async publishCurrentVersion\(([\s\S]*?)\n  }\n/.exec(adapter);
  if (publishBlock !== null && /currentVersion:/.test(publishBlock[1])) {
    // Moving the counter would silently change which version is published.
    fail(`${CANONICAL_FILES.adapter}: publish moves current_version`);
  }
  const unpublishBlock = /async unpublish\(([\s\S]*?)\n  }\n/.exec(adapter);
  if (unpublishBlock !== null && /publishedAt|designTemplateVersions/.test(unpublishBlock[1])) {
    fail(`${CANONICAL_FILES.adapter}: unpublish touches a version or its publication stamp`);
  }
  if (/\.delete\(/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: deletes rows — archive is retention, never a delete`);
  }

  // The use case creates nothing and produces nothing.
  for (const [pattern, complaint] of [
    [/saveDraftVersion\(|publishVersion\(/, 'creates a version'],
    [/ensureAssetAssociation\(/, 'mutates a Template Asset association'],
    [/OutboxEventStore/, 'appends an outbox event'],
    [/prepareDesignDocument\(/, 'rewrites the document'],
  ]) {
    if (pattern.test(useCase)) fail(`${CANONICAL_FILES.useCase}: ${complaint}`);
  }
  // Translation, or a stale CAS answers 500 against a published 409.
  if (!/DESIGN_TEMPLATE_VERSION_CONFLICT/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: a stale compare-and-set is not translated to the conflict`);
  }
  // Usage, not the word: the file's own header explains where restore lives, and
  // a bare-word scan would fail on that explanation. `ARCHIVED` appearing as a
  // *source* state is what a restore implementation would need.
  if (/\basync restore\s*\(|from: 'ARCHIVED'/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: implements restore, which belongs to APP3-B04A`);
  }
}

/** One bounded audit row per transition, and a reason on archive alone. */
export function checkAudit(rootDir, fail) {
  const recorder = read(rootDir, 'recorder') ?? '';
  const useCase = read(rootDir, 'useCase') ?? '';

  for (const action of [
    "PUBLISHED: 'design_template.published'",
    "UNPUBLISHED: 'design_template.unpublished'",
    "ARCHIVED: 'design_template.archived'",
  ]) {
    if (!recorder.includes(action)) {
      fail(`${CANONICAL_FILES.recorder}: does not record ${action}`);
    }
  }
  // Bounded: the summary carries states and a version number, never a payload.
  if (!/summary: \{ from: input\.from, to: input\.to, version: input\.version \}/.test(recorder)) {
    fail(`${CANONICAL_FILES.recorder}: the lifecycle summary is not the bounded from/to/version`);
  }
  for (const leak of ['designDocument', 'storageKey', 'assetId']) {
    if (new RegExp(`summary:[\\s\\S]{0,200}${leak}`).test(recorder)) {
      fail(`${CANONICAL_FILES.recorder}: the lifecycle summary carries "${leak}"`);
    }
  }
  // Atomic: the audit call sits inside the transaction with the transition.
  const transaction = useCase.indexOf('runInTransaction');
  const audited = useCase.indexOf('recordLifecycle');
  if (transaction === -1 || audited === -1 || transaction > audited) {
    fail(`${CANONICAL_FILES.useCase}: the audit row is not written inside the transition`);
  }
  if (!/reason: command\.reason/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: archive does not carry its reason into the audit row`);
  }
}

/** No migration, no dependency, no worker or frontend change, no root script. */
export function checkBoundaries(rootDir, fail) {
  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${count} migrations, expected ${EXPECTED_MIGRATIONS}`);
  }

  const rootPackage = read(rootDir, 'rootPackage');
  if (rootPackage !== undefined) {
    const scripts = Object.keys(JSON.parse(rootPackage).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts.length} root scripts, expected ${ROOT_SCRIPTS}`);
    }
  }

  for (const key of ['useCase', 'guard', 'unitSpec', 'liveSpec']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }

  const module = read(rootDir, 'module') ?? '';
  const providers = /providers:\s*\[([\s\S]*?)\n\s*\],/.exec(module);
  if (providers === null) {
    fail(`${CANONICAL_FILES.module}: no providers array is declared`);
  } else {
    for (const provider of ['TemplatePublicationAuthority', 'DesignTemplateLifecycleUseCase']) {
      if (!providers[1].includes(provider)) {
        fail(`${CANONICAL_FILES.module}: does not provide ${provider}`);
      }
    }
  }

  const controller = read(rootDir, 'controller') ?? '';
  if (/@Post\(':templateId\/restore'\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: declares the restore route, which is APP3-B04A's`);
  }
  // Create, save, publish, unpublish, archive.
  const guards = controller.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g);
  if ((guards?.length ?? 0) !== 5) {
    fail(
      `${CANONICAL_FILES.controller}: ${String(guards?.length ?? 0)} guarded writes, expected 5`,
    );
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B04',
    'CMD-TEST-APP3-B04',
    'CMD-TEST-APP3-B04-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3B04(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkRequestContract(rootDir, fail);
  checkPublishGuard(rootDir, fail);
  checkTransitions(rootDir, fail);
  checkAudit(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B04(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b04 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b04 — three LC-24 transitions and no fourth: publish runs the whole GRD-T01 ' +
      'guard — a valid current document under APP3-P01, an active product/side/area chain, ' +
      'placement agreement and containment under APP3-P02 in NEW_EDITING mode, and every ' +
      'referenced asset editor-safe — read-only, so a template that cannot publish is left ' +
      'exactly as it was; every transition is a compare-and-set on the source state and the ' +
      'caller’s expected version, answering a stale token with a conflict and nothing written; ' +
      'published_at is stamped under an IS NULL predicate so a republication keeps the original ' +
      'timestamp; unpublish touches the header alone and archive deletes and cascades nothing; ' +
      'no version is created, no association mutated and no event appended; and restore stays ' +
      'APP3-B04A’s — with no migration, no dependency, no worker or frontend change and no root ' +
      'script.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
