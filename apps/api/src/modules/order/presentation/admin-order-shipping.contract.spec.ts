/**
 * The published `APP9-B04` contract, built in process.
 *
 * The integration suite proves what the endpoints *do*; this proves what the
 * document *says*, which is the half every generated client depends on. It runs
 * before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * It also proves the module is reachable from the composition root: the document
 * is built from the real application, so an unregistered
 * `AdminOrderShippingModule` would publish no path at all.
 *
 * `APP9-B04-C1` added the third operation — the customer's own acknowledgement —
 * so the assertions that once demanded *no* public shipping path now pin the one
 * that exists and what it may not carry.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const SHIPPING_PATH = '/api/admin/orders/{orderId}/shipping-detail';
const DETAIL_SCHEMA = 'AdminShippingDetailResponse';
const SAVED_SCHEMA = 'AdminShippingDetailSavedResponse';
const FEE_SCHEMA = 'AdminShippingFeeOutcomeResponse';
const BODY_SCHEMA = 'SaveShippingDetailBody';
const ACK_PATH = '/api/public/orders/shipping-fee-acknowledgements';
const ACK_BODY_SCHEMA = 'AcknowledgeShippingFeeBody';
const ACK_RESPONSE_SCHEMA = 'ShippingFeeAcknowledgedResponse';

interface SchemaShape {
  readonly type?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly enum?: readonly string[];
  readonly $ref?: string;
  /** `APP12-B03` — the ready-made fields a custom order genuinely lacks. */
  readonly nullable?: boolean;
}
interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly responses?: Record<string, unknown>;
  readonly security?: readonly unknown[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Substrings no B04 schema may carry — in a name, a description or an example.
 *
 * Every one is a credential or a secure-flow secret. The acknowledgement a fee
 * increase records is real evidence, but it is *audit* content: an order screen
 * has no use for a grant id, and a document that named one would invite a client
 * to send one. Matching the serialized text is right, because a value smuggled
 * into an `example` would be as disclosed as one in a property.
 */
const FORBIDDEN_TEXT_IN_B04_SCHEMAS = [
  'tokenHash',
  'token_hash',
  'grantToken',
  'secureLink',
  'otp',
  'codeHash',
  'pepper',
  'challengeSecret',
  'stepUpChallengeId',
  'grantId',
  'storageKey',
  'accountNumber',
  'providerKey',
  'webhook',
];

/**
 * Property names no B04 schema may publish.
 *
 * The freeze fields a client could *send* (`status`, `frozenAt`) are absent from
 * the **body** and checked there; here the concern is money and lifecycle B04
 * does not own — a deposit, a total, a dispatch instruction — plus live carrier
 * tracking, which `APP9-G01` puts out of scope entirely.
 */
const FORBIDDEN_BODY_PROPERTIES = [
  'status',
  'frozenAt',
  'countryCode',
  'currencyCode',
  'orderId',
  'grantId',
  'stepUpChallengeId',
  'acknowledged',
  'dispatch',
  'dispatchedAt',
  'freeze',
];

describe('APP9-B04 — the published shipping-detail and fee-acknowledgement contract', () => {
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

  it('publishes exactly two operations — a GET and a PUT on one singleton path', () => {
    expect(Object.keys(document.paths[SHIPPING_PATH] ?? {}).sort()).toEqual(['get', 'put']);
    expect(document.paths[SHIPPING_PATH]?.['get']?.operationId).toBe('adminOrderShipping_read');
    expect(document.paths[SHIPPING_PATH]?.['put']?.operationId).toBe('adminOrderShipping_save');

    // The new module reissued no accepted id on the shared `admin/orders` base.
    expect(document.paths['/api/admin/orders']?.['get']?.operationId).toBe('adminOrder_list');
    expect(document.paths['/api/admin/orders/{orderId}']?.['get']?.operationId).toBe(
      'adminOrder_detail',
    );
    expect(document.paths['/api/admin/orders/{orderId}/transitions']?.['post']?.operationId).toBe(
      'adminOrder_transition',
    );
    expect(document.paths['/api/admin/orders/{orderId}/payments']?.['get']?.operationId).toBe(
      'adminOrderPayment_read',
    );
  });

  it('adds no freeze, dispatch or carrier-tracking operation, and one public path only', () => {
    const suspicious = Object.keys(document.paths).filter((path) =>
      /freeze|dispatch|tracking|carrier|complete/i.test(path),
    );
    expect(suspicious).toEqual([]);

    // `APP9-B04-C1`: exactly one non-Admin shipping path, and it is the
    // customer's acknowledgement collection. ADR-DB3-004 still makes pre-freeze
    // *edits* Admin-only — what this path records is a decision, not an edit,
    // which is why its body carries no shipping field at all (asserted below).
    expect(
      Object.keys(document.paths).filter(
        (path) => /shipping/i.test(path) && !path.startsWith('/api/admin/'),
      ),
    ).toEqual([ACK_PATH]);

    // The whole B04 surface, after the correction: two Admin, one customer.
    expect(
      Object.keys(document.paths)
        .filter((path) => /shipping/i.test(path))
        .sort(),
    ).toEqual([ACK_PATH, SHIPPING_PATH].sort());
    expect(Object.keys(document.paths[ACK_PATH] ?? {})).toEqual(['post']);
    expect(document.paths[ACK_PATH]?.['post']?.operationId).toBe(
      'publicOrderShippingFee_acknowledge',
    );
  });

  it('documents both operations as Admin cookie-authenticated, with their refusals', () => {
    const read = document.paths[SHIPPING_PATH]?.['get'];
    const save = document.paths[SHIPPING_PATH]?.['put'];
    expect(JSON.stringify(read?.security ?? [])).toContain('adminSession');
    expect(JSON.stringify(save?.security ?? [])).toContain('adminSession');

    // The read is a GET: no origin or JSON-body guard, so no 403 and no 415.
    expect(Object.keys(read?.responses ?? {}).sort()).toEqual(['200', '400', '401', '404', '500']);
    // The write carries the full Admin mutation set, and 409 for every refusal
    // that leaves nothing committed.
    expect(Object.keys(save?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '415',
      '500',
    ]);

    for (const operation of [read, save]) {
      expect(
        (operation?.parameters ?? []).filter((one) => one.in === 'path').map((one) => one.name),
      ).toEqual(['orderId']);
    }
  });

  it('publishes the detail as the repository projection, with no fulfillment note', () => {
    expect(Object.keys(schemaOf(DETAIL_SCHEMA).properties ?? {}).sort()).toEqual([
      'addressLine',
      'carrierName',
      'countryCode',
      'district',
      'feeAmount',
      'frozenAt',
      'province',
      'recipientName',
      'recipientPhone',
      'status',
      'trackingCode',
      'ward',
    ]);
    // Both LC-19 states, because the read serves a frozen detail too.
    expect(schemaOf(DETAIL_SCHEMA).properties?.['status']?.enum).toEqual(['EDITABLE', 'FROZEN']);
    // `fulfillment_note` is a real column that no delivered writer sets, so
    // publishing it would promise a fact nothing produces.
    expect(Object.keys(schemaOf(DETAIL_SCHEMA).properties ?? {})).not.toContain('fulfillmentNote');
  });

  it('publishes the fee outcome as ids and the payable figure, never a deposit', () => {
    // `APP12-B03` added the ready-made half. The two origins report different
    // obligation kinds and the fields stay separate on purpose: `remaining*` is
    // a balance moved by a fee difference, `full*`/`payableTotalAmount` is a
    // total recomposed from the frozen subtotal, and one shared field would let
    // a consumer read "the obligation" without knowing which rule produced it.
    expect(Object.keys(schemaOf(FEE_SCHEMA).properties ?? {}).sort()).toEqual([
      'acknowledged',
      'changed',
      'fullObligationId',
      'payableTotalAmount',
      'previousFeeAmount',
      'remainingAmount',
      'remainingObligationId',
      'supersededObligationId',
    ]);
    const names = Object.keys(schemaOf(FEE_SCHEMA).properties ?? {}).map((one) =>
      one.toLowerCase(),
    );
    // `totalAmount` stays forbidden — the *order* total is not this response's
    // to publish. `payableTotalAmount` is the ready-made obligation's own
    // amount, which the operator needs precisely because they just set it.
    for (const forbidden of ['depositamount', 'totalamount', 'orderstatus', 'attemptid']) {
      expect(names).not.toContain(forbidden);
    }
    // The three fields a ready-made write fills are all nullable, because a
    // custom order genuinely has none of them.
    for (const optional of ['fullObligationId', 'payableTotalAmount', 'previousFeeAmount']) {
      expect(schemaOf(FEE_SCHEMA).properties?.[optional]?.nullable).toBe(true);
    }
    expect(Object.keys(schemaOf(SAVED_SCHEMA).properties ?? {}).sort()).toEqual([
      'detail',
      'fee',
      'orderId',
    ]);
  });

  it('takes the whole detail in the body, with the fee a required decimal string', () => {
    const body = schemaOf(BODY_SCHEMA);
    expect(Object.keys(body.properties ?? {}).sort()).toEqual([
      'addressLine',
      'carrierName',
      'district',
      'feeAmount',
      'province',
      'recipientName',
      'recipientPhone',
      'trackingCode',
      'ward',
    ]);
    expect([...(body.required ?? [])].sort()).toEqual([
      'addressLine',
      'feeAmount',
      'province',
      'recipientName',
      'recipientPhone',
    ]);
    // A string, never a JSON number: a number would go through an IEEE-754
    // double before any exact arithmetic could see it.
    expect(body.properties?.['feeAmount']?.type).toBe('string');

    const names = Object.keys(body.properties ?? {}).map((one) => one.toLowerCase());
    for (const forbidden of FORBIDDEN_BODY_PROPERTIES) {
      expect(names).not.toContain(forbidden.toLowerCase());
    }
  });

  it('publishes the customer acknowledgement as a public, unauthenticated command', () => {
    const acknowledge = document.paths[ACK_PATH]?.['post'];
    // No Admin cookie scheme: the credential is the secure-link token, and it
    // travels in the body — never a path segment, query parameter or header.
    expect(JSON.stringify(acknowledge?.security ?? [])).not.toContain('adminSession');
    expect((acknowledge?.parameters ?? []).filter((one) => one.in === 'path')).toEqual([]);
    expect(Object.keys(acknowledge?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '403',
      '404',
      '409',
      '429',
      '500',
      '503',
    ]);
  });

  it('takes only a token and the accepted fee, deriving every other fact server-side', () => {
    const body = schemaOf(ACK_BODY_SCHEMA);
    expect(Object.keys(body.properties ?? {}).sort()).toEqual(['newFeeAmount', 'token']);
    expect([...(body.required ?? [])].sort()).toEqual(['newFeeAmount', 'token']);
    // A string, never a JSON number: a number would go through an IEEE-754
    // double before any exact arithmetic could see it.
    expect(body.properties?.['newFeeAmount']?.type).toBe('string');

    // The whole point of `APP9-B04-C1` §4. `previousFeeAmount` is the one that
    // matters most: the Admin write matches on it, so a caller-supplied value
    // would let a stale screen bind evidence to a baseline that is not the
    // order's. The shipping fields are absent because this is not an edit.
    const names = Object.keys(body.properties ?? {}).map((one) => one.toLowerCase());
    for (const forbidden of [
      'orderid',
      'ordercode',
      'customerid',
      'grantid',
      'challengeid',
      'stepupchallengeid',
      'previousfeeamount',
      'currencycode',
      'shippingdetailid',
      'recipientname',
      'recipientphone',
      'addressline',
      'province',
      'carriername',
      'trackingcode',
      'status',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('reports the decision without the evidence that authorised it', () => {
    expect(Object.keys(schemaOf(ACK_RESPONSE_SCHEMA).properties ?? {}).sort()).toEqual([
      'acknowledgedAt',
      'currencyCode',
      'newFeeAmount',
      'orderCode',
      'previousFeeAmount',
      'replayed',
    ]);
    // No obligation id and no balance: the acknowledgement changes no money, and
    // a field suggesting otherwise would misdescribe what the customer just did.
    const names = Object.keys(schemaOf(ACK_RESPONSE_SCHEMA).properties ?? {}).map((one) =>
      one.toLowerCase(),
    );
    for (const forbidden of ['remainingamount', 'obligationid', 'orderid', 'customerid']) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('carries no credential, secure-flow evidence id or provider field', () => {
    const serialized = JSON.stringify([
      schemaOf(DETAIL_SCHEMA),
      schemaOf(SAVED_SCHEMA),
      schemaOf(FEE_SCHEMA),
      schemaOf(BODY_SCHEMA),
      schemaOf(ACK_BODY_SCHEMA),
      schemaOf(ACK_RESPONSE_SCHEMA),
    ]);
    for (const forbidden of FORBIDDEN_TEXT_IN_B04_SCHEMAS) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
