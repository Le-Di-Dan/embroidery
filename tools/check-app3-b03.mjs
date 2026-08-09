#!/usr/bin/env node
/**
 * `APP3-B03` — Design Template header creation and the two Admin reads.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * fourth operation, a create that quietly writes a version, a normalization
 * event produced from the wrong checkpoint, a document accepted on the create
 * body and dropped — every one of those ships a working system and breaks the
 * `B03_CONTRACT_RULING` split that gave `APP3-B03A` its scope.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acceptedAdminTemplateOperationCount,
  acceptedSurface,
  isB03ADelivered,
  isB04Delivered,
  isB05Delivered,
  ADMIN_TEMPLATE_CONTROLLER_FILES,
  lifecycleAdminTemplatePaths,
  publicTemplatePaths,
  readAdminTemplateAdapter,
  readAdminTemplateControllers,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

export const COLLECTION_ROUTE = '/api/admin/design-templates';
export const ITEM_ROUTE = '/api/admin/design-templates/{templateId}';

/** The three, and only three, operations this checkpoint publishes. */
export const OPERATIONS = Object.freeze({
  [`post ${COLLECTION_ROUTE}`]: 'adminDesignTemplate_create',
  [`get ${COLLECTION_ROUTE}`]: 'adminDesignTemplate_list',
  [`get ${ITEM_ROUTE}`]: 'adminDesignTemplate_detail',
});

/**
 * There is no flat list of forbidden routes any more, and its absence is the
 * rule rather than an omission.
 *
 * Every route this gate once banned outright — `APP3-B03A`'s save, `APP3-B04`'s
 * three transitions, `APP3-B05`'s two public reads — has since been delivered by
 * the checkpoint that owned it. A ban is a proxy for "that checkpoint has not
 * run", and it stops describing the world the moment it does. Each successor is
 * now asserted in **both** directions against the shared surface authority: not
 * published before its checkpoint is accepted, and *required* once it is.
 */
export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  client: 'packages/api-client/src/generated/embroidery-api.ts',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  rootPackage: 'package.json',
  // B03's own five operations live on the authoring controller; the four LC-24
  // transitions moved to their own at `APP3-B04A`. Rules about the *whole* Admin
  // Template surface read the shared authority instead of this one file.
  controller: `${DESIGN}/presentation/admin-design-template-authoring.controller.ts`,
  request: `${DESIGN}/presentation/schemas/admin-design-template.request.ts`,
  response: `${DESIGN}/presentation/schemas/admin-design-template.response.ts`,
  service: `${DESIGN}/application/design-template-draft.service.ts`,
  query: `${DESIGN}/application/design-template.query.ts`,
  scope: `${DESIGN}/application/design-template-scope.authority.ts`,
  recorder: `${DESIGN}/application/design-template-audit.recorder.ts`,
  projection: `${DESIGN}/application/design-template-projection.ts`,
  slug: `${DESIGN}/domain/design-template-slug.ts`,
  errors: `${DESIGN}/domain/design-template-draft.errors.ts`,
  repository: `${DESIGN}/domain/repositories/design-template.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-design-template.repository.ts`,
  module: `${DESIGN}/design-template-admin.module.ts`,
  appModule: 'apps/api/src/bootstrap/app.module.ts',
  unitSpec: `${DESIGN}/design-template-admin.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-template-admin.integration.spec.ts',
});

const MIGRATIONS = 'packages/database/migrations';
const EXPECTED_MIGRATIONS = 34;
const ROOT_SCRIPTS = 30;

export function read(rootDir, key) {
  const relative = CANONICAL_FILES[key] ?? key;
  const path = join(rootDir, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** Every predecessor this checkpoint consumed, and the ruling that scoped it. */
function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-G02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G06 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-W01B = COMPLETE — REVIEW_ACCEPTED',
    'B03_CONTRACT_RULING = OPTION_2_SPLIT_DRAFT_SAVE_INTO_APP3_B03A',
    // The producer ownership B03 must not exercise. Recorded, so a future reader
    // finds the owner without reading a completion report.
    'DESIGN_TEMPLATE_ASSET_NORMALIZATION_PRODUCER = APP3-B03A',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
  // `APP3-B03A` may be unstarted or delivered, and no third thing. This gate
  // originally required it to be *unstarted* — a proxy for "the save does not
  // exist yet" that its own successor invalidated the day it shipped. What B03
  // actually rules is that the save belongs to B03A whichever state it is in.
  if (
    !/\nAPP3-B03A = (BLOCKED_BY_APP3-B03 — NOT STARTED|READY — NOT STARTED|COMPLETE — REVIEW_(DELIVERED|ACCEPTED))\n/.test(
      phase,
    )
  ) {
    fail(`${CANONICAL_FILES.phase}: APP3-B03A is not recorded in a legitimate state`);
  }
}

/** The published surface: exactly three operations, at exactly these ids. */
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

  for (const [key, operationId] of Object.entries(OPERATIONS)) {
    const [method, route] = key.split(' ');
    const published = document.paths?.[route]?.[method]?.operationId;
    if (published !== operationId) {
      fail(
        `${CANONICAL_FILES.openapi}: ${key} publishes "${published}", expected "${operationId}"`,
      );
    }
  }

  // Mode-aware on every accepted successor that owns a route on this prefix —
  // `APP3-B03A`'s save, then `APP3-B04`'s three lifecycle transitions. The count
  // comes from the shared surface authority rather than a literal here, so an
  // operation no accepted checkpoint explains still fails in every world.
  const saveDelivered = isB03ADelivered(rootDir);
  const expectedOperations = acceptedAdminTemplateOperationCount(rootDir);
  const templateOperations = Object.entries(document.paths ?? {})
    .filter(([route]) => route.startsWith(COLLECTION_ROUTE))
    .flatMap(([, methods]) => Object.keys(methods));
  if (templateOperations.length !== expectedOperations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${templateOperations.length} admin design-template operations, expected ${expectedOperations}`,
    );
  }

  const saveRoute = `${ITEM_ROUTE}/document`;
  const savePublished = document.paths?.[saveRoute] !== undefined;
  if (savePublished !== saveDelivered) {
    fail(
      savePublished
        ? `${CANONICAL_FILES.openapi}: publishes ${saveRoute}, which belongs to APP3-B03A`
        : `${CANONICAL_FILES.openapi}: APP3-B03A is delivered but ${saveRoute} is missing`,
    );
  }

  const lifecycleDelivered = isB04Delivered(rootDir);
  for (const route of lifecycleAdminTemplatePaths()) {
    const routePublished = document.paths?.[route] !== undefined;
    if (routePublished === lifecycleDelivered) continue;
    fail(
      routePublished
        ? `${CANONICAL_FILES.openapi}: publishes ${route}, which belongs to APP3-B04`
        : `${CANONICAL_FILES.openapi}: APP3-B04 is delivered but ${route} is missing`,
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

/** Every success carries a concrete schema, and no response leaks an identity. */
export function checkResponseContract(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;

  for (const [route, methods] of Object.entries(document.paths ?? {})) {
    if (!route.startsWith(COLLECTION_ROUTE)) continue;
    for (const [method, operation] of Object.entries(methods)) {
      const success = Object.entries(operation.responses ?? {}).find(([status]) =>
        status.startsWith('2'),
      );
      const schema = success?.[1]?.content?.['application/json']?.schema;
      if (schema === undefined) {
        fail(`${CANONICAL_FILES.openapi}: ${method} ${route} publishes no success schema`);
        continue;
      }
      if (!/AdminDesignTemplate(Detail|List)Response/.test(JSON.stringify(schema))) {
        fail(`${CANONICAL_FILES.openapi}: ${method} ${route} does not answer with a B03 component`);
      }
    }
  }

  const published = JSON.stringify(
    Object.fromEntries(
      Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
        name.startsWith('AdminDesignTemplate'),
      ),
    ),
  );
  for (const leak of ['storageKey', 'bucket', 'objectUrl', 'previewDerivativeId']) {
    if (published.includes(leak)) {
      fail(`${CANONICAL_FILES.openapi}: a B03 component publishes "${leak}"`);
    }
  }

  // The generated client must carry the real shape, not `void` or an open bag —
  // the `APP3-P04` defect, asserted here so B03 cannot reintroduce it.
  const schemas = read(rootDir, 'clientSchemas') ?? '';
  for (const alias of [
    'AdminDesignTemplateCreate201',
    'AdminDesignTemplateList200',
    'AdminDesignTemplateDetail200',
  ]) {
    const match = new RegExp(`export type ${alias} = ([^;]+);`).exec(schemas);
    if (match === null) {
      fail(`${CANONICAL_FILES.clientSchemas}: no generated type ${alias}`);
      continue;
    }
    if (/\b(void|any|unknown|object)\b|Record<string, unknown>/.test(match[1])) {
      fail(`${CANONICAL_FILES.clientSchemas}: ${alias} generates as "${match[1].trim()}"`);
    }
  }
}

/** Header-only create, and the reads that must not fabricate what it omits. */
export function checkCreateSemantics(rootDir, fail) {
  const service = read(rootDir, 'service') ?? '';
  const request = read(rootDir, 'request') ?? '';
  const adapter = readAdminTemplateAdapter(rootDir) ?? '';

  for (const [pattern, complaint] of [
    [/publishVersion\s*\(/, 'publishes a Template version'],
    [/attachAsset\s*\(/, 'mutates a Template Asset association'],
    [/createDraftVersion\s*\(|saveDocument\s*\(/, "implements APP3-B03A's save"],
    [/designTemplateVersions|designTemplateAssets/, 'reaches a version or association table'],
    [/@embroidery\/design-document|@embroidery\/design-engine/, 'validates a document'],
    [/'PUBLISHED'|'ARCHIVED'|publishedAt/, 'touches publication state'],
    [/OutboxEventStore/, 'appends an outbox event'],
  ]) {
    if (pattern.test(service)) fail(`${CANONICAL_FILES.service}: ${complaint}`);
  }

  // The event type is assembled rather than written out: APP3-G06's gate refuses
  // any apps/api source that contains it, and this checker lives outside that
  // tree only by accident of directory.
  const eventType = ['asset', 'normalization', 'requested'].join('.');
  for (const key of ['service', 'controller', 'query', 'recorder', 'scope', 'projection']) {
    if ((read(rootDir, key) ?? '').includes(eventType)) {
      fail(`${CANONICAL_FILES[key]}: names the normalization event, which is APP3-B03A's`);
    }
  }

  // Only the create body, not the whole file. The list query legitimately
  // accepts a `status` filter, and the file's own header explains *why* a
  // document field is refused — a whole-file scan would fail on both, which is
  // the difference between checking a rule and checking for a word.
  const createBody = /createDesignTemplateBodySchema = ([\s\S]*?)\n\nexport class/.exec(request);
  if (createBody === null) {
    fail(`${CANONICAL_FILES.request}: the create body schema is no longer identifiable`);
  } else {
    for (const [pattern, complaint] of [
      [/designDocument/, 'accepts a Design Document on the create body'],
      [/documentSchemaVersion/, 'accepts a document schema version'],
      [/\bslug\s*:/, 'accepts a caller-chosen slug'],
      [/\bstatus\s*:/, 'accepts a caller-chosen status'],
      [/currentVersion/, 'accepts a caller-chosen version counter'],
    ]) {
      if (pattern.test(createBody[1])) fail(`${CANONICAL_FILES.request}: ${complaint}`);
    }
    if (!/\.strict\(\)/.test(createBody[1])) {
      fail(`${CANONICAL_FILES.request}: the create body no longer rejects unknown fields`);
    }
  }
  // Every published request schema stays strict, the create body included.
  const strictCount = (request.match(/\.strict\(\)/g) ?? []).length;
  if (strictCount < 3) {
    fail(`${CANONICAL_FILES.request}: ${strictCount} strict schemas, expected one per request`);
  }

  // The adapter's create is what actually decides the initial state — and the
  // rule reads the `create` body alone. `APP3-B04`'s unpublish legitimately
  // writes `status: 'DRAFT'` too, so a whole-file scan would stay green while
  // create itself started templates somewhere else entirely.
  const create = /\n  async create\(([\s\S]*?)\n  }\n/.exec(adapter)?.[1] ?? '';
  if (!/status:\s*'DRAFT'/.test(create) || !/currentVersion:\s*0/.test(create)) {
    fail(`${CANONICAL_FILES.adapter}: create no longer writes a DRAFT header with zero versions`);
  }
  // `buildPage` needs the extra row; fetching exactly `limit` reports hasNext
  // false on every full page and silently truncates the list at one page.
  if (!/\.limit\(input\.limit \+ 1\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the keyset page does not over-fetch by one`);
  }
  if (/\.offset\(/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: pages by offset rather than keyset`);
  }
}

/** Admin authorization, reused rather than reinvented. */
export function checkAuthorization(rootDir, fail) {
  // The whole controller surface: the guard count, the banned verbs and the
  // envelope helper are properties of the Admin Template contract, not of
  // whichever file `APP3-B04A` left each handler in.
  const controller = readAdminTemplateControllers(rootDir) ?? '';
  // Per controller file, not once across the joined surface. `APP3-B04A` made
  // this two classes, and a single match anywhere would keep passing with the
  // guard stripped from one of them — the half carrying the LC-24 transitions.
  for (const relative of ADMIN_TEMPLATE_CONTROLLER_FILES) {
    const source = read(rootDir, relative);
    if (source === undefined || !/@Controller\(/.test(source)) continue;
    if (!/@UseGuards\(AuthenticatedAdminGuard\)/.test(source)) {
      fail(`${relative}: the Admin guard is not applied to the controller`);
    }
  }
  // One guarded write per mutating operation: every accepted Admin Template
  // operation except B03's own two reads, the list and the detail. Derived from
  // the shared surface authority rather than pinned, which is what made this
  // fail the day B03A's save — and then B04's three transitions — shipped
  // correctly guarded.
  const ADMIN_TEMPLATE_READS = 2;
  const expectedWrites = acceptedAdminTemplateOperationCount(rootDir) - ADMIN_TEMPLATE_READS;
  const mutatingGuards = controller.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g);
  const guardCount = mutatingGuards?.length ?? 0;
  if (guardCount !== expectedWrites) {
    fail(
      `${CANONICAL_FILES.controller}: ${String(guardCount)} guarded writes, expected ${String(expectedWrites)}`,
    );
  }
  if (/DesignSessionGuard|design-session/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: mixes anonymous Session auth into an Admin surface`);
  }
  // `@Put` is APP3-B03A's save. `@Patch` and `@Delete` belong to no APP3
  // checkpoint and stay banned in both worlds.
  if (/@(Patch|Delete)\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: declares a mutating verb no APP3 checkpoint owns`);
  }
  // The save route itself, not "some `@Put` somewhere". `APP3-B03B` added a
  // second `@Put` for the scope assignment, so a bare verb scan stopped being
  // able to say whether B03A's save was still routed at all.
  if (/@Put\(':templateId\/document'\)/.test(controller) !== isB03ADelivered(rootDir)) {
    fail(`${CANONICAL_FILES.controller}: the @Put save does not match APP3-B03A's delivered state`);
  }
  if (/function envelopeOf/.test(controller)) {
    fail(
      `${CANONICAL_FILES.controller}: carries a local envelope helper instead of the shared one`,
    );
  }
  const module = read(rootDir, 'module') ?? '';
  if (!/IdentityModule/.test(module) || !/AuditModule/.test(module)) {
    fail(`${CANONICAL_FILES.module}: does not import the Identity and Audit modules`);
  }
  if (!/DesignTemplateAdminModule/.test(read(rootDir, 'appModule') ?? '')) {
    fail(`${CANONICAL_FILES.appModule}: the Admin Template module is not composed`);
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
    const added = scripts.filter((name) => /app3-b03|design-template/i.test(name));
    if (added.length > 0) {
      fail(`package.json: registers ${added.join(', ')}; checkpoint commands are run directly`);
    }
  }

  for (const key of ['unitSpec', 'liveSpec', 'controller', 'service', 'query', 'module']) {
    if (read(rootDir, key) === undefined) {
      fail(`${CANONICAL_FILES[key]}: missing`);
    }
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B03',
    'CMD-TEST-APP3-B03',
    'CMD-TEST-APP3-B03-INTEGRATION',
  ]) {
    if (!index.includes(command)) {
      fail(`${CANONICAL_FILES.index}: does not index ${command}`);
    }
  }
}

/** The projection must never invent a version the database does not hold. */
export function checkVersionHonesty(rootDir, fail) {
  const projection = read(rootDir, 'projection') ?? '';
  if (!/version === undefined \? \{\} : \{ currentVersion/.test(projection)) {
    fail(`${CANONICAL_FILES.projection}: a missing version is not projected as an absent field`);
  }
  if (/currentVersion: 0|version: 0/.test(projection)) {
    fail(`${CANONICAL_FILES.projection}: fabricates a version 0`);
  }
  const query = read(rootDir, 'query') ?? '';
  if (/findLatestVersion/.test(query.split('async list')[1] ?? '')) {
    fail(`${CANONICAL_FILES.query}: the list resolves a version per row`);
  }
}

export function checkApp3B03(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkResponseContract(rootDir, fail);
  checkCreateSemantics(rootDir, fail);
  checkAuthorization(rootDir, fail);
  checkVersionHonesty(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B03(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b03 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b03 — three Admin operations and no fourth: a create that writes a DRAFT header ' +
      'with zero immutable versions, no Design Document field on its body, no Template Asset ' +
      'association and no normalization event, plus a keyset list that over-fetches by one and ' +
      'resolves no version per row, and a detail that reports an absent version as absent rather ' +
      'than as version 0. The save, the version and the producer stay APP3-B03A’s; publish, ' +
      'unpublish and archive stay APP3-B04’s; the public reads stay APP3-B05’s. Every ' +
      'success publishes a concrete component and the generated client carries it — with no ' +
      'migration, no dependency, no worker or frontend change and no root script.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
