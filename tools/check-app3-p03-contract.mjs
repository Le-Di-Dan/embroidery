#!/usr/bin/env node
/**
 * `APP3-P03` — what the DTO foundation **publishes**.
 *
 * Split from `check-app3-p03.mjs` by responsibility. That file asserts the
 * *mechanism*: the conversion authority, the refusal to fall back, the wiring,
 * and that runtime validation stayed exactly where it was. This one asserts the
 * *result*: that every schema-backed DTO in the repository is registered, that
 * none hand-decorates its way around the platform, and that no request body —
 * or anything a request body references — publishes as an empty object in the
 * committed artifact or the generated client.
 *
 * It also owns the canonical file map, so the dependency between the two halves
 * runs one way and there is no cycle.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-p03-contract.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { acceptedSurface } from './app3-accepted-surface.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PLATFORM = 'apps/api/src/platform';

export const CANONICAL_FILES = Object.freeze({
  converter: `${PLATFORM}/openapi/zod-openapi-schema.ts`,
  converterSpec: `${PLATFORM}/openapi/zod-openapi-schema.spec.ts`,
  augmentation: `${PLATFORM}/openapi/zod-dto-schema.augmentation.ts`,
  augmentationSpec: `${PLATFORM}/openapi/zod-dto-schema.augmentation.spec.ts`,
  publicationSpec: `${PLATFORM}/openapi/zod-dto-publication.contract.spec.ts`,
  platformIndex: `${PLATFORM}/openapi/index.ts`,
  registry: `${PLATFORM}/validation/zod-dto-registry.ts`,
  registrySpec: `${PLATFORM}/validation/zod-dto-registry.spec.ts`,
  dto: `${PLATFORM}/validation/zod-dto.ts`,
  pipe: `${PLATFORM}/validation/zod-validation.pipe.ts`,
  validationIndex: `${PLATFORM}/validation/index.ts`,
  builder: 'apps/api/src/openapi/build-openapi-document.ts',
  apiManifest: 'apps/api/package.json',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  clientSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  governance: 'docs/implementation/VALIDATION_GOVERNANCE.md',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  rootManifest: 'package.json',
});

const REQUEST_MODULE_ROOT = 'apps/api/src/modules';

export const PATH_COUNT = 19;
export const OPERATION_COUNT = 23;
export const MINIMUM_CONSUMERS = 16;
export const MINIMUM_JSON_BODIES = 7;

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];

/** The bodies whose generated client types must name real fields. */
const PUBLISHED_BODY_TYPES = Object.freeze([
  'CreateProductBody',
  'UpdateProductBody',
  'ArchiveProductBody',
  'PublishProductBody',
  'UnpublishProductBody',
  'ReplaceProductPlacementBody',
  'ReplacePlacementSideBody',
  'ReplacePlacementAreaBody',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Source with comments removed, so prose explaining a rule cannot satisfy a scan. */
export function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function openapi(rootDir) {
  const raw = read(rootDir, 'openapi');
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** Every `*.request.ts` module in the API source tree. */
export function requestModules(rootDir) {
  const root = join(rootDir, REQUEST_MODULE_ROOT);
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.request.ts'))
        found.push({ path: entry.name, source: readFileSync(path, 'utf8') });
    }
  };
  walk(root);
  return found.sort((left, right) => (left.path < right.path ? -1 : 1));
}

/** Every `class X extends createZodDto(...)` the repository declares. */
export function zodDtoConsumers(rootDir) {
  const consumers = [];
  for (const { path, source } of requestModules(rootDir)) {
    for (const match of source.matchAll(/class\s+(\w+)\s+extends\s+createZodDto\(/g)) {
      consumers.push({ name: match[1], path, source });
    }
  }
  return consumers;
}

/** 1 — every canonical file exists. Everything after depends on it. */
function checkFilesExist(rootDir, fail) {
  for (const [key, path] of Object.entries(CANONICAL_FILES)) {
    if (read(rootDir, key) === undefined) fail(`${path} is missing`);
  }
}

/** 2 — every schema-backed DTO in the repository is registered for publication. */
function checkEveryConsumerRegistered(rootDir, fail) {
  const consumers = zodDtoConsumers(rootDir);
  if (consumers.length < MINIMUM_CONSUMERS) {
    fail(`only ${String(consumers.length)} createZodDto consumers found; the inventory is wrong`);
  }
  for (const consumer of consumers) {
    const registered = new RegExp(`registerZodDtos\\([^)]*\\b${consumer.name}\\b`, 's').test(
      consumer.source,
    );
    if (!registered) fail(`${consumer.path}: ${consumer.name} is never registered for publication`);
  }
}

/**
 * 3 — no schema-backed DTO carries its own `@ApiProperty` body.
 *
 * The workaround this checkpoint replaced. One DTO re-acquiring it would mean
 * the platform silently stopped covering that body while the document still
 * looked correct — the defect returning through the door marked "just this one".
 */
function checkNoManualWorkaround(rootDir, fail) {
  for (const consumer of zodDtoConsumers(rootDir)) {
    const decorated = new RegExp(
      `class\\s+${consumer.name}\\s+extends\\s+createZodDto\\([^)]*\\)\\s*\\{[^}]*@Api`,
    ).test(consumer.source);
    if (decorated) {
      fail(`${consumer.path}: ${consumer.name} hand-decorates its own OpenAPI metadata`);
    }
  }
}

function resolver(document) {
  const schemas = document.components?.schemas ?? {};
  return [
    schemas,
    (schema) =>
      schema?.$ref === undefined
        ? schema
        : schemas[schema.$ref.replace('#/components/schemas/', '')],
  ];
}

/** 4 — no JSON request body in the published document is empty, at any depth. */
function checkNoEmptyPublishedBody(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;
  const [, resolve] = resolver(document);

  let bodies = 0;
  const visit = (schema, operationId, seen) => {
    if (schema?.$ref !== undefined) {
      if (seen.has(schema.$ref)) return;
      seen.add(schema.$ref);
    }
    const resolved = resolve(schema);
    if (resolved === undefined || typeof resolved !== 'object') return;
    if (resolved.type === 'object' && Object.keys(resolved.properties ?? {}).length === 0) {
      fail(`${operationId}: publishes an empty request-body schema`);
      return;
    }
    for (const property of Object.values(resolved.properties ?? {})) {
      visit(property.items ?? property, operationId, seen);
    }
  };

  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      const schema = operation?.requestBody?.content?.['application/json']?.schema;
      if (schema === undefined) continue;
      bodies += 1;
      visit(schema, operation.operationId ?? 'an operation', new Set());
    }
  }
  if (bodies < MINIMUM_JSON_BODIES) {
    fail(`only ${String(bodies)} JSON request bodies found; the sweep is vacuous`);
  }
}

/** 5 — the placement body keeps its exact `APP3-B01-C1` contract. */
function checkPlacementBody(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;
  const [schemas, resolve] = resolver(document);
  const body = schemas.ReplaceProductPlacementBody;
  if (body === undefined) {
    fail('ReplaceProductPlacementBody is no longer published');
    return;
  }
  const required = [...(body.required ?? [])].sort().join(',');
  if (required !== 'expectedUpdatedAt,sides') {
    fail(`ReplaceProductPlacementBody requires ${required || 'nothing'}, not the token and sides`);
  }
  const token = body.properties?.expectedUpdatedAt ?? {};
  if (token.format !== 'date-time' || !String(token.pattern ?? '').includes('[+-]')) {
    fail('the placement concurrency token no longer publishes as an offset-bearing date-time');
  }
  const side = resolve(body.properties?.sides?.items);
  if (side === undefined || Object.keys(side.properties ?? {}).length < 12) {
    fail('the nested Side body is no longer published in full');
    return;
  }
  const area = resolve(side.properties?.areas?.items);
  if (area === undefined || Object.keys(area.properties ?? {}).length < 11) {
    fail('the nested Area body is no longer published in full');
  }
  // The authored documentation moved onto the Zod schema; losing it there would
  // be invisible in the field list, so it is asserted separately.
  if (side.properties?.backgroundAssetId?.description === undefined) {
    fail('the authored field descriptions were lost when the body moved onto the platform');
  }
}

/** 6 — the generated client exposes real fields, not an open bag. */
function checkGeneratedClient(rootDir, fail) {
  const client = read(rootDir, 'clientSchemas') ?? '';
  for (const name of PUBLISHED_BODY_TYPES) {
    const declared = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(client);
    if (declared === null) {
      fail(`the generated client no longer declares ${name}`);
      continue;
    }
    if (declared[1].includes('[key: string]: unknown')) {
      fail(`the generated client types ${name} as an open bag rather than its fields`);
    }
  }
  if (!/expectedUpdatedAt: string;/.test(client)) {
    fail('the generated client no longer types the concurrency token');
  }
  if (!/sides: ReplacePlacementSideBody\[\];/.test(client)) {
    fail('the generated client no longer types the nested placement side list');
  }
}

/** 7 — no route, operation or capability was added. */
function checkNoSurfaceDelta(rootDir, fail) {
  const document = openapi(rootDir);
  if (document === undefined) return;
  const paths = Object.keys(document.paths ?? {});
  if (paths.length !== acceptedSurface(rootDir).paths) {
    fail(
      `the document publishes ${String(paths.length)} paths; APP3-P03 adds none to ${String(acceptedSurface(rootDir).paths)}`,
    );
  }
  let operations = 0;
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const method of Object.keys(pathItem)) if (HTTP_METHODS.includes(method)) operations += 1;
  }
  if (operations !== acceptedSurface(rootDir).operations) {
    fail(
      `the document publishes ${String(operations)} operations; APP3-P03 adds none to ${String(acceptedSurface(rootDir).operations)}`,
    );
  }
  const background =
    document.paths?.['/api/public/products/{slug}/sides/{sideCode}/background']?.get;
  if (background === undefined || background.operationId !== 'publicProductSideBackground_get') {
    fail('the APP3-B02 binary operation was disturbed');
  } else if (background.requestBody !== undefined) {
    fail('a request body was added to the APP3-B02 binary operation');
  }
}

export function checkApp3P03Contract(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkFilesExist(rootDir, fail);
  checkEveryConsumerRegistered(rootDir, fail);
  checkNoManualWorkaround(rootDir, fail);
  checkNoEmptyPublishedBody(rootDir, fail);
  checkPlacementBody(rootDir, fail);
  checkGeneratedClient(rootDir, fail);
  checkNoSurfaceDelta(rootDir, fail);

  return failures;
}

async function main() {
  const failures = checkApp3P03Contract(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-p03-contract — ${String(failures.length)} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-p03-contract — every createZodDto consumer is registered for publication and ' +
      'none hand-decorates its way around the platform; no JSON request body, and nothing any ' +
      'of them references, publishes as an empty object; the placement body keeps its exact ' +
      'APP3-B01-C1 contract down to the nested Area and its authored descriptions; the generated ' +
      'client types real fields instead of an open bag; and the 19 paths, 23 operations and the ' +
      'APP3-B02 binary route are untouched',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
