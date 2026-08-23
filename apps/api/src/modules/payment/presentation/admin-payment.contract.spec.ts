/**
 * The published `APP7-B04` contract, built in process.
 *
 * The integration suites prove what the three operations *do*; this proves what
 * the document *says*, which is the half every generated client depends on. It
 * runs before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const READ_PATH = '/api/admin/orders/{orderId}/payments';
const VERIFY_PATH = '/api/admin/payment-attempts/{attemptId}/verify';
const REVIEW_PATH = '/api/admin/payment-attempts/{attemptId}/review';

/** `APP7-B03`'s and `APP7-B05`'s customer operations, named so the bounds stay exhaustive. */
const CUSTOMER_PAYMENT_PATHS = [
  '/api/public/orders/deposit',
  '/api/public/orders/deposit/attempts',
  '/api/public/orders/deposit/qr',
  '/api/public/orders/deposit/evidence',
  '/api/public/orders/deposit/evidence/status',
];

interface SchemaShape {
  readonly pattern?: string;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly example?: string;
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
 * Fields no B04 **request** may accept (`APP7-B04` §11).
 *
 * Every one is server-owned. A body that took any of them would let an operator
 * name another order's obligation, assert an identity the session did not
 * establish, choose the status a decision produces, or supply the expected facts
 * their own observation is supposed to be judged against.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'orderId',
  'orderCode',
  'obligationId',
  'paymentObligationId',
  'customerId',
  'grantId',
  'stepUpChallengeId',
  'challengeId',
  'adminId',
  'actorId',
  'actorKind',
  'verifiedBy',
  'reviewedBy',
  'status',
  'toStatus',
  'attemptStatus',
  'resolvedStatus',
  'succeededAt',
  'verifiedAt',
  'timestamp',
  'occurredAt',
  'providerKey',
  'providerRef',
  'providerEventId',
  'evidenceId',
  'assetId',
  'evidencePresent',
  'expectedAmount',
  'expectedCurrency',
  'expectedCurrencyCode',
  'expectedReference',
  'expectedTransferReference',
  'correlationId',
];

/**
 * Substrings no B04 schema may contain anywhere — name, description or example.
 *
 * Each is a credential or a storage identity, and none has an innocent reading
 * on a payment surface. `APP7-B04` §9 forbids exposing any of them, and §32
 * makes the response a safe DTO rather than a raw row.
 */
const FORBIDDEN_TEXT = [
  'storageKey',
  'objectKey',
  'bucketName',
  'presigned',
  'tokenHash',
  'tokenDigest',
  'grantToken',
  'sessionSecret',
  'secretHash',
];

/**
 * Substrings no B04 **response property name** may contain.
 *
 * `remaining` is the APP9 obligation this phase neither shows nor collects;
 * `provider`/`webhook` stay closed under `IMP-O007`; `inventory` and
 * `production` are APP8; `checksum`/`fingerprint`/`scanner` are asset internals;
 * `refund` is LC-20 and outside this checkpoint.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
  'remaining',
  'provider',
  'webhook',
  'inventory',
  'production',
  'checksum',
  'fingerprint',
  'scanner',
  'refund',
  'storage',
  'bucket',
  'token',
  'secret',
];

const B04_RESPONSE_SCHEMAS = [
  'AdminOrderPaymentsResponse',
  'AdminPaymentAttemptResponse',
  'AdminPaymentEvidenceResponse',
  'AdminPaymentReconciliationResponse',
  'PaymentDecisionResponse',
];

describe('APP7-B04 — the published Admin payment contract', () => {
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

  function bodySchemaOf(path: string): SchemaShape {
    const raw = operation(path, 'post').requestBody?.content?.['application/json']?.schema;
    expect(raw).toBeDefined();
    const ref = (raw as SchemaShape).$ref;
    return ref === undefined
      ? (raw as SchemaShape)
      : schemaOf(ref.replace('#/components/schemas/', ''));
  }

  describe('the surface is exactly three operations', () => {
    it('publishes one read and two mutations, and nothing else', () => {
      expect(Object.keys(document.paths[READ_PATH] as object)).toEqual(['get']);
      expect(Object.keys(document.paths[VERIFY_PATH] as object)).toEqual(['post']);
      expect(Object.keys(document.paths[REVIEW_PATH] as object)).toEqual(['post']);
    });

    it('names them in two Admin domains, neither colliding with B02’s', () => {
      expect(operation(READ_PATH, 'get').operationId).toBe('adminOrderPayment_read');
      expect(operation(VERIFY_PATH, 'post').operationId).toBe('adminPaymentAttempt_verify');
      expect(operation(REVIEW_PATH, 'post').operationId).toBe('adminPaymentAttempt_review');
      // `APP7-B02`'s two accepted ids are untouched by this checkpoint.
      expect(document.paths['/api/admin/orders']?.['get']?.operationId).toBe('adminOrder_list');
      expect(document.paths['/api/admin/orders/{orderId}']?.['get']?.operationId).toBe(
        'adminOrder_detail',
      );
    });

    it('publishes exactly three operations beneath /api/admin/payment-attempts and admin payments', () => {
      const operations = Object.entries(document.paths)
        .filter(([path]) => path.includes('payment') && path.startsWith('/api/admin'))
        .flatMap(([path, item]) =>
          Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
        );
      expect(operations.sort()).toEqual(
        [`GET ${READ_PATH}`, `POST ${VERIFY_PATH}`, `POST ${REVIEW_PATH}`].sort(),
      );
    });

    it('publishes no Admin binary evidence operation — that is APP7-B06’s', () => {
      // B04 exposes evidence *metadata* and a `previewEligible` hint. A route
      // that could serve a byte would be B06 delivered early, without its
      // association-first, ACCEPTED-only, no-existence-oracle proof.
      const evidenceRoutes = Object.keys(document.paths).filter(
        (path) => path.startsWith('/api/admin') && /evidence|asset|preview|download/i.test(path),
      );
      expect(evidenceRoutes.filter((path) => path.includes('payment'))).toEqual([]);
    });

    it('publishes no provider, webhook, callback or remaining-payment operation anywhere', () => {
      const forbidden = Object.keys(document.paths).filter((path) =>
        /webhook|callback|provider|remaining|refund/i.test(path),
      );
      expect(forbidden).toEqual([]);
    });

    it('adds no customer payment operation — B03’s and B05’s five are unchanged', () => {
      const customer = Object.keys(document.paths).filter((path) =>
        path.startsWith('/api/public/orders'),
      );
      expect(customer.sort()).toEqual([...CUSTOMER_PAYMENT_PATHS].sort());
    });

    it('declares each path’s only locator as its own path parameter', () => {
      expect(
        (operation(READ_PATH, 'get').parameters ?? [])
          .filter((one) => one.in === 'path')
          .map((one) => one.name),
      ).toEqual(['orderId']);
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        expect(
          (operation(path, 'post').parameters ?? [])
            .filter((one) => one.in === 'path')
            .map((one) => one.name),
        ).toEqual(['attemptId']);
      }
    });

    it('takes no body on the read and no query parameter on any of the three', () => {
      expect(operation(READ_PATH, 'get').requestBody).toBeUndefined();
      for (const [path, method] of [
        [READ_PATH, 'get'],
        [VERIFY_PATH, 'post'],
        [REVIEW_PATH, 'post'],
      ] as const) {
        expect(
          (operation(path, method).parameters ?? []).filter((one) => one.in === 'query'),
        ).toEqual([]);
      }
    });
  });

  describe('the request bodies accept the operator’s own observation and nothing else', () => {
    it('verify takes exactly the observed amount, the observed reference and a note', () => {
      const body = bodySchemaOf(VERIFY_PATH);
      expect(Object.keys(body.properties ?? {}).sort()).toEqual([
        'note',
        'observedAmount',
        'observedTransferReference',
      ]);
      expect([...(body.required ?? [])].sort()).toEqual([
        'note',
        'observedAmount',
        'observedTransferReference',
      ]);
    });

    it('review takes exactly a mandatory reason and two optional observed facts', () => {
      const body = bodySchemaOf(REVIEW_PATH);
      expect(Object.keys(body.properties ?? {}).sort()).toEqual([
        'observedAmount',
        'observedTransferReference',
        'reviewReason',
      ]);
      expect([...(body.required ?? [])]).toEqual(['reviewReason']);
    });

    it('rejects every server-owned field on both bodies', () => {
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        const properties = Object.keys(bodySchemaOf(path).properties ?? {});
        for (const forbidden of FORBIDDEN_REQUEST_FIELDS) {
          expect(properties).not.toContain(forbidden);
        }
      }
    });

    it('accepts no additional property on either body', () => {
      // `.strict()` is the security property: a schema that merely ignored an
      // unknown key would accept a body claiming to set `adminId` or `toStatus`.
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        expect(bodySchemaOf(path).additionalProperties).toBe(false);
      }
    });

    it('takes no observed currency, because the column is closed to VND', () => {
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        const properties = Object.keys(bodySchemaOf(path).properties ?? {});
        expect(properties.filter((name) => /currenc/i.test(name))).toEqual([]);
      }
    });

    it('types every observed amount as a string, never a JSON number', () => {
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        expect(bodySchemaOf(path).properties?.['observedAmount']?.type).toBe('string');
      }
    });

    it('publishes the observed memo with no constraint at all (APP7-B04-C1, FD1)', () => {
      // `^[A-Z0-9]{15}$` describes the reference the **server derives**. An
      // observed bank memo is evidence about the outside world, and constraining
      // it to that shape — which `APP7-B04` did — makes a lowercase or mangled
      // memo a `400` and destroys the contradiction before it can be recorded.
      //
      // `maxLength` is asserted absent too. `COL-TBL057-08` is `text` with no
      // length authority, so a ceiling here — even the 2000 `APP7-B04-C1`
      // borrowed from the note field beside it — would be the application
      // asserting that a real memo longer than that cannot exist. Body-size
      // abuse is the transport layer's concern.
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        const observed = bodySchemaOf(path).properties?.['observedTransferReference'];
        expect(observed?.type).toBe('string');
        expect(observed?.pattern).toBeUndefined();
        expect(observed?.format).toBeUndefined();
        expect(observed?.enum).toBeUndefined();
        expect(observed?.minLength).toBeUndefined();
        expect(observed?.maxLength).toBeUndefined();
      }
    });

    it('keeps the operator’s written reason bounded — the asymmetry is the point', () => {
      // A human-authored explanation has an accepted length policy; an observed
      // financial fact does not. Removing the observed bound must not remove
      // this one.
      expect(bodySchemaOf(VERIFY_PATH).properties?.['note']?.maxLength).toBe(2_000);
      expect(bodySchemaOf(REVIEW_PATH).properties?.['reviewReason']?.maxLength).toBe(2_000);
    });

    it('keeps the canonical pattern on the derived expected reference', () => {
      // The other half of the same rule: C1 must not weaken the identifier this
      // system issues, only stop imposing its shape on what a bank returned.
      const expected = schemaOf('AdminOrderPaymentsResponse').properties?.[
        'expectedTransferReference'
      ];
      expect(expected?.type).toBe('string');
      expect(expected?.example).toMatch(/^[A-Z0-9]{15}$/);
    });
  });

  describe('the responses publish safe facts only', () => {
    it('names the deposit read’s properties exactly', () => {
      expect(Object.keys(schemaOf('AdminOrderPaymentsResponse').properties ?? {}).sort()).toEqual([
        'attempts',
        'depositObligationId',
        'depositStatus',
        'expectedAmount',
        'expectedCurrencyCode',
        'expectedTransferReference',
        'orderCode',
        'orderId',
        'orderStatus',
        'reconciliations',
        'satisfiedAt',
        'satisfiedByAttemptId',
      ]);
    });

    it('names the attempt and evidence properties exactly', () => {
      expect(Object.keys(schemaOf('AdminPaymentAttemptResponse').properties ?? {}).sort()).toEqual([
        'amount',
        'attemptId',
        'createdAt',
        'currencyCode',
        'evidence',
        'expiresAt',
        'failedAt',
        'method',
        'reviewReason',
        'status',
        'succeededAt',
        'updatedAt',
      ]);
      expect(Object.keys(schemaOf('AdminPaymentEvidenceResponse').properties ?? {}).sort()).toEqual(
        ['assetStatus', 'byteSize', 'createdAt', 'evidenceId', 'mediaType', 'previewEligible'],
      );
    });

    it('names the reconciliation and decision properties exactly', () => {
      expect(
        Object.keys(schemaOf('AdminPaymentReconciliationResponse').properties ?? {}).sort(),
      ).toEqual([
        'action',
        'adminId',
        'amount',
        'bankReference',
        'createdAt',
        'paymentAttemptId',
        'reason',
        'reconciliationId',
        'resolvedStatus',
      ]);
      expect(Object.keys(schemaOf('PaymentDecisionResponse').properties ?? {}).sort()).toEqual([
        'attemptId',
        'attemptStatus',
        'depositObligationId',
        'depositStatus',
        'orderId',
        'orderStatus',
        'reconciliationAction',
        'replayed',
      ]);
    });

    it('carries no forbidden property name on any B04 schema', () => {
      for (const name of B04_RESPONSE_SCHEMAS) {
        const properties = Object.keys(schemaOf(name).properties ?? {});
        for (const forbidden of FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS) {
          expect(
            properties.filter((property) => property.toLowerCase().includes(forbidden)),
          ).toEqual([]);
        }
      }
    });

    it('mentions no credential or storage identity in any B04 schema text', () => {
      const serialized = JSON.stringify(B04_RESPONSE_SCHEMAS.map((name) => schemaOf(name)));
      for (const forbidden of FORBIDDEN_TEXT) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it('types every money field as a string', () => {
      expect(schemaOf('AdminOrderPaymentsResponse').properties?.['expectedAmount']?.type).toBe(
        'string',
      );
      expect(schemaOf('AdminPaymentAttemptResponse').properties?.['amount']?.type).toBe('string');
      expect(schemaOf('AdminPaymentReconciliationResponse').properties?.['amount']?.type).toBe(
        'string',
      );
    });

    it('publishes no synthesised paid flag anywhere', () => {
      // `APP7-G01` §12.2 — transferred / evidence submitted / verified are three
      // facts with three authorities. A boolean would be the first collapse.
      const serialized = JSON.stringify(
        B04_RESPONSE_SCHEMAS.map((name) => Object.keys(schemaOf(name).properties ?? {})),
      );
      for (const flag of ['"paid"', '"isPaid"', '"settled"', '"confirmed"', '"verified"']) {
        expect(serialized).not.toContain(flag);
      }
    });

    it('publishes the reconciliation action as the closed DB4 vocabulary', () => {
      expect(schemaOf('AdminPaymentReconciliationResponse').properties?.['action']?.enum).toEqual([
        'MANUAL_MATCH',
        'RESOLVE_REVIEW',
        'OBLIGATION_RECALC',
        'CARRYOVER_APPLICATION',
      ]);
    });

    it('returns JSON on all three and a byte stream on none', () => {
      for (const [path, method] of [
        [READ_PATH, 'get'],
        [VERIFY_PATH, 'post'],
        [REVIEW_PATH, 'post'],
      ] as const) {
        const content = operation(path, method).responses?.['200']?.content ?? {};
        expect(Object.keys(content)).toEqual(['application/json']);
      }
    });

    it('declares the refusals each operation can actually give', () => {
      // `500` is the platform's own augmentation, present on every published
      // operation; the rest are this checkpoint's, and the read deliberately
      // declares no `403`, `409` or `415` because it has no origin guard, no
      // conflict and no body.
      expect(Object.keys(operation(READ_PATH, 'get').responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '401',
        '404',
        '500',
      ]);
      for (const path of [VERIFY_PATH, REVIEW_PATH]) {
        expect(Object.keys(operation(path, 'post').responses ?? {}).sort()).toEqual([
          '200',
          '400',
          '401',
          '403',
          '404',
          '409',
          '415',
          '500',
        ]);
      }
    });
  });
});
