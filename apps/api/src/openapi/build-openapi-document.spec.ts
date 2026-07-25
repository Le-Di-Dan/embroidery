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

  it('documents the health routes plus the APP1-B01 staff session endpoints', () => {
    const stats = describeDocument(buildOpenApiDocument(app));
    // Health (2 ops) + staff session open/close (2 ops on one path).
    expect(stats.pathCount).toBe(3);
    expect(stats.operationCount).toBe(4);
    expect(stats.schemaCount).toBeGreaterThan(0);
  });

  it('gives every operation a deterministic policy-conforming id', () => {
    const document = buildOpenApiDocument(app);
    expect(document.paths['/api/health']?.get?.operationId).toBe('health_check');
    expect(document.paths['/api/health/readiness']?.get?.operationId).toBe('health_readiness');
    expect(document.paths['/api/staff/session']?.post?.operationId).toBe('staffSession_create');
    expect(document.paths['/api/staff/session']?.delete?.operationId).toBe('staffSession_delete');
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
});
