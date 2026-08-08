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

/** The generated P01 component the autosave body must reference (`APP3-B08-C1`). */
const DESIGN_DOCUMENT_SCHEMA = 'DesignDocument';
const PUBLISHED_SCHEMA_MARKER = 'x-embroidery-published-schema';

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
  // `APP3-B08-C1`: the snapshot publishes the generated P01 component, not an
  // open object. An open object is not a contract — it typed the generated
  // client as an unbounded map — so the reference is the assertion, and a
  // regression to `type: 'object'` must fail here rather than pass as "an
  // object was published".
  const documentField = schema.properties?.document ?? {};
  const reference = documentField.$ref ?? documentField.allOf?.[0]?.$ref;
  if (reference !== `#/components/schemas/${DESIGN_DOCUMENT_SCHEMA}`) {
    fail(
      `${CANONICAL_FILES.openapi}: the document snapshot does not reference ${DESIGN_DOCUMENT_SCHEMA}`,
    );
  }
  if (document.components?.schemas?.[DESIGN_DOCUMENT_SCHEMA] === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${DESIGN_DOCUMENT_SCHEMA} is not published as a component`);
  }
  // The marker is an internal opt-in, never part of the contract.
  if (JSON.stringify(document).includes(PUBLISHED_SCHEMA_MARKER)) {
    fail(`${CANONICAL_FILES.openapi}: the published-schema marker leaked into the artifact`);
  }
  // OpenAPI 3.0 has no `const`; a draft-07 keyword surviving the conversion
  // would make the element union unreadable to every generator.
  if (/"const"\s*:/.test(JSON.stringify(document.components?.schemas ?? {}))) {
    fail(`${CANONICAL_FILES.openapi}: a draft-07 "const" keyword survived into OpenAPI 3.0`);
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
  // `APP3-B08-C1`: the whole point of the correction. Before it the client typed
  // the snapshot as an unbounded map, so a caller got no help and no safety.
  if (!/export interface DesignDocument\b/.test(schemas)) {
    fail(`${CANONICAL_FILES.clientSchemas}: the Design Document type was not generated`);
  }
  if (!/document: DesignDocument/.test(schemas)) {
    fail(`${CANONICAL_FILES.clientSchemas}: the autosave body does not carry the document type`);
  }
  for (const leak of ['sessionSecretHash', 'storageKey', 'objectKey']) {
    if (schemas.includes(leak) || client.includes(leak)) {
      fail(`${CANONICAL_FILES.client}: generated client exposes "${leak}"`);
    }
  }
}
