/**
 * The published `APP5-B06` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
 * document *says*, which is the half the generated client and `APP5-A02` depend
 * on. It runs before the single generation slot is spent, so a defect found here
 * costs nothing while one found in the committed artifact costs the slot.
 *
 * Docker-free: no database, no container, no network.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../../../bootstrap/api-application';
import { buildOpenApiDocument } from '../../../openapi/build-openapi-document';
import { ensureGenerationEnvironment } from '../../../openapi/generation-environment';

const CONTENT_PATH = '/api/admin/custom-requests/{requestId}/assets/{assetId}/content';

/** The three the intake allowlist admits, and nothing else. */
const DELIVERABLE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly {
    readonly name: string;
    readonly in: string;
    /** Present on an enumerated parameter; read to prove a closed vocabulary. */
    readonly schema?: { readonly enum?: readonly string[] };
  }[];
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
  'adminId',
  'tokenHash',
  'sessionSecret',
];

/** A response body that is bytes rather than an envelope. */
function isBinaryMedia(mediaType: string): boolean {
  return mediaType.startsWith('image/') || mediaType === 'application/octet-stream';
}

describe('APP5-B06 — the published Admin request-asset contract', () => {
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

  it('publishes exactly one operation at the contextual address, and only GET', () => {
    expect(Object.keys(document.paths[CONTENT_PATH] ?? {})).toEqual(['get']);
    expect(operation()?.operationId).toBe('adminCustomRequestAsset_get');
  });

  it('is the only Admin address that serves bytes, and adds no generic asset route', () => {
    const adminBinaries = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/'))
      .flatMap(([path, item]) =>
        Object.entries(item)
          .filter(([, op]) => Object.keys(op.responses?.['200']?.content ?? {}).some(isBinaryMedia))
          .map(([method]) => `${method.toUpperCase()} ${path}`),
      );

    // Five, and every other one is contextual in exactly the way this is:
    // `APP3-A01`'s placement background belongs to a product side, `APP7-B06`'s
    // transfer screenshot to a payment attempt's evidence association, and
    // `APP11-B02`'s rendition to a single gallery asset. This checkpoint still
    // adds one and only one, and none of the five is a generic binary or a
    // companion "download" address. Re-measured by `APP12-H01`.
    //
    // The fifth arrived with `APP12-V02-C2` under Human-PO authority, and it is
    // contextual in the same way its `gallery-assets` twin is: the lane is
    // re-checked per request, the rendition is an enum of the two processed
    // derivatives, and there is no word in that enum for an original — so it
    // cannot become the generic `GET /assets/:id` escape hatch §1 forbids. The
    // *count* is not what this guard protects; the shape of each address is.
    expect(adminBinaries.sort()).toEqual(
      [
        `GET ${CONTENT_PATH}`,
        'GET /api/admin/assets/{assetId}/{rendition}',
        'GET /api/admin/gallery-assets/{assetId}/{rendition}',
        'GET /api/admin/payment-evidence/{evidenceId}/content',
        'GET /api/admin/products/{productId}/sides/{sideId}/background',
      ].sort(),
    );

    // The rendition enum is the reason the address above cannot serve an
    // original: a request has no word to spell one with.
    const rendition = document.paths['/api/admin/assets/{assetId}/{rendition}']?.[
      'get'
    ]?.parameters?.find((parameter) => parameter.name === 'rendition');
    expect(rendition?.schema?.enum).toEqual(['thumbnail', 'catalog-preview']);

    // `/api/admin/assets/{assetId}` is `APP2-B01`'s catalog-media **metadata**
    // read and predates this checkpoint. B06 neither adds to it nor turns it
    // into a delivery route: the generic address §1 forbids is a binary one, and
    // this asserts the existing JSON operation stayed JSON.
    const genericAsset = document.paths['/api/admin/assets/{assetId}']?.['get'];
    expect(Object.keys(genericAsset?.responses?.['200']?.content ?? {})).toEqual([
      'application/json',
    ]);
  });

  it('adds no mutation of its own anywhere under the Admin request prefix', () => {
    const mutations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/custom-requests'))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => method !== 'get')
          .map((method) => `${method.toUpperCase()} ${path}`),
      );

    // Unchanged by B06: no upload, no replace, no delete, no re-inspect and no
    // role change on a submitted attachment (§15). The two design entries are
    // `APP6-B08`'s authoring route and `APP6-B09`'s exact-version send, each
    // reconciled here deliberately when its checkpoint published it — this list
    // freezes the whole prefix, so a route that appeared without being named
    // here would fail.
    expect(mutations.sort()).toEqual([
      'POST /api/admin/custom-requests/{requestId}/design-versions',
      'POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send',
      'POST /api/admin/custom-requests/{requestId}/moderation-notes',
      'POST /api/admin/custom-requests/{requestId}/transitions',
    ]);
  });

  it('takes both ids from the path, no body, and no query parameter at all', () => {
    const parameters = operation()?.parameters ?? [];

    expect(
      parameters
        .filter((p) => p.in === 'path')
        .map((p) => p.name)
        .sort(),
    ).toEqual(['assetId', 'requestId']);
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
    // `image/svg+xml` cannot be stored by the intake lane, so it cannot be
    // published as deliverable here either.
    expect(content['image/svg+xml']).toBeUndefined();
    expect(content['application/json']).toBeUndefined();
  });

  it('documents the collapsed private miss and the bounded provider failure', () => {
    expect(operation()?.responses?.['400']).toBeDefined();
    expect(operation()?.responses?.['404']).toBeDefined();
    expect(operation()?.responses?.['503']).toBeDefined();
  });

  it('names no storage identity, credential or actor parameter anywhere', () => {
    const serialized = JSON.stringify(operation()).toLowerCase();

    for (const forbidden of FORBIDDEN_IN_B06) {
      expect(serialized).not.toContain(forbidden.toLowerCase());
    }
  });

  it('leaves the accepted B04 and B05 operation ids untouched', () => {
    const ids = Object.values(document.paths)
      .flatMap((item) => Object.values(item))
      .map((op) => op.operationId);

    expect(ids).toEqual(expect.arrayContaining(['adminCustomRequest_list']));
    expect(ids).toEqual(expect.arrayContaining(['adminCustomRequest_detail']));
    expect(ids).toEqual(expect.arrayContaining(['adminCustomRequest_appendNote']));
    expect(ids).toEqual(expect.arrayContaining(['adminCustomRequest_transition']));
  });
});
