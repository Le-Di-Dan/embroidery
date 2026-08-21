/**
 * The published `APP6-B07` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';
import { DESIGN_DOCUMENT_SCHEMA_NAME } from '../../../openapi/design-document-schema.augmentation';

const SUBMITTED_DESIGN_PATH = '/api/admin/custom-requests/{requestId}/submitted-design';
const OPERATION_ID = 'adminCustomRequestSubmittedDesign_get';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, { readonly content?: Record<string, unknown> }>;
  readonly security?: readonly unknown[];
}
interface SchemaShape {
  readonly type?: string;
  readonly nullable?: boolean;
  readonly properties?: Record<string, SchemaShape>;
  readonly allOf?: readonly { readonly $ref?: string }[];
  readonly $ref?: string;
  readonly items?: SchemaShape;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no B07 schema, property name, description or example may contain.
 *
 * Matched case-insensitively over the serialized B07 components, so a field
 * added to any of them later cannot introduce one without failing here.
 */
const FORBIDDEN_IN_B07_SCHEMAS = [
  'sessionSecret',
  'secretHash',
  'tokenHash',
  'tokenDigest',
  'pepper',
  'cookie',
  'storageKey',
  'objectKey',
  'bucket',
  'presign',
  'checksum',
  'grantToken',
  'idempotencyKey',
];

describe('APP6-B07 — the published Admin submitted-design contract', () => {
  let app: INestApplication;
  let document: OpenApiShape;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    previousUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    app = await createApiApplication({ logger: false });
    document = buildOpenApiDocument(app) as unknown as OpenApiShape;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
  });

  const operation = (): OperationShape | undefined =>
    document.paths[SUBMITTED_DESIGN_PATH]?.['get'];

  it('publishes exactly one operation on the path, and it is a read', () => {
    expect(Object.keys(document.paths[SUBMITTED_DESIGN_PATH] ?? {})).toEqual(['get']);
    expect(operation()?.operationId).toBe(OPERATION_ID);
  });

  it('adds no mutation anywhere under the Admin request prefix beyond the accepted set', () => {
    const mutations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/custom-requests'))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => method !== 'get')
          .map((method) => `${method.toUpperCase()} ${path}`),
      );

    // Unchanged by B07 itself: it authors no design version, sets no pointer,
    // moves no session and offers no download or export (§9, §14). The design
    // entries belong to later checkpoints — `APP6-B08`'s authoring route and
    // `APP6-B09`'s exact-version send — and this assertion freezes the *whole*
    // Admin request mutation surface, so each was reconciled here deliberately
    // rather than appearing unnoticed. The send is on the list; a route that
    // moved a request's status directly would not be.
    expect(mutations.sort()).toEqual([
      'POST /api/admin/custom-requests/{requestId}/design-versions',
      'POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send',
      'POST /api/admin/custom-requests/{requestId}/moderation-notes',
      'POST /api/admin/custom-requests/{requestId}/transitions',
    ]);
  });

  it('publishes no Admin route addressed by a session id, and no Admin session API', () => {
    // The `APP3-B06A` public routes under `/api/public/design-sessions/{sessionId}`
    // are unchanged and out of scope: those callers hold the Session secret and
    // prove it. What B07 must not create is a *staff* route addressed by a
    // session, which is the generic Admin Design Session API §3 forbids.
    const adminSessionAddressed = Object.keys(document.paths).filter(
      (path) => path.startsWith('/api/admin/') && path.toLowerCase().includes('session'),
    );
    expect(adminSessionAddressed).toEqual([]);
  });

  it('leaves the two APP5-B04 operation ids untouched', () => {
    expect(document.paths['/api/admin/custom-requests']?.['get']?.operationId).toBe(
      'adminCustomRequest_list',
    );
    expect(document.paths['/api/admin/custom-requests/{requestId}']?.['get']?.operationId).toBe(
      'adminCustomRequest_detail',
    );
  });

  it('takes the request id from the path, no body, and no query parameter at all', () => {
    const parameters = operation()?.parameters ?? [];

    expect(parameters.filter((p) => p.in === 'path').map((p) => p.name)).toEqual(['requestId']);
    // No `sessionId` anywhere, in any position: the caller cannot name a
    // session, so a foreign one cannot be requested (§4, §13).
    expect(parameters.map((p) => p.name)).not.toContain('sessionId');
    // The platform's `X-Request-ID` header is the only non-path parameter, and
    // no session identifier may ever travel in a query string (§10).
    expect(parameters.filter((p) => p.in === 'query')).toEqual([]);
    expect(operation()?.requestBody).toBeUndefined();
  });

  it('is guarded by the Admin cookie scheme and documents 401 and 404', () => {
    expect(JSON.stringify(operation()?.security ?? [])).toContain('adminSession');
    // `500` is the platform's, added to every operation by the document
    // builder; the four this controller declares are the ones above it.
    expect(Object.keys(operation()?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
  });

  it('answers JSON only — no binary rendition, preview or download', () => {
    expect(Object.keys(operation()?.responses?.['200']?.content ?? {})).toEqual([
      'application/json',
    ]);
  });

  it('publishes the source as a nullable object with exactly four fields', () => {
    const wrapper = document.components.schemas['AdminSubmittedDesignResponse'];
    expect(Object.keys(wrapper?.properties ?? {})).toEqual(['submittedDesign']);
    expect(wrapper?.properties?.['submittedDesign']?.nullable).toBe(true);

    const source = document.components.schemas['AdminSubmittedDesignSourceResponse'];
    expect(Object.keys(source?.properties ?? {}).sort()).toEqual([
      'document',
      'documentSchemaVersion',
      'revision',
      'sessionId',
    ]);
  });

  it('reuses the generated APP3-P01 DesignDocument component rather than restating it', () => {
    const source = document.components.schemas['AdminSubmittedDesignSourceResponse'];
    const documentProperty = source?.properties?.['document'];

    // The marker must have been resolved into a reference by the augmentation:
    // a residual open object would mean the generated client typed the document
    // as an unbounded map, which is the debt `APP3-B08-C1` closed.
    expect(documentProperty?.allOf?.[0]?.$ref).toBe(
      `#/components/schemas/${DESIGN_DOCUMENT_SCHEMA_NAME}`,
    );
    expect(documentProperty?.type).toBeUndefined();
    expect(JSON.stringify(documentProperty)).not.toContain('x-embroidery-published-schema');
    expect(document.components.schemas[DESIGN_DOCUMENT_SCHEMA_NAME]).toBeDefined();

    // The same component the customer-facing session snapshot references. One
    // structural definition, not an Admin-flavoured second one.
    expect(
      document.components.schemas['DesignSessionSnapshotResponse']?.properties?.['document']
        ?.allOf?.[0]?.$ref,
    ).toBe(documentProperty?.allOf?.[0]?.$ref);
  });

  it('names no secret, credential or storage vocabulary in either B07 component', () => {
    const serialized = JSON.stringify([
      document.components.schemas['AdminSubmittedDesignResponse'],
      document.components.schemas['AdminSubmittedDesignSourceResponse'],
      operation(),
    ]).toLowerCase();

    for (const forbidden of FORBIDDEN_IN_B07_SCHEMAS) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }
  });
});
