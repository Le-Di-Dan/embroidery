/**
 * The public Side-background address, composed API-side (`APP3-B02` §8).
 *
 * `@embroidery/contracts` owns the canonical builder for every frontend
 * consumer, but the compiled API cannot `require` that package: it resolves to
 * raw TypeScript with no build output, and `node dist/main.js` would die on the
 * import (IMP-D018, proven by `contracts-package-boundary.spec.ts`). So the API
 * composes the same path locally, and `public-side-background-path.spec.ts`
 * asserts byte equivalence against `buildPublicSideBackgroundPath` — a spec may
 * import contracts because `tsconfig.build.json` excludes specs from `dist`.
 *
 * The result is a **relative application path** and nothing else: no host, no
 * bucket, no object key, no signature, no expiry. `APP3-B02` serves it through
 * the publication-gated route, which re-resolves the Product, its Category, the
 * Side, the background association and the derivative on every request — so this
 * string grants nothing on its own, and a Product unpublished a moment later
 * stops resolving without anything here having to be recalled.
 */

/** Must equal `PUBLIC_SIDE_BACKGROUND_PATH_PREFIX` in `@embroidery/contracts`. */
const PUBLIC_SIDE_BACKGROUND_PATH_PREFIX = '/api/public/products';
/** Must equal `PUBLIC_SIDE_BACKGROUND_SIDES_SEGMENT` in `@embroidery/contracts`. */
const PUBLIC_SIDE_BACKGROUND_SIDES_SEGMENT = 'sides';
/** Must equal `PUBLIC_SIDE_BACKGROUND_SEGMENT` in `@embroidery/contracts`. */
const PUBLIC_SIDE_BACKGROUND_SEGMENT = 'background';

export interface PublicSideBackgroundPathParts {
  readonly slug: string;
  readonly sideCode: string;
}

/**
 * Builds one public Side-background path.
 *
 * Both variable segments are percent-encoded. Neither is attacker-controlled —
 * the slug and the Side code are read from rows this request already resolved —
 * but encoding is what keeps that true if a future writer widens what a slug or
 * a placement code may contain, and it costs nothing here.
 */
export function publicSideBackgroundPath({
  slug,
  sideCode,
}: PublicSideBackgroundPathParts): string {
  return [
    PUBLIC_SIDE_BACKGROUND_PATH_PREFIX,
    encodeURIComponent(slug),
    PUBLIC_SIDE_BACKGROUND_SIDES_SEGMENT,
    encodeURIComponent(sideCode),
    PUBLIC_SIDE_BACKGROUND_SEGMENT,
  ].join('/');
}
