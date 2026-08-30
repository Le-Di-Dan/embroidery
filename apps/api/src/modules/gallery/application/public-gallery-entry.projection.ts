/**
 * Turns internal gallery rows into the two public payloads (`APP11-B03`).
 *
 * This is the boundary where internal identity stops. A row arriving here
 * carries `gallery_entries.display_order` (the keyset sort value) and
 * `linked_product_id` (a link that may name a product the public may not see);
 * a value leaving here carries neither as a field it should not. The asset id
 * survives because the media route addresses it and the approved Gallery Detail
 * needs to correlate an image with its address — it is an opaque subordinate
 * identity that grants nothing on its own.
 *
 * Deliberately absent, and asserted absent by the contract suite: storage key,
 * bucket, checksum, any private original URL, `assets.classification`, the
 * lifecycle `status`, `archivedAt`, the `createdAt`/`updatedAt` concurrency
 * token, and `altText` — `ALT_TEXT_MODEL` remains `DERIVED_NOT_PERSISTED`, so
 * accessible text is derived by the Storefront from gallery-entry context and
 * has no column, no field and no API here.
 *
 * Pure functions, no injection, no I/O: every rule below is decidable from its
 * arguments, which is what lets the leak scan enumerate real projections rather
 * than reason about the code that builds them.
 */
import { publicProductMediaPath } from '../../catalog/domain/public-product-catalog-path';
import { PUBLIC_LIST_RENDITION } from '../../catalog/domain/public-product-catalog.policy';
import type { PublicLinkedProductRow } from '../../catalog/domain/repositories/public-product.repository';
import { publicGalleryMediaPath } from '../domain/public-gallery-entry-path';
import {
  PUBLIC_GALLERY_DETAIL_RENDITION,
  PUBLIC_GALLERY_LIST_RENDITION,
} from '../domain/public-gallery-media.policy';
import type {
  PublicGalleryEntryAssetRow,
  PublicGalleryEntryDetail,
  PublicGalleryEntryListRow,
} from '../domain/repositories/public-gallery-entry.repository';

/** One image of a gallery entry: its opaque identity, its place, its address. */
export interface PublicGalleryAssetReference {
  readonly assetId: string;
  /** Zero-based position in the curator's stored order; 0 is the cover. */
  readonly position: number;
  /** Relative application path served by the publication-gated media route. */
  readonly url: string;
}

export interface PublicGalleryEntrySummary {
  readonly galleryEntryId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly isIndexable: boolean;
  /** Always present: an entry with no deliverable cover is not in the feed. */
  readonly coverAssetId: string;
  readonly coverUrl: string;
  readonly assetCount: number;
}

/**
 * The public projection of a linked Product.
 *
 * Only what the approved Gallery Detail needs. No price, no category, no stock
 * flag, no product id and no lifecycle state — and the whole object is absent
 * unless the Catalog public authority resolved the product, so a draft or
 * archived product contributes nothing at all, not even its id.
 */
export interface PublicGalleryLinkedProduct {
  readonly slug: string;
  readonly name: string;
  readonly thumbnailUrl?: string;
}

/**
 * Only the SEO facts that physically exist on `gallery_entries`.
 *
 * No canonical URL and no robots directive: `APP11-B04` owns the sitemap and
 * S03/S04 own the document head, and computing either here would lock a
 * Storefront decision from inside the API.
 */
export interface PublicGalleryEntrySeo {
  readonly title?: string;
  readonly description?: string;
  readonly isIndexable: boolean;
}

export interface PublicGalleryEntryDetailView {
  readonly galleryEntryId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly displayOrder: number;
  readonly assets: readonly PublicGalleryAssetReference[];
  readonly seo: PublicGalleryEntrySeo;
  readonly linkedProduct: PublicGalleryLinkedProduct | null;
}

export function toPublicGalleryEntrySummary(
  row: PublicGalleryEntryListRow,
  coverAssetId: string,
): PublicGalleryEntrySummary {
  return {
    galleryEntryId: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    displayOrder: row.displayOrder,
    isIndexable: row.isIndexable,
    coverAssetId,
    coverUrl: publicGalleryMediaPath({
      slug: row.slug,
      assetId: coverAssetId,
      rendition: PUBLIC_GALLERY_LIST_RENDITION,
    }),
    assetCount: row.assetCount,
  };
}

/**
 * One detail image.
 *
 * `position` is the index in the filtered array rather than the persisted
 * `display_order`: the stored positions are the curator's and may have gaps
 * once a withdrawn image is filtered out, and publishing a gap would tell a
 * caller that something it may not see used to sit there.
 */
export function toPublicGalleryAssetReference(
  slug: string,
  asset: PublicGalleryEntryAssetRow,
  position: number,
): PublicGalleryAssetReference {
  return {
    assetId: asset.assetId,
    position,
    url: publicGalleryMediaPath({
      slug,
      assetId: asset.assetId,
      rendition: PUBLIC_GALLERY_DETAIL_RENDITION,
    }),
  };
}

export function toPublicGalleryLinkedProduct(
  row: PublicLinkedProductRow,
): PublicGalleryLinkedProduct {
  return {
    slug: row.slug,
    name: row.name,
    // Omitted rather than nulled when the product has no deliverable
    // thumbnail: a fabricated address would 404 at the catalog media route.
    ...(row.thumbnailProductMediaId === undefined
      ? {}
      : {
          thumbnailUrl: publicProductMediaPath({
            slug: row.slug,
            productMediaId: row.thumbnailProductMediaId,
            rendition: PUBLIC_LIST_RENDITION,
          }),
        }),
  };
}

export function toPublicGalleryEntryDetail(
  detail: PublicGalleryEntryDetail,
  linkedProduct: PublicGalleryLinkedProduct | null,
): PublicGalleryEntryDetailView {
  const { entry } = detail;
  return {
    galleryEntryId: entry.id,
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    displayOrder: entry.displayOrder,
    // Repository order is the persisted gallery order; the projection preserves
    // it rather than re-sorting on anything the client can see.
    assets: detail.assets.map((asset, index) =>
      toPublicGalleryAssetReference(entry.slug, asset, index),
    ),
    seo: {
      ...(entry.seoTitle === undefined ? {} : { title: entry.seoTitle }),
      ...(entry.seoDescription === undefined ? {} : { description: entry.seoDescription }),
      isIndexable: entry.isIndexable,
    },
    linkedProduct,
  };
}
