#!/usr/bin/env node
/**
 * `APP3-B03A` — the Design Template draft document save.
 *
 * The rules worth a machine are the ones that stay green while being wrong: a
 * save that lets the caller choose its version number, a draft version stamped
 * as published, a normalization event appended before the association it names,
 * a second event for an association that already existed, a document accepted
 * without P01, or B04's publication geometry quietly imported to "be safe".
 * Every one of those ships a working system.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acceptedAdminTemplateOperationCount,
  acceptedSurface,
  isB04Delivered,
  isB05Delivered,
  lifecycleAdminTemplatePaths,
  publicTemplatePaths,
} from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = 'apps/api/src/modules/design';

export const SAVE_ROUTE = '/api/admin/design-templates/{templateId}/document';
export const SAVE_OPERATION = 'adminDesignTemplate_saveDocument';

/**
 * There is no flat list of forbidden routes any more, and its absence is the
 * rule rather than an omission.
 *
 * `APP3-B04`'s three transitions and `APP3-B05`'s two public reads were both
 * banned outright here, and both have since been delivered by the checkpoint
 * that owned them. A ban is a proxy for "that checkpoint has not run", and it
 * stops describing the world the moment it does. Each successor is now asserted
 * in **both** directions against the shared surface authority: not published
 * before its checkpoint is accepted, and *required* once it is.
 */
export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  rootPackage: 'package.json',
  useCase: `${DESIGN}/application/save-template-document.use-case.ts`,
  documents: `${DESIGN}/application/template-document.authority.ts`,
  media: `${DESIGN}/application/template-document-media.authority.ts`,
  request: `${DESIGN}/presentation/schemas/admin-design-template.request.ts`,
  controller: `${DESIGN}/presentation/admin-design-template.controller.ts`,
  repository: `${DESIGN}/domain/repositories/design-template.repository.ts`,
  adapter: `${DESIGN}/infrastructure/persistence/drizzle-design-template.repository.ts`,
  recorder: `${DESIGN}/application/design-template-audit.recorder.ts`,
  module: `${DESIGN}/design-template-admin.module.ts`,
  unitSpec: `${DESIGN}/design-template-save.spec.ts`,
  liveSpec: 'apps/api/test/integration/design-template-save.integration.spec.ts',
  g06: 'tools/check-app3-g06.mjs',
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

/** Predecessors, and the ruling that gave this checkpoint its scope. */
function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B03 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-P01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-G06 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    'B03_CONTRACT_RULING = OPTION_2_SPLIT_DRAFT_SAVE_INTO_APP3_B03A',
    'DESIGN_TEMPLATE_ASSET_NORMALIZATION_PRODUCER = APP3-B03A',
    // The intake gap this checkpoint does not close and must not paper over.
    'FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
}

/** Exactly one new operation, at the locked route and id. */
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

  const published = document.paths?.[SAVE_ROUTE]?.put?.operationId;
  if (published !== SAVE_OPERATION) {
    fail(
      `${CANONICAL_FILES.openapi}: the save publishes "${published}", expected "${SAVE_OPERATION}"`,
    );
  }

  const templateOperations = Object.entries(document.paths ?? {})
    .filter(([route]) => route.startsWith('/api/admin/design-templates'))
    .flatMap(([, methods]) => Object.keys(methods));
  // Three from `APP3-B03`, this one, and each accepted successor's — counted by
  // the shared surface authority, so an operation no accepted checkpoint
  // explains is still scope creep in every world.
  const expectedOperations = acceptedAdminTemplateOperationCount(rootDir);
  if (templateOperations.length !== expectedOperations) {
    fail(
      `${CANONICAL_FILES.openapi}: ${templateOperations.length} admin design-template operations, expected ${expectedOperations}`,
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

/** The request body, and the P01 component it must reference rather than restate. */
export function checkRequestContract(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;

  const bodyRef =
    document.paths?.[SAVE_ROUTE]?.put?.requestBody?.content?.['application/json']?.schema?.$ref;
  const name = typeof bodyRef === 'string' ? bodyRef.split('/').pop() : undefined;
  const body = name === undefined ? undefined : document.components?.schemas?.[name];
  if (body === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the save publishes no request body component`);
    return;
  }

  const properties = Object.keys(body.properties ?? {}).sort();
  if (properties.join(',') !== 'document,expectedCurrentVersion') {
    fail(`${CANONICAL_FILES.openapi}: the save body publishes [${properties.join(', ')}]`);
  }
  const documentNode = JSON.stringify(body.properties?.['document'] ?? {});
  if (!documentNode.includes('#/components/schemas/DesignDocument')) {
    // The `APP3-B08-C1` defect returning: an open object where the generated P01
    // graph should be.
    fail(
      `${CANONICAL_FILES.openapi}: the save body does not reference the generated DesignDocument`,
    );
  }
  if (document.components?.schemas?.['DesignDocument'] === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the generated DesignDocument component is absent`);
  }

  const success = document.paths?.[SAVE_ROUTE]?.put?.responses?.['200'];
  const schema = JSON.stringify(success?.content?.['application/json']?.schema ?? {});
  if (!schema.includes('AdminDesignTemplateDetailResponse')) {
    fail(`${CANONICAL_FILES.openapi}: the save does not answer with the B03 detail projection`);
  }

  const clientSchemas = read(rootDir, 'clientSchemas') ?? '';
  const match = /export type AdminDesignTemplateSaveDocument200 = ([^;]+);/.exec(clientSchemas);
  if (match === null) {
    fail(`${CANONICAL_FILES.clientSchemas}: no generated type for the save response`);
  } else if (/\b(void|any|unknown|object)\b|Record<string, unknown>/.test(match[1])) {
    fail(`${CANONICAL_FILES.clientSchemas}: the save response generates as "${match[1].trim()}"`);
  }
  if (!/export interface SaveDesignTemplateDocumentBody/.test(clientSchemas)) {
    fail(`${CANONICAL_FILES.clientSchemas}: the save request body is not typed`);
  }
}

/** The compare-and-set, and the immutability it protects. */
export function checkSaveSemantics(rootDir, fail) {
  const adapter = read(rootDir, 'adapter') ?? '';
  const repository = read(rootDir, 'repository') ?? '';
  const useCase = read(rootDir, 'useCase') ?? '';
  const request = read(rootDir, 'request') ?? '';

  if (!/saveDraftVersion\s*\(/.test(repository)) {
    fail(`${CANONICAL_FILES.repository}: no draft-version seam is declared`);
  }
  // `publishVersion` must not be widened to sometimes not publish. Scoped to its
  // *input* type: `DesignTemplateVersion.publishedAt` is legitimately optional,
  // because a draft version genuinely has none, and a whole-file scan would fail
  // on the read model it is not talking about.
  const publishInput = /interface PublishDesignTemplateVersionInput \{([\s\S]*?)\n\}/.exec(
    repository,
  );
  if (publishInput === null) {
    fail(`${CANONICAL_FILES.repository}: PublishDesignTemplateVersionInput is no longer declared`);
  } else if (!/publishedAt:\s*Date;/.test(publishInput[1])) {
    fail(`${CANONICAL_FILES.repository}: publishVersion no longer requires a real publishedAt`);
  }

  // The expected value must be in the predicate, not read then written — and
  // read from the save's own body. `APP3-B04`'s shared lifecycle `transition`
  // carries the same token predicate, so a whole-file scan would stay green
  // while the save itself became a read-then-write.
  const save = /\n  async saveDraftVersion\(([\s\S]*?)\n  }\n/.exec(adapter)?.[1] ?? '';
  if (!/eq\(designTemplates\.currentVersion, input\.expectedCurrentVersion\)/.test(save)) {
    fail(`${CANONICAL_FILES.adapter}: the save does not compare-and-set on current_version`);
  }
  if (!/eq\(designTemplates\.status, 'DRAFT'\)/.test(save)) {
    fail(`${CANONICAL_FILES.adapter}: the save does not require a DRAFT header`);
  }
  if (!/publishedAt:\s*null/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: a draft version is not written with published_at null`);
  }
  if (!/'STALE_WRITE'/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: a lost compare-and-set does not raise STALE_WRITE`);
  }
  if (!/onConflictDoNothing/.test(adapter)) {
    // A read-then-insert would let two racing saves both believe they created
    // the association, and produce two normalization requests for one row.
    fail(`${CANONICAL_FILES.adapter}: the association insert is not conflict-atomic`);
  }

  // The caller never chooses a version number.
  if (!/expectedCurrentVersion: z\.number\(\)\.int\(\)\.min\(0\)/.test(request)) {
    fail(`${CANONICAL_FILES.request}: the save body does not take a non-negative expected version`);
  }
  for (const [pattern, complaint] of [
    [/\bversion:\s*z\./, 'lets the caller choose the version number'],
    [/publishedAt/, 'accepts a publication stamp'],
    [/\bstatus:\s*z\./, 'accepts a lifecycle state'],
  ]) {
    const saveBody = /saveDesignTemplateDocumentBodySchema = ([\s\S]*?)\n\nexport class/.exec(
      request,
    );
    if (saveBody !== null && pattern.test(saveBody[1])) {
      fail(`${CANONICAL_FILES.request}: the save body ${complaint}`);
    }
  }

  // Translation, or a stale CAS answers 500 against a published 409.
  if (!/DESIGN_TEMPLATE_VERSION_CONFLICT/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: a stale compare-and-set is not translated to the conflict`);
  }
}

/** P01 is the only document authority, and P02 is not imported. */
export function checkDocumentAuthority(rootDir, fail) {
  const documents = read(rootDir, 'documents') ?? '';
  const useCase = read(rootDir, 'useCase') ?? '';

  for (const call of [
    'readSchemaVersion',
    'prepareDesignDocument',
    'validateDesignDocumentContext',
  ]) {
    if (!documents.includes(`${call}(`)) {
      fail(`${CANONICAL_FILES.documents}: does not call ${call}`);
    }
  }
  for (const key of ['documents', 'useCase']) {
    const source = read(rootDir, key) ?? '';
    if (/from '@embroidery\/design-engine'/.test(source)) {
      // `GRD-T01` is `APP3-B04`'s; a draft may be saved out of bounds.
      fail(`${CANONICAL_FILES[key]}: imports design-engine, which is APP3-B04's publication guard`);
    }
    if (/ObjectStorage|presign|getObject|storageKey/.test(source)) {
      fail(`${CANONICAL_FILES[key]}: reads object storage to decide a document write`);
    }
  }
  // The canonical document is what persists, never the request body.
  if (!/outcome\.document/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: does not persist the canonical prepared document`);
  }
}

/** The association producer, its ordering and its exact event. */
export function checkNormalizationProducer(rootDir, fail) {
  const useCase = read(rootDir, 'useCase') ?? '';

  const transaction = useCase.indexOf('runInTransaction');
  const association = useCase.indexOf('ensureAssetAssociation(');
  const append = useCase.indexOf('this.outbox.append(');
  if (transaction === -1 || association === -1 || append === -1) {
    fail(`${CANONICAL_FILES.useCase}: the transaction, the association or the append is missing`);
  } else if (!(transaction < association && association < append)) {
    // `APP3-G06`: an event appended before the association that defines its work
    // cannot carry its context.
    fail(
      `${CANONICAL_FILES.useCase}: the event is not appended after the association, in the transaction`,
    );
  }

  if (!/if \(!association\.created\) continue;/.test(useCase)) {
    fail(`${CANONICAL_FILES.useCase}: an existing association is not exempted from a second event`);
  }
  for (const token of [
    'ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE',
    'ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION',
    'buildAssetNormalizationRequestedPayload',
    "kind: 'DESIGN_TEMPLATE_ASSET'",
  ]) {
    if (!useCase.includes(token)) {
      fail(`${CANONICAL_FILES.useCase}: the event does not use ${token}`);
    }
  }
  if (!/designTemplateAssetId: association\.designTemplateAssetId/.test(useCase)) {
    fail(
      `${CANONICAL_FILES.useCase}: the association ref does not carry the durable association id`,
    );
  }

  // The G06 gate must sanction exactly this producer, and only when delivered.
  const g06 = read(rootDir, 'g06') ?? '';
  if (!g06.includes('b03aAllowed') || !g06.includes(CANONICAL_FILES.useCase)) {
    fail(`${CANONICAL_FILES.g06}: does not sanction the APP3-B03A producer by name`);
  }
  if (!/\\nAPP3-B03A = COMPLETE/.test(g06)) {
    fail(
      `${CANONICAL_FILES.g06}: the B03A producer allowance is not gated on its delivered status`,
    );
  }
}

/** The lane the media allowlist is built from, and nothing wider. */
export function checkMediaAuthority(rootDir, fail) {
  const media = read(rootDir, 'media') ?? '';
  if (!/TEMPLATE_ARTWORK_ASSET_KIND = 'TEMPLATE_SOURCE'/.test(media)) {
    fail(`${CANONICAL_FILES.media}: the eligible Asset kind is not TEMPLATE_SOURCE`);
  }
  if (!/TEMPLATE_ARTWORK_ASSET_CLASSIFICATION = 'PRODUCTION_SENSITIVE'/.test(media)) {
    fail(`${CANONICAL_FILES.media}: the eligible classification is not PRODUCTION_SENSITIVE`);
  }
  if (!/findScopedByIds\(/.test(media)) {
    fail(`${CANONICAL_FILES.media}: the allowlist is not built through the scoped Asset read`);
  }
  if (/CUSTOMER_UPLOAD|CATALOG_MEDIA/.test(media)) {
    fail(`${CANONICAL_FILES.media}: admits an Asset lane that is not Template artwork`);
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

  for (const key of ['useCase', 'documents', 'media', 'unitSpec', 'liveSpec']) {
    if (read(rootDir, key) === undefined) fail(`${CANONICAL_FILES[key]}: missing`);
  }

  // Scoped to the `providers` array, not the whole file: the import sits above
  // it, so a whole-file scan would pass for a class Nest never instantiates.
  const module = read(rootDir, 'module') ?? '';
  const providers = /providers:\s*\[([\s\S]*?)\n\s*\],/.exec(module);
  if (providers === null) {
    fail(`${CANONICAL_FILES.module}: no providers array is declared`);
  } else {
    for (const provider of [
      'SaveTemplateDocumentUseCase',
      'TemplateDocumentAuthority',
      'TemplateDocumentMediaAuthority',
    ]) {
      if (!providers[1].includes(provider)) {
        fail(`${CANONICAL_FILES.module}: does not provide ${provider}`);
      }
    }
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-B03A',
    'CMD-TEST-APP3-B03A',
    'CMD-TEST-APP3-B03A-INTEGRATION',
  ]) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3B03A(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkSurface(rootDir, fail);
  checkRequestContract(rootDir, fail);
  checkSaveSemantics(rootDir, fail);
  checkDocumentAuthority(rootDir, fail);
  checkNormalizationProducer(rootDir, fail);
  checkMediaAuthority(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3B03A(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b03a — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b03a — one save operation and no second: a full Design Document snapshot becomes ' +
      'the next immutable version under a compare-and-set that requires a DRAFT header at the ' +
      'caller’s expected version, writes published_at null, and answers a stale token with a ' +
      'conflict and nothing written; the document is judged by APP3-P01 alone — structure, ' +
      'complexity, quantization, canonicalization and contextual media — while placement and ' +
      'containment stay APP3-B04’s publication guard; a placeable image must be a measured ' +
      'derivative of a TEMPLATE_SOURCE asset, decided from persistence and never from object ' +
      'storage; and every newly created Template Asset association appends exactly one ' +
      'normalization request, after the association and inside the same transaction, with the ' +
      'IMP-D046 payload unchanged — with no migration, no dependency, no worker or frontend ' +
      'change and no root script.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
