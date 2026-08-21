/**
 * The published `APP6-B09` contract, built in process.
 *
 * The integration suite proves what the endpoint *does*; this proves what the
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

const SEND_PATH = '/api/admin/custom-requests/{requestId}/design-versions/{versionId}/send';
const CREATE_PATH = '/api/admin/custom-requests/{requestId}/design-versions';

interface OperationShape {
  readonly operationId?: string;
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly requestBody?: unknown;
  readonly responses?: Record<string, unknown>;
}
interface SchemaShape {
  readonly type?: string | readonly string[];
  readonly nullable?: boolean;
  readonly properties?: Record<string, SchemaShape>;
  readonly required?: readonly string[];
  readonly items?: SchemaShape;
  readonly enum?: readonly string[];
}
interface OpenApiShape {
  readonly paths: Record<string, Record<string, OperationShape>>;
  readonly components: { readonly schemas: Record<string, SchemaShape> };
}

/**
 * Names the send response may never publish.
 *
 * Each is a surface `APP6-B10`/`B11` own or a credential reference: a field here
 * would let one reach an Admin client before the checkpoint that governs it
 * exists.
 */
const FORBIDDEN_RESPONSE_FIELDS = [
  'document',
  'designDocument',
  'elements',
  'previewUrl',
  'previewHash',
  'previewDerivativeId',
  'storageKey',
  'downloadUrl',
  'token',
  'grantId',
  'secureLink',
  'customerId',
  'approvalSnapshotId',
  'agreementVersionId',
  'stepUpChallengeId',
];

describe('APP6-B09 — the published Admin design-version send contract', () => {
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
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
  });

  function sendOperation(): OperationShape {
    const operation = document.paths[SEND_PATH]?.['post'];
    expect(operation).toBeDefined();
    return operation as OperationShape;
  }

  it('publishes exactly one new operation, on the exact-version send path', () => {
    expect(Object.keys(document.paths[SEND_PATH] ?? {})).toEqual(['post']);
    expect(sendOperation().operationId).toBe('adminCustomRequestDesignVersion_send');
  });

  it('leaves both accepted APP6-B08 operation ids untouched', () => {
    expect(document.paths[CREATE_PATH]?.['post']?.operationId).toBe(
      'adminCustomRequestDesignVersion_create',
    );
    expect(document.paths[CREATE_PATH]?.['get']?.operationId).toBe(
      'adminCustomRequestDesignVersion_list',
    );
  });

  it('publishes no second send route, no resend and no status mutation', () => {
    const suspicious = Object.keys(document.paths).filter(
      (path) =>
        path !== SEND_PATH &&
        (/design-versions?\/.*\/(resend|review-ready|design-review)/.test(path) ||
          /custom-requests\/\{requestId\}\/(design-review|status)$/.test(path)),
    );
    expect(suspicious).toEqual([]);
  });

  it('adds no customer or public operation', () => {
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.values(item).map((operation) => ({ path, id: operation.operationId ?? '' })),
    );
    const designReviewPublic = operations.filter(
      (operation) =>
        operation.path.includes('design-version') && !operation.path.startsWith('/api/admin/'),
    );
    expect(designReviewPublic).toEqual([]);
  });

  it('accepts two uuid path parameters and no request body at all', () => {
    const operation = sendOperation();
    // The absence of a request body **is** the contract: every fact a body
    // could carry — the document, the hash, the placement, the actor, the
    // instant, both target states — is server-derived.
    expect(operation.requestBody).toBeUndefined();
    const parameters = operation.parameters ?? [];
    // `X-Request-ID` is the platform correlation header every operation
    // carries; the operation's own parameters are the two path ids.
    expect(
      parameters
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name)
        .sort(),
    ).toEqual(['requestId', 'versionId']);
    expect(parameters.filter((parameter) => parameter.in === 'query')).toEqual([]);
  });

  it('publishes the refusal statuses the operation can actually give', () => {
    const statuses = Object.keys(sendOperation().responses ?? {}).sort();
    // `500` is the platform filter's, published on every operation.
    expect(statuses).toEqual(['200', '400', '401', '403', '404', '409', '422', '500']);
  });

  it('publishes a bounded send response carrying the hash and no design content', () => {
    const schema = document.components.schemas['DesignVersionSentResponse'];
    expect(schema).toBeDefined();
    const properties = Object.keys(schema?.properties ?? {}).sort();
    expect(properties).toEqual(
      [
        'branch',
        'designCaseId',
        'documentHash',
        'documentSchemaVersion',
        'replayed',
        'requestId',
        'requestStatus',
        'requestTransitioned',
        'sentAt',
        'supersededVersionIds',
        'version',
        'versionId',
        'versionStatus',
      ].sort(),
    );
    for (const forbidden of FORBIDDEN_RESPONSE_FIELDS) {
      expect(properties).not.toContain(forbidden);
    }
  });

  it('publishes the two committed states as single-member enums, never as inputs', () => {
    const schema = document.components.schemas['DesignVersionSentResponse'];
    expect(schema?.properties?.['versionStatus']?.enum).toEqual(['SENT_FOR_REVIEW']);
    expect(schema?.properties?.['requestStatus']?.enum).toEqual(['DESIGN_REVIEW']);
  });

  it('does not duplicate the DesignDocument schema', () => {
    const documentSchemas = Object.keys(document.components.schemas).filter((name) =>
      /^DesignDocument/.test(name),
    );
    expect(documentSchemas.length).toBeLessThanOrEqual(1);
  });
});
