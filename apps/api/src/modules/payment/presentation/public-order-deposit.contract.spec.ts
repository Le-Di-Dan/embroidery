/**
 * The published `APP7-B03` contract, built in process.
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

const DEPOSIT_PATH = '/api/public/orders/deposit';
const ATTEMPTS_PATH = '/api/public/orders/deposit/attempts';
const QR_PATH = '/api/public/orders/deposit/qr';

/**
 * `APP7-B05`'s two operations.
 *
 * Restated here so the two "and nothing else" bounds below stay exhaustive
 * assertions about the whole `public/orders` surface, rather than being loosened
 * into a prefix filter that would quietly stop noticing a fourth B03 route.
 */
const B05_EVIDENCE_PATHS = [
  '/api/public/orders/deposit/evidence',
  '/api/public/orders/deposit/evidence/status',
];

/**
 * `APP7-B04`'s three Admin operations.
 *
 * Listed for the same reason B05's are: the repository-wide "no other payment
 * route exists" bound below matches on the word `payment`, and an Admin
 * verification path is a route that must be *named* to stay excluded rather than
 * loosened past by a prefix filter. All three are behind
 * `AuthenticatedAdminGuard` and none is reachable from this customer surface.
 */
const B04_ADMIN_PAYMENT_PATHS = [
  '/api/admin/orders/{orderId}/payments',
  '/api/admin/payment-attempts/{attemptId}/verify',
  '/api/admin/payment-attempts/{attemptId}/review',
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
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Fields no deposit **request** may accept.
 *
 * Every one is server-owned (`APP7-B03` §7). A body that took any of them would
 * let a caller name another customer's obligation, another customer's proof of
 * presence, a different sum, or a payment provider.
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
  'depositAmount',
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
 * Substrings no B03 schema may contain **anywhere** — name, description or
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
 * Substrings no B03 **response property name** may contain.
 *
 * `remaining` is the APP9 obligation this surface neither shows nor makes
 * payable; `evidence` is `APP7-B05`; `reconcil`/`refund`/`verif` are
 * `APP7-B04`; `provider`/`webhook` stay closed under `IMP-O007`; `inventory`
 * and `production` are APP8.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
  'remaining',
  'evidence',
  'reconcil',
  'refund',
  'verif',
  'provider',
  'webhook',
  'inventory',
  'production',
  'idempotency',
  'grant',
  'challenge',
  'admin',
];

describe('APP7-B03 — the published customer deposit contract', () => {
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
    it('publishes three paths under public/orders, beside B05’s two and nothing else', () => {
      const paths = Object.keys(document.paths).filter((path) =>
        path.startsWith('/api/public/orders'),
      );
      expect(paths.sort()).toEqual(
        [DEPOSIT_PATH, ATTEMPTS_PATH, QR_PATH, ...B05_EVIDENCE_PATHS].sort(),
      );
    });

    it('publishes exactly one method on each, all POST', () => {
      for (const path of [DEPOSIT_PATH, ATTEMPTS_PATH, QR_PATH]) {
        expect(Object.keys(document.paths[path] as object)).toEqual(['post']);
      }
    });

    it('names the three operations in one publicOrderDeposit domain', () => {
      expect(operation(DEPOSIT_PATH, 'post').operationId).toBe('publicOrderDeposit_current');
      expect(operation(ATTEMPTS_PATH, 'post').operationId).toBe('publicOrderDeposit_initiate');
      expect(operation(QR_PATH, 'post').operationId).toBe('publicOrderDeposit_qr');
    });

    it('publishes no customer deposit or payment operation beyond B03’s three and B05’s two', () => {
      // Attempt list, attempt detail, "mark paid", customer confirmation, a
      // provider route and a webhook are each explicitly out of scope. None of
      // them exists at any path. The two evidence routes are `APP7-B05`'s and
      // the three Admin routes are `APP7-B04`'s; both are bounded by their own
      // suites and are named here so this stays an exhaustive assertion.
      const forbidden = Object.keys(document.paths).filter((path) =>
        /deposit|payment|evidence|webhook|refund/i.test(path),
      );
      expect(forbidden.sort()).toEqual(
        [
          DEPOSIT_PATH,
          ATTEMPTS_PATH,
          QR_PATH,
          ...B05_EVIDENCE_PATHS,
          ...B04_ADMIN_PAYMENT_PATHS,
        ].sort(),
      );
    });

    it('takes no locator in any path, so no order can be addressed', () => {
      for (const path of [DEPOSIT_PATH, ATTEMPTS_PATH, QR_PATH]) {
        expect(path).not.toContain('{');
      }
    });
  });

  describe('the request bodies accept the token and nothing else', () => {
    it.each([['ReadDepositBody'], ['InitiateDepositAttemptBody'], ['DepositQrBody']])(
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
      for (const name of ['ReadDepositBody', 'InitiateDepositAttemptBody', 'DepositQrBody']) {
        expect(Object.keys(schemaOf(name).properties ?? {})).not.toContain(field);
      }
    });

    it('publishes no example token', () => {
      // An example token is a credential-shaped string rendered in Swagger UI
      // and pre-filled into "try it out".
      const serialized = JSON.stringify(schemaOf('ReadDepositBody'));
      expect(serialized).not.toContain('example');
    });

    it('carries the attempt key as the delivered Idempotency-Key header', () => {
      const parameters = operation(ATTEMPTS_PATH, 'post').parameters ?? [];
      const names = parameters.filter((p) => p.in === 'header').map((p) => p.name);
      expect(names).toContain('Idempotency-Key');
      // And not as a second transport in the body.
      expect(Object.keys(schemaOf('InitiateDepositAttemptBody').properties ?? {})).not.toContain(
        'idempotencyKey',
      );
    });
  });

  describe('the deposit read publishes the obligation, never a recomputed share', () => {
    it('publishes both states as accepted names and no collapsing boolean', () => {
      const schema = schemaOf('CustomerDepositResponse');
      const properties = Object.keys(schema.properties ?? {});
      expect(properties.sort()).toEqual(
        [
          'accessExpiresAt',
          'bankInstructions',
          'currencyCode',
          'depositAmount',
          'depositStatus',
          'orderCode',
          'orderStatus',
        ].sort(),
      );
      expect(schema.properties?.['orderStatus']?.enum).toContain('AWAITING_DEPOSIT');
      expect(schema.properties?.['orderStatus']?.enum).toContain('DEPOSIT_PAID');
      expect(schema.properties?.['depositStatus']?.enum).toEqual(
        expect.arrayContaining(['PENDING', 'SATISFIED']),
      );
      for (const collapsed of ['paid', 'isPaid', 'verified', 'confirmed', 'succeeded']) {
        expect(properties).not.toContain(collapsed);
      }
    });

    it('publishes every amount as a string, never a JSON number', () => {
      expect(schemaOf('CustomerDepositResponse').properties?.['depositAmount']?.type).toBe(
        'string',
      );
      expect(schemaOf('DepositAttemptResponse').properties?.['amount']?.type).toBe('string');
    });

    it('publishes the bank instructions and the derived reference', () => {
      const schema = schemaOf('DepositBankInstructionsResponse');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
        'accountName',
        'accountNumber',
        'bankBin',
        'bankDisplayName',
        'transferReference',
      ]);
    });
  });

  describe('the attempt response never claims payment', () => {
    it('publishes the method and state sets, with PENDING the documented one', () => {
      const schema = schemaOf('DepositAttemptResponse');
      expect(schema.properties?.['method']?.enum).toContain('BANK_TRANSFER');
      expect(schema.properties?.['status']?.enum).toContain('PENDING');
    });

    it('publishes no provider field and no settlement field', () => {
      const properties = Object.keys(schemaOf('DepositAttemptResponse').properties ?? {});
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
      expect(Object.keys(operation(DEPOSIT_PATH, 'post').responses ?? {})).toContain('200');
      expect(Object.keys(operation(QR_PATH, 'post').responses ?? {})).toContain('200');
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
    const names = [
      'ReadDepositBody',
      'InitiateDepositAttemptBody',
      'DepositQrBody',
      'CustomerDepositResponse',
      'DepositBankInstructionsResponse',
      'DepositAttemptResponse',
    ];

    it.each(FORBIDDEN_TEXT)('no B03 schema mentions `%s` anywhere', (text) => {
      for (const name of names) {
        expect(JSON.stringify(schemaOf(name))).not.toContain(text);
      }
    });

    it.each(FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS)(
      'no B03 response property name contains `%s`',
      (substring) => {
        for (const name of [
          'CustomerDepositResponse',
          'DepositBankInstructionsResponse',
          'DepositAttemptResponse',
        ]) {
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
        schemaOf('DepositBankInstructionsResponse'),
        schemaOf('CustomerDepositResponse'),
      ]);
      expect(serialized).toContain('00000000000');
    });
  });
});
