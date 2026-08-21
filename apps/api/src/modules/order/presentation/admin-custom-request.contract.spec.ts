/**
 * The published `APP5-B04` contract, built in process.
 *
 * The integration suites prove what the two endpoints *do*; this proves what the
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

const QUEUE_PATH = '/api/admin/custom-requests';
const DETAIL_PATH = '/api/admin/custom-requests/{requestId}';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}
interface SchemaShape {
  readonly properties?: Record<string, SchemaShape>;
  readonly oneOf?: readonly unknown[];
  readonly discriminator?: { readonly propertyName?: string };
  readonly enum?: readonly string[];
  readonly items?: SchemaShape;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no schema, property name, description or example may contain.
 *
 * Matched case-insensitively over the serialized document, so a field added to
 * any B04 component later cannot introduce one without failing here.
 */
const FORBIDDEN_IN_B04_SCHEMAS = [
  'tokenHash',
  'tokenDigest',
  'storageKey',
  'objectKey',
  'bucket',
  'sessionSecret',
  'secretHash',
  'idempotencyKey',
  'grantToken',
];

/** The Admin-only fields `APP5-B03`'s customer schema must never gain. */
const ADMIN_ONLY_FIELDS = [
  'internalReason',
  'moderationNotes',
  'transitions',
  'customerNote',
  'designSessionId',
];

describe('APP5-B04 — the published Admin request contract', () => {
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

  function propertyNames(schema: string): string[] {
    return Object.keys(document.components.schemas[schema]?.properties ?? {});
  }

  it('publishes exactly two operations, both reads, under one domain', () => {
    expect(Object.keys(document.paths[QUEUE_PATH] ?? {})).toEqual(['get']);
    expect(Object.keys(document.paths[DETAIL_PATH] ?? {})).toEqual(['get']);
    expect(document.paths[QUEUE_PATH]?.['get']?.operationId).toBe('adminCustomRequest_list');
    expect(document.paths[DETAIL_PATH]?.['get']?.operationId).toBe('adminCustomRequest_detail');
  });

  it('publishes no mutation on the two read paths, and only B05’s two beneath them', () => {
    const mutations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/custom-requests'))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => method !== 'get')
          .map((method) => `${method.toUpperCase()} ${path}`),
      );
    // Reconciled by `APP5-B05` (the two moderation writes), then by
    // `APP6-B08` (design-version authoring) and `APP6-B09` (the exact-version
    // send). The assertion is not relaxed: B04's own two paths still carry
    // `get` and nothing else (asserted above), and the only writes anywhere
    // under the prefix are the four named here. A fifth would fail, and so
    // would a note edit, a note delete, a per-transition route, or any route
    // that set a request status directly — `DESIGN_REVIEW` is reached only as a
    // projection of the design send.
    expect(mutations.sort()).toEqual([
      'POST /api/admin/custom-requests/{requestId}/design-versions',
      'POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send',
      'POST /api/admin/custom-requests/{requestId}/moderation-notes',
      'POST /api/admin/custom-requests/{requestId}/transitions',
    ]);
  });

  it('declares the queue filters as query parameters and accepts no body', () => {
    const operation = document.paths[QUEUE_PATH]?.['get'];
    // Query parameters only: the platform adds an `X-Request-ID` header to
    // every operation, and it is not this endpoint's filter surface.
    const names = (operation?.parameters ?? [])
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name)
      .sort();

    expect(names).toEqual([
      'code',
      'contact',
      'contactKind',
      'cursor',
      'limit',
      'status',
      'subjectKind',
      'submittedFrom',
      'submittedTo',
    ]);
    expect(operation?.requestBody).toBeUndefined();
    // No `adminId` in any form: the operator's identity is server-derived (§4).
    expect(names).not.toContain('adminId');
    expect(names).not.toContain('actorId');
  });

  it('publishes the full LC-11 vocabulary on the status filter and the row', () => {
    const statusParameter = (document.paths[QUEUE_PATH]?.['get']?.parameters ?? []).find(
      (parameter) => parameter.name === 'status',
    ) as { readonly schema?: SchemaShape } | undefined;

    expect(statusParameter?.schema?.items?.enum).toEqual([
      'NEW',
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'QUOTED',
      'QUOTE_ACCEPTED',
      'DIGITIZING',
      'DESIGN_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ]);
  });

  it('publishes the queue row without moderation, attachment or contact fields', () => {
    expect(propertyNames('AdminCustomRequestQueueItemResponse')).toEqual([
      'requestId',
      'code',
      'status',
      'subjectKind',
      'subjectSummary',
      'customerId',
      'customerDisplayName',
      'submittedAt',
      'totalQuantity',
    ]);
  });

  it('discriminates the detail subject truthfully, with no shared base', () => {
    const subject =
      document.components.schemas['AdminCustomRequestDetailResponse']?.properties?.['subject'];
    expect(subject?.oneOf).toHaveLength(2);
    expect(subject?.discriminator?.propertyName).toBe('kind');

    // The catalog branch carries the provenance; the customer-owned branch has
    // nowhere to put a product id, so a consumer must narrow before reading one.
    expect(propertyNames('AdminCatalogSubjectResponse')).toContain('designSessionId');
    expect(propertyNames('AdminCustomerOwnedSubjectResponse')).not.toContain('productId');
    expect(propertyNames('AdminCustomerOwnedSubjectResponse')).not.toContain('designSessionId');
  });

  it('keeps the internal and customer-visible reasons as two distinct fields', () => {
    for (const schema of ['AdminCustomRequestDetailResponse', 'AdminRequestTransitionResponse']) {
      const names = propertyNames(schema);
      expect(names).toContain('internalReason');
      expect(names).toContain('customerVisibleReason');
      // No merged field that a later edit could make the single source of both.
      expect(names).not.toContain('reason');
    }
  });

  it('publishes attachment metadata without a locator', () => {
    expect(propertyNames('AdminRequestAssetResponse')).toEqual([
      'assetId',
      'role',
      'linkedAt',
      'mimeType',
      'sizeBytes',
      'status',
    ]);
  });

  it('publishes no credential or object-storage vocabulary in any B04 component', () => {
    const b04Schemas = Object.entries(document.components.schemas).filter(
      ([name]) => name.startsWith('Admin') && name.includes('Request'),
    );
    expect(b04Schemas.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(Object.fromEntries(b04Schemas)).toLowerCase();
    for (const forbidden of FORBIDDEN_IN_B04_SCHEMAS) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }
  });

  /**
   * `APP5-B04` §15.4 — the one narrow cross-check.
   *
   * B04 legitimately reads more than B03, so the risk this checkpoint creates is
   * that a field lands on the wrong schema. One assertion over the customer
   * status component is enough to prove it did not; the B03 suite itself is not
   * rerun.
   */
  it('leaves the B03 customer status schema free of every Admin-only field', () => {
    const names = propertyNames('CustomRequestStatusResponse');
    expect(names).toContain('customerVisibleReason');
    for (const field of ADMIN_ONLY_FIELDS) {
      expect(names).not.toContain(field);
    }
  });
});
