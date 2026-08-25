/**
 * `APP8-B04` — the published transition contract, proved against the built
 * OpenAPI document.
 *
 * Docker-free and fast, on the same reasoning `admin-production-job.contract.spec.ts`
 * records: what a client can *ask for* is decided by the document, and a
 * document assertion fails at the moment the contract changes rather than when a
 * generated client is regenerated later.
 *
 * The route count itself is asserted in `admin-production-job.contract.spec.ts`
 * — the bound on the whole production surface lives in one place — so this file
 * is about the *shape* of the one operation B04 adds.
 */
import type { INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const TRANSITION_PATH = '/api/admin/production-jobs/{jobId}/transitions';

interface SchemaShape {
  readonly type?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly items?: SchemaShape;
  readonly additionalProperties?: unknown;
  readonly enum?: readonly string[];
  readonly $ref?: string;
}
interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: { readonly content?: Record<string, { readonly schema?: SchemaShape }> };
  readonly responses?: Record<string, unknown>;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Fields no transition request may accept.
 *
 * Every one is bound by the server or frozen by an earlier checkpoint. A body
 * taking any of them would let an operator assert an identity the session did
 * not establish, name the reservations to consume, redirect the order, or move
 * the approval a job was frozen from.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'adminId',
  'actorKind',
  'systemJobKey',
  'correlationId',
  'jobId',
  'orderId',
  'orderStatus',
  'approvalSnapshotId',
  'reservationId',
  'reservationIds',
  'skuId',
  'quantity',
  'occurredAt',
  'startedAt',
  'completedAt',
  'cancelledAt',
];

/** Substrings no production response property may contain. */
const FORBIDDEN_RESPONSE_SUBSTRINGS = [
  'contact',
  'price',
  'amount',
  'currency',
  'artifact',
  'storage',
  'bucket',
  'token',
  'secret',
];

describe('APP8-B04 — the published production transition contract', () => {
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

  function operation(): OperationShape {
    const item = document.paths[TRANSITION_PATH];
    expect(item).toBeDefined();
    const found = (item as Record<string, OperationShape>)['post'];
    expect(found).toBeDefined();
    return found as OperationShape;
  }

  function bodySchema(): SchemaShape {
    const schema = operation().requestBody?.content?.['application/json']?.schema;
    expect(schema).toBeDefined();
    return resolve(schema as SchemaShape);
  }

  function resolve(schema: SchemaShape): SchemaShape {
    if (schema.$ref === undefined) {
      return schema;
    }
    const name = schema.$ref.replace('#/components/schemas/', '');
    const target = document.components.schemas[name];
    expect(target).toBeDefined();
    return target as SchemaShape;
  }

  describe('the request contract', () => {
    it('takes the job from the path and the target from the body, and nothing else', () => {
      // `X-Request-ID` is the platform's global correlation header, added to
      // every operation by the OpenAPI augmentation — not something this route
      // declares.
      const declared = (operation().parameters ?? []).filter(
        (parameter) => parameter.in === 'path' || parameter.in === 'query',
      );
      expect(declared.map((parameter) => parameter.name)).toEqual(['jobId']);
      expect(Object.keys(bodySchema().properties ?? {}).sort()).toEqual(['reason', 'to']);
    });

    it('publishes the three targets APP8-B04 owns, and not PLANNED', () => {
      const to = bodySchema().properties?.['to'];
      expect(to?.enum).toEqual(['STARTED', 'COMPLETED', 'CANCELLED']);
      // `PLANNED` is not a destination: `TR-LC18-01` creates a job in it and
      // LC-18 has no move back to it. A rerun is a rework job with its own id.
      expect(to?.enum).not.toContain('PLANNED');
    });

    it('requires the target and leaves the reason conditional', () => {
      expect(bodySchema().required).toEqual(['to']);
    });

    it.each(FORBIDDEN_REQUEST_FIELDS)('never accepts `%s` from the caller', (field) => {
      expect(Object.keys(bodySchema().properties ?? {})).not.toContain(field);
    });
  });

  describe('the response contract', () => {
    function responseSchema(): SchemaShape {
      const schema = document.components.schemas['AdminProductionTransitionResultResponse'];
      expect(schema).toBeDefined();
      return schema as SchemaShape;
    }

    it('publishes the committed transition, both sides of it, and what it terminalized', () => {
      expect(Object.keys(responseSchema().properties ?? {}).sort()).toEqual([
        'fromStatus',
        'jobId',
        'orderId',
        'orderStatus',
        'reservationIds',
        'status',
      ]);
    });

    it('reports the reservations as a list, so an empty one is a truthful answer', () => {
      const reservationIds = responseSchema().properties?.['reservationIds'];
      expect(reservationIds?.type).toBe('array');
      expect(reservationIds?.items?.type).toBe('string');
    });

    it('publishes the whole LC-14 vocabulary for the order, because a cancel moves it nowhere', () => {
      expect(responseSchema().properties?.['orderStatus']?.enum).toContain('DEPOSIT_PAID');
      expect(responseSchema().properties?.['orderStatus']?.enum).toContain('IN_PRODUCTION');
      expect(responseSchema().properties?.['orderStatus']?.enum).toContain('PRODUCTION_COMPLETED');
    });

    it.each(FORBIDDEN_RESPONSE_SUBSTRINGS)('publishes no property containing `%s`', (needle) => {
      const names = Object.keys(responseSchema().properties ?? {});
      expect(names.filter((name) => name.toLowerCase().includes(needle))).toEqual([]);
    });
  });

  describe('the published refusals', () => {
    it('documents every status the guards and the platform can produce', () => {
      expect(Object.keys(operation().responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '403',
        '404',
        '409',
        '415',
        // The platform filter's own entry, published on every operation.
        '500',
      ]);
    });
  });

  describe('the surface stays Admin-only', () => {
    it('exposes no public or customer transition route', () => {
      const stray = Object.keys(document.paths).filter(
        (path) => path.startsWith('/api/public') && /transition|production/i.test(path),
      );
      expect(stray).toEqual([]);
    });
  });
});
