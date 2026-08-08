#!/usr/bin/env node
/**
 * `APP3-B08` — the published autosave contract.
 *
 * Split from the parent gate so both halves stay inside the tooling size
 * standard. This half owns everything read out of the generated artifact: the
 * accepted counts, the single operation, the concrete request body, and the
 * absence of anything B08 does not own.
 *
 * Read-only, cross-platform pure Node.
 */
import { acceptedSurface } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, HTTP_METHODS, OPERATION, ROUTE, read } from './check-app3-b08-files.mjs';

/** 2 — exactly one new operation, published concretely. */
export function checkSurface(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(raw);
  const accepted = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths ?? {});
  const operations = paths.reduce(
    (total, path) =>
      total + Object.keys(document.paths[path]).filter((m) => HTTP_METHODS.includes(m)).length,
    0,
  );

  if (paths.length !== accepted.paths) {
    fail(`${CANONICAL_FILES.openapi}: ${paths.length} paths, expected ${accepted.paths}`);
  }
  if (operations !== accepted.operations) {
    fail(`${CANONICAL_FILES.openapi}: ${operations} operations, expected ${accepted.operations}`);
  }
  if (accepted.schemas !== undefined) {
    const schemas = Object.keys(document.components?.schemas ?? {}).length;
    if (schemas !== accepted.schemas) {
      fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${accepted.schemas}`);
    }
  }

  const entry = document.paths?.[ROUTE];
  if (entry === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} is not published`);
    return;
  }
  const methods = Object.keys(entry).filter((m) => HTTP_METHODS.includes(m));
  if (methods.length !== 1 || methods[0] !== 'put') {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} publishes ${methods.join(',')}, expected only put`);
    return;
  }
  const put = entry.put;
  if (put.operationId !== OPERATION) {
    fail(`${CANONICAL_FILES.openapi}: operation id is "${String(put.operationId)}"`);
  }

  const sessionId = (put.parameters ?? []).find((parameter) => parameter.name === 'sessionId');
  if (sessionId?.schema?.format !== 'uuid' || sessionId.required !== true) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} has no required uuid path parameter`);
  }
  if (put.responses?.['409'] === undefined) {
    fail(`${CANONICAL_FILES.openapi}: a stale revision is not documented as 409`);
  }

  checkRequestSchema(document, put, fail);
  checkNoPrivateMaterial(raw, fail);
  checkNoForbiddenOperations(paths, fail);
}

/** The body must be concrete — never the empty schema `createZodDto` can emit. */
function checkRequestSchema(document, put, fail) {
  const ref = put.requestBody?.content?.['application/json']?.schema?.$ref;
  const name = typeof ref === 'string' ? ref.split('/').pop() : undefined;
  const schema = name === undefined ? undefined : document.components?.schemas?.[name];
  if (schema === undefined) {
    fail(`${CANONICAL_FILES.openapi}: the autosave body is not a concrete component schema`);
    return;
  }
  const properties = Object.keys(schema.properties ?? {});
  if (properties.length === 0) {
    fail(`${CANONICAL_FILES.openapi}: the autosave body publishes an empty schema`);
    return;
  }
  const required = schema.required ?? [];
  for (const field of ['expectedRevision', 'document']) {
    if (!required.includes(field)) {
      fail(`${CANONICAL_FILES.openapi}: "${field}" is not required on the autosave body`);
    }
  }
  const revision = schema.properties?.expectedRevision;
  if (revision?.type !== 'integer' || revision.minimum !== 0) {
    fail(`${CANONICAL_FILES.openapi}: expectedRevision is not an integer with minimum 0`);
  }
  if (schema.properties?.document?.type !== 'object') {
    fail(`${CANONICAL_FILES.openapi}: the document snapshot is not published as an object`);
  }
  // The caller never supplies the persisted schema version; the server derives
  // it from the document itself.
  if (properties.includes('documentSchemaVersion')) {
    fail(`${CANONICAL_FILES.openapi}: the caller may not choose the persisted schema version`);
  }
}

function checkNoPrivateMaterial(raw, fail) {
  for (const leak of [
    'sessionSecretHash',
    'secretPepper',
    'storageKey',
    'objectKey',
    'claimToken',
    'scopeKey',
    'networkKey',
  ]) {
    if (raw.includes(leak)) {
      fail(`${CANONICAL_FILES.openapi}: publishes private material "${leak}"`);
    }
  }
}

/** B08 is autosave and nothing adjacent to it. */
function checkNoForbiddenOperations(paths, fail) {
  for (const path of paths) {
    if (!path.startsWith('/api/public/design-sessions')) continue;
    if (/\/(patch|elements|submit|collaborat|presign|history|versions)/.test(path)) {
      fail(`${CANONICAL_FILES.openapi}: ${path} is beyond the one autosave operation`);
    }
  }
}

/** 11 — the generated client is current and carries concrete types. */
export function checkGeneratedClient(rootDir, fail) {
  const client = read(rootDir, 'client') ?? '';
  const schemas = read(rootDir, 'clientSchemas') ?? '';
  if (!client.includes('publicDesignSessionAutosave')) {
    fail(`${CANONICAL_FILES.client}: the autosave method was not generated`);
  }
  if (!schemas.includes('AutosaveDesignSessionBody')) {
    fail(`${CANONICAL_FILES.clientSchemas}: the autosave body type was not generated`);
  }
  if (!/expectedRevision: number/.test(schemas)) {
    fail(`${CANONICAL_FILES.clientSchemas}: the request type is not concrete`);
  }
  for (const leak of ['sessionSecretHash', 'storageKey', 'objectKey']) {
    if (schemas.includes(leak) || client.includes(leak)) {
      fail(`${CANONICAL_FILES.client}: generated client exposes "${leak}"`);
    }
  }
}
