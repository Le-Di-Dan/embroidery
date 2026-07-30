/**
 * Builds the OpenAPI document from the real `AppModule` (APP0-B01).
 *
 * The application is created but never initialised or listened on, so the
 * database lifecycle hook does not run and no PostgreSQL instance is required.
 * A non-connecting placeholder `DATABASE_URL` satisfies the persistence
 * provider factories, which is exactly how the generator CLI behaves.
 */
import { type INestApplication } from '@nestjs/common';

import { createApiApplication } from '../bootstrap/api-application';
import { ObjectStorageBootstrapService } from '../modules/asset/infrastructure/storage/object-storage-bootstrap.service';
import { buildOpenApiDocument, describeDocument } from './build-openapi-document';
import { ensureGenerationEnvironment } from './generation-environment';
import { OPENAPI_DOCUMENT_TITLE, OPENAPI_DOCUMENT_VERSION } from './openapi-document.config';
import { compareArtifact, readCommittedArtifact, resolveArtifactPath } from './openapi-artifact';
import { serializeOpenApiDocument } from './serialize-openapi-document';

describe('buildOpenApiDocument', () => {
  let app: INestApplication;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    previousUrl = process.env['DATABASE_URL'];
    ensureGenerationEnvironment();
    app = await createApiApplication({ logger: false });
  });

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousUrl;
    }
  });

  it('carries the canonical, environment-independent metadata', () => {
    const document = buildOpenApiDocument(app);
    expect(document.info.title).toBe(OPENAPI_DOCUMENT_TITLE);
    expect(document.info.version).toBe(OPENAPI_DOCUMENT_VERSION);
  });

  it('documents the health routes under the runtime global prefix', () => {
    const paths = Object.keys(buildOpenApiDocument(app).paths);
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/health/readiness');
    expect(paths.every((path) => path.startsWith('/api/'))).toBe(true);
  });

  it('documents the health routes plus the APP1 staff and APP2 asset/product endpoints', () => {
    const stats = describeDocument(buildOpenApiDocument(app));
    // Health (2 ops) + staff session open/close (2 ops on one path) + staff/me
    // (1 op) + APP2-B01 Admin asset upload/detail/list (3 ops on 3 paths)
    // + APP2-B02 Admin product list/create (2 ops on one path), detail/update
    // (2 ops on one path) and archive (1 op on its own path).
    expect(stats.pathCount).toBe(10);
    expect(stats.operationCount).toBe(13);
    expect(stats.schemaCount).toBeGreaterThan(0);
  });

  it('gives every operation a deterministic policy-conforming id', () => {
    const document = buildOpenApiDocument(app);
    expect(document.paths['/api/health']?.get?.operationId).toBe('health_check');
    expect(document.paths['/api/health/readiness']?.get?.operationId).toBe('health_readiness');
    expect(document.paths['/api/staff/session']?.post?.operationId).toBe('staffSession_create');
    expect(document.paths['/api/staff/session']?.delete?.operationId).toBe('staffSession_delete');
    expect(document.paths['/api/staff/me']?.get?.operationId).toBe('staffSelf_get');
    expect(document.paths['/api/admin/products']?.get?.operationId).toBe('adminProduct_list');
    expect(document.paths['/api/admin/products']?.post?.operationId).toBe('adminProduct_create');
    expect(document.paths['/api/admin/products/{productId}']?.get?.operationId).toBe(
      'adminProduct_detail',
    );
    expect(document.paths['/api/admin/products/{productId}']?.patch?.operationId).toBe(
      'adminProduct_update',
    );
    expect(document.paths['/api/admin/products/{productId}/archive']?.post?.operationId).toBe(
      'adminProduct_archive',
    );
  });

  it('requires data on the current-staff 200 response (APP1-B02-C1)', () => {
    const document = buildOpenApiDocument(app);
    const schema = (
      document.paths['/api/staff/me']?.get?.responses?.['200'] as {
        content?: { 'application/json'?: { schema?: { allOf?: Array<Record<string, unknown>> } } };
      }
    )?.content?.['application/json']?.schema;
    const allOf = schema?.allOf ?? [];
    // The base envelope plus an override that makes `data` required and typed.
    expect(allOf).toContainEqual({ $ref: '#/components/schemas/ApiSuccessResponse' });
    const override = allOf.find((member) => Array.isArray(member['required']));
    expect(override?.['required']).toContain('data');
    expect(override?.['properties']).toEqual({
      data: { $ref: '#/components/schemas/CurrentStaffResponse' },
    });

    // The payload schema exposes exactly the three safe fields.
    const currentStaff = document.components?.schemas?.['CurrentStaffResponse'] as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect([...(currentStaff.required ?? [])].sort()).toEqual(['displayName', 'email', 'id']);
    expect(Object.keys(currentStaff.properties ?? {}).sort()).toEqual([
      'displayName',
      'email',
      'id',
    ]);
    for (const forbidden of [
      'credential',
      'session',
      'sessionId',
      'token',
      'role',
      'permissions',
    ]) {
      expect(currentStaff.properties ?? {}).not.toHaveProperty(forbidden);
    }
  });

  it('keeps the current-staff 401 as the canonical error envelope', () => {
    const document = buildOpenApiDocument(app);
    const schema = (
      document.paths['/api/staff/me']?.get?.responses?.['401'] as {
        content?: { 'application/json'?: { schema?: unknown } };
      }
    )?.content?.['application/json']?.schema;
    expect(schema).toEqual({ $ref: '#/components/schemas/ApiErrorResponse' });
  });

  it('leaves login and logout as 204 no-content operations', () => {
    const document = buildOpenApiDocument(app);
    const post = document.paths['/api/staff/session']?.post?.responses ?? {};
    const del = document.paths['/api/staff/session']?.delete?.responses ?? {};
    expect(post).toHaveProperty('204');
    expect(del).toHaveProperty('204');
    expect(post).not.toHaveProperty('200');
    expect(del).not.toHaveProperty('200');
  });

  it('declares no environment-specific server', () => {
    expect(buildOpenApiDocument(app).servers ?? []).toHaveLength(0);
  });

  it('is byte-identical when generated twice from the same application', () => {
    const first = serializeOpenApiDocument(buildOpenApiDocument(app));
    const second = serializeOpenApiDocument(buildOpenApiDocument(app));
    expect(first).toBe(second);
  });

  it('contains no host, credential, or machine-specific value', () => {
    const serialized = serializeOpenApiDocument(buildOpenApiDocument(app));
    expect(serialized).not.toMatch(/localhost/i);
    expect(serialized).not.toMatch(/postgres:\/\//);
    expect(serialized).not.toMatch(/openapi\.invalid/);
    expect(serialized).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
  });

  it('matches the committed artifact, proving the drift check is satisfied', () => {
    const artifactPath = resolveArtifactPath(__dirname);
    const candidate = serializeOpenApiDocument(buildOpenApiDocument(app));
    expect(compareArtifact(readCommittedArtifact(artifactPath), candidate)).toEqual({
      matches: true,
    });
  });

  it('reaches no object store while generating (APP2-I03)', () => {
    // The generator builds the real `AppModule` against an `.invalid` endpoint
    // that can never resolve. If bucket bootstrap had been attached to module
    // construction or a lifecycle hook, this graph would try to reach it and
    // `isReady()` would be the only place that showed it. Bootstrap belongs to
    // the production startup sequence in `main.ts`, and this is the assertion
    // that keeps it there.
    expect(app.get(ObjectStorageBootstrapService).isReady()).toBe(false);
  });
});
