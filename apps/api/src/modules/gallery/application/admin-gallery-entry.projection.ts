/**
 * The runtime projection for the Admin gallery authoring surface
 * (`APP11-B01` §8.3, §10).
 *
 * Kept apart from the OpenAPI response classes for the reason
 * `product-projection.ts` records: adding a property to one and forgetting the
 * other then shows up as a type error rather than as a silently undocumented —
 * or silently undelivered — field.
 *
 * Two absences are deliberate and load-bearing:
 *
 * - **No storage fact.** An association is projected as an id and a position.
 *   No storage key, bucket, checksum, MIME type, derivative or URL crosses this
 *   boundary; Admin asset presentation reuses the existing Admin asset
 *   authority in `APP11-A02`, and an address invented here would be fabricated.
 * - **No per-image alt text.** `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`
 *   (`APP11-D01-C1`): there is no column, so there is no property. Accessible
 *   image text is derived at render time from the entry title and the image
 *   position.
 */
import type {
  AdminGalleryEntry,
  GalleryEntryAssetLink,
  GalleryEntryAssetSummary,
} from '../domain/repositories/gallery-entry.repository';

/** One ordered association, as the Admin surface sees it. */
export interface AdminGalleryEntryAssetView {
  readonly assetId: string;
  readonly position: number;
}

export interface AdminGalleryEntrySummaryView {
  readonly galleryEntryId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly displayOrder: number;
  readonly linkedProductId?: string;
  readonly isIndexable: boolean;
  /** The first association, when one exists. Identity only — there is no URL. */
  readonly coverAssetId?: string;
  readonly assetCount: number;
}

export interface AdminGalleryEntryDetailView extends AdminGalleryEntrySummaryView {
  readonly description: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  /** Lifecycle evidence; present only on an archived entry. */
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assets: readonly AdminGalleryEntryAssetView[];
}

export interface AdminGalleryEntryListView {
  readonly items: readonly AdminGalleryEntrySummaryView[];
  readonly nextCursor?: string;
  readonly hasNext: boolean;
}

const NO_ASSETS: GalleryEntryAssetSummary = { assetCount: 0, coverAssetId: undefined };

export function toSummaryView(
  entry: AdminGalleryEntry,
  assets: GalleryEntryAssetSummary = NO_ASSETS,
): AdminGalleryEntrySummaryView {
  return {
    galleryEntryId: entry.id,
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    displayOrder: entry.displayOrder,
    ...(entry.linkedProductId === undefined ? {} : { linkedProductId: entry.linkedProductId }),
    isIndexable: entry.isIndexable,
    ...(assets.coverAssetId === undefined ? {} : { coverAssetId: assets.coverAssetId }),
    assetCount: assets.assetCount,
  };
}

export function toDetailView(
  entry: AdminGalleryEntry,
  links: readonly GalleryEntryAssetLink[],
): AdminGalleryEntryDetailView {
  const first = links[0];
  return {
    ...toSummaryView(entry, {
      assetCount: links.length,
      coverAssetId: first?.assetId,
    }),
    description: entry.description,
    ...(entry.seoTitle === undefined ? {} : { seoTitle: entry.seoTitle }),
    ...(entry.seoDescription === undefined ? {} : { seoDescription: entry.seoDescription }),
    ...(entry.archivedAt === undefined ? {} : { archivedAt: entry.archivedAt.toISOString() }),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    // Position is the stored `display_order`, published as it is: it is the
    // value `APP11-B02` will patch, so renumbering it here would make the
    // editor send back a position the database never held.
    assets: links.map((link) => ({ assetId: link.assetId, position: link.displayOrder })),
  };
}
