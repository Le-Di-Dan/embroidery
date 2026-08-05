/**
 * The public Product Side background delivery address (`APP3-B02`).
 *
 * One builder, shared by the API that serves the route and by every consumer
 * that reads a placement manifest. Having exactly one means a change to the
 * address cannot land in the server and be missed in the Studio — the route test
 * in `apps/api` asserts the two agree byte for byte.
 *
 * The result is a **relative application path**. No host, no protocol, no
 * object-store base and no signature: a Side background is a private object
 * delivered only through the publication-gated application route
 * (`ADR-APP2-001` §4.7, `IMP-D044` PO-06), so anything resembling a storage
 * address here would either be fabricated or a leak.
 *
 * The address is keyed by **Product slug and Side code** — the two public,
 * stable, server-owned identities. Deliberately not an Asset id, a derivative id
 * or a Product Side UUID: those are private, and a background may be *replaced*
 * without the Side changing, so keying on the artifact would make every manifest
 * stale the moment an operator swaps an image. Keying on the placement means the
 * same address keeps resolving to whatever the Side's current approved
 * background is — and stops resolving entirely once the Product is unpublished
 * or the Side retired, because the route re-proves both on every request.
 */

/** Must equal the API's global prefix plus the public catalogue base. */
export const PUBLIC_SIDE_BACKGROUND_PATH_PREFIX = '/api/public/products';

/** The segment between the slug and the Side code. */
export const PUBLIC_SIDE_BACKGROUND_SIDES_SEGMENT = 'sides';

/** The terminal segment naming what is delivered. */
export const PUBLIC_SIDE_BACKGROUND_SEGMENT = 'background';

export interface PublicSideBackgroundPathInput {
  /** The server-owned Product slug. */
  readonly slug: string;
  /** `product_sides.code` — the Side's stable public identity. */
  readonly sideCode: string;
}

/** Slug charset as produced by the server's own derivation (`product-slug.ts`). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `PLACEMENT_CODE_PATTERN` from the database schema, restated here because a
 * frontend-safe package may not import the persistence layer. The API's
 * equivalence spec pins the two together.
 */
const SIDE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export class PublicSideBackgroundPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSideBackgroundPathError';
  }
}

/**
 * Builds the public delivery path for one Product Side background.
 *
 * Throws rather than returning a best-effort string: a malformed address would
 * be rendered into a Studio canvas as a broken background, and a caller that
 * cannot produce a valid identity has a bug worth surfacing where it happens.
 * Segments are still percent-encoded after validation — the patterns already
 * exclude every character that would need it, so the encoding is a second
 * barrier rather than the only one.
 */
export function buildPublicSideBackgroundPath(input: PublicSideBackgroundPathInput): string {
  const { slug, sideCode } = input;

  if (!SLUG_PATTERN.test(slug)) {
    // The slug is a server-owned public address with no personal data, so it is
    // safe to echo; that makes the failure diagnosable at the call site.
    throw new PublicSideBackgroundPathError(`Invalid product slug "${slug}".`);
  }
  if (!SIDE_CODE_PATTERN.test(sideCode)) {
    throw new PublicSideBackgroundPathError(`Invalid product side code "${sideCode}".`);
  }

  return [
    PUBLIC_SIDE_BACKGROUND_PATH_PREFIX,
    encodeURIComponent(slug),
    PUBLIC_SIDE_BACKGROUND_SIDES_SEGMENT,
    encodeURIComponent(sideCode),
    PUBLIC_SIDE_BACKGROUND_SEGMENT,
  ].join('/');
}
