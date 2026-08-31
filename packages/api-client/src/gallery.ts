/**
 * Gallery operations (`APP11`): the Admin gallery entry list, and the
 * authenticated preview of one gallery image.
 *
 * `APP11-B01` deliberately delivered the whole `adminGalleryEntry_*` family
 * without publishing any of it here, on the consumer-driven release rule this
 * boundary is governed by: an operation crosses when the checkpoint that
 * consumes it lands. `APP11-A01` is that checkpoint for the **list**, and for
 * the cover thumbnail beside it — and for nothing else.
 *
 * ## What crosses, and what is held back
 *
 * Two operations cross. `adminGalleryEntryCreate`, `adminGalleryEntryDetail`,
 * `adminGalleryEntryUpdate`, `adminGalleryEntryReplaceAssets`,
 * `adminGalleryEntryPublish` and `adminGalleryEntryUnpublish` stay unexported
 * until `APP11-A02` builds `/gallery/{entryId}`: A01 is a read-only list, and a
 * boundary that published the six mutations would make "this screen cannot
 * create, edit or publish an entry" a convention rather than a fact the module
 * graph enforces. `adminGalleryAssetCreate` is held back for the same reason —
 * `APP11-B03A`'s asset preparation has no Admin surface yet.
 *
 * The **public** gallery reads and the sitemap operations are not here either,
 * and not merely because no consumer has landed: this barrel serves the Admin
 * app, and a storefront read reached from an Admin screen would be a second,
 * unauthenticated view of the same rows.
 *
 * ## The preview is bytes, not an address
 *
 * `adminGalleryAssetPreview` streams a rendition to an authenticated operator
 * and returns a `Blob`. There is no URL, no signed link, no bucket and no
 * storage key anywhere in this surface — `coverAssetId` is an identity, and the
 * only way to turn it into pixels is this operation, through the session the
 * Admin app already holds.
 *
 * `AdminGalleryEntryListStatus` crosses as a **value** for the reason
 * `AdminProductionJobListStatusItem` does: the filter's three options are
 * derived from the contract rather than from a hand-kept list that could drift.
 * `DRAFT`, `PUBLISHED` and `ARCHIVED` are the whole vocabulary, and there is no
 * `ALL` sentinel to export because the contract defines none — an omitted
 * `status` is what "every state" means.
 */
export { adminGalleryEntryList, adminGalleryAssetPreview } from './generated/embroidery-api';
export { AdminGalleryEntryListStatus } from './generated/embroidery-api.schemas';
export type {
  AdminGalleryEntryListParams,
  AdminGalleryEntryListResponse,
  AdminGalleryEntrySummaryResponse,
} from './generated/embroidery-api.schemas';
