/**
 * The public catalog-media delivery policy (`APP2-T01` §16).
 *
 * These assertions are about *what may be served*, so they are written as
 * closed statements ("exactly these two kinds are reachable") rather than
 * spot-checks. A rendition that silently gained access to another derivative
 * kind is the failure this file exists to make impossible.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The closed derivative-kind set is not one of the root package's narrow value
// re-exports, so it is read through the schema namespace. That is a rule for
// domain *modules* (`BACKEND_CONVENTIONS.md` §3); a test asserting a
// database-wide property is exactly where reaching for it is correct.
import { schema } from '@embroidery/database';

import { findRepositoryRoot } from '../../../openapi/openapi-artifact';
import {
  DERIVATIVE_KIND_BY_RENDITION,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_CONTENT_DISPOSITION,
  PUBLIC_MEDIA_CONTENT_TYPE,
  PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS,
  PUBLIC_PRODUCT_MEDIA_RENDITIONS,
  REQUIRED_MEDIA_ROLE_BY_RENDITION,
  resolveDerivativeKind,
  resolveRequiredMediaRole,
} from './public-product-media.policy';

describe('public catalog-media rendition mapping', () => {
  it('offers exactly two renditions', () => {
    expect([...PUBLIC_PRODUCT_MEDIA_RENDITIONS]).toStrictEqual(['thumbnail', 'catalog-preview']);
  });

  it('maps each rendition to its one catalog derivative kind', () => {
    expect(resolveDerivativeKind('thumbnail')).toBe('THUMBNAIL');
    expect(resolveDerivativeKind('catalog-preview')).toBe('CATALOG_PREVIEW');
  });

  it('never reaches a private, artwork or watermarked derivative kind', () => {
    const reachable = Object.values(DERIVATIVE_KIND_BY_RENDITION);

    expect(new Set(reachable)).toStrictEqual(new Set(['THUMBNAIL', 'CATALOG_PREVIEW']));
    // Stated against the full closed set so a new kind added to the database
    // cannot become publicly reachable without this failing.
    expect(schema.ASSET_DERIVATIVE_KINDS.length).toBeGreaterThan(2);
    for (const kind of schema.ASSET_DERIVATIVE_KINDS) {
      if (kind !== 'THUMBNAIL' && kind !== 'CATALOG_PREVIEW') {
        expect(reachable).not.toContain(kind);
      }
    }
    expect(reachable).not.toContain('PREVIEW_WATERMARKED');
  });

  it('lets any ordered association produce either rendition (APP12-M01-B1)', () => {
    // The `thumbnail` rendition used to be restricted to the stored `THUMBNAIL`
    // association, back when it existed only to serve the product card. It now
    // also backs the Product Detail thumbnail strip, where every control
    // addresses a `GALLERY` association — with the restriction in place those
    // published addresses all answered 404. The card no longer depends on the
    // predicate either: `PUBLIC_EFFECTIVE_PRIMARY_ORDER` chooses its image by
    // ordering, so a Product whose stored primary went undeliverable still has
    // one. Role is editorial, never an authorization boundary.
    expect(resolveRequiredMediaRole('thumbnail')).toBeUndefined();
    expect(resolveRequiredMediaRole('catalog-preview')).toBeUndefined();
  });

  it('covers the whole rendition union in both maps', () => {
    for (const rendition of PUBLIC_PRODUCT_MEDIA_RENDITIONS) {
      expect(DERIVATIVE_KIND_BY_RENDITION[rendition]).toBeDefined();
      expect(rendition in REQUIRED_MEDIA_ROLE_BY_RENDITION).toBe(true);
    }
  });
});

describe('public catalog-media response policy', () => {
  it('serves the derivatives bucket, never originals', () => {
    expect(PUBLIC_MEDIA_BUCKET).toBe('DERIVATIVES');
  });

  it('never caches, so an unpublish cannot be outlived', () => {
    expect(PUBLIC_MEDIA_CACHE_CONTROL).toBe('no-store');
  });

  it('renders inline and declares no filename', () => {
    expect(PUBLIC_MEDIA_CONTENT_DISPOSITION).toBe('inline');
    expect(PUBLIC_MEDIA_CONTENT_DISPOSITION).not.toContain('filename');
  });

  it('forbids content-type sniffing', () => {
    expect(PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS).toBe('nosniff');
  });
});

/**
 * `asset_derivatives` has no media-type column, so the delivery content type is
 * an application invariant rather than a stored fact: `APP2-W01` encodes both
 * catalog derivatives through one frozen WebP policy. The API may not import
 * the worker, so the two constants are held together by reading the worker's
 * declaration — a mismatch would otherwise ship a wrong `Content-Type` for
 * every catalog image with nothing to catch it.
 */
describe('delivery content type agrees with the worker that writes the bytes', () => {
  it('matches the derivative output policy', () => {
    const policySource = readFileSync(
      join(
        findRepositoryRoot(__dirname),
        'apps/worker/src/jobs/asset-inspection/domain/asset-processing-policy.ts',
      ),
      'utf8',
    );

    const declared = [...policySource.matchAll(/mediaType:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared)).toStrictEqual(new Set([PUBLIC_MEDIA_CONTENT_TYPE]));
  });
});
