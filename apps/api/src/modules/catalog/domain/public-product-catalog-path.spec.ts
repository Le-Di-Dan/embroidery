/**
 * Locks the API's local media-path composer to the shared contract helper
 * (`APP2-B04` §5).
 *
 * Two copies of an address exist on purpose: `@embroidery/contracts` owns the
 * one every frontend consumer calls, and the API composes its own because the
 * compiled bundle cannot `require` that package (IMP-D018). Two copies are only
 * safe while something proves they agree — that is this file. A spec may import
 * contracts because `tsconfig.build.json` excludes specs from `dist`, so this
 * test can reach the authority the runtime deliberately cannot.
 */
import {
  PUBLIC_PRODUCT_MEDIA_RENDITIONS,
  buildPublicProductMediaPath,
} from '@embroidery/contracts';

import { publicProductMediaPath } from './public-product-catalog-path';
import { PUBLIC_DETAIL_RENDITION, PUBLIC_LIST_RENDITION } from './public-product-catalog.policy';

const SLUG = 'khan-theu-hoa-sen';
const MEDIA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

describe('publicProductMediaPath', () => {
  it('produces exactly what the shared contract helper produces', () => {
    for (const rendition of PUBLIC_PRODUCT_MEDIA_RENDITIONS) {
      expect(publicProductMediaPath({ slug: SLUG, productMediaId: MEDIA_ID, rendition })).toBe(
        buildPublicProductMediaPath({ slug: SLUG, productMediaId: MEDIA_ID, rendition }),
      );
    }
  });

  it('uses only renditions the shared contract declares', () => {
    // A rendition the delivery route does not serve would be a 400 the
    // catalogue advertised itself.
    expect(PUBLIC_PRODUCT_MEDIA_RENDITIONS).toContain(PUBLIC_LIST_RENDITION);
    expect(PUBLIC_PRODUCT_MEDIA_RENDITIONS).toContain(PUBLIC_DETAIL_RENDITION);
    expect(PUBLIC_LIST_RENDITION).not.toBe(PUBLIC_DETAIL_RENDITION);
  });

  it('is a relative application path carrying no storage detail', () => {
    const path = publicProductMediaPath({
      slug: SLUG,
      productMediaId: MEDIA_ID,
      rendition: PUBLIC_LIST_RENDITION,
    });
    expect(path).toBe(`/api/public/products/${SLUG}/media/${MEDIA_ID}/thumbnail`);
    expect(path.startsWith('/api/')).toBe(true);
    expect(path).not.toMatch(/^https?:/);
    expect(path).not.toMatch(/minio|s3|bucket|amazonaws|X-Amz|signature|expires/i);
  });

  it('percent-encodes the variable segments', () => {
    // Neither value is attacker-controlled today; encoding is what keeps the
    // address well formed if the slug vocabulary ever widens.
    expect(
      publicProductMediaPath({
        slug: 'a b/c',
        productMediaId: 'x/y',
        rendition: PUBLIC_LIST_RENDITION,
      }),
    ).toBe('/api/public/products/a%20b%2Fc/media/x%2Fy/thumbnail');
  });
});
