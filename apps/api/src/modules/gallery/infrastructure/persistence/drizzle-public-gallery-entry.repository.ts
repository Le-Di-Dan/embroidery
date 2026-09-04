/**
 * Drizzle implementation of the two public gallery reads (`APP11-B03`).
 *
 * ## Visibility is in the SQL, not above it
 *
 * `status = 'PUBLISHED'` is part of every statement here. A caller cannot
 * forget it, and there is no code path that returns a draft or archived row for
 * a service to filter out later — the row never arrives. `is_indexable` is
 * deliberately *not* a term: a `noindex` entry is a published entry.
 *
 * ## Media eligibility is the delivery route's own predicate
 *
 * An image is only projected when its bytes would actually be served, and an
 * entry only appears in the feed when it has at least one such image (§10). The
 * conditions come from `gallery-public-media-eligibility.ts`, which the binary
 * route uses too, so the two cannot drift.
 *
 * ## No N+1
 *
 * The feed resolves each card's cover and image count with correlated
 * subqueries inside the single list statement, so a page of twenty entries is
 * one round trip. The detail is two statements — the entry row and its ordered
 * images — which is constant, not per-item.
 *
 * The repository opens no transaction and takes **no lock** (DEC-DB7-006):
 * these are ordinary anonymous reads, each already a single consistent
 * snapshot, and a public GET that locked rows would let unauthenticated traffic
 * block an operator's write.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';

import { toIntrinsicSize } from '../../../catalog/domain/public-media-dimensions';

import {
  PUBLIC_GALLERY_DETAIL_RENDITION,
  PUBLIC_GALLERY_LIST_RENDITION,
  resolveDerivativeKind,
} from '../../domain/public-gallery-media.policy';
import { PUBLIC_GALLERY_ENTRY_VISIBLE_STATE } from '../../domain/public-gallery-entry.policy';
import type {
  PublicGalleryEntryAssetRow,
  PublicGalleryEntryDetail,
  PublicGalleryEntryListQuery,
  PublicGalleryEntryListRow,
  PublicGalleryEntryRepository,
  PublicIndexableGalleryEntryRow,
} from '../../domain/repositories/public-gallery-entry.repository';
import {
  GALLERY_ASSET_ID_SELECTION,
  GALLERY_ASSET_ORDER,
  GALLERY_DERIVATIVE_HEIGHT_SELECTION,
  GALLERY_DERIVATIVE_WIDTH_SELECTION,
  allOf,
  deliverableAssetConditions,
  deliverableAssetSource,
} from './gallery-public-media-eligibility';

const { galleryEntries, galleryEntryAssets, assets, assetDerivatives } = schema;

const LIST_DERIVATIVE_KIND = resolveDerivativeKind(PUBLIC_GALLERY_LIST_RENDITION);
const DETAIL_DERIVATIVE_KIND = resolveDerivativeKind(PUBLIC_GALLERY_DETAIL_RENDITION);

@Injectable()
export class DrizzlePublicGalleryEntryRepository
  extends DrizzleRepository
  implements PublicGalleryEntryRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listPublished(
    query: PublicGalleryEntryListQuery,
  ): Promise<readonly PublicGalleryEntryListRow[]> {
    const conditions = [
      eq(galleryEntries.status, PUBLIC_GALLERY_ENTRY_VISIBLE_STATE),
      // §10 — an image-led card with no image is not a valid public
      // projection, so the entry is omitted at the source rather than
      // returned and dropped afterwards, which would break the page size.
      sql`exists (select 1 ${this.coverSource()})`,
    ];
    // Keyset, not OFFSET: strict lexicographic "after" on the exact ordering
    // tuple, expressed as (sort > s) OR (sort = s AND id > i) so it matches the
    // IDX-066 key order rather than forcing a row-value comparison.
    if (query.after !== undefined) {
      const { displayOrder, id } = query.after;
      conditions.push(
        or(
          gt(galleryEntries.displayOrder, displayOrder),
          and(eq(galleryEntries.displayOrder, displayOrder), gt(galleryEntries.id, id)),
        )!,
      );
    }

    const rows = await this.db
      .select({
        id: galleryEntries.id,
        displayOrder: galleryEntries.displayOrder,
        slug: galleryEntries.slug,
        title: galleryEntries.title,
        description: galleryEntries.description,
        isIndexable: galleryEntries.isIndexable,
        coverAssetId: sql<
          string | null
        >`(select ${GALLERY_ASSET_ID_SELECTION} ${this.coverSource()} ${GALLERY_ASSET_ORDER} limit 1)`,
        // The same source, the same total order and the same `limit 1` as the
        // cover id above, differing only in the projected column — so the size
        // describes the derivative the cover URL addresses (`APP12-H05-C1`).
        coverWidth: sql<
          number | null
        >`(select ${GALLERY_DERIVATIVE_WIDTH_SELECTION} ${this.coverSource()} ${GALLERY_ASSET_ORDER} limit 1)`,
        coverHeight: sql<
          number | null
        >`(select ${GALLERY_DERIVATIVE_HEIGHT_SELECTION} ${this.coverSource()} ${GALLERY_ASSET_ORDER} limit 1)`,
        assetCount: sql<number>`(select count(*)::int ${this.coverSource()})`,
      })
      .from(galleryEntries)
      .where(and(...conditions))
      .orderBy(asc(galleryEntries.displayOrder), asc(galleryEntries.id))
      .limit(query.limit);

    return rows.map(({ coverWidth, coverHeight, ...row }) => ({
      ...row,
      coverAssetId: row.coverAssetId ?? undefined,
      coverSize: toIntrinsicSize(coverWidth, coverHeight),
      assetCount: Number(row.assetCount),
    }));
  }

  async findPublishedBySlug(slug: string): Promise<PublicGalleryEntryDetail | undefined> {
    const [entry] = await this.db
      .select({
        id: galleryEntries.id,
        slug: galleryEntries.slug,
        title: galleryEntries.title,
        description: galleryEntries.description,
        displayOrder: galleryEntries.displayOrder,
        isIndexable: galleryEntries.isIndexable,
        seoTitle: galleryEntries.seoTitle,
        seoDescription: galleryEntries.seoDescription,
        linkedProductId: galleryEntries.linkedProductId,
      })
      .from(galleryEntries)
      .where(
        and(
          eq(galleryEntries.slug, slug),
          eq(galleryEntries.status, PUBLIC_GALLERY_ENTRY_VISIBLE_STATE),
        ),
      )
      .limit(1);

    if (entry === undefined) {
      return undefined;
    }

    return {
      entry: {
        ...entry,
        seoTitle: entry.seoTitle ?? undefined,
        seoDescription: entry.seoDescription ?? undefined,
        linkedProductId: entry.linkedProductId ?? undefined,
      },
      assets: await this.deliverableAssets(entry.id),
    };
  }

  async listIndexable(limit: number): Promise<readonly PublicIndexableGalleryEntryRow[]> {
    return (
      this.db
        .select({ slug: galleryEntries.slug, updatedAt: galleryEntries.updatedAt })
        .from(galleryEntries)
        .where(
          and(
            eq(galleryEntries.status, PUBLIC_GALLERY_ENTRY_VISIBLE_STATE),
            // The only place in this repository where indexability narrows a
            // result set: everywhere else a `noindex` entry is an ordinary
            // published entry.
            eq(galleryEntries.isIndexable, true),
            // The detail route's own renderability test, correlated per entry, so
            // the sitemap cannot advertise a slug that would 404.
            sql`exists (select 1 ${this.detailSource()})`,
          ),
        )
        // `slug` alone is total: `uq_gallery_entries__slug` makes it unique, so
        // no tie-breaker is owed and the inventory is stable between calls.
        .orderBy(asc(galleryEntries.slug))
        .limit(limit)
    );
  }

  /**
   * The entry's images in stored gallery order, restricted to those whose
   * detail rendition would really stream. An association the curator kept but
   * whose asset has since been withdrawn is filtered here — the stored
   * selection is never edited by a GET (§7.2, §10).
   */
  private async deliverableAssets(
    galleryEntryId: string,
  ): Promise<readonly PublicGalleryEntryAssetRow[]> {
    return this.db
      .select({
        assetId: galleryEntryAssets.assetId,
        displayOrder: galleryEntryAssets.displayOrder,
        // Direct columns: this statement already INNER JOINs the exact detail
        // derivative the asset URL addresses.
        width: assetDerivatives.widthPx,
        height: assetDerivatives.heightPx,
      })
      .from(galleryEntryAssets)
      .innerJoin(assets, eq(assets.id, galleryEntryAssets.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(galleryEntryAssets.galleryEntryId, galleryEntryId),
          allOf(deliverableAssetConditions(DETAIL_DERIVATIVE_KIND)),
        ),
      )
      .orderBy(asc(galleryEntryAssets.displayOrder), asc(galleryEntryAssets.id))
      .then((rows) =>
        rows.map(({ width, height, ...asset }) => ({
          ...asset,
          size: toIntrinsicSize(width, height),
        })),
      );
  }

  /**
   * The correlated source the feed's three terms share.
   *
   * Keyed on the **list** rendition, so "this entry has a cover", "this is the
   * cover" and "this many images" are one consistent answer: a card whose
   * thumbnail is missing is absent from the feed rather than present with a
   * cover address that would 404.
   */
  private coverSource() {
    return deliverableAssetSource(galleryEntries.id, LIST_DERIVATIVE_KIND);
  }

  /**
   * The same correlated source keyed on the **detail** rendition.
   *
   * What the sitemap's renderability term asks, and exactly what
   * `deliverableAssets` filters the detail's images on — so "this entry is in
   * the index" and "this entry answers 200" are one predicate, not two.
   */
  private detailSource() {
    return deliverableAssetSource(galleryEntries.id, DETAIL_DERIVATIVE_KIND);
  }
}
