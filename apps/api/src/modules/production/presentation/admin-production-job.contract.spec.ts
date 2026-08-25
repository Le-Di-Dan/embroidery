/**
 * The published `APP8-B03` contract, built in process.
 *
 * The integration suites prove what the three operations *do*; this proves what
 * the document *says*, which is the half every generated client depends on. It
 * runs before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * It also proves the property the checkpoint exists for at the cheapest
 * possible layer: **the production surface is reachable through the composition
 * root**. A route can only appear in this document if `AdminProductionModule` —
 * and through it `ProductionModule` — is registered in `AppModule`, because the
 * document is built from the real application graph.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const CREATE_PATH = '/api/admin/orders/{orderId}/production-jobs';
const QUEUE_PATH = '/api/admin/production-jobs';
const DETAIL_PATH = '/api/admin/production-jobs/{jobId}';
/** `APP8-B04`'s one addition, asserted here so the bound stays in one place. */
const TRANSITION_PATH = '/api/admin/production-jobs/{jobId}/transitions';

interface SchemaShape {
  readonly type?: string;
  readonly format?: string;
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
  readonly responses?: Record<string, { readonly content?: Record<string, unknown> }>;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Fields no `APP8-B03` **request** may accept.
 *
 * Every one is server-owned, repository-owned or a `B04` concern. A body that
 * took any of them would let an operator name the resulting job, assert an
 * identity the session did not establish, choose the LC-18 state directly,
 * overwrite a value the approval snapshot froze, or reach a reservation.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'jobId',
  'status',
  'adminId',
  'actorId',
  'actorKind',
  'systemJobKey',
  'correlationId',
  'createdAt',
  'startedAt',
  'completedAt',
  'cancelledAt',
  'cancelledReason',
  'reworkedFromJobId',
  'documentHash',
  'productName',
  'variantLabel',
  'sideName',
  'areaName',
  'physicalWidthMm',
  'physicalHeightMm',
  'quantityTotal',
  'reservationId',
  'skuId',
  'skuStockId',
  'assetId',
  'note',
];

/**
 * Substrings no `APP8-B03` **response property name** may contain.
 *
 * `contact` is the frozen `[PII]` copy the approval snapshot carries and B03
 * never republishes; `price`, `amount` and `currency` are Catalog and Payment
 * money, and the deposit is a gate rather than a figure this surface reports;
 * `storage`, `bucket`, `token` and `secret` have no innocent reading anywhere;
 * `artifact` is `PO-APP8-004`.
 *
 * `customer` is deliberately **not** on this list, unlike `APP8-B01`'s. That
 * surface is about a quantity and has no customer-shaped fact at all;
 * `customerOwnedItemCount` here is a count of order lines carrying no customer
 * identity, and it is exactly what makes the COP branch truthful rather than
 * indistinguishable from missing reservation coverage. Banning the substring
 * would ban the honest answer.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
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

const B03_RESPONSE_SCHEMAS = [
  'AdminProductionJobQueueResponse',
  'AdminProductionJobQueueItemResponse',
  'AdminProductionJobDetailResponse',
  'AdminProductionSpecificationResponse',
  'AdminProductionTransitionResponse',
  'AdminProductionReservationResponse',
  'AdminProductionReservationSummaryResponse',
  'AdminProductionJobCreatedResponse',
];

describe('APP8-B03 — the published Admin production contract', () => {
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

  function operation(path: string, method: string): OperationShape {
    const item = document.paths[path];
    expect(item).toBeDefined();
    const found = (item as Record<string, OperationShape>)[method];
    expect(found).toBeDefined();
    return found as OperationShape;
  }

  function schemaOf(name: string): SchemaShape {
    const schema = document.components.schemas[name];
    expect(schema).toBeDefined();
    return schema as SchemaShape;
  }

  describe('the surface is exactly four operations', () => {
    it('publishes two mutations and two reads, and nothing else', () => {
      expect(Object.keys(document.paths[CREATE_PATH] as object)).toEqual(['post']);
      expect(Object.keys(document.paths[QUEUE_PATH] as object)).toEqual(['get']);
      expect(Object.keys(document.paths[DETAIL_PATH] as object)).toEqual(['get']);
      expect(Object.keys(document.paths[TRANSITION_PATH] as object)).toEqual(['post']);
    });

    it('names them in one Admin domain', () => {
      expect(operation(CREATE_PATH, 'post').operationId).toBe('adminProductionJob_create');
      expect(operation(QUEUE_PATH, 'get').operationId).toBe('adminProductionJob_list');
      expect(operation(DETAIL_PATH, 'get').operationId).toBe('adminProductionJob_get');
      expect(operation(TRANSITION_PATH, 'post').operationId).toBe('adminProductionJob_transition');
    });

    /**
     * The composition proof, and the bound on the phase's size in one
     * assertion: every production route in the whole document is one of these
     * four. `APP8-B04` added exactly one — the transitions collection — and an
     * artifact, note or customer route still fails here.
     */
    it('publishes exactly four production operations across the entire document', () => {
      const operations = Object.entries(document.paths)
        .filter(([path]) => /production/i.test(path))
        .flatMap(([path, item]) =>
          Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
        );
      expect(operations.sort()).toEqual(
        [
          `POST ${CREATE_PATH}`,
          `GET ${QUEUE_PATH}`,
          `GET ${DETAIL_PATH}`,
          `POST ${TRANSITION_PATH}`,
        ].sort(),
      );
    });

    /**
     * One transitions collection, not three verbs. `APP8-B04` §3 caps the
     * mutation surface at two operations for the whole checkpoint; a
     * `/start`, `/complete` or `/cancel` route would publish three operation
     * ids for one state machine and is what this assertion forbids. Artifacts
     * and notes stay outside APP8 entirely (`PO-APP8-004`).
     */
    it('adds no per-verb, artifact or note route under the production surface', () => {
      const stray = Object.keys(document.paths).filter((path) =>
        /production-jobs\/\{jobId\}\/(start|complete|cancel|artifacts|notes)/i.test(path),
      );
      expect(stray).toEqual([]);
    });

    it('exposes no public or customer production route', () => {
      const publicProduction = Object.keys(document.paths).filter(
        (path) => path.startsWith('/api/public') && /production|job/i.test(path),
      );
      expect(publicProduction).toEqual([]);
    });

    /**
     * `APP7-B02`'s Admin order reads share the `admin/orders` base path and are
     * untouched. The two surfaces would collide if either had chosen the
     * other's segment shape.
     */
    it('leaves the APP7-B02 Admin order operations exactly as they were', () => {
      expect(document.paths['/api/admin/orders']?.['get']?.operationId).toBe('adminOrder_list');
      expect(document.paths['/api/admin/orders/{orderId}']?.['get']?.operationId).toBe(
        'adminOrder_detail',
      );
    });
  });

  describe('the request contract', () => {
    it('locates creation by the order and both reads by the job', () => {
      const pathParams = (path: string, method: string): readonly string[] =>
        (operation(path, method).parameters ?? [])
          .filter((parameter) => parameter.in === 'path')
          .map((parameter) => parameter.name);

      expect(pathParams(CREATE_PATH, 'post')).toEqual(['orderId']);
      expect(pathParams(QUEUE_PATH, 'get')).toEqual([]);
      expect(pathParams(DETAIL_PATH, 'get')).toEqual(['jobId']);
    });

    it('accepts only an approval confirmation and machine parameters on creation', () => {
      const raw = operation(CREATE_PATH, 'post').requestBody?.content?.['application/json']?.schema;
      const ref = (raw as SchemaShape).$ref;
      const body =
        ref === undefined
          ? (raw as SchemaShape)
          : schemaOf(ref.replace('#/components/schemas/', ''));

      expect(Object.keys(body.properties ?? {}).sort()).toEqual([
        'approvalSnapshotId',
        'productionParameters',
      ]);
      // Both optional: the authoritative approval is resolved from the order.
      expect(body.required ?? []).toEqual([]);
      expect(body.additionalProperties).toBe(false);
      for (const field of FORBIDDEN_REQUEST_FIELDS) {
        expect(body.properties?.[field]).toBeUndefined();
      }
    });

    it('publishes the queue filters, and no invented priority', () => {
      const names = (operation(QUEUE_PATH, 'get').parameters ?? [])
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => parameter.name);

      expect(names.sort()).toEqual(['cursor', 'limit', 'orderId', 'status']);
      expect(names).not.toContain('priority');
      expect(names).not.toContain('operatorId');
      expect(names).not.toContain('machineId');
    });
  });

  describe('the response contract', () => {
    it('publishes a bounded, cursor-paged queue row', () => {
      const page = schemaOf('AdminProductionJobQueueResponse');
      expect(Object.keys(page.properties ?? {}).sort()).toEqual(['hasNext', 'items', 'nextCursor']);
      expect(page.required ?? []).not.toContain('nextCursor');

      const item = schemaOf('AdminProductionJobQueueItemResponse');
      expect(Object.keys(item.properties ?? {}).sort()).toEqual(
        [
          'approvalSnapshotId',
          'cancelledAt',
          'completedAt',
          'createdAt',
          'jobId',
          'orderId',
          'startedAt',
          'status',
        ].sort(),
      );
      expect(item.properties?.['status']?.enum).toEqual([
        'PLANNED',
        'STARTED',
        'COMPLETED',
        'CANCELLED',
      ]);
      // Only `createdAt` is guaranteed; the rest are LC-18 evidence that may
      // not have happened yet.
      for (const field of ['startedAt', 'completedAt', 'cancelledAt']) {
        expect(item.required ?? []).not.toContain(field);
      }
    });

    it('publishes the frozen specification as stored, dimensions as strings', () => {
      const spec = schemaOf('AdminProductionSpecificationResponse');
      expect(Object.keys(spec.properties ?? {}).sort()).toEqual(
        [
          'approvalSnapshotId',
          'areaName',
          'documentHash',
          'physicalHeightMm',
          'physicalWidthMm',
          'productName',
          'productionParameters',
          'quantityTotal',
          'sideName',
          'variantLabel',
        ].sort(),
      );
      // `numeric`, transported exactly as stored — never a rounded JSON number.
      expect(spec.properties?.['physicalWidthMm']?.type).toBe('string');
      expect(spec.properties?.['physicalHeightMm']?.type).toBe('string');
      expect(spec.properties?.['quantityTotal']?.type).toBe('number');
      // A COP subject has no variant (INV-13), so it cannot be required.
      expect(spec.required ?? []).not.toContain('variantLabel');
    });

    it('publishes the reservation summary as read-only context', () => {
      const summary = schemaOf('AdminProductionReservationSummaryResponse');
      expect(Object.keys(summary.properties ?? {}).sort()).toEqual([
        'catalogItemCount',
        'customerOwnedItemCount',
        'required',
        'reservations',
      ]);
      expect(summary.properties?.['required']?.type).toBe('boolean');

      const reservation = schemaOf('AdminProductionReservationResponse');
      expect(Object.keys(reservation.properties ?? {}).sort()).toEqual([
        'quantity',
        'reservationId',
        'skuId',
        'skuStockId',
        'status',
      ]);
      // Every LC-17 reservation state, so a released row is distinguishable
      // from one that never existed.
      expect(reservation.properties?.['status']?.enum).toEqual([
        'RESERVED',
        'CONSUMED',
        'RELEASED',
        'EXPIRED',
      ]);
    });

    it('publishes the detail with an optional specification and summary', () => {
      const detail = schemaOf('AdminProductionJobDetailResponse');
      expect(detail.required ?? []).not.toContain('specification');
      expect(detail.required ?? []).not.toContain('reservationSummary');
      expect(detail.properties?.['transitions']?.type).toBe('array');
      // The creation receipt names the job and nothing the detail owns.
      expect(
        Object.keys(schemaOf('AdminProductionJobCreatedResponse').properties ?? {}).sort(),
      ).toEqual(['approvalSnapshotId', 'jobId', 'orderId', 'status'].sort());
    });

    it('carries no customer, money or artifact fact anywhere', () => {
      for (const name of B03_RESPONSE_SCHEMAS) {
        for (const property of Object.keys(schemaOf(name).properties ?? {})) {
          for (const forbidden of FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS) {
            expect(property.toLowerCase()).not.toContain(forbidden);
          }
        }
      }
    });

    it('answers with JSON only — no production operation serves a byte', () => {
      for (const [path, method, status] of [
        [CREATE_PATH, 'post', '201'],
        [QUEUE_PATH, 'get', '200'],
        [DETAIL_PATH, 'get', '200'],
      ] as const) {
        expect(Object.keys(operation(path, method).responses?.[status]?.content ?? {})).toEqual([
          'application/json',
        ]);
      }
    });

    it('documents the refusals each operation can actually produce', () => {
      expect(Object.keys(operation(QUEUE_PATH, 'get').responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        // The platform's sanitised fault response, on every operation.
        '500',
      ]);
      expect(Object.keys(operation(DETAIL_PATH, 'get').responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '404',
        '500',
      ]);
      // The mutation adds the staff-origin and JSON-only refusals, and the
      // three conflicts the reads cannot produce.
      expect(Object.keys(operation(CREATE_PATH, 'post').responses ?? {}).sort()).toEqual([
        '201',
        '400',
        '401',
        '403',
        '404',
        '409',
        '415',
        '500',
      ]);
    });
  });
});
