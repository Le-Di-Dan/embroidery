/**
 * The published `APP6-B10` contract, built in process.
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

const CURRENT_PATH = '/api/public/design-reviews/current';

/** The three Admin design-version operation ids accepted through `APP6-B09`. */
const ACCEPTED_DESIGN_OPERATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '/api/admin/custom-requests/{requestId}/design-versions': {
    post: 'adminCustomRequestDesignVersion_create',
    get: 'adminCustomRequestDesignVersion_list',
  },
  '/api/admin/custom-requests/{requestId}/design-versions/{versionId}/send': {
    post: 'adminCustomRequestDesignVersion_send',
  },
  '/api/admin/custom-requests/{requestId}/submitted-design': {
    get: 'adminCustomRequestSubmittedDesign_get',
  },
};

interface SchemaShape {
  readonly type?: string;
  readonly properties?: Record<string, SchemaShape>;
  readonly items?: { readonly $ref?: string };
  readonly allOf?: readonly { readonly $ref?: string }[];
  readonly additionalProperties?: boolean;
  readonly example?: unknown;
  readonly $ref?: string;
}
interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP6-B10 — the published customer design review contract', () => {
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

  it('publishes exactly one new operation, under its own derived public domain', () => {
    const item = document.paths[CURRENT_PATH];

    expect(Object.keys(item ?? {})).toEqual(['post']);
    // Derived from the controller class name; no `CONTROLLER_DOMAIN_KEYS` entry
    // exists or is needed, so no accepted id is reissued to mint this one.
    expect(item?.['post']?.operationId).toBe('publicDesignReview_current');
  });

  it('leaves the accepted APP6 design operation ids untouched', () => {
    for (const [path, methods] of Object.entries(ACCEPTED_DESIGN_OPERATIONS)) {
      for (const [method, operationId] of Object.entries(methods)) {
        expect(document.paths[path]?.[method]?.operationId).toBe(operationId);
      }
    }
  });

  it('leaves the APP6-B04/B05 public quotation operation ids untouched', () => {
    expect(document.paths['/api/public/quotations/current']?.['post']?.operationId).toBe(
      'publicQuotation_current',
    );
    expect(document.paths['/api/public/quotations/accept']?.['post']?.operationId).toBe(
      'publicQuotation_accept',
    );
  });

  it('adds no agreement-publish endpoint anywhere in the document', () => {
    // Publication is a bootstrap action attributed to a real Admin, never a
    // request. A route that could publish or withdraw a term would let anyone
    // who reached it change what customers are bound by.
    const agreementPaths = Object.keys(document.paths).filter((path) => /agreement/i.test(path));
    expect(agreementPaths).toEqual([]);
    const operationIds = Object.values(document.paths).flatMap((item) =>
      Object.values(item).map((operation) => operation.operationId ?? ''),
    );
    expect(operationIds.filter((id) => /agreement/i.test(id))).toEqual([]);
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
    expect(propertyNames('ReadCurrentDesignReviewBody')).toEqual(['token']);
    expect(document.components.schemas['ReadCurrentDesignReviewBody']?.additionalProperties).toBe(
      false,
    );
    // A published example token is a credential-shaped string rendered in
    // Swagger UI and pre-filled into "try it out".
    expect(propertyOf('ReadCurrentDesignReviewBody', 'token')?.example).toBeUndefined();
  });

  it('accepts no target selector and no acceptance the caller could smuggle in', () => {
    const accepted = propertyNames('ReadCurrentDesignReviewBody');

    for (const forbidden of [
      'designVersionId',
      'versionId',
      'designCaseId',
      'requestId',
      'code',
      'customerId',
      'grantId',
      'scopeKind',
      'challengeId',
      'agreementVersionId',
      'acceptedAgreements',
      'documentHash',
    ]) {
      expect(accepted).not.toContain(forbidden);
    }
  });

  it('exposes no public design collection, history or identified read', () => {
    const publicReviewPaths = Object.keys(document.paths).filter((path) =>
      path.startsWith('/api/public/design-reviews'),
    );

    expect(publicReviewPaths).toEqual([CURRENT_PATH]);
    for (const path of publicReviewPaths) {
      expect(path).not.toContain('{');
    }
  });

  it('references the one generated DesignDocument component and duplicates none', () => {
    const documentProperty = propertyOf('CustomerDesignReviewResponse', 'document');

    // Resolved to the P01 component by the `APP3-B08-C1` marker. Left as the
    // placeholder object it is declared as, a generated client would type a
    // customer's artwork as an unbounded map.
    expect(documentProperty?.allOf?.[0]?.$ref).toBe('#/components/schemas/DesignDocument');
    expect(documentProperty?.additionalProperties).toBeUndefined();

    const designDocumentSchemas = Object.keys(document.components.schemas).filter((name) =>
      /^DesignDocument/.test(name),
    );
    expect(designDocumentSchemas).toEqual(['DesignDocument']);
  });

  it('publishes the exact version identity and the stored hash a later approval binds', () => {
    expect(propertyOf('CustomerDesignReviewResponse', 'designVersionId')?.type).toBe('string');
    expect(propertyOf('CustomerDesignReviewResponse', 'documentHash')?.type).toBe('string');
    expect(propertyOf('CustomerDesignReviewResponse', 'documentSchemaVersion')?.type).toBe(
      'number',
    );
  });

  it('publishes every required agreement with its id, type, hash and content', () => {
    const agreements = propertyOf('CustomerDesignReviewResponse', 'agreements');
    expect(agreements?.type).toBe('array');
    expect(agreements?.items?.$ref).toBe('#/components/schemas/DesignReviewAgreementResponse');

    expect(propertyNames('DesignReviewAgreementResponse').sort()).toEqual([
      'agreementType',
      'agreementVersionId',
      'content',
      'contentHash',
      'language',
      'version',
    ]);
    // The type is a plain string, not an enum: `APP6-G01-C1` §5.1 keeps the
    // required set in policy configuration precisely so business may change it
    // without a schema change, and publishing an enum here would freeze it into
    // every generated client.
    expect(propertyOf('DesignReviewAgreementResponse', 'agreementType')?.type).toBe('string');
  });

  it('publishes no storage reference, no private original and no internal identifier', () => {
    const published = propertyNames('CustomerDesignReviewResponse');

    for (const forbidden of [
      'storageKey',
      'bucket',
      'objectKey',
      'previewUrl',
      'downloadUrl',
      'assetId',
      'derivativeId',
      'previewHash',
      'designCaseId',
      'customRequestId',
      'customerId',
      'grantId',
      'scopeKind',
      'token',
      'tokenHash',
      'sessionId',
      'parentVersionId',
      'status',
      'placement',
      'productId',
      'productVariantId',
      'approvedAt',
      'supersededAt',
      'createdAt',
    ]) {
      expect(published).not.toContain(forbidden);
    }
    expect(JSON.stringify(document.paths[CURRENT_PATH])).not.toMatch(/s3|bucket|presigned/i);
  });

  it('documents no-store on the success path', () => {
    const success = document.paths[CURRENT_PATH]?.['post']?.responses?.['200'];
    expect(JSON.stringify(success)).toContain('no-store');
  });

  it('documents the uniform 404 and the platform categories beside it', () => {
    const responses = document.paths[CURRENT_PATH]?.['post']?.responses ?? {};

    // `500` is the platform's own documented category, added to every operation.
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '404', '429', '500', '503']);
    // One refusal for every definitive secure/target unavailability, and none of
    // the internal causes named anywhere in the document.
    expect(JSON.stringify(responses['404'])).toContain('SECURE_LINK_UNAVAILABLE');
    const serialized = JSON.stringify(responses);
    for (const leaked of [
      'DESIGN_CASE_UNRESOLVED',
      'DESIGN_VERSION_NOT_FOUND',
      'REVIEW_ALREADY_ACTIVE',
      'DESIGN_REVIEW_TERMS_UNAVAILABLE',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});
