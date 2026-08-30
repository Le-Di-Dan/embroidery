/**
 * The one HTTP fact the capacity unit tests cannot prove (`APP11-B04-C1`):
 * that a combined-cap overflow leaves the wire as **503 with no items**.
 *
 * The application under test is a purpose-built module, exactly as
 * `api-response.integration.spec.ts` does it: the real controller, the real
 * query and the real envelope/exception filter, with the two public read ports
 * faked so the assertion needs neither PostgreSQL nor 50 000 seeded rows. The
 * row counts are the smallest ones that carry the correction — a mixed
 * inventory whose halves are each individually legal.
 *
 * The redaction asserted here is deliberate and unchanged from `APP11-B04`: a
 * 5xx never publishes its business code, so an anonymous crawler learns that
 * the inventory is unavailable and never how large it grew.
 */
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../bootstrap/api-application';
import {
  API_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
} from '../../../platform/http-response/api-error-code';
import { HttpResponseModule } from '../../../platform/http-response/http-response.module';
import { RequestContextModule } from '../../../platform/request-context/request-context.module';
import {
  PUBLIC_PRODUCT_REPOSITORY,
  type PublicIndexableProductRow,
} from '../../catalog/domain/repositories/public-product.repository';
import { PUBLIC_GALLERY_ENTRY_REPOSITORY } from '../../gallery/domain/repositories/public-gallery-entry.repository';
import { PublicSitemapQuery } from '../application/public-sitemap.query';
import { PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES } from '../domain/public-sitemap.policy';
import { PublicSitemapEntryController } from './public-sitemap-entry.controller';

/** 30 000 + 20 001: neither half is illegal, the file they would form is. */
const PRODUCT_ROWS = 30_000;
const GALLERY_ROWS = PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES - PRODUCT_ROWS + 1;

const STAMP = new Date('2026-08-30T09:15:00.000Z');

function rows(prefix: string, count: number): PublicIndexableProductRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    slug: `${prefix}-${String(index).padStart(6, '0')}`,
    updatedAt: STAMP,
  }));
}

/** Only `listIndexable` is reachable from this graph; nothing else is provided. */
function indexableOnly(prefix: string, count: number) {
  const all = rows(prefix, count);
  return { listIndexable: (limit: number) => Promise.resolve(all.slice(0, limit)) };
}

@Module({
  imports: [RequestContextModule, HttpResponseModule],
  controllers: [PublicSitemapEntryController],
  providers: [
    PublicSitemapQuery,
    { provide: PUBLIC_PRODUCT_REPOSITORY, useValue: indexableOnly('san-pham', PRODUCT_ROWS) },
    {
      provide: PUBLIC_GALLERY_ENTRY_REPOSITORY,
      useValue: indexableOnly('bo-suu-tap', GALLERY_ROWS),
    },
  ],
})
class OversizedSitemapModule {}

const PATH = `/${GLOBAL_ROUTE_PREFIX}/public/sitemap-entries`;

type HttpServer = Parameters<typeof request>[0];

describe('APP11-B04-C1 combined-cap overflow over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OversizedSitemapModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 503 for a mixed inventory neither kind alone would refuse', async () => {
    const response = await request(app.getHttpServer() as HttpServer).get(PATH);

    expect(response.status).toBe(503);
    expect(PRODUCT_ROWS + GALLERY_ROWS).toBeGreaterThan(PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES);
    // Each half on its own would have been served under the old per-kind cap.
    expect(PRODUCT_ROWS).toBeLessThanOrEqual(PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES);
    expect(GALLERY_ROWS).toBeLessThanOrEqual(PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES);
  });

  it('sends no partial inventory: the body carries no items at all', async () => {
    const response = await request(app.getHttpServer() as HttpServer).get(PATH);
    const body = response.body as { success: boolean; data?: unknown };

    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('san-pham');
    expect(JSON.stringify(body)).not.toContain('bo-suu-tap');
  });

  it('redacts the cause, as any 5xx on this surface must', async () => {
    const response = await request(app.getHttpServer() as HttpServer).get(PATH);
    const body = response.body as { code: string; message: string };

    expect(body.code).toBe(API_ERROR_CODE.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe(INTERNAL_ERROR_MESSAGE);
    // Never an oracle for how much work exists, released or not.
    expect(JSON.stringify(body)).not.toContain('PUBLIC_SITEMAP_INVENTORY_TOO_LARGE');
    expect(JSON.stringify(body)).not.toContain('sitemap');
  });
});
