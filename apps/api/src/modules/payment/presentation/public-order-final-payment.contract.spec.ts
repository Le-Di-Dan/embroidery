/**
 * The published `APP9-B02` contract, built in process.
 *
 * The integration suite proves what the three operations *do*; this proves what
 * the document *says*, which is the half every generated client depends on. It
 * runs before the single generation slot is spent, so a defect found here costs
 * nothing while one found in the committed artifact costs the slot. Building the
 * real document also proves both new modules are reachable from the composition
 * root.
 *
 * Two of its jobs are B02-specific and are the reason it is a separate suite
 * from `APP7-B03`'s. First, the **delta**: exactly three operations were added
 * and none of APP7's five moved. Second, the **sibling** property: the
 * final-payment components are their own, not a re-pointing of the deposit's.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const FINAL_PAYMENT_PATH = '/api/public/orders/final-payment';
const QR_PATH = '/api/public/orders/final-payment/qr';
const ATTEMPTS_PATH = '/api/public/orders/final-payment/attempts';

const B02_PATHS = [FINAL_PAYMENT_PATH, QR_PATH, ATTEMPTS_PATH];

/**
 * Every `APP7` payment path, restated so the bounds below stay exhaustive.
 *
 * `APP9-B02` must add three operations and disturb none of these. Listing them
 * by literal is what makes "APP7's surface is intact" an assertion rather than
 * an absence of complaint.
 */
const APP7_DEPOSIT_PATHS = [
  '/api/public/orders/deposit',
  '/api/public/orders/deposit/qr',
  '/api/public/orders/deposit/attempts',
  '/api/public/orders/deposit/evidence',
  '/api/public/orders/deposit/evidence/status',
];

const APP7_ADMIN_PAYMENT_PATHS = [
  '/api/admin/orders/{orderId}/payments',
  '/api/admin/payment-attempts/{attemptId}/verify',
  '/api/admin/payment-attempts/{attemptId}/review',
  '/api/admin/payment-evidence/{evidenceId}/content',
];

/** The accepted APP7 operation ids, none of which B02 may rename. */
const APP7_DEPOSIT_OPERATION_IDS = [
  'publicOrderDeposit_current',
  'publicOrderDeposit_qr',
  'publicOrderDeposit_initiate',
];

/**
 * Fields no final-payment **request** may accept.
 *
 * Every one is server-owned (`APP9-B02` §5). A body that took any of them would
 * let a caller name another customer's order, another obligation, another
 * customer's proof of presence, a different sum, or a payment provider — and the
 * first three would defeat the grant chain entirely.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'orderId',
  'orderCode',
  'paymentObligationId',
  'obligationId',
  'attemptId',
  'stepUpChallengeId',
  'challengeId',
  'grantId',
  'customerId',
  'requestId',
  'scopeKind',
  'amount',
  'finalPaymentAmount',
  'remainingAmount',
  'currency',
  'currencyCode',
  'method',
  'providerKey',
  'providerRef',
  'transferReference',
  'bankBin',
  'accountNumber',
];

/**
 * Substrings no B02 schema may contain **anywhere** — name, description or
 * example. Each is a credential or a storage identity with no innocent reading
 * on a payment surface.
 */
const FORBIDDEN_TEXT = [
  'tokenHash',
  'tokenDigest',
  'grantToken',
  'storageKey',
  'objectKey',
  'bucket',
  'secretHash',
  'sessionSecret',
];

/**
 * Substrings no B02 **response property name** may contain.
 *
 * `deposit` is the sibling obligation this surface neither shows nor makes
 * payable — the mirror of B03's `remaining` exclusion, and what makes the two
 * projections genuinely separate rather than one renamed. `evidence` is
 * `APP7-B05`'s lane, reused but never re-published here. `reconcil`/`refund`/
 * `verif` are Admin's. `provider`/`webhook` stay closed under `IMP-O007`.
 * `shipping`/`carrier`/`tracking` are the fulfillment scope APP9 records
 * internally and shows no customer. `inventory` and `production` are APP8's.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
  'deposit',
  'evidence',
  'reconcil',
  'refund',
  'verif',
  'provider',
  'webhook',
  'shipping',
  'carrier',
  'tracking',
  'inventory',
  'production',
  'idempotency',
  'grant',
  'challenge',
  'admin',
];

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: SchemaShape }>;
  };
  readonly responses?: Record<string, { readonly content?: Record<string, unknown> }>;
}
interface SchemaShape {
  readonly type?: string;
  readonly format?: string;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaShape>;
  readonly additionalProperties?: unknown;
  readonly enum?: readonly string[];
  readonly $ref?: string;
  readonly example?: unknown;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

const B02_SCHEMA_NAMES = [
  'ReadFinalPaymentBody',
  'FinalPaymentQrBody',
  'InitiateFinalPaymentAttemptBody',
  'CustomerFinalPaymentResponse',
  'FinalPaymentBankInstructionsResponse',
  'FinalPaymentAttemptResponse',
];

const B02_RESPONSE_NAMES = [
  'CustomerFinalPaymentResponse',
  'FinalPaymentBankInstructionsResponse',
  'FinalPaymentAttemptResponse',
];

const B02_REQUEST_NAMES = [
  'ReadFinalPaymentBody',
  'FinalPaymentQrBody',
  'InitiateFinalPaymentAttemptBody',
];

describe('APP9-B02 — the published customer final-payment contract', () => {
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

  describe('the delta is exactly three operations', () => {
    it('publishes exactly three final-payment paths and nothing else beneath them', () => {
      const paths = Object.keys(document.paths).filter((path) => path.includes('final-payment'));
      expect(paths.sort()).toEqual([...B02_PATHS].sort());
    });

    it('publishes exactly one method on each, all POST', () => {
      for (const path of B02_PATHS) {
        expect(Object.keys(document.paths[path] as object)).toEqual(['post']);
      }
    });

    it('names the three operations in one publicOrderFinalPayment domain', () => {
      expect(operation(FINAL_PAYMENT_PATH, 'post').operationId).toBe(
        'publicOrderFinalPayment_current',
      );
      expect(operation(QR_PATH, 'post').operationId).toBe('publicOrderFinalPayment_qr');
      expect(operation(ATTEMPTS_PATH, 'post').operationId).toBe('publicOrderFinalPayment_initiate');
    });

    it('takes no locator in any path, so no order or obligation can be addressed', () => {
      for (const path of B02_PATHS) {
        expect(path).not.toContain('{');
      }
    });

    it('adds no evidence endpoint — the attempt-scoped lane stays APP7’s two', () => {
      const evidencePaths = Object.keys(document.paths).filter((path) => /evidence/i.test(path));
      expect(evidencePaths.sort()).toEqual(
        [
          '/api/public/orders/deposit/evidence',
          '/api/public/orders/deposit/evidence/status',
          // APP7-B06's Admin delivery route, named so this stays exhaustive.
          '/api/admin/payment-evidence/{evidenceId}/content',
        ].sort(),
      );
      for (const path of Object.keys(document.paths)) {
        expect(path).not.toContain('final-payment/evidence');
      }
    });
  });

  describe('APP7’s payment surface is untouched', () => {
    it('still publishes every APP7 payment path, and the whole payment surface is these plus three', () => {
      const paths = Object.keys(document.paths).filter((path) =>
        /deposit|payment|evidence|webhook|refund/i.test(path),
      );
      expect(paths.sort()).toEqual(
        [...APP7_DEPOSIT_PATHS, ...APP7_ADMIN_PAYMENT_PATHS, ...B02_PATHS].sort(),
      );
    });

    it('leaves the three accepted deposit operation ids exactly where they were', () => {
      expect(operation('/api/public/orders/deposit', 'post').operationId).toBe(
        APP7_DEPOSIT_OPERATION_IDS[0],
      );
      expect(operation('/api/public/orders/deposit/qr', 'post').operationId).toBe(
        APP7_DEPOSIT_OPERATION_IDS[1],
      );
      expect(operation('/api/public/orders/deposit/attempts', 'post').operationId).toBe(
        APP7_DEPOSIT_OPERATION_IDS[2],
      );
    });

    it('introduces no provider, callback or webhook route anywhere', () => {
      for (const path of Object.keys(document.paths)) {
        expect(path).not.toMatch(/webhook|callback|checkout|provider/i);
      }
    });
  });

  describe('the request bodies accept the token and nothing else', () => {
    it.each(B02_REQUEST_NAMES.map((name) => [name]))(
      '%s carries only `token` and refuses every other field',
      (name) => {
        const schema = schemaOf(name);
        expect(Object.keys(schema.properties ?? {})).toEqual(['token']);
        expect(schema.required).toEqual(['token']);
        // `.strict()` — an unknown field is a 400, not silently ignored.
        expect(schema.additionalProperties).toBe(false);
      },
    );

    it.each(FORBIDDEN_REQUEST_FIELDS)('no request body accepts `%s`', (field) => {
      for (const name of B02_REQUEST_NAMES) {
        expect(Object.keys(schemaOf(name).properties ?? {})).not.toContain(field);
      }
    });

    it('publishes no example token', () => {
      // An example token is a credential-shaped string rendered in Swagger UI
      // and pre-filled into "try it out".
      expect(JSON.stringify(schemaOf('ReadFinalPaymentBody'))).not.toContain('example');
    });

    it('carries the attempt key as the delivered Idempotency-Key header', () => {
      const parameters = operation(ATTEMPTS_PATH, 'post').parameters ?? [];
      const names = parameters.filter((p) => p.in === 'header').map((p) => p.name);
      expect(names).toContain('Idempotency-Key');
      // And not as a second transport in the body.
      expect(
        Object.keys(schemaOf('InitiateFinalPaymentAttemptBody').properties ?? {}),
      ).not.toContain('idempotencyKey');
    });
  });

  describe('the projection is a sibling, not a re-pointed deposit view', () => {
    it('publishes its own component, leaving CustomerDepositResponse deposit-named', () => {
      const deposit = schemaOf('CustomerDepositResponse');
      // Untouched: still the deposit's own names, and still saying nothing about
      // the balance. If B02 had re-pointed it, one of these would have moved.
      expect(Object.keys(deposit.properties ?? {})).toEqual(
        expect.arrayContaining(['depositAmount', 'depositStatus']),
      );
      expect(JSON.stringify(deposit).toLowerCase()).not.toContain('remaining');

      const finalPayment = schemaOf('CustomerFinalPaymentResponse');
      expect(Object.keys(finalPayment.properties ?? {})).toEqual(
        expect.arrayContaining(['finalPaymentAmount', 'finalPaymentStatus']),
      );
    });

    it('publishes exactly the customer-safe field set, and the payable distinction', () => {
      const schema = schemaOf('CustomerFinalPaymentResponse');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
        [
          'accessExpiresAt',
          'bankInstructions',
          'currencyCode',
          'finalPaymentAmount',
          'finalPaymentStatus',
          'orderCode',
          'orderStatus',
          'payable',
        ].sort(),
      );
      // The two states are published separately and `payable` is derived from
      // both — the §6 distinction between an obligation that *exists* and one
      // that is currently collectable.
      expect(schema.properties?.['orderStatus']?.enum).toContain('AWAITING_FINAL_PAYMENT');
      expect(schema.properties?.['orderStatus']?.enum).toContain('READY_FOR_DELIVERY');
      expect(schema.properties?.['finalPaymentStatus']?.enum).toEqual(
        expect.arrayContaining(['PENDING', 'SATISFIED']),
      );
      expect(schema.properties?.['payable']?.type).toBe('boolean');
      // `payable` is an eligibility flag, never a claim that money arrived.
      for (const collapsed of ['paid', 'isPaid', 'verified', 'confirmed', 'succeeded']) {
        expect(Object.keys(schema.properties ?? {})).not.toContain(collapsed);
      }
    });

    it('publishes every amount as a string, never a JSON number', () => {
      expect(
        schemaOf('CustomerFinalPaymentResponse').properties?.['finalPaymentAmount']?.type,
      ).toBe('string');
      expect(schemaOf('FinalPaymentAttemptResponse').properties?.['amount']?.type).toBe('string');
    });

    it('publishes the bank instructions and the derived RM reference', () => {
      const schema = schemaOf('FinalPaymentBankInstructionsResponse');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
        'accountName',
        'accountNumber',
        'bankBin',
        'bankDisplayName',
        'transferReference',
      ]);
      // The memo example ends in RM, not DC: the two obligations of one order
      // must be distinguishable on a bank statement.
      expect(String(schema.properties?.['transferReference']?.example)).toMatch(/RM$/);
    });
  });

  describe('the attempt response never claims payment', () => {
    it('publishes the method and state sets, with PENDING the documented one', () => {
      const schema = schemaOf('FinalPaymentAttemptResponse');
      expect(schema.properties?.['method']?.enum).toContain('BANK_TRANSFER');
      expect(schema.properties?.['status']?.enum).toContain('PENDING');
    });

    it('publishes no provider field and no settlement field', () => {
      const properties = Object.keys(schemaOf('FinalPaymentAttemptResponse').properties ?? {});
      for (const forbidden of [
        'providerKey',
        'providerRef',
        'succeededAt',
        'settledAt',
        'verifiedAt',
        'paid',
      ]) {
        expect(properties).not.toContain(forbidden);
      }
    });

    it('publishes 201 for the write and 200 for the two reads', () => {
      expect(Object.keys(operation(ATTEMPTS_PATH, 'post').responses ?? {})).toContain('201');
      expect(Object.keys(operation(FINAL_PAYMENT_PATH, 'post').responses ?? {})).toContain('200');
      expect(Object.keys(operation(QR_PATH, 'post').responses ?? {})).toContain('200');
    });

    it('publishes the not-payable refusal on the two acting operations and not on the read', () => {
      // The §6 read/act split, visible in the contract: a customer whose balance
      // has been settled may still read it, but neither acting operation will
      // reopen payment.
      expect(Object.keys(operation(QR_PATH, 'post').responses ?? {})).toContain('409');
      expect(Object.keys(operation(ATTEMPTS_PATH, 'post').responses ?? {})).toContain('409');
      expect(Object.keys(operation(FINAL_PAYMENT_PATH, 'post').responses ?? {})).not.toContain(
        '409',
      );
    });
  });

  describe('the QR operation is a binary contract', () => {
    it('publishes image/png binary, not an enveloped JSON body', () => {
      const success = operation(QR_PATH, 'post').responses?.['200'];
      const content = success?.content ?? {};
      expect(Object.keys(content)).toEqual(['image/png']);
      expect(content['image/png']).toEqual({ schema: { type: 'string', format: 'binary' } });
    });

    it('publishes a JSON request body, because the token cannot be in the URL', () => {
      const body = operation(QR_PATH, 'post').requestBody;
      expect(Object.keys(body?.content ?? {})).toEqual(['application/json']);
    });
  });

  describe('nothing forbidden reaches the published document', () => {
    it.each(FORBIDDEN_TEXT)('no B02 schema mentions `%s` anywhere', (text) => {
      for (const name of B02_SCHEMA_NAMES) {
        expect(JSON.stringify(schemaOf(name))).not.toContain(text);
      }
    });

    it.each(FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS)(
      'no B02 response property name contains `%s`',
      (substring) => {
        for (const name of B02_RESPONSE_NAMES) {
          for (const property of Object.keys(schemaOf(name).properties ?? {})) {
            expect(property.toLowerCase()).not.toContain(substring);
          }
        }
      },
    );

    it('carries no real production banking value in any example', () => {
      // The document is committed. An example that looked like a real account
      // would be a production value in the repository.
      const serialized = JSON.stringify([
        schemaOf('FinalPaymentBankInstructionsResponse'),
        schemaOf('CustomerFinalPaymentResponse'),
      ]);
      expect(serialized).toContain('00000000000');
    });
  });
});
