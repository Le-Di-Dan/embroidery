/**
 * The public SEO inventory (`APP11-B04`), crossing for `APP11-S04` — the
 * Storefront's `sitemap.xml`.
 *
 * ## Why it is its own barrel
 *
 * `publicSitemapEntry_list` answers one question across two domains: which
 * dynamic URLs — Products *and* gallery entries — a search engine may index
 * right now. It is not a catalog read and not a gallery read; putting it in
 * either barrel would file a cross-domain operation under whichever domain
 * happened to notice it first, and the gallery barrel says as much where it
 * withheld the family. It is technical SEO, so it sits in a barrel named for
 * that and nothing else.
 *
 * ## Consumer-driven release, satisfied now
 *
 * `APP11-B04` delivered the operation and `APP11-B04-C1` corrected its capacity
 * invariant, and it stayed off this boundary through five Storefront checkpoints
 * because no surface consumed it. `APP11-S04` is that surface: `/sitemap.xml`
 * exists as of this checkpoint and this operation is the single read it makes.
 *
 * ## What crosses, and what it carries
 *
 * The operation, its response types, and the `kind` enum as a **value** — the
 * Storefront maps each kind to its own browser route, and deriving the two
 * branches from the contract means a third kind is a compile error rather than a
 * silently skipped entry. That is the same reason the discovery feature derives
 * its four category slugs from `PublicProductListCategorySlug`.
 *
 * Nothing here carries an absolute URL, a canonical URL or a browser route: the
 * response is `{ kind, slug, updatedAt }` and route shapes are Storefront
 * authority. Nothing carries a bucket, an object key or a signature either — a
 * slug is a public address segment, and a `noindex` or unpublished entity is
 * simply absent rather than marked.
 */
export { publicSitemapEntryList } from './generated/embroidery-api';
export { PublicSitemapEntryResponseKind } from './generated/embroidery-api.schemas';
export type {
  PublicSitemapEntryResponse,
  PublicSitemapListResponse,
} from './generated/embroidery-api.schemas';
