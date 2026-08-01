/**
 * The public catalog-media delivery address (`APP2-T01`, IMP-D036).
 *
 * One builder, shared by the API that serves the route and by every consumer
 * that projects a media reference (`APP2-B04` list/detail, `APP2-S01`/`S02`).
 * Having exactly one means a change to the address cannot land in the server
 * and be missed in the client — the route test in `apps/api` asserts the two
 * agree.
 *
 * The result is a **relative application path**. No host, no protocol, no
 * object-store base and no signature: APP2 delivers binaries only through the
 * publication-gated application route (`ADR-APP2-001` §4.7), so anything that
 * looked like a storage address here would either be fabricated or a leak.
 *
 * `productMediaId` is an **opaque association identity**, not a credential. It
 * grants nothing on its own — the route re-resolves the Product, its Category,
 * the attachment, the Asset lane and the derivative on every request. That is
 * also why the association may be replaced: `APP2-B02` rewrites a product's
 * media selection wholesale, so a path built before an edit stops resolving and
 * safely reports not-found rather than serving a stale image.
 */

/**
 * The two renditions a public caller may ask for, in card-then-detail order.
 *
 * Wire values are lowercase kebab-case because they are URL segments; they are
 * deliberately *not* the database derivative-kind literals, so the persistence
 * vocabulary is not part of the public contract and can be mapped rather than
 * exposed. The mapping itself lives in the API's delivery policy.
 */
export const PUBLIC_PRODUCT_MEDIA_RENDITIONS = ['thumbnail', 'catalog-preview'] as const;

export type PublicProductMediaRendition = (typeof PUBLIC_PRODUCT_MEDIA_RENDITIONS)[number];

/**
 * The route prefix, split so a consumer can assert it against the API's own
 * global prefix instead of re-typing `/api` at a call site.
 */
export const PUBLIC_PRODUCT_MEDIA_PATH_PREFIX = '/api/public/products';

/** The segment between the slug and the association id. */
export const PUBLIC_PRODUCT_MEDIA_PATH_SEGMENT = 'media';

export interface PublicProductMediaPathInput {
  /** The server-owned Product slug. */
  readonly slug: string;
  /** `product_media.id` — a UUID identifying the current association. */
  readonly productMediaId: string;
  readonly rendition: PublicProductMediaRendition;
}

/**
 * Lowercase canonical UUID. Deliberately not UUIDv7-specific: the column is a
 * plain `uuid` and this builder's job is to reject a value that could not be an
 * identifier at all, not to re-implement the database's generation policy.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Slug charset as produced by the server's own derivation (`product-slug.ts`). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PublicProductMediaPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicProductMediaPathError';
  }
}

function isRendition(value: string): value is PublicProductMediaRendition {
  return (PUBLIC_PRODUCT_MEDIA_RENDITIONS as readonly string[]).includes(value);
}

/**
 * Builds the public delivery path for one Product-media rendition.
 *
 * Throws rather than returning a best-effort string: a malformed address would
 * be rendered into a page as a broken image, and a caller that cannot produce a
 * valid identity has a bug worth surfacing where it happens. Segments are still
 * percent-encoded after validation — the patterns already exclude every
 * character that would need it, so the encoding is a second barrier rather than
 * the only one.
 */
export function buildPublicProductMediaPath(input: PublicProductMediaPathInput): string {
  const { slug, productMediaId, rendition } = input;

  if (!SLUG_PATTERN.test(slug)) {
    // The slug is a server-owned public address with no personal data, so it is
    // safe to echo; that makes the failure diagnosable at the call site.
    throw new PublicProductMediaPathError(`Invalid product slug "${slug}".`);
  }
  if (!UUID_PATTERN.test(productMediaId)) {
    throw new PublicProductMediaPathError('Invalid product media id.');
  }
  if (!isRendition(rendition)) {
    throw new PublicProductMediaPathError(`Invalid rendition "${String(rendition)}".`);
  }

  return [
    PUBLIC_PRODUCT_MEDIA_PATH_PREFIX,
    encodeURIComponent(slug),
    PUBLIC_PRODUCT_MEDIA_PATH_SEGMENT,
    encodeURIComponent(productMediaId),
    rendition,
  ].join('/');
}
