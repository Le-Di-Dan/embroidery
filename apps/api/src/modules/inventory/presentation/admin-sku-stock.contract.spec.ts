/**
 * The published `APP8-B01` contract, built in process.
 *
 * The integration suite proves what the three operations *do*; this proves what
 * the document *says*, which is the half every generated client depends on. It
 * runs before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * It also proves the property the checkpoint exists for at the cheapest
 * possible layer: **the inventory surface is reachable through the composition
 * root**. A route can only appear in this document if `AdminSkuStockModule` —
 * and through it `InventoryModule` — is registered in `AppModule`, because the
 * document is built from the real application graph.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const STOCK_PATH = '/api/admin/skus/{skuId}/stock';
const ADJUST_PATH = '/api/admin/skus/{skuId}/stock/adjustments';
const LEDGER_PATH = '/api/admin/skus/{skuId}/stock/ledger';
/**
 * `APP7-B01`'s SKU update, named here rather than filtered past.
 *
 * The repository-wide bound below matches on `/api/admin/skus`, so a new route
 * under that base must be *named* to stay inside it — which is what keeps
 * "B01 publishes three operations, and none of them edits a SKU" checkable
 * after a sibling checkpoint adds a fourth.
 */
const B01_SKU_UPDATE_PATH = '/api/admin/skus/{skuId}';

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
 * Fields no `APP8-B01` **request** may accept.
 *
 * Every one is server-owned or repository-owned. A body that took any of them
 * would let an operator name another SKU's anchor, assert an identity the
 * session did not establish, choose the resulting quantity directly instead of
 * stating a delta, or write a ledger entry kind of their own choosing.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'skuId',
  'skuStockId',
  'quantityOnHand',
  'available',
  'heldQuantity',
  'reservedQuantity',
  'lowStockThreshold',
  'entryKind',
  'adminId',
  'actorId',
  'actorKind',
  'systemJobKey',
  'orderId',
  'reservationId',
  'softHoldId',
  'customRequestId',
  'occurredAt',
  'correlationId',
];

/**
 * Substrings no `APP8-B01` **response property name** may contain.
 *
 * `order`, `customer`, `request` and `reservationId` are the customer-owned
 * facts an inventory screen must never carry (`APP8` exit gate); `price`,
 * `amount` and `currency` are Catalog and Payment money; `storage`/`bucket`/
 * `token`/`secret` have no innocent reading anywhere; `production` and `job`
 * are `APP8-B03`/`B04`, not this checkpoint.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
  'order',
  'customer',
  'request',
  'price',
  'amount',
  'currency',
  'production',
  'job',
  'storage',
  'bucket',
  'token',
  'secret',
  'admin',
];

const B01_RESPONSE_SCHEMAS = [
  'AdminSkuStockResponse',
  'AdminSkuStockLedgerResponse',
  'AdminSkuStockLedgerEntryResponse',
];

describe('APP8-B01 — the published Admin stock contract', () => {
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

  describe('the surface is exactly three operations', () => {
    it('publishes two reads and one mutation, and nothing else', () => {
      expect(Object.keys(document.paths[STOCK_PATH] as object)).toEqual(['get']);
      expect(Object.keys(document.paths[ADJUST_PATH] as object)).toEqual(['post']);
      expect(Object.keys(document.paths[LEDGER_PATH] as object)).toEqual(['get']);
    });

    it('names them in one Admin domain', () => {
      expect(operation(STOCK_PATH, 'get').operationId).toBe('adminSkuStock_get');
      expect(operation(ADJUST_PATH, 'post').operationId).toBe('adminSkuStock_adjust');
      expect(operation(LEDGER_PATH, 'get').operationId).toBe('adminSkuStock_ledger');
    });

    /**
     * The composition proof, and the bound on the checkpoint's size in one
     * assertion: every route under `admin/skus` is one of these three. A fourth
     * inventory route — or an accidental reservation, hold or production
     * surface reached from this module — fails here.
     */
    it('publishes exactly three operations beneath the Admin SKU-stock surface', () => {
      const operations = Object.entries(document.paths)
        .filter(([path]) => path.startsWith('/api/admin/skus'))
        .flatMap(([path, item]) =>
          Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
        );
      expect(operations.sort()).toEqual(
        [
          `GET ${STOCK_PATH}`,
          `POST ${ADJUST_PATH}`,
          `GET ${LEDGER_PATH}`,
          // APP7-B01's SKU update shares this base path and is untouched.
          `PATCH ${B01_SKU_UPDATE_PATH}`,
        ].sort(),
      );
    });

    /**
     * `APP7-B01`'s two accepted SKU-authoring ids are untouched. The two
     * surfaces share the word `skus` and would collide if either had chosen the
     * other's base path.
     */
    it('leaves the APP7-B01 SKU authoring operations exactly as they were', () => {
      expect(
        document.paths['/api/admin/products/{productId}/variants/{variantId}/skus']?.['post']
          ?.operationId,
      ).toBe('adminSku_create');
      expect(document.paths[B01_SKU_UPDATE_PATH]?.['patch']?.operationId).toBe('adminSku_update');
      // The two surfaces share a base path and differ by one segment, so Nest
      // matches on segment count and method regardless of registration order.
      expect(Object.keys(document.paths[B01_SKU_UPDATE_PATH] as object)).toEqual(['patch']);
    });

    it('publishes no inventory reservation, hold or production route at all', () => {
      const stray = Object.keys(document.paths).filter((path) =>
        /reservation|soft-hold|production/i.test(path),
      );
      expect(stray).toEqual([]);
    });

    it('exposes no public or customer inventory route', () => {
      const publicInventory = Object.keys(document.paths).filter(
        (path) => path.startsWith('/api/public') && /stock|inventory|ledger/i.test(path),
      );
      expect(publicInventory).toEqual([]);
    });
  });

  describe('the request contract', () => {
    it('locates every operation by the SKU, never by the stock anchor', () => {
      for (const [path, method] of [
        [STOCK_PATH, 'get'],
        [ADJUST_PATH, 'post'],
        [LEDGER_PATH, 'get'],
      ] as const) {
        const parameters = operation(path, method).parameters ?? [];
        // The platform augmentation adds the optional `X-Request-ID` header to
        // every operation; what matters here is that the only *path* parameter
        // is the SKU.
        expect(
          parameters
            .filter((parameter) => parameter.in === 'path')
            .map((parameter) => parameter.name),
        ).toEqual(['skuId']);
      }
    });

    it('accepts a delta and a reason, and refuses every server-owned field', () => {
      const raw = operation(ADJUST_PATH, 'post').requestBody?.content?.['application/json']?.schema;
      const ref = (raw as SchemaShape).$ref;
      const body =
        ref === undefined
          ? (raw as SchemaShape)
          : schemaOf(ref.replace('#/components/schemas/', ''));

      expect(Object.keys(body.properties ?? {}).sort()).toEqual(['delta', 'reason']);
      expect([...(body.required ?? [])].sort()).toEqual(['delta', 'reason']);
      expect(body.additionalProperties).toBe(false);
      for (const field of FORBIDDEN_REQUEST_FIELDS) {
        expect(body.properties?.[field]).toBeUndefined();
      }
    });
  });

  describe('the response contract', () => {
    it('publishes the computed availability and the low-stock signal', () => {
      const stock = schemaOf('AdminSkuStockResponse');
      expect(Object.keys(stock.properties ?? {}).sort()).toEqual(
        [
          'available',
          'heldQuantity',
          'lowStock',
          'lowStockThreshold',
          'quantityOnHand',
          'reservedQuantity',
          'skuId',
          'skuStockId',
        ].sort(),
      );
      // Quantities are JSON numbers: they are `integer` columns, not money.
      for (const field of ['quantityOnHand', 'heldQuantity', 'reservedQuantity', 'available']) {
        expect(stock.properties?.[field]?.type).toBe('number');
      }
      expect(stock.properties?.['lowStock']?.type).toBe('boolean');
      // Absent means "no threshold configured", so it must not be required.
      expect(stock.required ?? []).not.toContain('lowStockThreshold');
    });

    it('publishes a bounded, newest-first ledger page', () => {
      const ledger = schemaOf('AdminSkuStockLedgerResponse');
      expect(Object.keys(ledger.properties ?? {}).sort()).toEqual([
        'entries',
        'skuId',
        'skuStockId',
        'truncated',
      ]);
      expect(ledger.properties?.['entries']?.type).toBe('array');

      const entry = schemaOf('AdminSkuStockLedgerEntryResponse');
      expect(Object.keys(entry.properties ?? {}).sort()).toEqual([
        'entryKind',
        'occurredAt',
        'onHandDelta',
        'quantity',
        'reason',
      ]);
      expect(entry.properties?.['entryKind']?.enum).toContain('ADJUSTMENT');
      // A movement that carries no reason is ordinary; only ADJUSTMENT needs one.
      expect(entry.required ?? []).not.toContain('reason');
    });

    it('carries no customer-owned, money or production fact anywhere', () => {
      for (const name of B01_RESPONSE_SCHEMAS) {
        for (const property of Object.keys(schemaOf(name).properties ?? {})) {
          for (const forbidden of FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS) {
            expect(property.toLowerCase()).not.toContain(forbidden);
          }
        }
      }
    });

    it('answers with JSON only — no stock operation serves a byte', () => {
      for (const [path, method] of [
        [STOCK_PATH, 'get'],
        [ADJUST_PATH, 'post'],
        [LEDGER_PATH, 'get'],
      ] as const) {
        expect(Object.keys(operation(path, method).responses?.['200']?.content ?? {})).toEqual([
          'application/json',
        ]);
      }
    });

    it('documents the refusals each operation can actually produce', () => {
      expect(Object.keys(operation(STOCK_PATH, 'get').responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '404',
        // The platform's sanitised fault response, on every operation.
        '500',
      ]);
      expect(Object.keys(operation(LEDGER_PATH, 'get').responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '404',
        '500',
      ]);
      // The mutation adds the staff-origin and JSON-only refusals, and the
      // negative-stock conflict the read cannot produce.
      expect(Object.keys(operation(ADJUST_PATH, 'post').responses ?? {}).sort()).toEqual([
        '200',
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
