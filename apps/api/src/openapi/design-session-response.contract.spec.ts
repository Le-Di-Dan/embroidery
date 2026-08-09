/**
 * The shared Design Session response contract (`APP3-P04`).
 *
 * These build the real document in process, exactly as
 * `build-openapi-document.spec.ts` does, so the contract is proved **before**
 * the single generation slot is spent rather than after — a defect found here
 * costs nothing, one found in the artifact costs the slot.
 *
 * What is asserted is the property the foundation exists for: all three public
 * Session operations answer with a concrete schema, they answer with the *same*
 * one, and its document field resolves to the generated `APP3-P01` component
 * rather than to an open map. Everything else in the response surface — the
 * secret, the digest, the storage identity — is asserted absent.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../bootstrap/api-application';
import { buildOpenApiDocument } from './build-openapi-document';
import { readCommittedArtifact, resolveArtifactPath } from './openapi-artifact';
import { ensureGenerationEnvironment } from './generation-environment';
import {
  DESIGN_DOCUMENT_SCHEMA_NAME,
  PUBLISHED_SCHEMA_MARKER,
} from './design-document-schema.augmentation';
import { ENVELOPE_SCHEMA_NAMES } from './envelope-schema.augmentation';

const SNAPSHOT_SCHEMA = 'DesignSessionSnapshotResponse';

const OPERATIONS = [
  { path: '/api/public/design-sessions', method: 'post', status: '201' },
  { path: '/api/public/design-sessions/{sessionId}/resume', method: 'post', status: '200' },
  { path: '/api/public/design-sessions/{sessionId}/document', method: 'put', status: '200' },
] as const;

describe('the shared Design Session response contract', () => {
  let app: INestApplication;
  let document: Record<string, never>;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    previousUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    app = await createApiApplication({ logger: false });
    document = buildOpenApiDocument(app) as unknown as Record<string, never>;
  });

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previousUrl;
  });

  const doc = () => document as unknown as OpenApiShape;

  interface OpenApiShape {
    readonly paths: Record<string, Record<string, OperationShape>>;
    readonly components: { readonly schemas: Record<string, SchemaShape> };
  }
  interface OperationShape {
    readonly operationId?: string;
    // OpenAPI 3.0 keeps a response schema under its media type, never directly
    // on the response object.
    readonly responses?: Record<
      string,
      { readonly content?: Record<string, { readonly schema?: SchemaShape }> }
    >;
  }
  interface SchemaShape {
    readonly $ref?: string;
    readonly allOf?: readonly SchemaShape[];
    readonly type?: string;
    readonly required?: readonly string[];
    readonly properties?: Record<string, SchemaShape>;
    readonly additionalProperties?: unknown;
  }

  /** The success response schema an operation publishes, if any. */
  const successSchema = (entry: (typeof OPERATIONS)[number]): SchemaShape | undefined =>
    doc().paths[entry.path]?.[entry.method]?.responses?.[entry.status]?.content?.[
      'application/json'
    ]?.schema;

  /** The data component a success envelope wraps. */
  const wrappedComponent = (schema: SchemaShape | undefined): string | undefined => {
    const members = schema?.allOf ?? [];
    const envelope = members.find((member) => member.$ref?.endsWith(ENVELOPE_SCHEMA_NAMES.success));
    const data = members.find((member) => member.properties?.['data'] !== undefined);
    if (envelope === undefined || data === undefined) return undefined;
    return data.properties?.['data']?.$ref?.split('/').pop();
  };

  describe('every operation answers concretely', () => {
    it.each(OPERATIONS)('$method $path publishes a success schema', (entry) => {
      expect(successSchema(entry)).toBeDefined();
    });

    it.each(OPERATIONS)('$method $path wraps the shared snapshot component', (entry) => {
      // §11.4 — the same semantic schema, not three lookalikes.
      expect(wrappedComponent(successSchema(entry))).toBe(SNAPSHOT_SCHEMA);
    });

    it('publishes the snapshot component itself', () => {
      expect(doc().components.schemas[SNAPSHOT_SCHEMA]).toBeDefined();
    });
  });

  describe('the snapshot', () => {
    const snapshot = () => doc().components.schemas[SNAPSHOT_SCHEMA]!;

    it('requires every field the runtime always returns', () => {
      const required = [...(snapshot().required ?? [])].sort();
      expect(required).toEqual([
        'document',
        'documentSchemaVersion',
        'expiresAt',
        'revision',
        'sessionId',
        'status',
      ]);
    });

    it('leaves scope and lineage optional, because runtime omits them', () => {
      // Bootstrap returns scope, a clone returns lineage, autosave returns
      // neither. Requiring them would describe a response the API never sends.
      const properties = snapshot().properties ?? {};
      expect(properties['scope']).toBeDefined();
      expect(properties['lineage']).toBeDefined();
      expect(snapshot().required ?? []).not.toContain('scope');
      expect(snapshot().required ?? []).not.toContain('lineage');
    });

    it('resolves the document to the generated P01 component', () => {
      // §11.5 and the whole reason the foundation exists: not an open map.
      const field = snapshot().properties?.['document'];
      const reference = field?.$ref ?? field?.allOf?.[0]?.$ref;
      expect(reference).toBe(`#/components/schemas/${DESIGN_DOCUMENT_SCHEMA_NAME}`);
      expect(field?.type).toBeUndefined();
      expect(field?.additionalProperties).toBeUndefined();
    });

    it('publishes the P01 component graph it references', () => {
      expect(doc().components.schemas[DESIGN_DOCUMENT_SCHEMA_NAME]).toBeDefined();
    });
  });

  describe('what the response never carries', () => {
    it('leaks no internal publication marker', () => {
      expect(JSON.stringify(doc())).not.toContain(PUBLISHED_SCHEMA_MARKER);
    });

    it('leaks no credential or storage identity', () => {
      const published = JSON.stringify(doc());
      for (const forbidden of [
        'sessionSecretHash',
        'secretPepper',
        'rawSecret',
        'storageKey',
        'objectKey',
        'scopeKey',
        'networkKey',
      ]) {
        expect(published).not.toContain(forbidden);
      }
    });
  });

  describe('the surface is unchanged', () => {
    it('matches the committed artifact exactly, path for path', () => {
      // Compared against the committed artifact rather than a literal count.
      // A number here says nothing about this contract and goes stale the day
      // any checkpoint publishes an operation — it read `23`/`27` and broke on
      // `APP3-B03B`'s scope assignment, which has nothing to do with Design
      // Session responses. Comparing the path *set* is both stronger and stable:
      // it catches a route this process serves but the artifact does not, which
      // is the drift actually worth failing on.
      const committed = JSON.parse(
        readCommittedArtifact(resolveArtifactPath(__dirname)) ?? '{}',
      ) as { paths: Record<string, Record<string, unknown>> };

      expect(Object.keys(doc().paths).sort()).toEqual(Object.keys(committed.paths).sort());
    });
  });
});
