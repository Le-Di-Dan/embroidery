/**
 * What a gallery entry slug may look like, before anything is asked of the API.
 *
 * The server owns the address: `gallery_entries.slug` is accepted once at
 * create time and never regenerated, and the API validates it against
 * `GALLERY_ENTRY_SLUG_PATTERN` — the same charset the catalog uses. This is a
 * **syntax** gate and nothing more: a well-formed slug that names no entry
 * still resolves to the same safe not-found the API returns, and this function
 * cannot tell the two apart, which is exactly the property the public surface
 * needs.
 *
 * It exists so a scanner walking `/bo-suu-tap/<junk>` never becomes a backend
 * request. `%2F`, a query fragment, a path traversal and an empty segment are
 * all rejected here rather than being forwarded for the API to reject again.
 *
 * Declared locally rather than imported from `@embroidery/contracts`. The
 * contracts package publishes `isPublicProductSlug` because the *product* media
 * path builder needed it there; there is no gallery equivalent, and adding one
 * would be a change to a package this checkpoint does not own. The pattern is
 * identical to the API's by derivation, not by coincidence, and the boundary
 * suite asserts the two spellings still agree — if the API ever widens the
 * charset, that assertion fails rather than this file silently rejecting
 * addresses the server considers valid.
 */

/** The charset the server's own slug derivation produces. */
const GALLERY_ENTRY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Whether `value` can be a public gallery entry slug at all.
 *
 * Length is deliberately not checked. The API owns that limit, and a second
 * copy of it here would start refusing addresses the server is happy to
 * resolve the day someone raises it.
 */
export function isPublicGalleryEntrySlug(value: string): boolean {
  return GALLERY_ENTRY_SLUG_PATTERN.test(value);
}
