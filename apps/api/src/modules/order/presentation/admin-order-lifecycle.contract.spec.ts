/**
 * The published `APP9-B01` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * It also proves the module is reachable from the composition root: the document
 * is built from the real application, so an unregistered
 * `AdminOrderLifecycleModule` would publish no path at all.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const TRANSITION_PATH = '/api/admin/orders/{orderId}/transitions';
const RESULT_SCHEMA = 'AdminOrderTransitionResultResponse';
const BODY_SCHEMA = 'TransitionAdminOrderBody';

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
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: SchemaShape }>;
  };
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no B01 schema may carry — in a name, a description or an example.
 *
 * Each is either a credential, a storage identity, a payment internal that
 * `APP9-B02`/`B03` own, or a fulfillment field `APP9-B05` owns. None has an
 * innocent reading in a lifecycle receipt, so matching the serialized text is
 * right: a value smuggled into an `example` would be as disclosed as one in a
 * property.
 */
const FORBIDDEN_TEXT_IN_B01_SCHEMAS = [
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
  'trackingCode',
  'carrierName',
];

/**
 * Property names no B01 schema may publish.
 *
 * `remainingAmount` and every sibling: B01 opens the window and reports which
 * obligation it opened, never what it is worth. `payable` and its variants: the
 * order's LC-14 state *is* the window, and a flag beside it would be a second
 * answer to the same question.
 */
const FORBIDDEN_PROPERTY_NAMES = [
  'remainingAmount',
  'amount',
  'totalAmount',
  'depositAmount',
  'currencyCode',
  'payable',
  'isPayable',
  'paid',
  'attemptId',
  'qr',
  'shipping',
  'refund',
];

describe('APP9-B01 — the published Admin order lifecycle contract', () => {
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

  it('publishes exactly one operation, a POST, in the adminOrder domain', () => {
    expect(Object.keys(document.paths[TRANSITION_PATH] ?? {})).toEqual(['post']);
    expect(document.paths[TRANSITION_PATH]?.['post']?.operationId).toBe('adminOrder_transition');
    // The split module did not reissue `APP7-B02`'s two accepted ids.
    expect(document.paths['/api/admin/orders']?.['get']?.operationId).toBe('adminOrder_list');
    expect(document.paths['/api/admin/orders/{orderId}']?.['get']?.operationId).toBe(
      'adminOrder_detail',
    );
  });

  it('adds no second Admin lifecycle, eligibility or payable operation', () => {
    // Scoped to the **Admin** surface. `APP9-B02` legitimately published three
    // public customer final-payment operations after this assertion was
    // written, so the unscoped form had been failing at HEAD ever since and was
    // testing the wrong thing: the rule `APP9-B01` set is that *it* opens one
    // guarded Admin transition and no second Admin command that could move an
    // order into a payable state. A customer read of a balance it may not move
    // was never in scope. `APP12-A02-C1` runs this suite and records the
    // correction rather than leaving a permanently red assertion.
    const suspicious = Object.keys(document.paths).filter(
      (path) =>
        path.startsWith('/api/admin/') &&
        /payable|eligibility|final-payment|open-final|request-final/i.test(path),
    );
    expect(suspicious).toEqual([]);

    // The public lane is still checked, just for the right property: those
    // operations exist, and none of them is an Admin one wearing a public path.
    const publicFinalPayment = Object.keys(document.paths).filter((path) =>
      /final-payment/i.test(path),
    );
    expect(publicFinalPayment.every((path) => path.startsWith('/api/public/'))).toBe(true);
  });

  it('takes the order id in the path and the target in a one-member enum body', () => {
    const operation = document.paths[TRANSITION_PATH]?.['post'];
    expect(
      (operation?.parameters ?? []).filter((one) => one.in === 'path').map((one) => one.name),
    ).toEqual(['orderId']);

    const body = schemaOf(BODY_SCHEMA);
    expect(Object.keys(body.properties ?? {})).toEqual(['to']);
    expect(body.properties?.['to']?.enum).toEqual(['AWAITING_FINAL_PAYMENT']);
    expect(body.required).toEqual(['to']);
  });

  it('documents the operation as Admin cookie-authenticated with its refusals', () => {
    const operation = document.paths[TRANSITION_PATH]?.['post'];
    expect(JSON.stringify(operation?.security ?? [])).toContain('adminSession');
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '415',
      // The platform's global 500 augmentation, on every operation.
      '500',
    ]);
  });

  it('publishes the receipt as the move plus the obligation it required, and no money', () => {
    expect(Object.keys(schemaOf(RESULT_SCHEMA).properties ?? {}).sort()).toEqual([
      'code',
      'fromStatus',
      'orderId',
      'remainingObligationId',
      'remainingObligationStatus',
      'status',
    ]);
    expect(schemaOf(RESULT_SCHEMA).properties?.['remainingObligationStatus']?.enum).toEqual([
      'PENDING',
      'SATISFIED',
    ]);
  });

  it('carries no credential, storage identity, provider field or fulfillment fact', () => {
    const serialized = JSON.stringify([schemaOf(RESULT_SCHEMA), schemaOf(BODY_SCHEMA)]);
    for (const forbidden of FORBIDDEN_TEXT_IN_B01_SCHEMAS) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    const names = [
      ...Object.keys(schemaOf(RESULT_SCHEMA).properties ?? {}),
      ...Object.keys(schemaOf(BODY_SCHEMA).properties ?? {}),
    ].map((name) => name.toLowerCase());
    for (const forbidden of FORBIDDEN_PROPERTY_NAMES) {
      expect(names).not.toContain(forbidden.toLowerCase());
    }
  });
});
