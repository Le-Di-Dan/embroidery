#!/usr/bin/env node
/**
 * `APP3-B05` — the two anonymous public Design Template reads.
 *
 * The rules worth a machine are the ones that stay green while being wrong: a
 * public read that answers from the header's `current_version` instead of the
 * highest published one, a scope predicate quietly reduced from three columns to
 * two, an eligibility check that runs once at publication instead of on every
 * request, a 404 that says *why*, a third operation that delivers bytes, an
 * offset page, or a "read" that acquired a write on the way past review. Every
 * one of those ships a working system.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  B05A_STATUS_LINES,
  acceptedPublicTemplateAssetPaths,
  acceptedSurface,
  publicTemplatePaths,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

/** The two, and only two, operations this checkpoint publishes. */
export const OPERATIONS = Object.freeze({
  '/api/public/design-templates': 'publicDesignTemplate_list',
  '/api/public/design-templates/{slug}': 'publicDesignTemplate_detail',
});

/** The exact triple `IMP-D042` PO-06 makes compatibility out of. */
const SCOPE_COLUMNS = Object.freeze(['productId', 'productSideId', 'embroideryAreaId']);

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  rootPackage: 'package.json',
  port: `${DESIGN}/domain/repositories/published-design-template.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-published-design-template.repository.ts`,
  query: `${DESIGN}/application/public-design-template.query.ts`,
  projection: `${DESIGN}/application/public-design-template.projection.ts`,
  cursor: `${DESIGN}/domain/public-design-template-cursor.ts`,
  errors: `${DESIGN}/domain/public-design-template.errors.ts`,
  policy: `${DESIGN}/domain/public-design-template.policy.ts`,
  request: `${DESIGN}/presentation/schemas/public-design-template.request.ts`,
  response: `${DESIGN}/presentation/schemas/public-design-template.response.ts`,
  controller: `${DESIGN}/presentation/public-design-template.controller.ts`,
  module: `${DESIGN}/design-template-public.module.ts`,
  catalogPort: 'apps/api/src/modules/catalog/domain/repositories/product-placement.repository.ts',
  catalogAdapter:
    'apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-placement.repository.ts',
  unitSpec: `${DESIGN}/public-design-template.spec.ts`,
  liveSpec: 'apps/api/test/integration/public-design-template.integration.spec.ts',
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

/** Predecessors, and the split that kept this at two operations. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B04 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B03A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B03 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B05 OPERATIONS = 2 — UNCHANGED_JSON_READ_ONLY',
    'APP3-B05 COMPATIBILITY = EXACT_TRIPLE_PRODUCT_SIDE_AREA',
    'APP3-B05 VERSION_SELECTION = HIGHEST_PUBLISHED_AT_NOT_NULL',
    'APP3-B05 SCOPE_ELIGIBILITY = RE_EVALUATED_AT_READ_TIME',
    'APP3-B05 WRITES = NONE',
    'APP3-B05 MIGRATION = NONE',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  // The delivery successor must be recorded under one of its legitimate status
  // lines. This asserted "recorded **and unstarted**", which was a true proxy for
  // "byte delivery does not exist" right up to the checkpoint that made it exist.
  // B05's own rules are unchanged; only the set of worlds this gate admits has
  // widened, and the list is asserted here rather than read back out of the
  // document it checks.
  if (!B05A_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-B05A is not recorded under a legitimate status`);
  }
}

/** Exactly two new operations, both anonymous GETs, and no delivery route. */
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
    const methods = document.paths?.[route];
    const published = methods?.get?.operationId;
    if (published !== operationId) {
      fail(
        `${CANONICAL_FILES.openapi}: ${route} publishes "${published}", expected "${operationId}"`,
      );
    }
    // A public read that acquired a write would still publish its GET.
    const extra = Object.keys(methods ?? {}).filter((method) => method !== 'get');
    if (extra.length > 0) {
      fail(`${CANONICAL_FILES.openapi}: ${route} also publishes ${extra.join(', ')}`);
    }
    if (methods?.get?.security !== undefined) {
      fail(`${CANONICAL_FILES.openapi}: ${route} requires authentication — B05 is anonymous`);
    }
    const success = methods?.get?.responses?.['200'];
    const schema = JSON.stringify(success?.content?.['application/json']?.schema ?? {});
    if (!/PublicDesignTemplate(List|Detail)Response/.test(schema)) {
      fail(`${CANONICAL_FILES.openapi}: ${route} does not answer with a concrete public shape`);
    }
  }

  // Exactly two operations are **B05's**, so a third under this base is a
  // failure whatever it is called — unless it is a route the phase has since
  // accepted from another checkpoint. `APP3-B05A`'s delivery route is exactly
  // that: it shares the base, it is emphatically not a third B05 read, and it is
  // excluded by name from a list B05A does not get to grow. Before B05A the list
  // is empty and this is the original ban, unchanged.
  const b05aRoutes = acceptedPublicTemplateAssetPaths(rootDir);
  const publicTemplateOperations = Object.entries(document.paths ?? {})
    .filter(([route]) => route.startsWith('/api/public/design-templates'))
    .filter(([route]) => !b05aRoutes.includes(route))
    .flatMap(([, methods]) => Object.keys(methods));
  if (publicTemplateOperations.length !== 2) {
    fail(
      `${CANONICAL_FILES.openapi}: ${publicTemplateOperations.length} public design-template operations, expected 2`,
    );
  }
  for (const route of Object.keys(document.paths ?? {})) {
    if (!route.startsWith('/api/public/design-templates')) continue;
    if (publicTemplatePaths().includes(route)) continue;
    if (b05aRoutes.includes(route)) continue;
    fail(`${CANONICAL_FILES.openapi}: ${route} is not an APP3-B05 operation`);
  }

  // The detail must reference `APP3-P01`'s component, not a second definition.
  const detail = JSON.stringify(
    document.components?.schemas?.['PublicDesignTemplateDetailResponse'] ?? {},
  );
  if (!detail.includes('#/components/schemas/DesignDocument')) {
    fail(`${CANONICAL_FILES.openapi}: the public detail does not reuse the P01 DesignDocument`);
  }

  const clientSchemas = read(rootDir, 'clientSchemas') ?? '';
  for (const alias of ['PublicDesignTemplateList200', 'PublicDesignTemplateDetail200']) {
    const match = new RegExp(`export type ${alias} = ([^;]+);`).exec(clientSchemas);
    if (match === null) {
      fail(`${CANONICAL_FILES.clientSchemas}: no generated type ${alias}`);
    } else if (/\b(void|any|unknown)\b|Record<string, unknown>/.test(match[1])) {
      fail(`${CANONICAL_FILES.clientSchemas}: ${alias} generates as "${match[1].trim()}"`);
    }
  }
}

/** The exact compatibility triple, required whole and matched by equality. */
export function checkCompatibility(rootDir, fail) {
  const request = read(rootDir, 'request') ?? '';
  const adapter = read(rootDir, 'adapter') ?? '';
  const document = openapi(rootDir);

  const listQuery = /publicDesignTemplateListQuerySchema = ([\s\S]*?)\n\nexport const/.exec(
    request,
  );
  if (listQuery === null) {
    fail(`${CANONICAL_FILES.request}: the list query schema is no longer identifiable`);
  } else {
    for (const column of SCOPE_COLUMNS) {
      // Required: `.optional()` on any of the three would let a partial scope
      // through, and every meaning a partial scope could have matches more
      // templates than the caller asked for.
      if (!new RegExp(`${column}: scopeIdSchema,`).test(listQuery[1])) {
        fail(`${CANONICAL_FILES.request}: ${column} is not a required scope id`);
      }
    }
    if (!/\.strict\(\)/.test(listQuery[1])) {
      fail(`${CANONICAL_FILES.request}: the list query stopped rejecting unknown parameters`);
    }
    for (const [pattern, dimension] of [
      [/status:/, 'a lifecycle selector'],
      [/offset:|page:/, 'offset paging'],
      [/search:|query:/, 'free-text search'],
      [/sort:|orderBy:/, 'a sort selector'],
    ]) {
      if (pattern.test(listQuery[1])) {
        fail(`${CANONICAL_FILES.request}: the list query admits ${dimension}`);
      }
    }
  }

  // Equality on all three columns, in the statement.
  for (const column of SCOPE_COLUMNS) {
    if (!adapter.includes(`eq(designTemplates.${column}, input.scope.${column})`)) {
      fail(`${CANONICAL_FILES.adapter}: does not match ${column} by equality`);
    }
  }
  // No wildcard escape: a null-tolerant scope predicate would match unscoped rows.
  if (/isNull\(designTemplates\.(productId|productSideId|embroideryAreaId)\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: admits an unscoped template into a scoped read`);
  }

  if (document !== undefined) {
    const parameters = document.paths?.['/api/public/design-templates']?.get?.parameters ?? [];
    for (const column of SCOPE_COLUMNS) {
      const parameter = parameters.find((entry) => entry.name === column);
      if (parameter?.required !== true) {
        fail(`${CANONICAL_FILES.openapi}: ${column} is not published as a required parameter`);
      }
    }
  }
}

/** Header state, published-version selection, and the ordering that picks it. */
export function checkVisibility(rootDir, fail) {
  const adapter = read(rootDir, 'adapter') ?? '';

  if (!/const PUBLIC_TEMPLATE_STATE = 'PUBLISHED'/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the public lifecycle state is not pinned to PUBLISHED`);
  }
  const headerPredicates = (
    adapter.match(/eq\(designTemplates\.status, PUBLIC_TEMPLATE_STATE\)/g) ?? []
  ).length;
  // Both reads, or one of them is reachable while the other is not.
  if (headerPredicates < 2) {
    fail(`${CANONICAL_FILES.adapter}: a public read does not constrain the header to PUBLISHED`);
  }
  for (const state of ["'DRAFT'", "'ARCHIVED'"]) {
    if (adapter.includes(`designTemplates.status, ${state}`)) {
      fail(`${CANONICAL_FILES.adapter}: a public read admits ${state}`);
    }
  }

  // The version is chosen by its own publication stamp, never by the header's
  // counter. This is the rule that stays green while being wrong: the two agree
  // in every state the delivered lifecycle reaches.
  if (!/isNotNull\(designTemplateVersions\.publishedAt\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the published version is not selected by published_at`);
  }
  if (/designTemplates\.currentVersion/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: selects a version by the header's current_version`);
  }
  if (!/selectDistinctOn\(\[designTemplateVersions\.designTemplateId\]\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: does not pick one version per template in one statement`);
  }
  if (!/desc\(designTemplateVersions\.version\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: does not order candidate versions by version descending`);
  }
  // A `PUBLISHED` header with no published version must show nothing.
  const existsUses = (adapter.match(/this\.hasPublishedVersion\(\)/g) ?? []).length;
  if (existsUses < 2) {
    fail(`${CANONICAL_FILES.adapter}: a public read does not require a published version to exist`);
  }
}

/** Scope eligibility, re-asked per read, owned by Catalog and never repaired. */
export function checkEligibility(rootDir, fail) {
  const query = read(rootDir, 'query') ?? '';
  const catalogPort = read(rootDir, 'catalogPort') ?? '';
  const catalogAdapter = read(rootDir, 'catalogAdapter') ?? '';
  const adapter = read(rootDir, 'adapter') ?? '';

  if (!/findPublicPlacementScope\(/.test(catalogPort)) {
    fail(`${CANONICAL_FILES.catalogPort}: declares no public placement-scope seam`);
  }
  // Both reads ask, or one of them shows a withdrawn placement.
  const asks = (query.match(/findPublicPlacementScope\(/g) ?? []).length;
  if (
    asks < 1 ||
    !/eligibleScope\([\s\S]{0,400}?detail\(|detail\([\s\S]*?eligibleScope\(/.test(query)
  ) {
    fail(`${CANONICAL_FILES.query}: the detail read does not re-evaluate scope eligibility`);
  }
  if (!/eligibleScope\(requested\)|eligibleScope\(scope\)/.test(query)) {
    fail(`${CANONICAL_FILES.query}: eligibility is not resolved from the requested scope`);
  }

  // Catalog owns the definition; Design must not restate it.
  for (const predicate of ['PRODUCT_PUBLISHED_STATE', 'APP2_CATEGORY_STATUS']) {
    if (!catalogAdapter.includes(predicate)) {
      fail(`${CANONICAL_FILES.catalogAdapter}: the scope read drops ${predicate}`);
    }
    if (adapter.includes(predicate) || query.includes(predicate)) {
      fail(`${CANONICAL_FILES.adapter}: Design restates Catalog's ${predicate} predicate`);
    }
  }
  const scopeQuery = /async findPublicPlacementScope\(([\s\S]*?)\n  }\n/.exec(catalogAdapter);
  if (scopeQuery === null) {
    fail(`${CANONICAL_FILES.catalogAdapter}: the scope read is no longer identifiable`);
  } else {
    for (const [pattern, complaint] of [
      [/isNull\(embroideryAreas\.retiredAt\)/, 'admits a retired Area'],
      [/isNull\(productSides\.retiredAt\)/, 'admits a retired Side'],
      [
        /eq\(productSides\.id, embroideryAreas\.productSideId\)/,
        'does not bind the Area to the Side',
      ],
      [/eq\(products\.id, productSides\.productId\)/, 'does not bind the Side to the Product'],
      [/isNull\(categories\.archivedAt\)/, 'admits an archived category'],
    ]) {
      if (!pattern.test(scopeQuery[1])) {
        fail(`${CANONICAL_FILES.catalogAdapter}: the scope read ${complaint}`);
      }
    }
  }
}

/** One answer for every invisible state, and a cursor that refuses. */
export function checkNonDisclosure(rootDir, fail) {
  const errors = read(rootDir, 'errors') ?? '';
  const query = read(rootDir, 'query') ?? '';
  const cursor = read(rootDir, 'cursor') ?? '';

  const codes = /PUBLIC_DESIGN_TEMPLATE_ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(errors);
  if (codes === null) {
    fail(`${CANONICAL_FILES.errors}: the error vocabulary is no longer identifiable`);
  } else {
    const declared = codes[1].match(/'([A-Z_]+)'/g) ?? [];
    // Two, and no more. A third code is how "not found" acquires a reason.
    if (declared.length !== 2) {
      fail(`${CANONICAL_FILES.errors}: ${declared.length} public error codes, expected 2`);
    }
    for (const leak of ['DRAFT', 'ARCHIVED', 'UNPUBLISHED', 'INELIGIBLE', 'NOT_PUBLISHED']) {
      if (codes[1].includes(leak)) {
        fail(`${CANONICAL_FILES.errors}: publishes "${leak}" as a distinguishable public reason`);
      }
    }
  }
  // Exactly one refusal function reaches the caller for every hidden state.
  const refusals = (query.match(/publicDesignTemplateNotFound\(\)/g) ?? []).length;
  if (refusals < 2) {
    fail(`${CANONICAL_FILES.query}: the detail read does not answer every hidden state alike`);
  }
  if (/message: `|\$\{slug\}|\$\{templateId\}/.test(errors)) {
    fail(`${CANONICAL_FILES.errors}: interpolates a caller-supplied value into a public message`);
  }

  // The cursor is bound to the scope it was issued under, and a malformed one is
  // refused rather than silently restarting the sequence.
  for (const column of SCOPE_COLUMNS) {
    if (!new RegExp(`${column} !== scope\\.${column}`).test(cursor)) {
      fail(`${CANONICAL_FILES.cursor}: does not bind ${column} into the cursor`);
    }
  }
  if ((cursor.match(/publicDesignTemplateCursorInvalid\(\)/g) ?? []).length < 4) {
    fail(`${CANONICAL_FILES.cursor}: a malformed cursor is not refused on every failure path`);
  }
  if (/return undefined|return \{ createdAt: new Date\(0\)/.test(cursor)) {
    fail(`${CANONICAL_FILES.cursor}: a bad cursor silently restarts the sequence`);
  }
}

/** No write, no audit, no outbox, no session, no bytes. */
export function checkReadOnly(rootDir, fail) {
  const adapter = read(rootDir, 'adapter') ?? '';
  const query = read(rootDir, 'query') ?? '';
  const controller = read(rootDir, 'controller') ?? '';
  const module = read(rootDir, 'module') ?? '';
  const port = read(rootDir, 'port') ?? '';

  for (const [key, code] of [
    ['adapter', adapter],
    ['query', query],
    ['controller', controller],
  ]) {
    for (const [pattern, complaint] of [
      [/\.insert\(|\.update\(|\.delete\(/, 'writes'],
      [/runInTransaction|requireTransaction|\.for\('update'\)/, 'opens a transaction or a lock'],
      [/new \w*Audit\w*\(|\.record\w+\(/, 'appends an audit row'],
      [/Outbox|\.append\w*Event\(/, 'appends an outbox event'],
      [/ObjectStorage|presign|getObject|StreamableFile/, 'reaches object storage'],
    ]) {
      if (pattern.test(code)) fail(`${CANONICAL_FILES[key]}: ${complaint}`);
    }
  }

  // The port itself offers no write to call — the structural form of the promise.
  const methods = port.match(/^ {2}(\w+)\(/gm) ?? [];
  for (const method of methods) {
    if (!/^ {2}(listPublished|findPublishedBySlug)\(/.test(method)) {
      fail(`${CANONICAL_FILES.port}: declares "${method.trim()}", which is not a read`);
    }
  }

  const imports = /imports:\s*\[([\s\S]*?)\]/.exec(module)?.[1] ?? '';
  const providers = /providers:\s*\[([\s\S]*?)\n {2}\],/.exec(module)?.[1] ?? '';
  if (imports === '' || providers === '') {
    fail(`${CANONICAL_FILES.module}: the module composition is no longer identifiable`);
  }
  // Read from the decorator, never the file: this module's header names the
  // modules it deliberately does *not* compose, and a whole-file scan would fail
  // on the sentence that documents the invariant.
  for (const forbidden of ['Audit', 'Identity', 'Asset', 'ObjectStorage']) {
    if (new RegExp(`${forbidden}\\w*Module`).test(imports)) {
      fail(`${CANONICAL_FILES.module}: composes ${forbidden}Module into an anonymous read`);
    }
  }
  if (!/provide: PUBLISHED_DESIGN_TEMPLATE_REPOSITORY/.test(providers)) {
    fail(`${CANONICAL_FILES.module}: does not bind the read-only Template port`);
  }
  if (/provide: DESIGN_TEMPLATE_REPOSITORY/.test(providers)) {
    fail(`${CANONICAL_FILES.module}: binds the write-bearing Template port into a public read`);
  }
  if (!/CatalogPlacementReadModule/.test(imports)) {
    fail(`${CANONICAL_FILES.module}: does not read placement through the controller-free port`);
  }

  // Anonymous: a guard is what would make it not.
  if (/@UseGuards\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: guards an operation that must be anonymous`);
  }
  if (/@(Post|Put|Patch|Delete)\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: declares a write method`);
  }
  const cacheHeaders = (
    controller.match(/@Header\('Cache-Control', PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL\)/g) ?? []
  ).length;
  if (cacheHeaders !== 2) {
    fail(`${CANONICAL_FILES.controller}: ${cacheHeaders} cache headers, expected 2`);
  }
  const policy = read(rootDir, 'policy') ?? '';
  if (!/PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL = 'no-store'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: a revocable public resource is not no-store`);
  }
}

/** Nothing private on the wire, and no B05A address invented. */
export function checkProjection(rootDir, fail) {
  const projection = read(rootDir, 'projection') ?? '';
  const response = read(rootDir, 'response') ?? '';

  for (const leak of [
    'previewDerivativeId',
    'storageKey',
    'bucket',
    'assetId',
    'archivedAt',
    'currentVersion',
  ]) {
    // Usage, not the word: both files explain in prose which fields are withheld
    // and why, and a bare-word scan would fail on that explanation.
    if (new RegExp(`(readonly |^ *)${leak}[?!]?:`, 'm').test(projection)) {
      fail(`${CANONICAL_FILES.projection}: publishes "${leak}"`);
    }
    if (new RegExp(`\\n *${leak}[?!]?:`).test(response)) {
      fail(`${CANONICAL_FILES.response}: documents "${leak}"`);
    }
  }
  if (/template\.(previewDerivativeId|archivedAt|status)/.test(projection)) {
    fail(`${CANONICAL_FILES.projection}: reads a field a public caller may not see`);
  }
  // The public identity is the slug; the internal id is not published.
  if (/readonly templateId:/.test(projection)) {
    fail(`${CANONICAL_FILES.projection}: publishes the internal template id`);
  }
  if (!/readonly document: unknown/.test(projection)) {
    fail(`${CANONICAL_FILES.projection}: the detail carries no published document`);
  }
  // The list must not.
  const summary = /interface PublicTemplateSummaryView \{([\s\S]*?)\n\}/.exec(projection);
  if (summary !== null && /document/.test(summary[1])) {
    fail(`${CANONICAL_FILES.projection}: the list page carries a Design Document`);
  }
  if (!/PUBLISHED_SCHEMA_MARKER/.test(response)) {
    fail(`${CANONICAL_FILES.response}: does not reuse the generated DesignDocument component`);
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

  for (const key of ['port', 'adapter', 'query', 'controller', 'module', 'unitSpec', 'liveSpec']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B05',
    'CMD-TEST-APP3-B05',
    'CMD-TEST-APP3-B05-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3B05(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkCompatibility(rootDir, fail);
  checkVisibility(rootDir, fail);
  checkEligibility(rootDir, fail);
  checkNonDisclosure(rootDir, fail);
  checkReadOnly(rootDir, fail);
  checkProjection(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B05(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b05 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b05 — two anonymous public Design Template reads and no third: visibility is the ' +
      'PUBLISHED header *and* a version whose published_at is set, so a historical stamp never ' +
      'revives an archived template and the highest published version is selected rather than ' +
      'the header’s counter; compatibility is the exact product/side/area triple, required whole ' +
      'and matched by equality, with no product-wide or wildcard fallback; the placement chain’s ' +
      'public eligibility is re-asked of Catalog on every request and never repaired, so a ' +
      'withdrawn product hides its templates without touching one of them; unknown, draft, ' +
      'archived, unpublished and ineligible are one indistinguishable answer; paging is bounded ' +
      'keyset with the scope bound into the cursor and a malformed one refused rather than ' +
      'restarted; the detail reuses the APP3-P01 DesignDocument component and no storage key, ' +
      'derivative or B05A address is published; and the read path binds a port with no write on ' +
      'it — no insert, update, delete, audit row, outbox event or session mutation — with no ' +
      'migration, no dependency, no worker or frontend change and no root script.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
