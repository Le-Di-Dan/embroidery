/**
 * The published `APP5-B03` contract, built in process.
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

const STATUS_PATH = '/api/public/custom-requests/status';
const SUBMIT_PATH = '/api/public/custom-requests';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}
interface SchemaShape {
  readonly properties?: Record<string, SchemaShape>;
  readonly additionalProperties?: boolean;
  readonly oneOf?: readonly unknown[];
  readonly discriminator?: unknown;
  readonly example?: unknown;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

describe('APP5-B03 — the published grant-scoped status contract', () => {
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

  /** The declared property names of one published component. */
  function propertyNames(schema: string): string[] {
    return Object.keys(document.components.schemas[schema]?.properties ?? {});
  }

  /** One declared property of one published component. */
  function propertyOf(schema: string, property: string): SchemaShape | undefined {
    return document.components.schemas[schema]?.properties?.[property];
  }

  it('publishes exactly one new operation, under the custom-request domain', () => {
    const item = document.paths[STATUS_PATH];

    expect(Object.keys(item ?? {})).toEqual(['post']);
    expect(item?.['post']?.operationId).toBe('publicCustomRequest_status');
    // `APP5-B01`'s accepted operation id is untouched by the controller split.
    expect(document.paths[SUBMIT_PATH]?.['post']?.operationId).toBe('publicCustomRequest_submit');
  });

  it('carries the credential in the body and in no other position', () => {
    const operation = document.paths[STATUS_PATH]?.['post'];

    expect(operation?.requestBody).toBeDefined();
    // No path, query or cookie parameter at all, and the only header is the
    // platform's own correlation id, which every operation carries and which is
    // not a credential. A token in any of those positions reaches the gateway
    // access log, the application request log and every proxy in between.
    expect(operation?.parameters?.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual([
      'header:X-Request-ID',
    ]);
    expect(STATUS_PATH).not.toContain('{');
  });

  it('exposes no customer request list or collection read', () => {
    // `APP5-R00` §10.2 and `APP5-G01` §10 exclude a customer request list. The
    // assertion is over the whole published surface rather than one path, so a
    // list added anywhere under a public request route would fail it.
    const publicRequestReads = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) => method === 'get')
        .filter(() => path.startsWith('/api/public/custom-request'))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(publicRequestReads).toEqual([
      // The only public GET in this family is `APP5-B02`'s per-asset intake
      // status, which is keyed by a single asset id and lists nothing.
      'GET /api/public/custom-request-intake/challenges/{challengeId}/assets/{assetId}',
    ]);
  });

  it('accepts a token and nothing else — no request id, code or identity', () => {
    expect(propertyNames('ReadCustomRequestStatusBody')).toEqual(['token']);
    expect(document.components.schemas['ReadCustomRequestStatusBody']?.additionalProperties).toBe(
      false,
    );
  });

  it('returns the request code but never accepts one', () => {
    expect(propertyNames('CustomRequestStatusResponse')).toContain('code');
    expect(propertyNames('ReadCustomRequestStatusBody')).not.toContain('code');
  });

  it('publishes a truthful discriminated subject', () => {
    const subject = propertyOf('CustomRequestStatusResponse', 'subject');

    expect(subject?.oneOf).toEqual([
      { $ref: '#/components/schemas/CatalogRequestSubjectResponse' },
      { $ref: '#/components/schemas/CustomerOwnedRequestSubjectResponse' },
    ]);
    expect(subject?.discriminator).toEqual({ propertyName: 'kind' });
    // Both members are published, so neither `$ref` dangles in a generated client.
    expect(document.components.schemas['CatalogRequestSubjectResponse']).toBeDefined();
    expect(document.components.schemas['CustomerOwnedRequestSubjectResponse']).toBeDefined();
  });

  it('names no storage, credential, session or moderation field anywhere in its schemas', () => {
    const owned = [
      'CustomRequestStatusResponse',
      'CatalogRequestSubjectResponse',
      'CustomerOwnedRequestSubjectResponse',
      'RequestQuantityLineResponse',
      'RequestAssetResponse',
      'ReadCustomRequestStatusBody',
    ];
    const properties = owned.flatMap(propertyNames);

    for (const forbidden of [
      'storageKey',
      'bucket',
      'checksum',
      'mediaType',
      'byteSize',
      'inspection',
      'tokenHash',
      'grantId',
      'customerId',
      'sessionId',
      'submittedSessionId',
      'challengeId',
      'idempotencyKey',
      'reason',
      'cancelledReason',
      'moderationNote',
      'adminId',
      'actorKind',
      'correlationId',
    ]) {
      expect(properties).not.toContain(forbidden);
    }
    // The one reason field that does cross is the customer-facing one.
    expect(properties).toContain('customerVisibleReason');
  });

  it('publishes no token-shaped example a client could pre-fill', () => {
    expect(propertyOf('ReadCustomRequestStatusBody', 'token')?.example).toBeUndefined();
  });
});
