/**
 * The public catalog HTTP contract (`APP2-B04`).
 *
 * Two things are asserted from the *source* rather than from behaviour,
 * because both are absences and an absence has no runtime signal: that the
 * controller applies no guard, and that it introduces no third operation. A
 * future edit adding `@UseGuards(AuthenticatedAdminGuard)` would make the
 * endpoint non-public while every functional test kept passing, and only a
 * check like this one catches that.
 *
 * `tsc` preserves JSDoc into the emitted output, so these scans deliberately
 * match *usage* (a decorator call, an import statement) and not a bare word —
 * a mention of `AuthenticatedAdminGuard` in a comment must not fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PUBLIC_PRODUCT_MEDIA_PATH_PREFIX } from '@embroidery/contracts';

import { PublicProductController } from './public-product.controller';
import {
  publicProductListQuerySchema,
  publicProductSlugParamSchema,
} from './schemas/public-product.request';

const CONTROLLER_SOURCE = readFileSync(join(__dirname, 'public-product.controller.ts'), 'utf8');

describe('public catalog controller contract', () => {
  it('applies no guard of any kind', () => {
    expect(CONTROLLER_SOURCE).not.toMatch(/@UseGuards\s*\(/);
    expect(CONTROLLER_SOURCE).not.toMatch(/@ApiCookieAuth\s*\(/);
    expect(CONTROLLER_SOURCE).not.toMatch(/@ApiBearerAuth\s*\(/);
    // Nothing from the identity module is imported, so no guard is even in
    // scope to be applied.
    expect(CONTROLLER_SOURCE).not.toMatch(/from\s*['"].*identity.*['"]/);
  });

  it('declares exactly two operations', () => {
    const methods = CONTROLLER_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
    expect(methods).toHaveLength(2);
    const operationIds = [...CONTROLLER_SOURCE.matchAll(/operationId: '([^']+)'/g)].map(
      (m) => m[1],
    );
    expect(operationIds).toEqual(['publicProduct_list', 'publicProduct_detail']);
  });

  it('is mounted where the shared media contract expects the catalog to live', () => {
    // The media helper's prefix and this controller's base path have to agree,
    // or a projected media address would point outside the API's own namespace.
    expect(`/api/${'public/products'}`).toBe(PUBLIC_PRODUCT_MEDIA_PATH_PREFIX);
    expect(CONTROLLER_SOURCE).toMatch(/@Controller\('public\/products'\)/);
  });

  it('sends no-store on both operations', () => {
    const headers = CONTROLLER_SOURCE.match(
      /@Header\('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL\)/g,
    );
    expect(headers).toHaveLength(2);
  });

  it('accepts no parameter that could select lifecycle visibility', () => {
    const shape = Object.keys(publicProductListQuerySchema.shape);
    expect(shape.sort()).toEqual(['categorySlug', 'cursor', 'limit']);
    for (const forbidden of [
      'status',
      'includeDraft',
      'includeArchived',
      'q',
      'query',
      'search',
      'sort',
      'minPrice',
      'maxPrice',
      'sku',
      'variant',
      'inStock',
    ]) {
      expect(shape).not.toContain(forbidden);
    }
  });

  it('rejects an unknown query parameter rather than ignoring it', () => {
    expect(publicProductListQuerySchema.safeParse({ includeDraft: 'true' }).success).toBe(false);
    expect(publicProductListQuerySchema.safeParse({ status: 'DRAFT' }).success).toBe(false);
    expect(publicProductListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('bounds the page size at the shared maximum', () => {
    expect(publicProductListQuerySchema.safeParse({ limit: 100 }).success).toBe(true);
    expect(publicProductListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(publicProductListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(publicProductListQuerySchema.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it('accepts any well-formed category slug, and rejects malformed ones', () => {
    // `APP12-C01`: the taxonomy is dynamic, so the boundary validates a shape.
    // A slug naming no public category is *not* a 400 any more — it is a
    // filtered, empty page, proved over HTTP in the integration suite. Refusing
    // it here would need a closed contract enum, which is the ceiling C01
    // removed, and would also make the endpoint an oracle for which categories
    // the store has drafted.
    for (const categorySlug of ['khan', 'ao-thun', 'khong-ton-tai', 'danh-muc-2026']) {
      expect({
        categorySlug,
        ok: publicProductListQuerySchema.safeParse({ categorySlug }).success,
      }).toEqual({ categorySlug, ok: true });
    }
    for (const categorySlug of ['AO-THUN', 'áo-thun', 'ao_thun', 'ao thun', '-ao', 'ao--thun']) {
      expect({
        categorySlug,
        ok: publicProductListQuerySchema.safeParse({ categorySlug }).success,
      }).toEqual({ categorySlug, ok: false });
    }
  });

  it('validates the slug shape strictly', () => {
    for (const slug of ['khan-theu-hoa-sen', 'abc', 'a1-b2']) {
      expect(publicProductSlugParamSchema.safeParse({ slug }).success).toBe(true);
    }
    for (const slug of [
      '',
      'Khan',
      'a--b',
      '-abc',
      'abc-',
      'a b',
      '../etc/passwd',
      'a'.repeat(200),
    ]) {
      expect(publicProductSlugParamSchema.safeParse({ slug }).success).toBe(false);
    }
  });

  it('exposes the controller class the module registers', () => {
    expect(typeof PublicProductController).toBe('function');
  });
});
