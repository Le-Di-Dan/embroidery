#!/usr/bin/env node
/**
 * `APP3-B06B` — the published-contract half, runnable alone.
 *
 * Everything here reads the generated artifact and the two lane declarations:
 * the one new operation, the concrete multipart body, the uuid path parameter,
 * the absence of any private value, and the fact that the Admin lane still
 * carries exactly the values `APP2-B01` shipped. Split from the parent on
 * responsibility — these are the checks a reviewer runs when the question is
 * "what did we publish, and did the other lane move", and the parent asks "does
 * the implementation still mean it".
 *
 * Read-only, cross-platform pure Node.
 */
import { acceptedSurface } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, code, read, requireAll } from './check-app3-b06b-files.mjs';

const OPERATION_ID = 'publicDesignSessionAsset_create';
const ROUTE = '/api/public/design-sessions/{sessionId}/assets';

/** 2, 3 — exactly one new operation, concretely published. */
export function checkSurface(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(raw);
  const surface = acceptedSurface(rootDir);
  const paths = Object.keys(document.paths);
  const operations = Object.values(document.paths).reduce(
    (total, item) =>
      total +
      Object.keys(item).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).length,
    0,
  );
  if (paths.length !== surface.paths)
    fail(`${CANONICAL_FILES.openapi}: ${paths.length} paths, expected ${surface.paths}`);
  if (operations !== surface.operations)
    fail(`${CANONICAL_FILES.openapi}: ${operations} operations, expected ${surface.operations}`);

  const item = document.paths[ROUTE];
  if (item === undefined) {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} is not published`);
    return;
  }
  const methods = Object.keys(item).filter((m) =>
    ['get', 'post', 'put', 'patch', 'delete'].includes(m),
  );
  if (methods.length !== 1 || methods[0] !== 'post') {
    fail(`${CANONICAL_FILES.openapi}: ${ROUTE} publishes ${methods.join(',')}, expected one post`);
  }
  const operation = item.post ?? {};
  if (operation.operationId !== OPERATION_ID) {
    fail(`${CANONICAL_FILES.openapi}: operation id is "${operation.operationId}"`);
  }

  // The multipart body must be concrete: one binary part, no metadata fields.
  const body = operation.requestBody?.content?.['multipart/form-data']?.schema;
  const properties = Object.keys(body?.properties ?? {});
  if (body === undefined || properties.length !== 1 || properties[0] !== 'file') {
    fail(`${CANONICAL_FILES.openapi}: the multipart body is not exactly one "file" part`);
  } else if (body.properties.file.format !== 'binary') {
    fail(`${CANONICAL_FILES.openapi}: the file part is not binary`);
  }

  const sessionId = (operation.parameters ?? []).find((p) => p.name === 'sessionId');
  if (sessionId?.in !== 'path' || sessionId.schema?.format !== 'uuid') {
    fail(`${CANONICAL_FILES.openapi}: sessionId does not publish a uuid path parameter`);
  }
  for (const parameter of operation.parameters ?? []) {
    if (Object.keys(parameter.schema ?? {}).length === 0) {
      fail(`${CANONICAL_FILES.openapi}: parameter "${parameter.name}" publishes {}`);
    }
  }
  // Nothing private may reach the contract, in any operation.
  for (const leak of [
    'sessionSecretHash',
    'secretPepper',
    'rawSecret',
    'storageKey',
    'objectKey',
    'claimToken',
    'contentFingerprint',
  ]) {
    if (raw.includes(leak)) fail(`${CANONICAL_FILES.openapi}: publishes "${leak}"`);
  }
  // No presign, upload-intent or completion operation may appear.
  for (const forbidden of ['presign', 'upload-intent', 'uploadIntent', 'upload-complete']) {
    if (raw.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`${CANONICAL_FILES.openapi}: publishes "${forbidden}"; IMP-D048 PO-01 forbids it`);
    }
  }
}

/** 4 — the Session lane, and the Admin lane left alone. */
export function checkLane(rootDir, fail) {
  requireAll(
    rootDir,
    'policy',
    [
      [/MAX_SESSION_UPLOAD_BYTES = 10_485_760/, 'the 10 MiB ceiling is not 10 MiB'],
      [/SESSION_INTAKE_ASSET_KIND = 'CUSTOMER_UPLOAD'/, 'the asset kind is not CUSTOMER_UPLOAD'],
      [
        /SESSION_INTAKE_CLASSIFICATION = 'CUSTOMER_PRIVATE'/,
        'the classification is not CUSTOMER_PRIVATE',
      ],
      [/declaresMetadataFields: false/, 'the lane still declares metadata fields'],
      [/SESSION_UPLOAD_OPERATION_NAMESPACE = '[^']+'/, 'there is no idempotency namespace'],
    ],
    fail,
  );
  const policy = code(read(rootDir, 'policy') ?? '');
  if (/26_214_400|25 \* 1024/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: the Session lane carries the Admin ceiling`);
  }
  // The Admin lane must keep the values APP2-B01 shipped.
  requireAll(
    rootDir,
    'lane',
    [
      [/assetKind: INTAKE_ASSET_KIND/, 'the Admin lane no longer uses the APP2 kind'],
      [/classification: INTAKE_CLASSIFICATION/, 'the Admin lane no longer uses the APP2 class'],
      [/maxUploadBytes: MAX_UPLOAD_BYTES/, 'the Admin lane no longer uses the APP2 ceiling'],
      [/declaresMetadataFields: true/, 'the Admin lane stopped declaring its fields'],
    ],
    fail,
  );
}

/** 10 — the response is bounded and claims nothing it cannot prove. */
export function checkResponse(rootDir, fail) {
  requireAll(
    rootDir,
    'projection',
    [
      [/assetStatus: 'INSPECTING'/, 'the status is not INSPECTING'],
      [/designSessionAssetId: result\.designSessionAssetId/, 'the association id is not returned'],
      [/sessionRevision: result\.sessionRevision/, 'the revision is not returned'],
    ],
    fail,
  );
  const projection = code(read(rootDir, 'projection') ?? '');
  for (const leak of [
    'objectKey',
    'storageKey',
    'checksum',
    'contentFingerprint',
    'secret',
    'url',
  ]) {
    if (new RegExp(`${leak}:`, 'i').test(projection)) {
      fail(`${CANONICAL_FILES.projection}: returns "${leak}"`);
    }
  }
  for (const claim of ['READY', 'ACCEPTED', 'normalized', 'derivative']) {
    if (new RegExp(`'${claim}'`).test(projection)) {
      fail(`${CANONICAL_FILES.projection}: claims "${claim}"; intake proves no such thing`);
    }
  }
}
