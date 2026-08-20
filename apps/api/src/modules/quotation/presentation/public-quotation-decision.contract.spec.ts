/**
 * The published `APP6-B05` contract, built in process.
 *
 * The integration suites prove what the two decisions *do*; this proves what the
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

const ACCEPT_PATH = '/api/public/quotations/accept';
const REJECT_PATH = '/api/public/quotations/reject';
const CURRENT_PATH = '/api/public/quotations/current';

/** The five Admin quotation operation ids accepted through `APP6-B03`. */
const ACCEPTED_ADMIN_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  '/api/admin/quotations': ['adminQuotation_create'],
  '/api/admin/quotations/{quotationId}/versions': [
    'adminQuotation_addVersion',
    'adminQuotation_versionHistory',
  ],
  '/api/admin/quotations/{quotationId}/versions/{versionId}': ['adminQuotation_versionDetail'],
  '/api/admin/quotations/{quotationId}/versions/{versionId}/send': ['adminQuotation_sendVersion'],
};

/** The APP4/APP5 secure-link operation ids this checkpoint must not disturb. */
const SECURE_LINK_OPERATIONS = ['publicSecureLink_resolve', 'publicCustomRequest_status'];

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: { readonly $ref?: string } }>;
  };
  readonly responses?: Record<string, unknown>;
  readonly security?: unknown;
}
interface SchemaShape {
  readonly type?: string;
  readonly format?: string;
  readonly properties?: Record<string, SchemaShape>;
  readonly additionalProperties?: boolean;
  readonly example?: unknown;
  readonly required?: readonly string[];
  readonly enum?: readonly string[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP6-B05 — the published customer quotation decision contract', () => {
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

  it('publishes exactly two new operations, on the accepted domain and ids', () => {
    expect(Object.keys(document.paths[ACCEPT_PATH] ?? {})).toEqual(['post']);
    expect(Object.keys(document.paths[REJECT_PATH] ?? {})).toEqual(['post']);
    expect(document.paths[ACCEPT_PATH]?.['post']?.operationId).toBe('publicQuotation_accept');
    expect(document.paths[REJECT_PATH]?.['post']?.operationId).toBe('publicQuotation_reject');
  });

  it('leaves APP6-B04’s accepted read operation untouched', () => {
    expect(document.paths[CURRENT_PATH]?.['post']?.operationId).toBe('publicQuotation_current');
  });

  it('leaves the five accepted Admin quotation operation ids untouched', () => {
    const found = Object.entries(ACCEPTED_ADMIN_OPERATIONS).flatMap(([path, ids]) => {
      const item = document.paths[path] ?? {};
      return Object.values(item)
        .map((operation) => operation.operationId)
        .filter((id): id is string => id !== undefined && ids.includes(id));
    });
    expect(found.sort()).toEqual(Object.values(ACCEPTED_ADMIN_OPERATIONS).flat().sort());
  });

  it('leaves the APP4/APP5 secure-link operation ids untouched', () => {
    const published = new Set(
      Object.values(document.paths).flatMap((item) =>
        Object.values(item).map((operation) => operation.operationId),
      ),
    );
    for (const id of SECURE_LINK_OPERATIONS) {
      expect(published.has(id)).toBe(true);
    }
  });

  it('publishes no third decision operation and no identified quotation path', () => {
    const publicQuotationPaths = Object.keys(document.paths).filter((path) =>
      path.startsWith('/api/public/quotations'),
    );
    expect(publicQuotationPaths.sort()).toEqual([ACCEPT_PATH, CURRENT_PATH, REJECT_PATH].sort());
    // No `{...}` segment anywhere on this surface: a public route taking a
    // quotation or version id would be an enumeration oracle.
    for (const path of publicQuotationPaths) {
      expect(path).not.toContain('{');
    }
  });

  describe('the request bodies', () => {
    it.each([
      ['AcceptQuotationBody', ACCEPT_PATH],
      ['RejectQuotationBody', REJECT_PATH],
    ])('%s carries exactly the token and the exact version id', (schema, path) => {
      expect(propertyNames(schema).sort()).toEqual(['token', 'versionId']);
      expect(document.components.schemas[schema]?.required?.slice().sort()).toEqual([
        'token',
        'versionId',
      ]);
      // `.strict()` — nothing else may be sent.
      expect(document.components.schemas[schema]?.additionalProperties).toBe(false);
      expect(document.paths[path]?.['post']?.requestBody).toBeDefined();
    });

    it.each(['AcceptQuotationBody', 'RejectQuotationBody'])(
      '%s accepts no identity, target, credential or amount field',
      (schema) => {
        const forbidden = [
          'quotationId',
          'requestId',
          'customRequestId',
          'code',
          'customerId',
          'email',
          'phone',
          'grantId',
          'scopeKind',
          'challengeId',
          'stepUpChallengeId',
          'acceptedTotalAmount',
          'totalAmount',
          'confirmed',
          'reason',
        ];
        const published = propertyNames(schema);
        for (const field of forbidden) {
          expect(published).not.toContain(field);
        }
      },
    );

    it.each(['AcceptQuotationBody', 'RejectQuotationBody'])(
      '%s publishes no example token',
      (schema) => {
        // An example token is a credential-shaped string in the committed
        // document and pre-filled into Swagger UI's "try it out".
        expect(propertyOf(schema, 'token')?.example).toBeUndefined();
      },
    );
  });

  describe('the token never travels outside the body', () => {
    it.each([ACCEPT_PATH, REJECT_PATH])(
      '%s declares only the platform correlation header',
      (path) => {
        // `X-Request-ID` is applied to every operation by the platform and is not
        // a credential. What matters is that it is the *only* parameter: no path
        // segment, no query string and no second header carries the token or the
        // version id.
        const parameters = document.paths[path]?.['post']?.parameters ?? [];
        expect(parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual([
          'header:X-Request-ID',
        ]);
      },
    );

    it.each([ACCEPT_PATH, REJECT_PATH])('%s declares no security scheme', (path) => {
      // The credential is the body token. A declared scheme would be a second,
      // header-borne credential this surface does not have.
      expect(document.paths[path]?.['post']?.security).toBeUndefined();
    });
  });

  describe('the response bodies', () => {
    it('the acceptance publishes only committed customer-safe facts', () => {
      expect(propertyNames('QuotationAcceptedResponse').sort()).toEqual(
        [
          'acceptedAt',
          'acceptedTotalAmount',
          'currencyCode',
          'quotationStatus',
          'replayed',
          'requestStatus',
          'version',
          'versionId',
          'versionStatus',
        ].sort(),
      );
    });

    it('the rejection publishes only the exact version’s committed state', () => {
      expect(propertyNames('QuotationRejectedResponse').sort()).toEqual(
        ['quotationStatus', 'rejectedAt', 'version', 'versionId', 'versionStatus'].sort(),
      );
    });

    it('the rejection publishes no request status', () => {
      // A rejected quotation is not a rejected request. A field here would
      // invite a screen to say otherwise.
      expect(propertyNames('QuotationRejectedResponse')).not.toContain('requestStatus');
    });

    it.each(['QuotationAcceptedResponse', 'QuotationRejectedResponse'])(
      '%s exposes no credential, identity, audit or downstream field',
      (schema) => {
        const forbidden = [
          'token',
          'tokenHash',
          'grantId',
          'scopeKind',
          'customerId',
          'customRequestId',
          'quotationId',
          'challengeId',
          'stepUpChallengeId',
          'auditEventId',
          'idempotencyRecordId',
          'correlationId',
          'orderId',
          'paymentObligationId',
          'paymentAttemptId',
          'reservationId',
          'depositDueAt',
        ];
        const published = propertyNames(schema);
        for (const field of forbidden) {
          expect(published).not.toContain(field);
        }
      },
    );

    it('the accepted total is published as a string, never a JSON number', () => {
      const amount = propertyOf('QuotationAcceptedResponse', 'acceptedTotalAmount');
      expect(amount?.type).toBe('string');
      expect(amount?.type).not.toBe('number');
    });

    it('every published state field names its enum rather than being free text', () => {
      expect(propertyOf('QuotationAcceptedResponse', 'versionStatus')?.enum).toContain('ACCEPTED');
      expect(propertyOf('QuotationAcceptedResponse', 'quotationStatus')?.enum).toContain(
        'ACCEPTED',
      );
      expect(propertyOf('QuotationAcceptedResponse', 'requestStatus')?.enum).toContain(
        'QUOTE_ACCEPTED',
      );
      expect(propertyOf('QuotationRejectedResponse', 'versionStatus')?.enum).toContain('REJECTED');
    });
  });

  describe('the published refusals', () => {
    it('the acceptance documents the step-up, stale and conflict answers', () => {
      const responses = Object.keys(document.paths[ACCEPT_PATH]?.['post']?.responses ?? {});
      // `500` is the platform's sanitised catch-all, applied to every operation.
      expect(responses.sort()).toEqual(['200', '400', '403', '404', '409', '429', '500', '503']);
    });

    it('the rejection documents no 403, because it requires no step-up', () => {
      const responses = Object.keys(document.paths[REJECT_PATH]?.['post']?.responses ?? {});
      expect(responses).not.toContain('403');
      expect(responses.sort()).toEqual(['200', '400', '404', '409', '429', '500', '503']);
    });
  });
});
