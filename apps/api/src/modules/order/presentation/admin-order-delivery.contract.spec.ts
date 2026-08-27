/**
 * The published `APP9-B05` contract, built in process.
 *
 * The integration suite proves what the two endpoints *do*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * It also proves the module is reachable from the composition root: the document
 * is built from the real application, so an unregistered
 * `AdminOrderDeliveryModule` would publish no path at all.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const DISPATCH_PATH = '/api/admin/orders/{orderId}/dispatch';
const COMPLETION_PATH = '/api/admin/orders/{orderId}/completion';
const DISPATCH_SCHEMA = 'AdminOrderDispatchResponse';
const COMPLETION_SCHEMA = 'AdminOrderCompletionResponse';

interface SchemaShape {
  readonly type?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly enum?: readonly string[];
  readonly $ref?: string;
}
interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no B05 schema may carry — in a name, a description or an example.
 *
 * Each is either a credential, a storage identity, a payment internal that
 * `APP9-B02`/`B03` own, or a live-carrier fact that is out of scope entirely.
 * Matching the serialized text is right: a value smuggled into a `description`
 * or an `example` would be as published as one in a property.
 */
const FORBIDDEN_TEXT_IN_B05_SCHEMAS = [
  'tokenHash',
  'storageKey',
  'objectKey',
  'bucket',
  'sessionSecret',
  'grantToken',
  'accountNumber',
  'providerKey',
  'providerRef',
  'webhook',
  'callback',
  'courier',
  'parcel',
  'waybill',
];

/**
 * Property names no B05 schema may publish.
 *
 * The shipping `[PII]` and the fee, because the dispatch receipt reports the
 * freeze rather than repeating what was frozen — the Admin shipping route owns
 * that read. And every tracking-lifecycle field, because there is no such
 * lifecycle: `carrier_name` and `tracking_code` are static internal notes on the
 * shipping detail, not a state machine this contract publishes.
 */
const FORBIDDEN_PROPERTY_NAMES = [
  'recipientName',
  'recipientPhone',
  'addressLine',
  'ward',
  'district',
  'province',
  'feeAmount',
  'currencyCode',
  'carrierName',
  'trackingCode',
  'trackingStatus',
  'trackingUrl',
  'deliveryStatus',
  'shipmentStatus',
  'snapshotId',
  'attemptId',
  'refund',
];

describe('APP9-B05 — the published Admin delivery contract', () => {
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

  it('publishes exactly two operations, both POSTs, in the adminOrder domain', () => {
    expect(Object.keys(document.paths[DISPATCH_PATH] ?? {})).toEqual(['post']);
    expect(Object.keys(document.paths[COMPLETION_PATH] ?? {})).toEqual(['post']);
    expect(document.paths[DISPATCH_PATH]?.['post']?.operationId).toBe('adminOrder_dispatch');
    expect(document.paths[COMPLETION_PATH]?.['post']?.operationId).toBe('adminOrder_complete');
  });

  it('reissues none of the three accepted adminOrder ids', () => {
    expect(document.paths['/api/admin/orders']?.['get']?.operationId).toBe('adminOrder_list');
    expect(document.paths['/api/admin/orders/{orderId}']?.['get']?.operationId).toBe(
      'adminOrder_detail',
    );
    expect(document.paths['/api/admin/orders/{orderId}/transitions']?.['post']?.operationId).toBe(
      'adminOrder_transition',
    );
  });

  it('adds no carrier, tracking, freeze, snapshot or handoff operation', () => {
    const suspicious = Object.keys(document.paths).filter((path) =>
      /carrier|tracking|courier|shipment|parcel|handoff|freeze|snapshot|fulfil/i.test(path),
    );
    expect(suspicious).toEqual([]);
  });

  it('takes only the order id, and neither command accepts a body', () => {
    for (const path of [DISPATCH_PATH, COMPLETION_PATH]) {
      const operation = document.paths[path]?.['post'];
      expect(
        (operation?.parameters ?? []).filter((one) => one.in === 'path').map((one) => one.name),
      ).toEqual(['orderId']);
      // Nothing for a caller to state: no operator id, no dispatch instant, no
      // carrier and no tracking code can be supplied.
      expect(operation?.requestBody).toBeUndefined();
    }
  });

  it('documents both operations as Admin cookie-authenticated with their refusals', () => {
    for (const path of [DISPATCH_PATH, COMPLETION_PATH]) {
      const operation = document.paths[path]?.['post'];
      expect(JSON.stringify(operation?.security ?? [])).toContain('adminSession');
      // No 415: neither command reads a body, so there is no media type to
      // refuse.
      expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '403',
        '404',
        '409',
        // The platform's global 500 augmentation, on every operation.
        '500',
      ]);
    }
  });

  it('publishes the dispatch receipt as the move plus the freeze it produced', () => {
    expect(Object.keys(schemaOf(DISPATCH_SCHEMA).properties ?? {}).sort()).toEqual([
      'code',
      'dispatchedAt',
      'fromStatus',
      'frozenAt',
      'orderId',
      'shippingStatus',
      'status',
    ]);
  });

  it('publishes the completion receipt as the move alone', () => {
    expect(Object.keys(schemaOf(COMPLETION_SCHEMA).properties ?? {}).sort()).toEqual([
      'code',
      'fromStatus',
      'orderId',
      'status',
    ]);
  });

  it('reports the shipping state as a one-member FROZEN enum', () => {
    expect(schemaOf(DISPATCH_SCHEMA).properties?.['shippingStatus']?.enum).toEqual(['FROZEN']);
  });

  it('carries no credential, storage identity, provider field, PII or tracking fact', () => {
    const serialized = JSON.stringify([schemaOf(DISPATCH_SCHEMA), schemaOf(COMPLETION_SCHEMA)]);
    for (const forbidden of FORBIDDEN_TEXT_IN_B05_SCHEMAS) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    const names = [
      ...Object.keys(schemaOf(DISPATCH_SCHEMA).properties ?? {}),
      ...Object.keys(schemaOf(COMPLETION_SCHEMA).properties ?? {}),
    ].map((name) => name.toLowerCase());
    for (const forbidden of FORBIDDEN_PROPERTY_NAMES) {
      expect(names).not.toContain(forbidden.toLowerCase());
    }
  });
});
