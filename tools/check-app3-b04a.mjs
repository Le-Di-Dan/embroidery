#!/usr/bin/env node
/**
 * `APP3-B04A` — `TR-LC24-06`, the Design Template restore.
 *
 * One operation, and nearly everything worth a machine here is a **boundary**.
 * The rules that matter are the ones that stay green while being wrong, and
 * every one of these ships a working endpoint: a restore that also **publishes**
 * (`ARCHIVED → PUBLISHED` is not a transition LC-24 recognises, and a template
 * that skipped GRD-T01 on the way back to public is a published template nobody
 * validated); one that **keeps** `archived_at`, so the row reads `DRAFT` while
 * every query asking the marker still calls it archived; one that **moves the
 * counter**, creates a version or repairs a scope, each silently rewriting
 * retained data the Admin expected to find intact; one that runs the
 * **publication guard**, which would refuse to rescue exactly the template that
 * needs rescuing; and a transition whose Audit row can commit separately from it.
 *
 * The request/response contract and the controller-split rules live in the two
 * companion modules beside this one.
 *
 * This gate does not read the completion report. A report is a claim; every fact
 * below is recomputed from the repository. Read-only, cross-platform pure Node.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkClientBoundary as checkContractClientBoundary,
  checkRequestContract as checkContractRequestBody,
} from './check-app3-b04a-contract.mjs';
import {
  checkOperationIdStability as checkSplitOperationIds,
  checkSurfaceFileSizes,
} from './check-app3-b04a-split.mjs';
import {
  acceptedAdminTemplateOperationCount,
  acceptedSurface,
  readAdminTemplateAdapter,
  readAdminTemplateControllers,
  readAdminTemplateLifecycleController,
  restoreAdminTemplatePath,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

export const RESTORE_ROUTE = restoreAdminTemplatePath();
export const RESTORE_OPERATION_ID = 'adminDesignTemplate_restore';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  curatedClient: 'packages/api-client/src/index.ts',
  rootPackage: 'package.json',
  useCase: `${DESIGN}/application/design-template-lifecycle.use-case.ts`,
  guard: `${DESIGN}/application/template-publication.authority.ts`,
  recorder: `${DESIGN}/application/design-template-audit.recorder.ts`,
  request: `${DESIGN}/presentation/schemas/admin-design-template.request.ts`,
  repository: `${DESIGN}/domain/repositories/design-template.repository.ts`,
  module: `${DESIGN}/design-template-admin.module.ts`,
  operationIds: 'apps/api/src/openapi/operation-id.ts',
  unitSpec: `${DESIGN}/design-template-restore.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-template-restore.integration.spec.ts',
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

/** The body of one method, so a rule cannot be satisfied by a sibling. */
function methodBody(source, name) {
  return new RegExp(`async ${name}\\(([\\s\\S]*?)\\n  }\\n`).exec(source)?.[1];
}

/** Predecessors, and the routing ruling that gave this checkpoint its scope. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B03 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B03A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B03B = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B04 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G02 = COMPLETE — REVIEW_ACCEPTED',
    'B04_LIFECYCLE_ROUTING_RULING = RESTORE_SPLIT_TO_APP3_B04A',
    'APP3-B04A OPERATION_ID = adminDesignTemplate_restore',
    'APP3-B04A TRANSITION = TR-LC24-06',
    'APP3-B04A SOURCE_STATE = ARCHIVED_ONLY',
    'APP3-B04A PUBLISH_GUARD = NONE',
    'APP3-B04A VERSIONS_CREATED = NONE',
    'APP3-B04A EVENTS = NONE',
    'APP3-B04A CASCADE = NONE',
    'APP3-B04A MIGRATION = NONE',
  ]) {
    // The token, with an optional explanatory tail after an em dash — the form
    // the rest of this status block already uses. Matching the whole line would
    // make the gate refuse a record that merely explained itself.
    const token = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\n${token}(\\n| —)`).test(phase)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  // The `archived_at` ruling, and the canonical sentence it rests on. Recorded
  // so a later reader finds the authority without opening a completion report.
  if (!/\nAPP3-B04A ARCHIVED_AT = CLEARED/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: does not record that restore clears the archive marker`);
  }
}

/** Exactly one new operation, at the pre-authorised route and id. */
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

  const restore = document.paths?.[RESTORE_ROUTE];
  if (restore === undefined) {
    fail(`${CANONICAL_FILES.openapi}: does not publish ${RESTORE_ROUTE}`);
    return;
  }
  // A command, not a resource: one verb and no sibling that could restore by
  // another name.
  if (Object.keys(restore).join(',') !== 'post') {
    fail(`${CANONICAL_FILES.openapi}: ${RESTORE_ROUTE} carries ${Object.keys(restore).join(',')}`);
  }
  if (restore.post?.operationId !== RESTORE_OPERATION_ID) {
    fail(
      `${CANONICAL_FILES.openapi}: ${RESTORE_ROUTE} publishes "${restore.post?.operationId}", expected "${RESTORE_OPERATION_ID}"`,
    );
  }
  const success = JSON.stringify(
    restore.post?.responses?.['200']?.content?.['application/json']?.schema ?? {},
  );
  if (!success.includes('AdminDesignTemplateDetailResponse')) {
    fail(
      `${CANONICAL_FILES.openapi}: ${RESTORE_ROUTE} does not answer the Admin detail projection`,
    );
  }
  const body = JSON.stringify(
    restore.post?.requestBody?.content?.['application/json']?.schema ?? {},
  );
  if (!body.includes('RestoreDesignTemplateBody')) {
    fail(`${CANONICAL_FILES.openapi}: ${RESTORE_ROUTE} takes no published restore body`);
  }

  // Exactly one Admin Template operation more than the world before it, counted
  // from the shared path authority rather than a literal.
  const templateOperations = Object.entries(document.paths ?? {})
    .filter(([route]) => route.startsWith('/api/admin/design-templates'))
    .flatMap(([, methods]) => Object.keys(methods)).length;
  const expected = acceptedAdminTemplateOperationCount(rootDir);
  if (templateOperations !== expected) {
    fail(
      `${CANONICAL_FILES.openapi}: ${templateOperations} admin design-template operations, expected ${String(expected)}`,
    );
  }

  // No second way out of ARCHIVED, under any name.
  for (const alias of ['unarchive', 'restore-and-publish', 'republish', 'undelete']) {
    if (Object.keys(document.paths ?? {}).some((route) => route.includes(alias))) {
      fail(`${CANONICAL_FILES.openapi}: publishes a "${alias}" route — restore has no alias`);
    }
  }
}

/** The published request/response contract — see `check-app3-b04a-contract.mjs`. */
export function checkClientBoundary(rootDir, fail) {
  checkContractClientBoundary((key) => read(rootDir, key), fail, CANONICAL_FILES, rootDir);
}

export function checkRequestContract(rootDir, fail) {
  checkContractRequestBody((key) => read(rootDir, key), fail, CANONICAL_FILES);
}
/** The compare-and-set, and everything the transition preserves. */
export function checkTransition(rootDir, fail) {
  const adapter = readAdminTemplateAdapter(rootDir);
  const repository = read(rootDir, 'repository') ?? '';
  if (adapter === undefined) {
    fail('the Design Template adapter surface is missing a file');
    return;
  }
  if (!/\brestore\s*\(/.test(repository)) {
    fail(`${CANONICAL_FILES.repository}: no restore seam is declared on the port`);
  }

  const restore = methodBody(adapter, 'restore');
  if (restore === undefined) {
    fail('the Design Template adapter: the restore transition is not identifiable');
    return;
  }
  // `ARCHIVED` alone. Any second source state would make some other transition
  // reachable through this one.
  if (!/\['ARCHIVED'\]/.test(restore)) {
    fail('the Design Template adapter: restore does not constrain its source to ARCHIVED');
  }
  if (!/status: 'DRAFT'/.test(restore)) {
    fail('the Design Template adapter: restore does not land in DRAFT');
  }
  // The whole point of the transition: the current archive marker is cleared.
  if (!/archivedAt: null/.test(restore)) {
    fail('the Design Template adapter: restore does not clear archived_at');
  }
  // Never in the SET — the retained counter and the retained stamps are what
  // come back, and a transition that moved either would rewrite history.
  for (const [pattern, complaint] of [
    [/currentVersion:/, 'moves current_version'],
    [/publishedAt/, 'touches a publication stamp'],
    [/productId|productSideId|embroideryAreaId/, 'repairs the scope'],
    [/designTemplateVersions|designTemplateAssets/, 'reaches a version or association row'],
  ]) {
    if (pattern.test(restore)) fail(`the Design Template adapter: restore ${complaint}`);
  }

  // The shared compare-and-set restore delegates to, asserted where it lives.
  const transition = /private async transition\(([\s\S]*?)\n  }\n/.exec(adapter);
  if (transition === null) {
    fail('the Design Template adapter: the shared lifecycle transition is not identifiable');
  } else {
    if (!/inArray\(designTemplates\.status, \[\.\.\.from\]\)/.test(transition[1])) {
      fail('the Design Template adapter: a transition does not constrain the source state');
    }
    if (
      !/eq\(designTemplates\.currentVersion, input\.expectedCurrentVersion\)/.test(transition[1])
    ) {
      fail('the Design Template adapter: a transition does not compare-and-set on current_version');
    }
  }
  if (/\.delete\(/.test(adapter)) {
    fail('the Design Template adapter: deletes rows — restore is never a delete');
  }
}

/** No publication guard, no cascade, and nothing created. */
export function checkUseCase(rootDir, fail) {
  const useCase = read(rootDir, 'useCase') ?? '';
  const restore = methodBody(useCase, 'restore');
  if (restore === undefined) {
    fail(`${CANONICAL_FILES.useCase}: restore is not implemented`);
    return;
  }
  if (!/status !== 'ARCHIVED'/.test(restore)) {
    fail(`${CANONICAL_FILES.useCase}: restore does not refuse a non-ARCHIVED source`);
  }
  // GRD-T01 is publication's. A restore that had to be publishable could never
  // rescue the template that most needs restoring.
  for (const [pattern, complaint] of [
    [/this\.publication/, 'runs the publication guard'],
    [
      /saveDraftVersion\(|publishVersion\(|publishCurrentVersion\(/,
      'creates or publishes a version',
    ],
    [/ensureAssetAssociation\(|attachAsset\(/, 'mutates a Template Asset association'],
    [/prepareDesignDocument\(|validateDesignDocument/, 'touches the document'],
    [/OutboxEventStore|outbox/i, 'appends an outbox event'],
    [/session|clone|snapshot|lineage/i, 'reaches a Design Session, clone or snapshot'],
    [/productSideId:|embroideryAreaId:|productId:/, 'repairs the scope'],
  ]) {
    if (pattern.test(restore)) fail(`${CANONICAL_FILES.useCase}: restore ${complaint}`);
  }
  // A zero-version header restores: the counter is carried, never required.
  if (!/version: template\.currentVersion/.test(restore)) {
    fail(`${CANONICAL_FILES.useCase}: restore does not carry the retained counter`);
  }
  // The one transition LC-24 refuses.
  if (/from: 'ARCHIVED',\s*\n\s*to: '(?!DRAFT)/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: a transition leaves ARCHIVED for something other than DRAFT`);
  }
}

/** One bounded reason-bearing row, atomic with the transition. */
export function checkAudit(rootDir, fail) {
  const recorder = read(rootDir, 'recorder') ?? '';
  const useCase = read(rootDir, 'useCase') ?? '';

  if (!recorder.includes("RESTORED: 'design_template.restored'")) {
    fail(`${CANONICAL_FILES.recorder}: does not record design_template.restored`);
  }
  // A fourth *distinct* action: an operator must be able to tell a template that
  // came back from retirement from one merely taken off the storefront.
  const actions = [
    ...recorder.matchAll(/'design_template\.(published|unpublished|archived|restored)'/g),
  ];
  if (new Set(actions.map((match) => match[1])).size !== 4) {
    fail(`${CANONICAL_FILES.recorder}: the four lifecycle actions are not four distinct codes`);
  }

  const restore = methodBody(useCase, 'restore');
  if (restore === undefined) return;
  const transaction = restore.indexOf('runInTransaction');
  const restored = restore.indexOf('this.templates.restore(');
  const audited = restore.indexOf('recordLifecycle');
  if (transaction === -1 || restored === -1 || audited === -1) {
    fail(
      `${CANONICAL_FILES.useCase}: restore does not write its transition and audit row together`,
    );
  } else if (!(transaction < restored && restored < audited)) {
    fail(`${CANONICAL_FILES.useCase}: the restore audit row is not written inside the transition`);
  }
  if (!/reason: command\.reason/.test(restore)) {
    fail(`${CANONICAL_FILES.useCase}: restore does not carry its reason into the audit row`);
  }
  for (const leak of ['designDocument', 'storageKey', 'assetId']) {
    if (new RegExp(`summary:[\\s\\S]{0,200}${leak}`).test(recorder)) {
      fail(`${CANONICAL_FILES.recorder}: the lifecycle summary carries "${leak}"`);
    }
  }
}

/**
 * The operation ids the controller split could have renamed, delegated to the
 * module that owns the split rules — see `check-app3-b04a-split.mjs`.
 */
export function checkOperationIdStability(rootDir, fail) {
  checkSplitOperationIds(
    (key) => read(rootDir, key),
    openapi(rootDir),
    fail,
    CANONICAL_FILES.operationIds,
  );
}
/** No migration, no dependency, no frontend or worker change — and file sizes. */
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

  for (const key of ['useCase', 'unitSpec', 'liveSpec', 'request', 'recorder']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }

  // The file-size debt this checkpoint was authorised to close
  // (`FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`). Measured, never asserted from the
  // follow-up own wording.
  checkSurfaceFileSizes((relative) => read(rootDir, relative), fail);
  // Both controllers wired, or the operation cannot be resolved at runtime.
  const module = read(rootDir, 'module') ?? '';
  for (const controller of [
    'AdminDesignTemplateAuthoringController',
    'AdminDesignTemplateLifecycleController',
  ]) {
    if (!new RegExp(`controllers:[\\s\\S]{0,200}${controller}`).test(module)) {
      fail(`${CANONICAL_FILES.module}: does not register ${controller}`);
    }
  }

  const controllers = readAdminTemplateControllers(rootDir) ?? '';
  if (
    !/@Post\(':templateId\/restore'\)\s*\n\s*@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/.test(
      controllers,
    )
  ) {
    fail('the Admin Design Template controllers: the restore route is not a guarded Admin write');
  }
  // The route belongs with the other transitions, not on the authoring surface.
  if (
    !/@Post\(':templateId\/restore'\)/.test(readAdminTemplateLifecycleController(rootDir) ?? '')
  ) {
    fail('the restore route is not on the lifecycle controller');
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B04A',
    'CMD-TEST-APP3-B04A',
    'CMD-TEST-APP3-B04A-API',
    'CMD-TEST-APP3-B04A-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3B04A(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkClientBoundary(rootDir, fail);
  checkRequestContract(rootDir, fail);
  checkTransition(rootDir, fail);
  checkUseCase(rootDir, fail);
  checkAudit(rootDir, fail);
  checkOperationIdStability(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B04A(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b04a — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b04a — one operation, TR-LC24-06 and no fifth transition: restore accepts ' +
      'ARCHIVED alone, lands in DRAFT and clears the archive marker, under a compare-and-set on ' +
      'the source state and the expected version, so a stale token is a conflict with nothing ' +
      'written; it preserves the counter, every version, every published_at, the scope triple ' +
      'and every asset association, creates nothing, repairs no scope and cascades to no ' +
      'Session, clone or snapshot; it runs no publication guard, because GRD-T01 is ' +
      'publication’s and a restore that had to be publishable could never rescue the template ' +
      'that needs it; one bounded reason-bearing design_template.restored row commits with the ' +
      'transition or not at all, with no outbox event; the generated client publishes it while ' +
      'the curated Admin boundary deliberately does not; the controller split declares its ' +
      'operation domain, so eight accepted operation ids survive it unchanged; and every file ' +
      'on the surface is under 400 lines, with no migration, dependency or frontend change.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
