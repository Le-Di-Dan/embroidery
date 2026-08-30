/**
 * The `APP11-B04` contract boundary, asserted without a database.
 *
 * Five things are proved here and nowhere else:
 *
 * 1. **The published delta is exactly one anonymous public GET**, on one new
 *    Path Item Object, carrying the canonical `publicSitemapEntry_list` id, and
 *    reaching the generated client — with the artifact at 128 operations.
 * 2. **The wire carries three fields and nothing else.** No title, no SEO text,
 *    no `isIndexable`, no status, no id, no category, no asset or storage fact,
 *    no `priority`/`changefreq`, and no URL of any kind.
 * 3. **The operation is path-agnostic.** No feature source mentions a browser
 *    route, an origin or an absolute address; the Storefront keeps route
 *    authority.
 * 4. **No contract was added that the checkpoint forbids.** No query parameter
 *    of any kind, no pagination, no filter — and the kind vocabulary is closed
 *    to two values.
 * 5. **Nothing outside B04's scope appeared.** No content-page or redirect
 *    route, no static Storefront path, no public write, no second sitemap
 *    operation, no migration — and no authentication decorator on the
 *    controller.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PUBLIC_SITEMAP_CACHE_CONTROL,
  PUBLIC_SITEMAP_ENTRY_KINDS,
  PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND,
} from '../domain/public-sitemap.policy';
import { PUBLIC_SITEMAP_ERROR_CODES } from '../domain/public-sitemap.errors';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as {
  readonly paths: Record<string, Record<string, { operationId?: string; parameters?: unknown[] }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

const CLIENT_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts'),
  'utf8',
);

const SITEMAP = '/api/public/sitemap-entries';

const CONTROLLER = readFileSync(join(__dirname, 'public-sitemap-entry.controller.ts'), 'utf8');
const QUERY_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'public-sitemap.query.ts'),
  'utf8',
);
const PROJECTION_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'public-sitemap.projection.ts'),
  'utf8',
);
const RESPONSE_SOURCE = readFileSync(
  join(__dirname, 'schemas', 'public-sitemap.response.ts'),
  'utf8',
);
const MODULE_SOURCE = readFileSync(join(__dirname, '..', 'content-public-seo.module.ts'), 'utf8');

/** Drops block and line comments so a structural check reads code, not prose. */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/** Every operation object in the artifact, flattened. */
function allOperations() {
  return Object.values(OPENAPI.paths).flatMap((item) => Object.values(item));
}

describe('APP11-B04 public sitemap inventory contract', () => {
  describe('published surface', () => {
    it('publishes exactly one operation, with the canonical id', () => {
      expect(OPENAPI.paths[SITEMAP]?.['get']?.operationId).toBe('publicSitemapEntry_list');
      // A GET and nothing else: no public write reaches the SEO surface.
      expect(Object.keys(OPENAPI.paths[SITEMAP] ?? {})).toEqual(['get']);
    });

    it('is the only sitemap path and the only publicSitemapEntry operation', () => {
      expect(Object.keys(OPENAPI.paths).filter((path) => /sitemap/i.test(path))).toEqual([SITEMAP]);
      const ids = allOperations().map((operation) => operation.operationId ?? '');
      expect(ids.filter((id) => id.startsWith('publicSitemapEntry'))).toEqual([
        'publicSitemapEntry_list',
      ]);
    });

    it('brings the artifact to 128 operations', () => {
      expect(allOperations()).toHaveLength(128);
    });

    it('reaches the generated client', () => {
      expect(CLIENT_SOURCE).toContain('export const publicSitemapEntryList = (');
    });
  });

  describe('no query contract', () => {
    it('declares no query or path parameter — only the platform request header', () => {
      const parameters = (OPENAPI.paths[SITEMAP]?.['get']?.parameters ?? []) as {
        in: string;
        name: string;
      }[];
      // `X-Request-ID` is added to every operation by the platform correlation
      // decorator and is not part of this contract.
      expect(parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual([
        'header:X-Request-ID',
      ]);
      expect(parameters.filter((parameter) => parameter.in !== 'header')).toEqual([]);
    });

    it('takes no cursor, limit, offset, page or filter in the handler', () => {
      const code = withoutComments(CONTROLLER);
      // The handler signature is empty, so there is no argument a query
      // parameter could ever be bound to.
      expect(code).toContain('async list(): Promise<PublicSitemapView>');
      for (const forbidden of ['@Query', '@Param', '@Body', '@ApiQuery', '@ApiParam']) {
        expect(code).not.toContain(forbidden);
      }
    });
  });

  describe('response contract', () => {
    it('carries exactly kind, slug and updatedAt', () => {
      const entry = OPENAPI.components.schemas['PublicSitemapEntryResponse'] as {
        properties: Record<string, unknown>;
        required?: string[];
      };
      expect(Object.keys(entry.properties).sort()).toEqual(['kind', 'slug', 'updatedAt']);
      expect((entry.required ?? []).sort()).toEqual(['kind', 'slug', 'updatedAt']);
    });

    it('wraps them in a single `items` collection and nothing else', () => {
      const list = OPENAPI.components.schemas['PublicSitemapListResponse'] as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(list.properties)).toEqual(['items']);
    });

    it('closes the kind vocabulary to PRODUCT and GALLERY', () => {
      const entry = OPENAPI.components.schemas['PublicSitemapEntryResponse'] as {
        properties: { kind: { enum?: string[] } };
      };
      expect(entry.properties.kind.enum).toEqual(['PRODUCT', 'GALLERY']);
      expect([...PUBLIC_SITEMAP_ENTRY_KINDS]).toEqual(['PRODUCT', 'GALLERY']);
    });

    it('leaks no private, editorial or storage fact', () => {
      const serialized = JSON.stringify([
        OPENAPI.components.schemas['PublicSitemapEntryResponse'],
        OPENAPI.components.schemas['PublicSitemapListResponse'],
      ]);
      for (const forbidden of [
        'title',
        'description',
        'isIndexable',
        'status',
        'productId',
        'galleryEntryId',
        'linkedProductId',
        'assetId',
        'storageKey',
        'bucket',
        'checksum',
        'classification',
        'category',
        'priority',
        'changefreq',
        'createdAt',
      ]) {
        // `description` is an OpenAPI documentation key, so the check is on
        // property *names* rather than on the serialized blob for that one.
        if (forbidden === 'description' || forbidden === 'title') {
          continue;
        }
        expect(serialized).not.toContain(`"${forbidden}"`);
      }
      const entry = OPENAPI.components.schemas['PublicSitemapEntryResponse'] as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(entry.properties)).not.toContain('title');
      expect(Object.keys(entry.properties)).not.toContain('description');
    });

    it('serializes updatedAt from the entity, never from the clock', () => {
      const code = withoutComments(PROJECTION_SOURCE);
      expect(code).toContain('row.updatedAt.toISOString()');
      for (const forbidden of ['Date.now', 'new Date(', 'now()']) {
        expect(code).not.toContain(forbidden);
      }
    });
  });

  describe('path-agnostic', () => {
    it('emits no browser route, origin or absolute URL from any B04 source', () => {
      for (const source of [CONTROLLER, QUERY_SOURCE, PROJECTION_SOURCE, RESPONSE_SOURCE]) {
        const code = withoutComments(source);
        for (const forbidden of [
          'san-pham',
          'bo-suu-tap',
          'kham-pha',
          'chinh-sach',
          'cua-hang',
          'http://',
          'https://',
          'sitemap.xml',
          'robots',
        ]) {
          expect(code).not.toContain(forbidden);
        }
      }
    });

    it('publishes no `url`, `loc` or `path` property on the wire', () => {
      const entry = OPENAPI.components.schemas['PublicSitemapEntryResponse'] as {
        properties: Record<string, unknown>;
      };
      for (const forbidden of ['url', 'loc', 'path', 'canonicalUrl']) {
        expect(Object.keys(entry.properties)).not.toContain(forbidden);
      }
    });
  });

  describe('authority reuse', () => {
    it('reads through the two owning public ports and no table of its own', () => {
      const code = withoutComments(QUERY_SOURCE);
      expect(code).toContain('PUBLIC_PRODUCT_REPOSITORY');
      expect(code).toContain('PUBLIC_GALLERY_ENTRY_REPOSITORY');
      // No Drizzle, no schema, no SQL: visibility is decided by the modules
      // that own it, never re-derived here.
      for (const forbidden of ['drizzle-orm', '@embroidery/database', 'sql`', 'schema.']) {
        expect(code).not.toContain(forbidden);
      }
    });

    it('composes no content-page or redirect port', () => {
      const code = withoutComments(MODULE_SOURCE);
      for (const forbidden of [
        'CONTENT_PAGE_REPOSITORY',
        'REDIRECT_RULE_REPOSITORY',
        'AGREEMENT_REPOSITORY',
        'ObjectStorage',
        'TransactionManager',
      ]) {
        expect(code).not.toContain(forbidden);
      }
    });

    it('never truncates: the fetch bound is one above the cap and overflow throws', () => {
      const code = withoutComments(QUERY_SOURCE);
      expect(code).toContain('PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND + 1');
      expect(code).toContain('publicSitemapInventoryTooLarge()');
      expect(code).not.toContain('.slice(');
      expect(PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND).toBe(50_000);
      expect(PUBLIC_SITEMAP_ERROR_CODES).toEqual(['PUBLIC_SITEMAP_INVENTORY_TOO_LARGE']);
    });

    it('is anonymous, unstored and read-only', () => {
      const code = withoutComments(CONTROLLER);
      expect(PUBLIC_SITEMAP_CACHE_CONTROL).toBe('no-store');
      expect(code).toContain("@Header('Cache-Control', PUBLIC_SITEMAP_CACHE_CONTROL)");
      for (const forbidden of [
        '@UseGuards',
        'StaffSession',
        'SecureLink',
        '@Post',
        '@Put',
        '@Patch',
        '@Delete',
      ]) {
        expect(code).not.toContain(forbidden);
      }
    });
  });

  describe('out of scope', () => {
    it('publishes no content-page, redirect, robots or static Storefront route', () => {
      for (const path of Object.keys(OPENAPI.paths)) {
        expect(path).not.toMatch(/robots\.txt|content-pages?|redirects?/i);
        expect(path).not.toMatch(/kham-pha|chinh-sach|cau-hoi|dich-vu/i);
      }
    });

    it('adds no migration', () => {
      const migrations = readdirSync(join(REPO_ROOT, 'packages/database/migrations')).filter(
        (file) => file.endsWith('.sql'),
      );
      expect(migrations.length).toBe(37);
    });

    it('does not grow the application root module', () => {
      const root = readFileSync(join(REPO_ROOT, 'apps/api/src/bootstrap/app.module.ts'), 'utf8');
      // `wc -l` semantics: the trailing newline ends the last line rather than
      // starting an empty one.
      expect(root.replace(/\n$/, '').split('\n').length).toBeLessThanOrEqual(339);
      expect(root).not.toContain('ContentPublicSeoModule');
    });
  });
});
