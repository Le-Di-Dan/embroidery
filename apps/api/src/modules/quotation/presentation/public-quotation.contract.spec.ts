/**
 * The published `APP6-B04` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half a browser and every generated client
 * actually depend on. It runs before the single generation slot is spent, so a
 * defect found here costs nothing while one found in the committed artifact
 * costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const CURRENT_PATH = '/api/public/quotations/current';

/** The five Admin quotation operation ids accepted through `APP6-B03`. */
const ACCEPTED_ADMIN_OPERATIONS: Readonly<Record<string, string>> = {
  '/api/admin/quotations': 'adminQuotation_create',
  '/api/admin/quotations/{quotationId}/versions': 'adminQuotation_addVersion',
  '/api/admin/quotations/{quotationId}/versions/{versionId}/send': 'adminQuotation_sendVersion',
};

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}
interface SchemaShape {
  readonly type?: string;
  readonly properties?: Record<string, SchemaShape>;
  readonly items?: SchemaShape;
  readonly additionalProperties?: boolean;
  readonly example?: unknown;
  readonly required?: readonly string[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP6-B04 — the published customer quotation contract', () => {
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

  function propertyOf(schema: string, property: string): SchemaShape | undefined {
    return document.components.schemas[schema]?.properties?.[property];
  }

  it('publishes exactly one new operation, under its own public domain', () => {
    const item = document.paths[CURRENT_PATH];

    expect(Object.keys(item ?? {})).toEqual(['post']);
    expect(item?.['post']?.operationId).toBe('publicQuotation_current');
  });

  it('leaves the five accepted Admin quotation operation ids untouched', () => {
    for (const [path, operationId] of Object.entries(ACCEPTED_ADMIN_OPERATIONS)) {
      expect(document.paths[path]?.['post']?.operationId).toBe(operationId);
    }
    const versionsPath = '/api/admin/quotations/{quotationId}/versions';
    expect(document.paths[versionsPath]?.['get']?.operationId).toBe(
      'adminQuotation_versionHistory',
    );
    expect(
      document.paths['/api/admin/quotations/{quotationId}/versions/{versionId}']?.['get']
        ?.operationId,
    ).toBe('adminQuotation_versionDetail');
  });

  it('leaves the APP5 public secure-link operation ids untouched', () => {
    expect(document.paths['/api/public/custom-requests/status']?.['post']?.operationId).toBe(
      'publicCustomRequest_status',
    );
    expect(document.paths['/api/public/custom-requests']?.['post']?.operationId).toBe(
      'publicCustomRequest_submit',
    );
  });

  it('carries the credential in the body and in no other position', () => {
    const operation = document.paths[CURRENT_PATH]?.['post'];

    expect(operation?.requestBody).toBeDefined();
    // No path, query or cookie parameter at all, and the only header is the
    // platform's own correlation id, which every operation carries and which is
    // not a credential. A token in any of those positions reaches the gateway
    // access log, the application request log and every proxy in between.
    expect(operation?.parameters?.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual([
      'header:X-Request-ID',
    ]);
    expect(CURRENT_PATH).not.toContain('{');
  });

  it('accepts a token and nothing else, with no example credential', () => {
    expect(propertyNames('ReadCurrentQuotationBody')).toEqual(['token']);
    expect(document.components.schemas['ReadCurrentQuotationBody']?.additionalProperties).toBe(
      false,
    );
    // A published example token is a credential-shaped string rendered in
    // Swagger UI and pre-filled into "try it out".
    expect(propertyOf('ReadCurrentQuotationBody', 'token')?.example).toBeUndefined();
  });

  it('exposes no public quotation collection, history or identified read', () => {
    const publicQuotationPaths = Object.keys(document.paths).filter((path) =>
      path.startsWith('/api/public/quotations'),
    );

    // `APP6-B05` added the two customer decisions to this base path. They are
    // listed rather than the assertion being deleted, because the property this
    // test exists for is untouched by them: every public quotation route is a
    // **fixed** sub-path, so there is still no collection, no history read and —
    // the part that matters — no identified route a caller could walk. That last
    // one is asserted directly below, where it cannot be lost by adding a name
    // to a list.
    expect(publicQuotationPaths.sort()).toEqual([
      '/api/public/quotations/accept',
      CURRENT_PATH,
      '/api/public/quotations/reject',
    ]);
    for (const path of publicQuotationPaths) {
      expect(path).not.toContain('{');
    }
  });

  it('publishes every amount as a string, never a JSON number', () => {
    for (const amount of [
      'subtotalAmount',
      'manualAdjustmentAmount',
      'shippingFeeAmount',
      'totalAmount',
      'depositPercent',
      'depositAmount',
      'remainingAmount',
    ]) {
      expect(propertyOf('CustomerQuotationResponse', amount)?.type).toBe('string');
    }
    for (const amount of ['unitPriceAmount', 'lineTotalAmount']) {
      expect(propertyOf('CustomerQuotationLineItemResponse', amount)?.type).toBe('string');
    }
  });

  it('publishes the exact version id the later decision will be bound to', () => {
    expect(propertyOf('CustomerQuotationResponse', 'versionId')?.type).toBe('string');
    expect(propertyOf('CustomerQuotationResponse', 'expired')?.type).toBe('boolean');
  });

  it('publishes no operator evidence and no identifier the caller did not present', () => {
    const published = propertyNames('CustomerQuotationResponse');

    for (const forbidden of [
      'adjustmentReason',
      'stitchCount',
      'customerId',
      'customRequestId',
      'quotationId',
      'grantId',
      'scopeKind',
      'token',
      'tokenHash',
      'acceptedAt',
      'supersededAt',
      'expiredAt',
      'createdAt',
    ]) {
      expect(published).not.toContain(forbidden);
    }
    expect(propertyNames('CustomerQuotationLineItemResponse')).not.toContain('skuId');
  });

  it('documents the uniform 404 and the platform categories beside it', () => {
    const responses = document.paths[CURRENT_PATH]?.['post']?.responses ?? {};

    // `500` is the platform's own documented category, added to every operation.
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '404', '429', '500', '503']);
    // No `409`, no `410` and no second 404 code: this surface publishes exactly
    // one refusal for every definitive secure/target unavailability.
    expect(JSON.stringify(responses['404'])).toContain('SECURE_LINK_UNAVAILABLE');
    expect(JSON.stringify(responses)).not.toContain('QUOTATION_NOT_FOUND');
  });
});
