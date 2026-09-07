/**
 * The locked public catalog-media delivery policy (`APP2-T01`, IMP-D036).
 *
 * This module is the single place that decides *what a public caller may be
 * served*. Everything here is either a re-export of an already-approved
 * publication constant or a mapping grounded in one — nothing is re-declared as
 * a fresh literal, because a second copy of "PUBLISHED" or "ACCEPTED" is how a
 * delivery path silently drifts away from the publication path that authorised
 * it.
 *
 * The visibility predicate deliberately mirrors `product-publication.policy.ts`:
 * publication decides a product *may* be public, and this route re-proves the
 * same facts on every request. Trusting the earlier decision is exactly what
 * would let an unpublished product keep being served to anyone holding a URL
 * (`ADR-APP2-001` §4.7).
 */
import { type AssetDerivativeKind, type ProductMediaRole } from '@embroidery/database';

import {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
} from './product-publication.policy';

export {
  APP2_CATEGORY_STATUS,
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
};

/**
 * The two rendition words a public caller may put in the path.
 *
 * Declared here rather than imported from `@embroidery/contracts`, which owns
 * the shared route *builder*. That package still resolves to TypeScript source
 * with no build output, so under IMP-D018 the compiled API cannot `require` it
 * — `node dist/main.js` would fail at load, in the container rather than in any
 * test. `contracts-package-boundary.spec.ts` enforces that, and the API keeps
 * importing contracts with `import type` only.
 *
 * The two declarations are therefore held together by a test, not by an import:
 * `public-product-media.contract.spec.ts` asserts this list and the composed
 * route match `buildPublicProductMediaPath` exactly.
 */
export const PUBLIC_PRODUCT_MEDIA_RENDITIONS = ['thumbnail', 'catalog-preview'] as const;

export type PublicProductMediaRendition = (typeof PUBLIC_PRODUCT_MEDIA_RENDITIONS)[number];

/**
 * The wire rendition → persisted derivative kind mapping.
 *
 * Total over the rendition union and closed in both directions: a client word
 * can only ever select one of the two catalog display derivatives, and no
 * client text reaches a derivative-kind comparison unmapped. `NORMALIZED`,
 * `MOCKUP` and `PREVIEW_WATERMARKED` are unreachable from here by construction
 * — the customer/design preview in particular is watermarked by definition
 * (INV-22 / BR-012) and is not catalog media.
 */
export const DERIVATIVE_KIND_BY_RENDITION: Readonly<
  Record<PublicProductMediaRendition, AssetDerivativeKind>
> = Object.freeze({
  thumbnail: 'THUMBNAIL',
  'catalog-preview': 'CATALOG_PREVIEW',
});

/**
 * The Product-media role a rendition additionally requires, or `undefined` when
 * any published association qualifies.
 *
 * **Both are `undefined` since `APP12-M01-B1`.** The `thumbnail` rendition used
 * to be restricted to the stored `THUMBNAIL` association, on the reasoning that
 * it existed only to serve the Q-01 product card and should therefore be "a
 * single well-defined thing rather than whichever association the caller names".
 * Two things retired that reasoning:
 *
 * 1. **The card no longer selects by this role.** `PUBLIC_EFFECTIVE_PRIMARY_ORDER`
 *    picks the card's image by an ordering, precisely so a Product whose stored
 *    primary became undeliverable still shows a picture. The delivery-side role
 *    predicate therefore guards nothing the read side still relies on.
 * 2. **The gallery legitimately needs the small rendition.** `M01-B1` publishes a
 *    `thumbnailUrl` for every detail media item so a 64 px strip control stops
 *    downloading a 1 250 px preview. Every one of those is a `GALLERY`
 *    association, and with the restriction in place all of them answered 404 —
 *    the contract advertising addresses that do not resolve, which is the single
 *    media defect a JSON payload can create on its own.
 *
 * Nothing about visibility changes. The route still requires the Product to be
 * `PUBLISHED` under a published category, the association to belong to *that*
 * Product, the asset to be in the catalog lane and `ACCEPTED` and untombstoned,
 * and the derivative to be `READY`, unwatermarked and stored. `role` is an
 * editorial designation, never an authorization boundary: an image already
 * served at 1 250 px is not made more private by being refused at 480 px.
 */
export const REQUIRED_MEDIA_ROLE_BY_RENDITION: Readonly<
  Record<PublicProductMediaRendition, ProductMediaRole | undefined>
> = Object.freeze({
  thumbnail: undefined,
  'catalog-preview': undefined,
});

/**
 * The media type every catalog derivative carries.
 *
 * Not a guess and not the parent Asset's `mime_type` — that column describes the
 * uploaded *original* (PNG/JPEG/WebP), which is not what this route serves.
 * `APP2-W01` encodes both catalog derivatives through one frozen WebP policy,
 * so the kind determines the type. It is stated here as a delivery-side
 * constant because `asset_derivatives` carries no media-type column and the API
 * may not import the worker.
 *
 * The consistency test in `public-product-media.policy.spec.ts` pins this to the
 * worker's declared output so the two cannot drift silently.
 */
export const PUBLIC_MEDIA_CONTENT_TYPE = 'image/webp' as const;

/**
 * `no-store`, until a cache-invalidation consumer exists.
 *
 * Unpublish (`TR-LC04-05`) must revoke access on the *next* request. Any shared
 * or browser cache that could answer after that transition would keep serving a
 * withdrawn product, and APP2 has no dispatcher for the `product.unpublished`
 * outbox events that would drive a purge — the backlog is undispatched by
 * design at this checkpoint. Immutable public caching and CDN revalidation are
 * a later deployment decision (`ADR-APP2-001` §4.7 portability seam), not a
 * capability this route may claim.
 */
export const PUBLIC_MEDIA_CACHE_CONTROL = 'no-store' as const;

/**
 * `inline` with no filename.
 *
 * A filename would have to come from somewhere: the original upload name is
 * user-supplied PII-adjacent text that `APP2-B01` deliberately never persists,
 * and a fabricated one would be a lie about the object. Omitting the parameter
 * entirely is the honest option.
 */
export const PUBLIC_MEDIA_CONTENT_DISPOSITION = 'inline' as const;

/** Sent alongside every binary so a browser cannot re-interpret the payload. */
export const PUBLIC_MEDIA_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/** The bucket catalog derivatives live in. Originals are never served publicly. */
export const PUBLIC_MEDIA_BUCKET = 'DERIVATIVES' as const;

export function resolveDerivativeKind(rendition: PublicProductMediaRendition): AssetDerivativeKind {
  return DERIVATIVE_KIND_BY_RENDITION[rendition];
}

export function resolveRequiredMediaRole(
  rendition: PublicProductMediaRendition,
): ProductMediaRole | undefined {
  return REQUIRED_MEDIA_ROLE_BY_RENDITION[rendition];
}
