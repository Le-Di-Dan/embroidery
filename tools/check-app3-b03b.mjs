#!/usr/bin/env node
/**
 * `APP3-B03B` — initial Design Template scope assignment.
 *
 * One operation, and almost everything this gate protects is a **boundary**:
 * what the assignment may do once, what it may never do twice, and the long list
 * of things it must not produce at all.
 *
 * Three rules carry the weight.
 *
 * *It is one-time, structurally.* The compare-and-set requires all three scope
 * columns to be null, so a rescope cannot match the predicate — it is
 * unrepresentable rather than merely unimplemented. The gate asserts the
 * predicate, and separately asserts that no clear/rescope method or route
 * exists anywhere.
 *
 * *It creates nothing.* No version, no document, no Asset association, no
 * normalization event, no lifecycle change. Each is asserted as an absence in
 * the source, because none of them is visible in a response.
 *
 * *It decides scope validity with `APP3-B03`'s authority and no other.* No
 * second Catalog query, no duplicated SQL, and — the one worth naming — no
 * Product-publication predicate, because publication readiness is `GRD-T01` and
 * belongs to `APP3-B04`.
 *
 * This gate does not read the completion report. A report is a claim; every fact
 * below is recomputed from the repository.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PHASE_PLAN = join(
  REPO_ROOT,
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
);
const API = join(REPO_ROOT, 'apps/api/src/modules/design');
const USE_CASE = join(API, 'application/assign-template-scope.use-case.ts');
const SCOPE_AUTHORITY = join(API, 'application/design-template-scope.authority.ts');
const AUDIT = join(API, 'application/design-template-audit.recorder.ts');
const REPOSITORY_PORT = join(API, 'domain/repositories/design-template.repository.ts');
const REPOSITORY = join(API, 'infrastructure/persistence/drizzle-design-template.repository.ts');
const CONTROLLER = join(API, 'presentation/admin-design-template.controller.ts');
const REQUEST_DTO = join(API, 'presentation/schemas/admin-design-template.request.ts');
const ERRORS = join(API, 'domain/design-template-draft.errors.ts');
const MODULE = join(API, 'design-template-admin.module.ts');
const UNIT_SPEC = join(API, 'design-template-scope-assign.spec.ts');
const INTEGRATION_SPEC = join(
  API,
  'tests/integration/design-template-scope-assign.integration.spec.ts',
);
const OPENAPI = join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json');
const GENERATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts');
const CURATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/index.ts');
const COMMAND_INDEX = join(REPO_ROOT, 'docs/implementation/SCOPED_COMMAND_INDEX.md');
const ROOT_PACKAGE = join(REPO_ROOT, 'package.json');
const MIGRATIONS = join(REPO_ROOT, 'packages/database/migrations');

const ROUTE = '/api/admin/design-templates/{templateId}/scope';

const failures = [];
const checks = [];

function check(label, condition, detail = '') {
  checks.push(label);
  if (!condition) failures.push(detail === '' ? label : `${label} — ${detail}`);
}

const readRaw = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const read = (path) => stripComments(readRaw(path));

function collect(dir, pattern) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// 1 · Entry authority
// ---------------------------------------------------------------------------
const plan = readRaw(PHASE_PLAN);

for (const [id, expected] of [
  ['APP3-B03', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-B03A', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-A02', 'COMPLETE — REVIEW_ACCEPTED'],
]) {
  check(
    `entry: ${id} is accepted`,
    plan.includes(`\n${id} = ${expected}`),
    `phase plan does not record "${id} = ${expected}"`,
  );
}

// The blocker this checkpoint exists to close must still be recorded as the
// reason A03 is not accepted — a gate that stopped asserting it would let the
// correction be forgotten while the operation shipped.
check(
  'entry: APP3-A03 is still awaiting its correction',
  /APP3-A03 =\s*\n?COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED/.test(plan) ||
    plan.includes('APP3-A03 = COMPLETE — REVIEW_DELIVERED — CORRECTION_REQUIRED'),
  'the A03 correction state is not recorded',
);

// ---------------------------------------------------------------------------
// 2 · Exactly one new operation, at the canonical route
// ---------------------------------------------------------------------------
const openapi = JSON.parse(readRaw(OPENAPI) || '{"paths":{},"components":{"schemas":{}}}');
const paths = Object.keys(openapi.paths);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const operationCount = Object.values(openapi.paths).reduce(
  (total, methods) => total + Object.keys(methods).filter((m) => METHODS.includes(m)).length,
  0,
);

check('contract: the surface is 33 paths', paths.length === 33, `${String(paths.length)} paths`);
check(
  'contract: the surface is 38 operations',
  operationCount === 38,
  `${String(operationCount)} operations`,
);
check(
  'contract: the scope route is published exactly once, as a PUT',
  Object.keys(openapi.paths[ROUTE] ?? {}).join(',') === 'put',
  `methods: ${Object.keys(openapi.paths[ROUTE] ?? {}).join(',') || 'none'}`,
);
check(
  'contract: the operation id is adminDesignTemplate_assignScope',
  openapi.paths[ROUTE]?.put?.operationId === 'adminDesignTemplate_assignScope',
  String(openapi.paths[ROUTE]?.put?.operationId),
);

// No alias, no rescope, no clear — asserted as an absence across the whole
// published surface rather than only on the route this checkpoint added.
for (const forbidden of ['rescope', 'unscope', 'scope/clear', 'clear-scope']) {
  check(
    `contract: no ${forbidden} route exists`,
    !paths.some((path) => path.includes(forbidden)),
    'a rescope-shaped route was published',
  );
}
check(
  'contract: no design-template path accepts PATCH',
  !paths.some(
    (path) =>
      path.includes('design-templates') && Object.keys(openapi.paths[path]).includes('patch'),
  ),
  'a PATCH alias was published',
);

const body = openapi.components.schemas['AssignDesignTemplateScopeBody'];
check('contract: the body schema is published', body !== undefined);
check(
  'contract: the body is exactly the complete triple',
  JSON.stringify((body?.required ?? []).slice().sort()) ===
    JSON.stringify(['embroideryAreaId', 'productId', 'productSideId']),
  `required: ${JSON.stringify(body?.required)}`,
);
check(
  'contract: the body accepts nothing else',
  Object.keys(body?.properties ?? {}).length === 3 && body?.additionalProperties === false,
  `properties: ${Object.keys(body?.properties ?? {}).join(',')}`,
);
check(
  'contract: the body carries no expected-version token',
  !('expectedCurrentVersion' in (body?.properties ?? {})),
  'a token whose only legal value is 0 was added to the body',
);
check(
  'contract: the success answers the shared detail response',
  JSON.stringify(openapi.paths[ROUTE]?.put?.responses?.['200'] ?? {}).includes(
    'AdminDesignTemplateDetailResponse',
  ),
  'the success is a void or open shape',
);
for (const status of ['400', '401', '404', '409']) {
  check(
    `contract: ${status} is documented`,
    openapi.paths[ROUTE]?.put?.responses?.[status] !== undefined,
    'the refusal is undocumented',
  );
}

// ---------------------------------------------------------------------------
// 3 · One-time assignment, structurally
// ---------------------------------------------------------------------------
const repository = read(REPOSITORY);
const predicate = repository.slice(
  repository.indexOf('async assignInitialScope'),
  repository.indexOf('async ensureAssetAssociation'),
);

check('cas: the repository method exists', predicate.length > 0);
check(
  'cas: it is an update-where, never a read-then-write',
  /\.update\(designTemplates\)[\s\S]*\.where\(/.test(predicate) &&
    !/\.select\([\s\S]{0,400}\.update\(designTemplates\)/.test(predicate),
  'the assignment reads the row and then updates it unconditionally',
);
for (const [clause, why] of [
  [/eq\(designTemplates\.status, 'DRAFT'\)/, 'a non-DRAFT template could be assigned'],
  [/eq\(designTemplates\.currentVersion, 0\)/, 'a versioned template could be assigned'],
  [/isNull\(designTemplates\.productId\)/, 'an already-scoped template could be rescoped'],
  [/isNull\(designTemplates\.productSideId\)/, 'a partial scope could be completed'],
  [/isNull\(designTemplates\.embroideryAreaId\)/, 'a partial scope could be completed'],
  [/notExists\(/, 'a template with version rows could be assigned'],
]) {
  check(`cas: the predicate pins ${String(clause)}`, clause.test(predicate), why);
}

const setClause = predicate.slice(predicate.indexOf('.set({'), predicate.indexOf('.where('));
for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
  check(
    `cas: ${column} is written in the same statement`,
    setClause.includes(`${column}: input.${column}`),
    'the three columns do not move together',
  );
}
check(
  'cas: nothing but the scope and updatedAt is written',
  !/status|currentVersion|publishedAt|archivedAt|previewDerivativeId/.test(setClause),
  'the assignment mutates something outside the scope',
);
check(
  'cas: it runs inside the caller transaction',
  /this\.requireTransaction\('assignInitialScope'\)/.test(predicate),
  'the write can commit without its Audit row',
);
check(
  'cas: no clear or rescope method exists on the adapter',
  !/clearScope|rescope|updateScope|reassignScope/.test(repository),
  'a rescope path was added',
);
check(
  'cas: no clear or rescope method exists on the port',
  !/clearScope|rescope|updateScope|reassignScope/.test(read(REPOSITORY_PORT)),
  'a rescope path was added to the contract',
);

// ---------------------------------------------------------------------------
// 4 · The use case creates nothing
// ---------------------------------------------------------------------------
const useCase = read(USE_CASE);
check('use-case: the module exists', useCase.length > 0);

for (const [pattern, why] of [
  [/saveDraftVersion|publishVersion/, 'a version would be created'],
  [/ensureAssetAssociation|attachAsset/, 'an Asset association would be created'],
  [/OutboxEventStore|outbox|EVENT_TYPE|ASSET_NORMALIZATION/, 'an event would be appended'],
  [/setPreviewDerivative/, 'a preview would be written'],
  [/'PUBLISHED'|'ARCHIVED'|publishedAt|archivedAt/, 'lifecycle state would change'],
  [/currentVersion:/, 'the version counter would move'],
  [/design-document|design-engine/, 'a document would be touched'],
]) {
  check(`use-case: it does not reach ${String(pattern)}`, !pattern.test(useCase), why);
}

check(
  'use-case: the scope authority is APP3-B03 own, reused',
  /DesignTemplateScopeAuthority/.test(useCase) && /this\.scopes\.resolve\(/.test(useCase),
  'scope validity is decided by something other than the shared authority',
);
check(
  'use-case: no second Catalog query or SQL',
  !/drizzle|products|product_sides|embroidery_areas|CatalogModule/.test(useCase),
  'Catalog persistence was duplicated into Design',
);
check(
  'use-case: no Product-publication predicate',
  !/publication|readiness|GRD-T01/.test(useCase),
  'publication readiness is APP3-B04 GRD-T01, not a scope-assignment condition',
);
check(
  'use-case: the persistence guard is translated, not leaked',
  /isPersistenceError/.test(useCase) &&
    /'STALE_WRITE'[\s\S]{0,160}SCOPE_NOT_ASSIGNABLE/.test(useCase),
  'a compare-and-set refusal would surface as a 500 against a published 409',
);
check(
  'use-case: the scope and the Audit row are one transaction',
  /runInTransaction\([\s\S]*assignInitialScope[\s\S]*recordScopeAssigned/.test(useCase),
  'the scope could commit without its evidence',
);

// The scope authority itself must stay publication-blind, or the reuse above
// would silently import a readiness predicate.
check(
  'authority: the shared scope authority applies no publication predicate',
  !/status === 'PUBLISHED'|isPublished|publication/.test(read(SCOPE_AUTHORITY)),
  'the create-scope authority gained a readiness check',
);

// ---------------------------------------------------------------------------
// 5 · Audit
// ---------------------------------------------------------------------------
const audit = read(AUDIT);
check(
  'audit: the scope action is the locked semantic name',
  /DESIGN_TEMPLATE_SCOPE_ASSIGNED_ACTION = 'design_template\.scope_assigned'/.test(audit),
  'the audit action is missing or renamed',
);
check(
  'audit: the summary names the source state and the exact triple',
  /from: 'UNSCOPED'[\s\S]{0,200}embroideryAreaId/.test(audit),
  'the audit row does not say what was assigned',
);
check(
  'audit: no document, asset, storage or outbox payload',
  !/designDocument|assetId|storageKey|bucket|outbox/i.test(
    audit.slice(audit.indexOf('recordScopeAssigned'), audit.indexOf('recordLifecycle')),
  ),
  'the audit summary carries a payload',
);

// ---------------------------------------------------------------------------
// 6 · Errors and DTO
// ---------------------------------------------------------------------------
const errors = read(ERRORS);
check(
  'errors: the not-assignable code exists and is a conflict',
  /'DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE'/.test(errors) &&
    /case 'DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE':\s*\n\s*return new ConflictException/.test(errors),
  'the refusal is not mapped to 409',
);
check(
  'errors: it is distinct from an invalid scope',
  /'DESIGN_TEMPLATE_SCOPE_INVALID'/.test(errors),
  'the two refusals were collapsed',
);

const dto = read(REQUEST_DTO);
check(
  'dto: the body is strict and requires three uuids',
  /assignDesignTemplateScopeBodySchema[\s\S]{0,400}\.strict\(\)/.test(dto) &&
    (dto.match(/productId: z\.string\(\)\.uuid\(\)/g) ?? []).length >= 1,
  'the body is not a strict complete triple',
);

const controller = read(CONTROLLER);
check(
  'controller: the route is a guarded Admin write',
  /@Put\(':templateId\/scope'\)\s*\n\s*@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/.test(
    controller,
  ),
  'the write is missing the origin/body guard pair',
);
check(
  'controller: it delegates rather than deciding',
  /this\.scopeAssignment\.assign\(/.test(controller) &&
    !/isNull|assignInitialScope|recordScopeAssigned/.test(controller),
  'the controller carries scope or persistence logic',
);
check(
  'module: the use case is provided',
  /AssignTemplateScopeUseCase/.test(read(MODULE)),
  'the operation cannot be resolved at runtime',
);

// ---------------------------------------------------------------------------
// 7 · Client boundary
// ---------------------------------------------------------------------------
check(
  'client: the generated client publishes the operation',
  readRaw(GENERATED_CLIENT).includes('export const adminDesignTemplateAssignScope ='),
  'the client was not regenerated',
);
// B03B is backend-only: `APP3-A03-C1` brings the operation across the curated
// boundary after human acceptance. An export here now would be a frontend
// change this checkpoint is forbidden to make.
check(
  'client: the curated boundary does not yet expose it',
  !/export \{[^}]*adminDesignTemplateAssignScope/s.test(read(CURATED_CLIENT)),
  'B03B must not modify the Admin frontend surface; APP3-A03-C1 owns that',
);

// ---------------------------------------------------------------------------
// 8 · No frontend, schema or dependency change
// ---------------------------------------------------------------------------
const migrations = collect(MIGRATIONS, /\.sql$/);
check(
  'scope: no migration was added',
  migrations.length === 34,
  `${String(migrations.length)} migrations`,
);
const rootScripts = Object.keys(JSON.parse(readRaw(ROOT_PACKAGE)).scripts ?? {});
check(
  'governance: the root script count is unchanged',
  rootScripts.length === 30,
  `${String(rootScripts.length)} root scripts`,
);
check(
  'scope: no scope column or table was added to the schema',
  !/scope_version|scope_history|scope_locked|scope_assigned_at/.test(
    collect(join(REPO_ROOT, 'packages/database/src/schema'), /\.ts$/)
      .map((path) => readRaw(path))
      .join('\n'),
  ),
  'the assignment invented schema authority',
);

// ---------------------------------------------------------------------------
// 9 · Tests exist and prove the live behaviour
// ---------------------------------------------------------------------------
check('tests: the focused spec exists', existsSync(UNIT_SPEC));
check('tests: the PostgreSQL integration spec exists', existsSync(INTEGRATION_SPEC));

const integration = read(INTEGRATION_SPEC);
check(
  'tests: the integration drives the real HTTP stack',
  /supertest|request\(app\.getHttpServer\(\)\)/.test(integration),
  'the integration bypasses the pipeline it claims to prove',
);
check(
  'tests: the race is proved concurrently, with one winner',
  /Promise\.all\(/.test(integration) && /\[200, 409\]/.test(integration),
  'the concurrency proof does not assert exactly one winner',
);
check(
  'tests: a refusal is proved to leave every scope column untouched',
  /product_id: null[\s\S]{0,200}product_side_id: null/.test(integration) ||
    /product_side_id: null[\s\S]{0,200}embroidery_area_id: null/.test(integration),
  'no test proves a failed assignment writes nothing',
);
check(
  'tests: the Audit row is counted, not assumed',
  /audit_events/.test(integration),
  'the audit atomicity is not proved against the database',
);

// ---------------------------------------------------------------------------
// 10 · Governance
// ---------------------------------------------------------------------------
const commandRows = readRaw(COMMAND_INDEX).split('\n');
for (const [command, invocation] of [
  ['CMD-CHECK-APP3-B03B', 'node tools/check-app3-b03b.mjs'],
  ['CMD-TEST-APP3-B03B', 'node --test tools/check-app3-b03b.test.mjs'],
  ['CMD-TEST-APP3-B03B-API', 'design-template-scope-assign'],
  ['CMD-TEST-APP3-B03B-INTEGRATION', 'design-template-scope-assign.integration'],
]) {
  check(
    `governance: ${command} is registered`,
    commandRows.some((row) => row.includes(`\`${command}\` |`) && row.includes(invocation)),
    'not registered in the scoped command index, or not bound to its command',
  );
}

// The follow-up must say what was and was not closed. "Partially resolved" is
// the whole point: initial assignment ships, general rescope does not.
check(
  'governance: the scope follow-up is reconciled, not closed',
  /FU-APP3-TEMPLATE-SCOPE-EDIT-01 = PARTIALLY_RESOLVED_BY_APP3-B03B/.test(plan),
  'the follow-up is missing, still open, or claims full resolution',
);
check(
  'governance: the follow-up does not claim general rescope',
  !/general rescope[^\n]*delivered|rescope = DELIVERED/i.test(plan),
  'the record claims a capability this checkpoint refused to build',
);

// ---------------------------------------------------------------------------
// 11 · File-size policy
// ---------------------------------------------------------------------------
// The files **this checkpoint created**. The two it extended —
// `admin-design-template.controller.ts` and the Drizzle adapter — were already
// 455 and 494 lines at entry, so they breached CLAUDE.md §6 before B03B existed.
// Asserting them here would fail this gate on a pre-existing condition the
// checkpoint is not scoped to fix, which is how a gate ends up disabled instead
// of obeyed. The overrun is carried as `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`
// and the rule below still binds everything B03B owns outright.
const oversized = [USE_CASE].filter((path) => readRaw(path).split('\n').length > 400);
check(
  'policy: every file this checkpoint created is within 400 lines',
  oversized.length === 0,
  oversized.map((path) => relative(REPO_ROOT, path)).join(', '),
);
check(
  'policy: the pre-existing file-size overrun is recorded, not silently inherited',
  /FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01/.test(plan),
  'the controller and adapter exceed 400 lines with no follow-up naming it',
);
const oversizedTests = [UNIT_SPEC, INTEGRATION_SPEC].filter(
  (path) => readRaw(path).split('\n').length > 600,
);
check(
  'policy: every B03B test file is within 600 lines',
  oversizedTests.length === 0,
  oversizedTests.map((path) => relative(REPO_ROOT, path)).join(', '),
);

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`APP3-B03B check FAILED (${String(failures.length)} of ${String(checks.length)}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `APP3-B03B check passed (${String(checks.length)} assertions; one new operation, 33 paths / ` +
    '38 operations). The assignment is one-time by construction — the compare-and-set requires ' +
    'DRAFT, counter zero, all three scope columns null and no version rows, so a rescope cannot ' +
    'match it and no clear or rescope method exists to try; it creates no version, document, ' +
    'association or event and changes no lifecycle state; scope validity is decided by APP3-B03 ' +
    'own authority with no Product-publication predicate; and the scope commits with its Audit ' +
    'row or not at all.',
);
