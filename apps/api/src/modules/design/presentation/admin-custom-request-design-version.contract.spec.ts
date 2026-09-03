/**
 * The published `APP6-B08` contract, built in process.
 *
 * The integration suite proves what the endpoints *do*; this proves what the
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

const DESIGN_VERSIONS_PATH = '/api/admin/custom-requests/{requestId}/design-versions';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: { readonly $ref?: string } }>;
  };
  readonly responses?: Record<string, unknown>;
}
interface SchemaShape {
  readonly type?: string | readonly string[];
  readonly nullable?: boolean;
  readonly additionalProperties?: boolean;
  readonly properties?: Record<string, SchemaShape>;
  readonly required?: readonly string[];
  readonly allOf?: readonly { readonly $ref?: string }[];
  readonly $ref?: string;
  readonly items?: SchemaShape;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Names no B08 request body may accept.
 *
 * Every one is server-derived, and a body that took any of them would be a body
 * through which a caller could aim a version at another request's design thread,
 * another product's placement, or a lifecycle state it did not reach.
 */
const SERVER_OWNED_FIELDS = [
  'requestId',
  'designCaseId',
  'customerId',
  'customerOwnedProductId',
  'productId',
  'productVariantId',
  'productSideId',
  'embroideryAreaId',
  'adminId',
  'actorKind',
  'status',
  'version',
  'parentVersionId',
  'branch',
  'documentHash',
  'previewHash',
  'previewDerivativeId',
  'createdAt',
];

describe('APP6-B08 — the published Admin design-version contract', () => {
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

  it('publishes exactly two operations, on one path', () => {
    const item = document.paths[DESIGN_VERSIONS_PATH] ?? {};
    expect(Object.keys(item).sort()).toEqual(['get', 'post']);
    expect(item['post']?.operationId).toBe('adminCustomRequestDesignVersion_create');
    expect(item['get']?.operationId).toBe('adminCustomRequestDesignVersion_list');
  });

  it('adds no review, snapshot or design-case route to the design surface', () => {
    // Scoped to design paths on purpose. `APP6-B03`'s
    // `/api/admin/quotations/{id}/versions/{id}/send` is an accepted quotation
    // route, and matching it here would be this test failing for another
    // checkpoint's reasons.
    const designPaths = Object.keys(document.paths).filter((path) => /design/.test(path));
    const forbidden = designPaths.filter(
      (path) =>
        path.includes('design-cases') ||
        path.includes('approval-snapshot') ||
        path.endsWith('/review') ||
        // `APP6-B09` delivered the exact-version send, so a sub-resource under
        // `/design-versions/` is no longer forbidden outright — only one is
        // permitted, and it is asserted by name below.
        (path.includes('/design-versions/') &&
          path !== `${DESIGN_VERSIONS_PATH}/{versionId}` &&
          path !== `${DESIGN_VERSIONS_PATH}/{versionId}/send`),
    );
    // `B10`/`B11` own the customer decision surfaces, and no checkpoint
    // publishes a design case or an Approval Snapshot as an addressable
    // resource.
    expect(forbidden).toEqual([]);
  });

  it('leaves the send to APP6-B09, on one path and with one operation', () => {
    // B08's own claim is unchanged: **this** class publishes two handlers and
    // its module holds no order write repository and no outbox, so nothing it
    // exposes can move a request. The send is a different class, a different
    // module and one operation — asserted here so that a second send route
    // appearing anywhere would fail a B08 test as well as a B09 one.
    const sendItem = document.paths[`${DESIGN_VERSIONS_PATH}/{versionId}/send`] ?? {};
    expect(Object.keys(sendItem)).toEqual(['post']);
    expect(sendItem['post']?.operationId).toBe('adminCustomRequestDesignVersion_send');
  });

  it('addresses the request, never a design case or a version', () => {
    for (const method of ['get', 'post'] as const) {
      // Path and query only. The platform's `X-Request-ID` header is added to
      // every operation by `APP0-B02` and is not a B08 parameter, so it is
      // excluded rather than asserted — this test is about what *addresses* the
      // resource.
      const names = (document.paths[DESIGN_VERSIONS_PATH]?.[method]?.parameters ?? [])
        .filter((parameter) => parameter.in !== 'header')
        .map((parameter) => `${parameter.in}:${parameter.name}`);
      // No `designCaseId`, no `versionId`, no `customerId` and no query
      // parameter at all: the request is the only address.
      expect(names).toEqual(['path:requestId']);
    }
  });

  it('accepts no server-owned field in the create body', () => {
    const ref =
      document.paths[DESIGN_VERSIONS_PATH]?.['post']?.requestBody?.content?.['application/json']
        ?.schema?.$ref;
    const name = ref?.split('/').pop() ?? '';
    const body = document.components.schemas[name];

    expect(body?.additionalProperties).toBe(false);
    const accepted = Object.keys(body?.properties ?? {});
    expect(accepted.sort()).toEqual([
      'document',
      'physicalHeightMm',
      'physicalWidthMm',
      'placementAreaLabel',
      'placementSideLabel',
    ]);
    for (const field of SERVER_OWNED_FIELDS) {
      expect(accepted).not.toContain(field);
    }
  });

  it('types the body document as the generated Design Document component', () => {
    const ref =
      document.paths[DESIGN_VERSIONS_PATH]?.['post']?.requestBody?.content?.['application/json']
        ?.schema?.$ref;
    const body = document.components.schemas[ref?.split('/').pop() ?? ''];
    // Not an open object: `APP3-B08-C1`'s whole point is that a generated client
    // types this as a Design Document rather than an unbounded map.
    expect(body?.properties?.['document']?.allOf?.[0]?.$ref).toBe(
      `#/components/schemas/${DESIGN_DOCUMENT_SCHEMA_NAME}`,
    );
  });

  it('publishes the widened placement ids in the OpenAPI 3.0 dialect', () => {
    const placement = document.components.schemas['DesignPlacementSnapshot'];
    for (const field of ['productSideId', 'embroideryAreaId'] as const) {
      const property = placement?.properties?.[field];
      // 3.0 has no type array. Left untranslated the generated client would fall
      // back to an untyped value, which is the silent widening this dialect
      // translation exists to prevent.
      expect(property?.type).toBe('string');
      expect(property?.nullable).toBe(true);
    }
    // Both stay *required*: absence is expressed as an explicit null, never by
    // dropping the key.
    expect(placement?.required).toEqual(
      expect.arrayContaining(['productSideId', 'embroideryAreaId']),
    );
  });

  it('publishes exactly one Design Document component', () => {
    const roots = Object.keys(document.components.schemas).filter(
      (name) => name === DESIGN_DOCUMENT_SCHEMA_NAME,
    );
    expect(roots).toHaveLength(1);
  });

  it('leaves the APP6-B07 operation untouched', () => {
    expect(
      document.paths['/api/admin/custom-requests/{requestId}/submitted-design']?.['get']
        ?.operationId,
    ).toBe('adminCustomRequestSubmittedDesign_get');
  });

  it('publishes the refusals each operation can actually give', () => {
    const post = document.paths[DESIGN_VERSIONS_PATH]?.['post'];
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '404',
      '409',
      '422',
      '500',
    ]);

    const get = document.paths[DESIGN_VERSIONS_PATH]?.['get'];
    // No 422: a read has no body to reject, and publishing a status the route
    // cannot return is a contract promise nothing keeps.
    expect(Object.keys(get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '409',
      '500',
    ]);
  });
});
