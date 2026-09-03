/**
 * The published `APP7-B06` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half the generated client and `APP7-A01` depend
 * on. It runs before the single generation slot is spent, so a defect found here
 * costs nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const CONTENT_PATH = '/api/admin/payment-evidence/{evidenceId}/content';

/** The three the intake allowlist admits, and nothing else. */
const DELIVERABLE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, { readonly content?: Record<string, unknown> }>;
  readonly security?: readonly unknown[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
}

/**
 * Substrings the operation may not contain anywhere — parameter names, response
 * descriptions, schema names or examples.
 *
 * Matched case-insensitively over the serialized operation, so a field added
 * later cannot introduce one without failing here.
 */
const FORBIDDEN_IN_B06 = [
  'storageKey',
  'objectKey',
  'bucket',
  'presign',
  'signedUrl',
  'downloadUrl',
  'assetId',
  'attemptId',
  'adminId',
  'accessToken',
  'tokenHash',
  'accountNumber',
];

/** A response body that is bytes rather than an envelope. */
function isBinaryMedia(mediaType: string): boolean {
  return mediaType.startsWith('image/') || mediaType === 'application/octet-stream';
}

describe('APP7-B06 — the published Admin transfer-evidence contract', () => {
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

  function operation(): OperationShape | undefined {
    return document.paths[CONTENT_PATH]?.['get'];
  }

  it('publishes exactly one operation at the evidence address, and only GET', () => {
    expect(Object.keys(document.paths[CONTENT_PATH] ?? {})).toEqual(['get']);
    expect(operation()?.operationId).toBe('adminPaymentEvidence_get');
  });

  it('adds exactly one operation to the whole Admin payment surface', () => {
    const paymentOperations = Object.entries(document.paths)
      .filter(
        ([path]) =>
          path.startsWith('/api/admin/payment') ||
          path.startsWith('/api/admin/orders/{orderId}/pay'),
      )
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
      );

    // B04's three, and B06's one. No metadata route, no list route, no
    // per-attempt evidence route, no download-token route, no presign route, no
    // delete/replace/retry (§1).
    expect(paymentOperations.sort()).toEqual(
      [
        `GET ${CONTENT_PATH}`,
        'GET /api/admin/orders/{orderId}/payments',
        'POST /api/admin/payment-attempts/{attemptId}/review',
        'POST /api/admin/payment-attempts/{attemptId}/verify',
      ].sort(),
    );
  });

  it('adds no generic Admin asset binary, and is the only payment byte stream', () => {
    const adminBinaries = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/'))
      .flatMap(([path, item]) =>
        Object.entries(item)
          .filter(([, op]) => Object.keys(op.responses?.['200']?.content ?? {}).some(isBinaryMedia))
          .map(([method]) => `${method.toUpperCase()} ${path}`),
      );

    // Four, and every one is contextual to a single aggregate in exactly the way
    // this one is contextual to a payment attempt's evidence association:
    // `APP3-A01`'s placement background, `APP5-B06`'s request attachment, B06's
    // own evidence content, and `APP11-B02`'s gallery rendition — the one added
    // after this checkpoint closed. `APP12-H01` re-measured the artifact and
    // named it rather than relaxing the fence, so a fifth Admin byte stream, or
    // any generic "download"/"thumbnail" address, still fails here.
    expect(adminBinaries.sort()).toEqual(
      [
        `GET ${CONTENT_PATH}`,
        'GET /api/admin/custom-requests/{requestId}/assets/{assetId}/content',
        'GET /api/admin/gallery-assets/{assetId}/{rendition}',
        'GET /api/admin/products/{productId}/sides/{sideId}/background',
      ].sort(),
    );

    // `/api/admin/assets/{assetId}` is `APP2-B01`'s catalog-media **metadata**
    // read and predates this checkpoint. B06 neither adds to it nor turns it
    // into a delivery route: the generic address §24 forbids is a binary one,
    // and this asserts the existing JSON operation stayed JSON.
    const genericAsset = document.paths['/api/admin/assets/{assetId}']?.['get'];
    expect(Object.keys(genericAsset?.responses?.['200']?.content ?? {})).toEqual([
      'application/json',
    ]);
    expect(document.paths['/api/admin/assets/{assetId}/content']).toBeUndefined();
  });

  it('adds no customer evidence binary anywhere under the public prefix', () => {
    const publicBinaries = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/public/'))
      .flatMap(([path, item]) =>
        Object.entries(item)
          .filter(([, op]) => Object.keys(op.responses?.['200']?.content ?? {}).some(isBinaryMedia))
          .map(([method]) => `${method.toUpperCase()} ${path}`),
      );

    // Whatever the public media and Studio lanes already publish, none of it is
    // transfer evidence (§23): B05 exposes no customer binary and B06 adds none.
    // `publicOrderDeposit_qr` is a public deposit binary and stays out of this
    // by name rather than by luck — it is a server-generated payment
    // instruction, not a customer's private upload.
    expect(publicBinaries.filter((entry) => entry.includes('evidence'))).toEqual([]);
  });

  it('takes one path id, no body, and no query parameter at all', () => {
    const parameters = operation()?.parameters ?? [];

    expect(parameters.filter((p) => p.in === 'path').map((p) => p.name)).toEqual(['evidenceId']);
    // No token, no secret, no `adminId`, no rendition selector: the platform's
    // `X-Request-ID` header is the only non-path parameter on the operation.
    expect(parameters.filter((p) => p.in === 'query')).toEqual([]);
    expect(operation()?.requestBody).toBeUndefined();
  });

  it('is guarded by the Admin cookie scheme and documents the 401', () => {
    const security = operation()?.security ?? [];

    expect(JSON.stringify(security)).toContain('adminSession');
    expect(operation()?.responses?.['401']).toBeDefined();
  });

  it('declares a binary success body limited to the three deliverable types', () => {
    const content = operation()?.responses?.['200']?.content ?? {};

    expect(Object.keys(content).sort()).toEqual([...DELIVERABLE_MEDIA_TYPES].sort());
    for (const media of DELIVERABLE_MEDIA_TYPES) {
      expect(content[media]).toEqual({ schema: { type: 'string', format: 'binary' } });
    }
    // `image/svg+xml` cannot be stored by the evidence intake lane, so it cannot
    // be published as deliverable here either.
    expect(content['image/svg+xml']).toBeUndefined();
    expect(content['application/json']).toBeUndefined();
  });

  it('documents the collapsed private miss and the bounded provider failure', () => {
    expect(operation()?.responses?.['400']).toBeDefined();
    expect(operation()?.responses?.['404']).toBeDefined();
    expect(operation()?.responses?.['503']).toBeDefined();
  });

  it('names no storage identity, asset id, attempt id or credential anywhere', () => {
    const serialized = JSON.stringify(operation()).toLowerCase();

    for (const forbidden of FORBIDDEN_IN_B06) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }
  });

  it('leaves the accepted B04 and B05 operation ids untouched', () => {
    const ids = Object.values(document.paths)
      .flatMap((item) => Object.values(item))
      .map((op) => op.operationId);

    for (const id of [
      'adminOrderPayment_read',
      'adminPaymentAttempt_verify',
      'adminPaymentAttempt_review',
      'publicOrderDepositEvidence_upload',
      'publicOrderDepositEvidence_status',
    ]) {
      expect(ids).toEqual(expect.arrayContaining([id]));
    }
  });
});
