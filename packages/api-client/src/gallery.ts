/**
 * Gallery operations (`APP11`): the Admin gallery entry list and editor, and
 * the authenticated preview of one gallery image.
 *
 * `APP11-B01` deliberately delivered the whole `adminGalleryEntry_*` family
 * without publishing any of it here, on the consumer-driven release rule this
 * boundary is governed by: an operation crosses when the checkpoint that
 * consumes it lands. `APP11-A01` was that checkpoint for the **list** and the
 * cover thumbnail beside it; `APP11-A02` is that checkpoint for the editor —
 * `/gallery/[entryId]` — and for the create action on the list that leads to
 * it.
 *
 * ## What crosses now, and why each one does
 *
 * The seven operations the editor consumes, and nothing beyond them:
 *
 * ```text
 * adminGalleryEntryCreate          the create bootstrap on /gallery
 * adminGalleryEntryDetail          the editor's load
 * adminGalleryEntryUpdate          the authoring save
 * adminGalleryEntryReplaceAssets   the ordered media save
 * adminGalleryEntryPublish         DRAFT -> PUBLISHED
 * adminGalleryEntryUnpublish       PUBLISHED -> DRAFT
 * adminGalleryAssetCreate          B03A preparation from a catalog source
 * ```
 *
 * `adminGalleryAssetCreate` crosses with them rather than on its own: it exists
 * so an operator can obtain a public gallery image, and until this checkpoint
 * there was no screen on which obtaining one meant anything.
 *
 * ## What is still held back
 *
 * The **public** gallery reads and the sitemap operations are not here, and not
 * merely because no consumer has landed: this barrel serves the Admin app, and
 * a storefront read reached from an Admin screen would be a second,
 * unauthenticated view of the same rows. There is no archive or restore
 * operation to withhold — `APP11-B02` publishes none, so the editor has none to
 * offer. There is no gallery-asset deletion operation either
 * (`FU-APP11-B03A-01`), so no deletion control can exist.
 *
 * ## The preview is bytes, not an address
 *
 * `adminGalleryAssetPreview` streams a rendition to an authenticated operator
 * and returns a `Blob`. There is no URL, no signed link, no bucket and no
 * storage key anywhere in this surface — `coverAssetId` is an identity, and the
 * only way to turn it into pixels is this operation, through the session the
 * Admin app already holds.
 *
 * `AdminGalleryEntryListStatus` and `AdminGalleryEntryDetailResponseStatus`
 * cross as **values** for the reason `AdminProductionJobListStatusItem` does:
 * the filter's options and the editor's lifecycle branches are derived from the
 * contract rather than from a hand-kept list that could drift. `DRAFT`,
 * `PUBLISHED` and `ARCHIVED` are the whole vocabulary, and there is no `ALL`
 * sentinel to export because the contract defines none — an omitted `status` is
 * what "every state" means.
 */
export {
  adminGalleryEntryList,
  adminGalleryEntryCreate,
  adminGalleryEntryDetail,
  adminGalleryEntryUpdate,
  adminGalleryEntryReplaceAssets,
  adminGalleryEntryPublish,
  adminGalleryEntryUnpublish,
  adminGalleryAssetCreate,
  adminGalleryAssetPreview,
} from './generated/embroidery-api';
export {
  AdminGalleryEntryListStatus,
  AdminGalleryEntryDetailResponseStatus,
} from './generated/embroidery-api.schemas';
export type {
  AdminGalleryEntryListParams,
  AdminGalleryEntryListResponse,
  AdminGalleryEntrySummaryResponse,
  AdminGalleryEntryDetailResponse,
  AdminGalleryEntryAssetResponse,
  AdminGalleryAssetResponse,
  CreateGalleryEntryBody,
  UpdateGalleryEntryBody,
  ReplaceGalleryEntryAssetsBody,
  PublishGalleryEntryBody,
  UnpublishGalleryEntryBody,
  PrepareGalleryAssetBody,
} from './generated/embroidery-api.schemas';

/**
 * The **public** gallery read (`APP11-B03`), crossing for `APP11-S02` — the
 * Storefront gallery feed at `/bo-suu-tap`.
 *
 * The block above says the public reads are held back because "this barrel
 * serves the Admin app". That was true while every gallery consumer was an
 * Admin screen; it is not a property of the barrel, which is one package root
 * serving both applications — `publicProductList` has sat on it since
 * `APP2-S01`. What the rule actually forbids is an **Admin screen** reading the
 * storefront's unauthenticated view of the same rows, and that stays forbidden:
 * it is asserted per application, in each app's own boundary suite, rather than
 * by keeping the operation out of a package both apps import.
 *
 * Only the list crosses. `publicGalleryEntryDetail` stays withheld because
 * `/bo-suu-tap/[slug]` does not exist yet — `APP11-S03` owns that route, and an
 * operation on this boundary is an invitation to render a page for it. The
 * `publicSitemapEntry_*` family stays withheld for `APP11-S04`.
 *
 * `publicGalleryEntryAsset` also stays withheld, for the reason
 * `publicProductMediaGet` does rather than a scheduling one: it streams image
 * bytes as a `Blob`. The browser reaches that route by rendering the relative
 * `coverUrl` the list response already returns — the API composes that path
 * itself, from the same rendition constant the route serves — so the feed
 * consumes the delivery route without any application code streaming its bytes.
 * An `<img src>` cannot be a `Blob`, so exporting the operation would publish a
 * function no correct consumer could call.
 *
 * Nothing here carries a bucket, an object key, a signature or an expiry:
 * `coverAssetId` is an opaque identity that resolves only inside its published
 * entry, and `coverUrl` is a relative application path the publication-gated
 * route re-checks on every request.
 */
export { publicGalleryEntryList } from './generated/embroidery-api';
export type {
  PublicGalleryEntryListParams,
  PublicGalleryEntryListResponse,
  PublicGalleryEntrySummaryResponse,
} from './generated/embroidery-api.schemas';
