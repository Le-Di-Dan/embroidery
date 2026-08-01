/**
 * The public media address, composed API-side (`APP2-B04` §5).
 *
 * `@embroidery/contracts` owns the canonical builder for every frontend
 * consumer, but the compiled API cannot `require` that package: it resolves to
 * raw TypeScript and `node dist/main.js` would die on the import (IMP-D018,
 * proven by `contracts-package-boundary.spec.ts`). So the API composes the same
 * path locally, and `public-product-catalog-path.spec.ts` asserts byte
 * equivalence against `buildPublicProductMediaPath` — a spec may import
 * contracts because `tsconfig.build.json` excludes specs from `dist`.
 *
 * The result is a **relative application path** and nothing else: no host, no
 * bucket, no object key, no signature, no expiry. `APP2-T01` serves it through
 * the publication-gated route, which re-resolves the product, its category, the
 * attachment, the asset lane and the derivative on every request — so this
 * string grants nothing on its own, and a product unpublished a moment later
 * stops resolving without anything here having to be recalled.
 */

/** Must equal `PUBLIC_PRODUCT_MEDIA_PATH_PREFIX` in `@embroidery/contracts`. */
const PUBLIC_MEDIA_PATH_PREFIX = '/api/public/products';
/** Must equal `PUBLIC_PRODUCT_MEDIA_PATH_SEGMENT` in `@embroidery/contracts`. */
const PUBLIC_MEDIA_PATH_SEGMENT = 'media';

export interface PublicMediaPathInput {
  readonly slug: string;
  readonly productMediaId: string;
  readonly rendition: string;
}

/**
 * Builds one public media path.
 *
 * Both variable segments are percent-encoded. Neither is attacker-controlled —
 * the slug and the association id are read from rows this request already
 * resolved — but encoding is what keeps that true if a future writer widens
 * what a slug may contain, and it costs nothing here.
 */
export function publicProductMediaPath({
  slug,
  productMediaId,
  rendition,
}: PublicMediaPathInput): string {
  return [
    PUBLIC_MEDIA_PATH_PREFIX,
    encodeURIComponent(slug),
    PUBLIC_MEDIA_PATH_SEGMENT,
    encodeURIComponent(productMediaId),
    rendition,
  ].join('/');
}
