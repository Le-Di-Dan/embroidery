/**
 * The published `APP7-B02` contract, built in process.
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

const QUEUE_PATH = '/api/admin/orders';
const DETAIL_PATH = '/api/admin/orders/{orderId}';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly {
    readonly name: string;
    readonly in: string;
    readonly required?: boolean;
    readonly schema?: SchemaShape;
  }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}
interface SchemaShape {
  readonly type?: string;
  readonly format?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly enum?: readonly string[];
  readonly items?: SchemaShape;
  readonly $ref?: string;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no B02 schema may contain **anywhere** — name, description or
 * example.
 *
 * Every entry is a credential or a storage identity, and none of them has an
 * innocent reading in an order document, so matching the serialized text is
 * right: a value smuggled into an `example` would be as disclosed as one in a
 * property.
 */
const FORBIDDEN_TEXT_IN_B02_SCHEMAS = [
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

/**
 * Substrings no B02 **property name** may contain.
 *
 * Matched against names rather than the whole document, because these are words
 * a truthful order document does use in prose — an order line names the
 * approval "evidence" that authorized it — while a *field* carrying one would be
 * the `APP7-B02` §8 boundary broken: `APP7-B04` owns Admin payment operations,
 * and APP8 owns inventory and production.
 */
const FORBIDDEN_PROPERTY_SUBSTRINGS = [
  'payment',
  'obligation',
  'attempt',
  'transferreference',
  'evidence',
  'provider',
  'reconcil',
  'qr',
  'bankaccount',
  'inventory',
  'production',
];

/** Fields whose only possible source is live Catalog state (`APP7-B02` §3). */
const LIVE_CATALOG_FIELDS = [
  'productId',
  'productVariantId',
  'productSideId',
  'embroideryAreaId',
  'skuCode',
  'basePriceAmount',
  'priceOverrideAmount',
  'slug',
  'categoryId',
];

describe('APP7-B02 — the published Admin order contract', () => {
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

  function schemaOf(name: string): SchemaShape {
    const schema = document.components.schemas[name];
    expect(schema).toBeDefined();
    return schema as SchemaShape;
  }

  function propertyNames(name: string): string[] {
    return Object.keys(schemaOf(name).properties ?? {});
  }

  it('publishes exactly two operations, both reads, under one domain', () => {
    expect(Object.keys(document.paths[QUEUE_PATH] ?? {})).toEqual(['get']);
    expect(Object.keys(document.paths[DETAIL_PATH] ?? {})).toEqual(['get']);
    expect(document.paths[QUEUE_PATH]?.['get']?.operationId).toBe('adminOrder_list');
    expect(document.paths[DETAIL_PATH]?.['get']?.operationId).toBe('adminOrder_detail');
  });

  it('publishes no further B02 operation anywhere beneath /api/admin/orders', () => {
    const operations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/orders'))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
      );

    // Every operation under the prefix, named rather than filtered past, so a
    // route added by a later checkpoint has to be acknowledged here.
    //
    // `{orderId}/payments` is `APP7-B04`'s Admin deposit read: a different
    // controller in a different module, published as its own `adminOrderPayment`
    // domain. B04's two **mutations** are not here at all — they address
    // `admin/payment-attempts`.
    //
    // `POST {orderId}/production-jobs` is `APP8-B03`'s job creation and
    // `POST {orderId}/transitions` is `APP9-B01`'s one guarded LC-14 command.
    // Both are writes, and neither is B02's: they live in modules of their own
    // precisely because `AdminOrderModule` holds no writer, which is the
    // property the two assertions below still prove. B02's two operation ids and
    // its two response schemas are untouched by either.
    // `APP9-B04` added the shipping-detail read and write and `APP9-B05` the
    // dispatch and completion commands; this inventory was never updated for
    // them and had been failing at HEAD since. `APP12-A02-C1` records them,
    // because it runs this suite and a permanently red assertion proves
    // nothing. All four are writes or reads owned by their own modules, and
    // none of them is B02's: the property under test — that `AdminOrderModule`
    // itself holds no writer — is unchanged, and `APP12-A02-C1` adds no
    // operation of its own to this list.
    expect(operations.sort()).toEqual([
      'GET /api/admin/orders',
      'GET /api/admin/orders/{orderId}',
      'GET /api/admin/orders/{orderId}/payments',
      'GET /api/admin/orders/{orderId}/shipping-detail',
      'POST /api/admin/orders/{orderId}/completion',
      'POST /api/admin/orders/{orderId}/dispatch',
      'POST /api/admin/orders/{orderId}/production-jobs',
      'POST /api/admin/orders/{orderId}/transitions',
      'PUT /api/admin/orders/{orderId}/shipping-detail',
    ]);
  });

  it('declares the queue filters as query parameters and accepts no body', () => {
    const operation = document.paths[QUEUE_PATH]?.['get'];
    expect(operation?.requestBody).toBeUndefined();

    const parameters = (operation?.parameters ?? []).filter((one) => one.in === 'query');
    expect(parameters.map((one) => one.name).sort()).toEqual([
      'cursor',
      'limit',
      'origin',
      'status',
    ]);
    expect(parameters.every((one) => one.required !== true)).toBe(true);

    // `APP12-A02-C1` — the origin filter is served by the **server**, so it has
    // to exist as a parameter here. A queue whose only origin filter was a
    // client-side predicate would page over the unfiltered set and hand an
    // operator short pages with a cursor that skips rows.
    const origin = parameters.find((one) => one.name === 'origin');
    expect(origin?.schema?.items?.enum).toEqual(['CUSTOM', 'READY_MADE']);
  });

  it('declares the detail id as a path parameter and accepts no body', () => {
    const operation = document.paths[DETAIL_PATH]?.['get'];
    expect(operation?.requestBody).toBeUndefined();
    // Path parameters only: the platform's `X-Request-ID` header augmentation
    // applies to every operation and is not B02's contract to assert here.
    expect(
      (operation?.parameters ?? []).filter((one) => one.in === 'path').map((one) => one.name),
    ).toEqual(['orderId']);
  });

  it('documents both operations as Admin cookie-authenticated with a 401 answer', () => {
    for (const path of [QUEUE_PATH, DETAIL_PATH]) {
      const operation = document.paths[path]?.['get'];
      expect(JSON.stringify(operation?.security ?? [])).toContain('adminSession');
      expect(Object.keys(operation?.responses ?? {})).toContain('401');
    }
    expect(Object.keys(document.paths[DETAIL_PATH]?.['get']?.responses ?? {})).toContain('404');
  });

  it('publishes the queue row as order-owned facts only', () => {
    expect(propertyNames('AdminOrderQueueItemResponse').sort()).toEqual([
      'code',
      'createdAt',
      'currencyCode',
      'customRequestId',
      'customerId',
      'orderId',
      'origin',
      'status',
      'totalAmount',
    ]);
    expect(propertyNames('AdminOrderQueueResponse').sort()).toEqual([
      'hasNext',
      'items',
      'nextCursor',
    ]);
  });

  it('publishes the detail as the order root plus its frozen lines', () => {
    expect(propertyNames('AdminOrderDetailResponse').sort()).toEqual([
      'acceptedQuotationVersionId',
      'code',
      'createdAt',
      'currencyCode',
      'currentApprovalSnapshotId',
      'customRequestId',
      'customerId',
      'items',
      'orderId',
      'origin',
      'paymentDeadline',
      'status',
      'totalAmount',
      'updatedAt',
    ]);
    expect(propertyNames('AdminOrderItemResponse').sort()).toEqual([
      'approvalSnapshotId',
      'currencyCode',
      'customerOwnedProductId',
      'lineTotalAmount',
      'position',
      'productName',
      'quantity',
      'sizeLabel',
      'skuId',
      'subjectKind',
      'unitPriceAmount',
      'variantLabel',
    ]);
  });

  it('publishes the XOR truthfully: both subject ids optional, the discriminator required', () => {
    const item = schemaOf('AdminOrderItemResponse');
    const required = [...(item.required ?? [])];

    expect(required).toContain('subjectKind');
    // Neither id may be required: a `CATALOG` line has no customer-owned product
    // and a `CUSTOMER_OWNED` line has no SKU, so requiring either would publish
    // a shape half the rows cannot satisfy.
    expect(required).not.toContain('skuId');
    expect(required).not.toContain('customerOwnedProductId');
    // The nullable frozen labels are optional for the same reason: `size_label`
    // is null on every line `APP7-W01` writes.
    expect(required).not.toContain('variantLabel');
    expect(required).not.toContain('sizeLabel');
    expect(item.properties?.['subjectKind']?.enum).toEqual(['CATALOG', 'CUSTOMER_OWNED']);
  });

  it('publishes every money field as an exact string, never a number', () => {
    expect(schemaOf('AdminOrderQueueItemResponse').properties?.['totalAmount']?.type).toBe(
      'string',
    );
    expect(schemaOf('AdminOrderDetailResponse').properties?.['totalAmount']?.type).toBe('string');
    for (const field of ['unitPriceAmount', 'lineTotalAmount']) {
      expect(schemaOf('AdminOrderItemResponse').properties?.[field]?.type).toBe('string');
    }
  });

  it('publishes all thirteen order states on both status fields', () => {
    // Eleven custom LC-14 states plus the two Ready-Made ones
    // (`APP12-A02-C1`). `APP7-B02` published eleven because no order could hold
    // a Ready-Made state; a queue that cannot name `AWAITING_SHIPPING_FEE`
    // cannot render, let alone triage, the order sitting in it.
    const states = [
      'AWAITING_DEPOSIT',
      'DEPOSIT_PAID',
      'IN_PRODUCTION',
      'PRODUCTION_COMPLETED',
      'AWAITING_FINAL_PAYMENT',
      'AWAITING_SHIPPING_FEE',
      'AWAITING_PAYMENT',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
      'ON_HOLD',
      'CANCELLING',
      'CANCELLED',
    ];
    expect(schemaOf('AdminOrderQueueItemResponse').properties?.['status']?.enum).toEqual(states);
    expect(schemaOf('AdminOrderDetailResponse').properties?.['status']?.enum).toEqual(states);

    // Neither invented state may appear. `PAID` would be a second copy of a
    // fact LC-15 keeps on the obligation; `EXPIRED` would be an order state no
    // row can hold, since a lapsed reservation cancels the order instead.
    for (const schema of ['AdminOrderQueueItemResponse', 'AdminOrderDetailResponse']) {
      expect(schemaOf(schema).properties?.['status']?.enum).not.toContain('PAID');
      expect(schemaOf(schema).properties?.['status']?.enum).not.toContain('EXPIRED');
    }
  });

  it('makes origin required and the whole custom chain optional beside it', () => {
    // `APP12-A02-C1`. `ck_orders__custom_chain_by_origin` nulls all four
    // custom-chain columns on a `READY_MADE` row, so any of them declared
    // `required` is a shape half the table cannot satisfy — which is exactly
    // what made the queue answer HTTP 500 for the whole page once one
    // Ready-Made order existed.
    for (const schema of ['AdminOrderQueueItemResponse', 'AdminOrderDetailResponse']) {
      const required = [...(schemaOf(schema).required ?? [])];
      expect(required).toContain('origin');
      expect(required).not.toContain('customRequestId');
      expect(schemaOf(schema).properties?.['origin']?.enum).toEqual(['CUSTOM', 'READY_MADE']);
    }

    const detail = [...(schemaOf('AdminOrderDetailResponse').required ?? [])];
    expect(detail).not.toContain('acceptedQuotationVersionId');
    expect(detail).not.toContain('currentApprovalSnapshotId');
    expect(detail).not.toContain('paymentDeadline');

    // A Ready-Made line approved nothing, so the snapshot cannot be required
    // either — and the id must stay a real reference rather than being filled
    // in with a sentinel.
    expect([...(schemaOf('AdminOrderItemResponse').required ?? [])]).not.toContain(
      'approvalSnapshotId',
    );

    // The facts every order has, whatever its origin, stay required. Widening
    // the chain must not quietly loosen the rest of the row.
    for (const always of ['orderId', 'code', 'status', 'customerId', 'totalAmount']) {
      expect([...(schemaOf('AdminOrderQueueItemResponse').required ?? [])]).toContain(always);
    }
  });

  it('carries no credential or storage identity anywhere in either schema', () => {
    const serialized = JSON.stringify([
      schemaOf('AdminOrderQueueResponse'),
      schemaOf('AdminOrderQueueItemResponse'),
      schemaOf('AdminOrderDetailResponse'),
      schemaOf('AdminOrderItemResponse'),
    ]).toLowerCase();

    for (const forbidden of FORBIDDEN_TEXT_IN_B02_SCHEMAS) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }
  });

  it('names no payment, inventory or production field in either schema', () => {
    const properties = [
      ...propertyNames('AdminOrderQueueItemResponse'),
      ...propertyNames('AdminOrderDetailResponse'),
      ...propertyNames('AdminOrderItemResponse'),
    ]
      // `paymentDeadline` is the one deliberate exception, and it is not a
      // payment fact: it is the **reservation's** own committed `expires_at`,
      // the instant the stock hold lapses. It carries no obligation, no
      // attempt, no amount and no transfer reference, so the rule this test
      // enforces — that the order read never becomes a second payment
      // authority — is intact. Every other substring below still applies to it,
      // which is what the assertion under this filter proves.
      .filter((name) => name !== 'paymentDeadline')
      .map((name) => name.toLowerCase());

    for (const forbidden of FORBIDDEN_PROPERTY_SUBSTRINGS) {
      expect(properties.filter((name) => name.includes(forbidden))).toEqual([]);
    }

    // The exception is exactly one field, spelled exactly this way. Anything
    // else payment-shaped would have to be added here deliberately.
    const deadlineFields = [
      ...propertyNames('AdminOrderQueueItemResponse'),
      ...propertyNames('AdminOrderDetailResponse'),
      ...propertyNames('AdminOrderItemResponse'),
    ].filter((name) => name.toLowerCase().includes('payment'));
    expect(deadlineFields).toEqual(['paymentDeadline']);
    // It is a date, never an amount or an id: a money field here would be this
    // read composing a total the payment vertical owns.
    expect(schemaOf('AdminOrderDetailResponse').properties?.['paymentDeadline']?.format).toBe(
      'date-time',
    );
  });

  it('names no live Catalog identity or price in either schema', () => {
    const properties = [
      ...propertyNames('AdminOrderQueueItemResponse'),
      ...propertyNames('AdminOrderDetailResponse'),
      ...propertyNames('AdminOrderItemResponse'),
    ];

    for (const field of LIVE_CATALOG_FIELDS) {
      expect(properties).not.toContain(field);
    }
  });
});
