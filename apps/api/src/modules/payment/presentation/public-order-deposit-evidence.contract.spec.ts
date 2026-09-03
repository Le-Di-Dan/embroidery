/**
 * The published `APP7-B05` contract, built in process.
 *
 * The integration suites prove what the two operations *do*; this proves what
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
import {
  MAX_EVIDENCE_PER_ATTEMPT,
  MAX_TRANSFER_EVIDENCE_BYTES,
  PAYMENT_EVIDENCE_INTAKE_LANE,
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
  TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
} from '../domain/evidence/transfer-evidence.policy';

const UPLOAD_PATH = '/api/public/orders/deposit/evidence';
const STATUS_PATH = '/api/public/orders/deposit/evidence/status';

/** The three B03 paths, restated so "and nothing else" can be checked. */
const B03_PATHS = [
  '/api/public/orders/deposit',
  '/api/public/orders/deposit/attempts',
  '/api/public/orders/deposit/qr',
];

/**
 * Every *other* customer family published under `public/orders`.
 *
 * The bound below is exhaustive, so a sibling family that is not listed reads
 * as this lane having grown a third operation. `APP12-B04` is the reason it is
 * being written now: that checkpoint made the Ready-Made `FULL` obligation
 * reuse **these two operations** rather than publish a fourth, so proving the
 * lane still has exactly two while a third obligation kind flows through it is
 * the claim this list protects.
 *
 * `APP9-B02`'s three and `APP9-B04`'s acknowledgement predate `APP12-B04` and
 * were already missing here; they are added in the same edit because the
 * assertion is one list and cannot be half-correct.
 */
const SIBLING_ORDER_PATHS = [
  '/api/public/orders/final-payment',
  '/api/public/orders/final-payment/qr',
  '/api/public/orders/final-payment/attempts',
  '/api/public/orders/full-payment',
  '/api/public/orders/full-payment/qr',
  '/api/public/orders/full-payment/attempts',
  '/api/public/orders/shipping-fee-acknowledgements',
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
  readonly items?: SchemaShape;
  readonly maxItems?: number;
  readonly $ref?: string;
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Fields no evidence **request** may accept.
 *
 * Every one is server-owned. A body taking any of them would let a caller name
 * another customer's obligation, choose where its own file lands, assert an
 * inspection outcome, or claim a payment fact only Admin verification can
 * establish. `attemptId` is deliberately **absent from this list**: it is the one
 * locator this surface takes, and `APP7-B05` §5 requires it precisely because
 * `APP7-B03` defined no current-attempt selector.
 */
const FORBIDDEN_REQUEST_FIELDS = [
  'assetKind',
  'classification',
  'storageKey',
  'objectKey',
  'bucket',
  'checksum',
  'contentFingerprint',
  'orderId',
  'orderCode',
  'paymentObligationId',
  'obligationId',
  'stepUpChallengeId',
  'challengeId',
  'grantId',
  'customerId',
  'requestId',
  'scopeKind',
  'assetId',
  'evidenceId',
  'amount',
  'currencyCode',
  'method',
  'providerKey',
  'providerRef',
  'transferReference',
  'idempotencyKey',
  'filename',
  'verified',
  'status',
];

/**
 * Substrings no B05 schema may contain **anywhere** — name, description or
 * example. Each is a credential or a storage identity with no innocent reading
 * on a customer payment surface.
 */
const FORBIDDEN_TEXT = [
  'tokenHash',
  'tokenDigest',
  'grantToken',
  'storageKey',
  'objectKey',
  'presign',
  'minio',
  's3://',
  'secretHash',
];

/**
 * Substrings no B05 **response property name** may contain.
 *
 * `bucket`/`url`/`key` are storage identity; `scan`/`inspect` is scanner detail;
 * `reconcil`/`refund`/`verif`/`admin` are `APP7-B04`; `provider`/`webhook` stay
 * closed under `IMP-O007`; `amount`/`order`/`obligation`/`attempt` are payment
 * facts this response does not carry; `grant`/`challenge`/`token`/`customer` are
 * identity; `idempotency` is transport.
 */
const FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS = [
  'bucket',
  'url',
  'key',
  'scan',
  'inspect',
  'reconcil',
  'refund',
  'verif',
  'admin',
  'provider',
  'webhook',
  'amount',
  'order',
  'obligation',
  'attempt',
  'grant',
  'challenge',
  'token',
  'customer',
  'idempotency',
  'checksum',
  'fingerprint',
];

describe('APP7-B05 — the published transfer-evidence contract', () => {
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

  describe('the surface is exactly two operations', () => {
    it('adds two paths under public/orders and no third, whatever else ships there', () => {
      const paths = Object.keys(document.paths).filter((path) =>
        path.startsWith('/api/public/orders'),
      );
      expect(paths.sort()).toEqual(
        [...B03_PATHS, ...SIBLING_ORDER_PATHS, UPLOAD_PATH, STATUS_PATH].sort(),
      );
      // The point of the bound, since `APP12-B04`: three obligation kinds now
      // attach evidence through this lane, and it is still two operations.
      const evidencePaths = paths.filter((path) => path.includes('evidence'));
      expect(evidencePaths.sort()).toEqual([UPLOAD_PATH, STATUS_PATH].sort());
    });

    it('publishes exactly one method on each, both POST', () => {
      // POST for the read too: `ADR-APP4-001` §11 forbids the token in a path or
      // a query, so a GET could not carry the credential anywhere loggable-free.
      for (const path of [UPLOAD_PATH, STATUS_PATH]) {
        expect(Object.keys(document.paths[path] as object)).toEqual(['post']);
      }
    });

    it('names both in their own publicOrderDepositEvidence domain', () => {
      expect(operation(UPLOAD_PATH, 'post').operationId).toBe('publicOrderDepositEvidence_upload');
      expect(operation(STATUS_PATH, 'post').operationId).toBe('publicOrderDepositEvidence_status');
    });

    it('publishes no evidence DELETE, PATCH, PUT or replace anywhere', () => {
      // Append-only (`APP7-G01` §7.2). There is no surface to remove, replace,
      // detach, rebind or reorder evidence — for a customer or for anyone else.
      //
      // Stated as "no mutating verb" rather than as "exactly `post`", which is
      // what it said before `APP7-B06` published the Admin evidence *read*. A
      // `GET` takes nothing away from append-only; `delete`, `patch` and `put`
      // are the verbs the rule exists to forbid, and `APP12-H01` re-measured the
      // artifact to confirm none of them exists on any evidence path.
      const MUTATING = ['delete', 'patch', 'put'];
      for (const [path, item] of Object.entries(document.paths)) {
        if (!/evidence/i.test(path)) continue;
        expect(Object.keys(item).filter((method) => MUTATING.includes(method))).toEqual([]);
        expect(Object.keys(item).sort()).toEqual(
          Object.keys(item)
            .filter((method) => method === 'get' || method === 'post')
            .sort(),
        );
      }
    });

    it('publishes no public evidence binary, preview or content route', () => {
      // `APP7-B06` owns Admin binary delivery and delivered exactly one address
      // for it after this checkpoint closed. What B05 claims — and what stays
      // true — is that the **public** evidence surface is metadata and status
      // only, with no byte stream a customer can address. Narrowed to that by
      // `APP12-H01`; the Admin side is fenced by the test below.
      const publicEvidencePaths = Object.keys(document.paths).filter(
        (path) => /evidence/i.test(path) && path.startsWith('/api/public/'),
      );
      expect(publicEvidencePaths.sort()).toEqual([UPLOAD_PATH, STATUS_PATH].sort());
      for (const path of publicEvidencePaths) {
        expect(path).not.toMatch(/content|preview|thumbnail|download|file/i);
      }
    });

    it('publishes no provider route, and exactly one Admin evidence address', () => {
      // The provider half is absolute and unchanged: no webhook, no callback, no
      // reconciliation endpoint exists anywhere, because `APP7-G01` makes a
      // browser redirect and a provider callback incapable of verifying a
      // payment. The Admin half was `[]` when B05 closed and is now exactly the
      // one read `APP7-B06` delivered — named by `APP12-H01` so a second Admin
      // evidence operation still fails here.
      const providerRoutes = Object.keys(document.paths).filter((path) =>
        /webhook|provider|reconcil/i.test(path),
      );
      expect(providerRoutes).toEqual([]);

      const adminEvidence = Object.keys(document.paths).filter((path) =>
        /admin.*evidence|evidence.*admin/i.test(path),
      );
      expect(adminEvidence).toEqual(['/api/admin/payment-evidence/{evidenceId}/content']);
    });

    it('takes no locator in either path, so nothing can be enumerated by URL', () => {
      for (const path of [UPLOAD_PATH, STATUS_PATH]) {
        expect(path).not.toContain('{');
      }
    });
  });

  describe('the upload publishes a streaming multipart contract', () => {
    it('consumes multipart/form-data and nothing else', () => {
      const body = operation(UPLOAD_PATH, 'post').requestBody;
      expect(Object.keys(body?.content ?? {})).toEqual(['multipart/form-data']);
    });

    it('publishes the two credential fields and exactly one binary part', () => {
      const schema = operation(UPLOAD_PATH, 'post').requestBody?.content?.['multipart/form-data']
        ?.schema;
      expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(
        ['accessToken', 'attemptId', 'file'].sort(),
      );
      expect((schema?.required ?? []).slice().sort()).toEqual(
        ['accessToken', 'attemptId', 'file'].sort(),
      );
      expect(schema?.properties?.['file']?.format).toBe('binary');
    });

    it('names every credential field so it sorts before the file part', () => {
      // Not cosmetic, and not a coincidence. `serialize-openapi-document.ts`
      // sorts every object key so the committed artifact's bytes cannot depend
      // on insertion order, and the generated client appends multipart parts in
      // published order. A credential named so that it sorted *after* `file`
      // would produce a client whose every upload is refused — correctly, since
      // a credential arriving after the bytes could not have authorized them.
      // This assertion is what keeps a future rename from breaking that
      // silently.
      for (const field of PAYMENT_EVIDENCE_INTAKE_LANE.credentialFields) {
        expect(field < 'file').toBe(true);
      }
    });

    it('states the ten-megabyte ceiling and the three accepted types', () => {
      const schema = operation(UPLOAD_PATH, 'post').requestBody?.content?.['multipart/form-data']
        ?.schema;
      const file = JSON.stringify(schema?.properties?.['file']);
      expect(file).toContain(String(MAX_TRANSFER_EVIDENCE_BYTES));
      expect(file).toContain('image/png');
      expect(file).toContain('image/jpeg');
      expect(file).toContain('image/webp');
      // No other type is offered, in either direction.
      for (const rejected of ['image/gif', 'image/svg', 'application/pdf', 'image/heic']) {
        expect(file).not.toContain(rejected);
      }
    });

    it('carries the upload key as the delivered Idempotency-Key header', () => {
      const parameters = operation(UPLOAD_PATH, 'post').parameters ?? [];
      const names = parameters.filter((p) => p.in === 'header').map((p) => p.name);
      expect(names).toContain('Idempotency-Key');
    });

    it('publishes 202, because inspection has not run when it answers', () => {
      expect(Object.keys(operation(UPLOAD_PATH, 'post').responses ?? {})).toContain('202');
    });
  });

  describe('the status read publishes a bounded JSON contract', () => {
    it('accepts the token and the attempt locator and refuses every other field', () => {
      const schema = schemaOf('ReadTransferEvidenceBody');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['accessToken', 'attemptId']);
      expect((schema.required ?? []).slice().sort()).toEqual(['accessToken', 'attemptId']);
      // `.strict()` — an unknown field is a 400, not silently ignored.
      expect(schema.additionalProperties).toBe(false);
    });

    it('publishes no example token', () => {
      // An example token is a credential-shaped string rendered in Swagger UI
      // and pre-filled into "try it out".
      expect(JSON.stringify(schemaOf('ReadTransferEvidenceBody'))).not.toContain('example');
    });

    it('publishes a list bounded at five, with no page cursor', () => {
      const schema = schemaOf('TransferEvidenceListResponse');
      expect(Object.keys(schema.properties ?? {})).toEqual(['evidence']);
      expect(schema.properties?.['evidence']?.maxItems).toBe(MAX_EVIDENCE_PER_ATTEMPT);
      for (const paging of ['cursor', 'nextCursor', 'page', 'limit', 'total', 'hasMore']) {
        expect(Object.keys(schema.properties ?? {})).not.toContain(paging);
      }
    });

    it('publishes 200 for the read', () => {
      expect(Object.keys(operation(STATUS_PATH, 'post').responses ?? {})).toContain('200');
    });
  });

  describe('neither request accepts a server-owned field', () => {
    it.each(FORBIDDEN_REQUEST_FIELDS)('no evidence request body accepts `%s`', (field) => {
      const multipart = operation(UPLOAD_PATH, 'post').requestBody?.content?.['multipart/form-data']
        ?.schema;
      expect(Object.keys(multipart?.properties ?? {})).not.toContain(field);
      expect(Object.keys(schemaOf('ReadTransferEvidenceBody').properties ?? {})).not.toContain(
        field,
      );
    });
  });

  describe('the responses carry status and never a claim, a byte or a location', () => {
    it('publishes the upload as INSPECTING and nothing stronger', () => {
      const schema = schemaOf('TransferEvidenceUploadResponse');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
        ['assetStatus', 'byteSize', 'evidenceId', 'mediaType', 'replayed'].sort(),
      );
      expect(schema.properties?.['assetStatus']?.enum).toEqual(['INSPECTING']);
      for (const claim of ['accepted', 'verified', 'paid', 'confirmed', 'succeeded', 'settled']) {
        expect(Object.keys(schema.properties ?? {})).not.toContain(claim);
      }
    });

    it('publishes the four states a customer may distinguish, and no internal one', () => {
      const states = schemaOf('TransferEvidenceItemResponse').properties?.['assetStatus']?.enum;
      expect(states).toEqual(['UPLOADED', 'INSPECTING', 'ACCEPTED', 'REJECTED']);
      // The removal states are projected onto REJECTED rather than published: a
      // customer has nothing to do with the difference.
      expect(states).not.toContain('DELETION_PENDING');
      expect(states).not.toContain('DELETED');
    });

    it('publishes the item as the association, its status and its measured facts', () => {
      expect(Object.keys(schemaOf('TransferEvidenceItemResponse').properties ?? {}).sort()).toEqual(
        ['assetStatus', 'byteSize', 'createdAt', 'evidenceId', 'mediaType'].sort(),
      );
    });

    it.each(FORBIDDEN_TEXT)('no B05 schema mentions `%s` anywhere', (text) => {
      for (const name of [
        'ReadTransferEvidenceBody',
        'TransferEvidenceUploadResponse',
        'TransferEvidenceItemResponse',
        'TransferEvidenceListResponse',
      ]) {
        expect(JSON.stringify(schemaOf(name))).not.toContain(text);
      }
    });

    it.each(FORBIDDEN_RESPONSE_PROPERTY_SUBSTRINGS)(
      'no B05 response property name contains `%s`',
      (substring) => {
        for (const name of [
          'TransferEvidenceUploadResponse',
          'TransferEvidenceItemResponse',
          'TransferEvidenceListResponse',
        ]) {
          for (const property of Object.keys(schemaOf(name).properties ?? {})) {
            expect(property.toLowerCase()).not.toContain(substring);
          }
        }
      },
    );
  });

  describe('the lane is the delivered one, with the locked values', () => {
    it('is CUSTOMER_UPLOAD / CUSTOMER_PRIVATE at ten megabytes', () => {
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.assetKind).toBe('CUSTOMER_UPLOAD');
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.classification).toBe('CUSTOMER_PRIVATE');
      expect(TRANSFER_EVIDENCE_ASSET_KIND).toBe('CUSTOMER_UPLOAD');
      expect(TRANSFER_EVIDENCE_CLASSIFICATION).toBe('CUSTOMER_PRIVATE');
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.maxUploadBytes).toBe(10_485_760);
    });

    it('claims under the namespace `APP7-G01` §7.1 locked', () => {
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.operationNamespace).toBe(
        'public.order.deposit-evidence.upload',
      );
      expect(TRANSFER_EVIDENCE_OPERATION_NAMESPACE).toBe('public.order.deposit-evidence.upload');
    });

    it('declares no self-describing metadata field, and two credential fields', () => {
      // A field whose only legal value is a constant is a field whose only
      // possible effect is to be filled in wrong.
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.declaresMetadataFields).toBe(false);
      expect(PAYMENT_EVIDENCE_INTAKE_LANE.credentialFields).toEqual(['accessToken', 'attemptId']);
    });

    it('bounds one attempt at five images', () => {
      expect(MAX_EVIDENCE_PER_ATTEMPT).toBe(5);
    });
  });
});
