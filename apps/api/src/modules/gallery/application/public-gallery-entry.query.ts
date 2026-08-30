/**
 * The two public gallery queries (`APP11-B03`).
 *
 * Orchestration only: resolve the page window, ask the repository, project.
 * There is no transaction, no lock, no cache and no write — the invariant that
 * unpublish takes effect on the next read is satisfied by there being nothing
 * between the caller and the row.
 *
 * The service never learns *why* a detail lookup failed. Unknown slug, DRAFT,
 * ARCHIVED and an entry whose every image has been withdrawn all collapse to
 * the same 404 at the boundary — the last one decided here, because "an
 * image-led page with no image" is a projection rule and not a fact SQL can
 * report without teaching the endpoint to distinguish the four cases.
 *
 * **A GET mutates nothing.** An entry left with no deliverable media is hidden,
 * never unpublished, and the curator's stored selection is never edited: the
 * operator repairs the media or unpublishes the entry, and the read reflects
 * whatever they did on the very next request.
 */
import { Inject, Injectable } from '@nestjs/common';
import { resolveLimit } from '@embroidery/persistence';

import {
  PUBLIC_PRODUCT_REPOSITORY,
  type PublicProductRepository,
} from '../../catalog/domain/repositories/public-product.repository';
import {
  publicGalleryEntryNotFound,
  publicGalleryEntryQueryInvalid,
} from '../domain/public-gallery-entry.errors';
import {
  decodePublicGalleryEntryCursor,
  encodePublicGalleryEntryCursor,
} from '../domain/public-gallery-entry-cursor';
import {
  PUBLIC_GALLERY_ENTRY_REPOSITORY,
  type PublicGalleryEntryListRow,
  type PublicGalleryEntryRepository,
} from '../domain/repositories/public-gallery-entry.repository';
import {
  toPublicGalleryEntryDetail,
  toPublicGalleryEntrySummary,
  toPublicGalleryLinkedProduct,
  type PublicGalleryEntryDetailView,
  type PublicGalleryEntrySummary,
  type PublicGalleryLinkedProduct,
} from './public-gallery-entry.projection';

export interface PublicGalleryEntryListInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface PublicGalleryEntryListView {
  readonly items: readonly PublicGalleryEntrySummary[];
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
}

@Injectable()
export class PublicGalleryEntryQuery {
  constructor(
    @Inject(PUBLIC_GALLERY_ENTRY_REPOSITORY)
    private readonly gallery: PublicGalleryEntryRepository,
    @Inject(PUBLIC_PRODUCT_REPOSITORY)
    private readonly products: PublicProductRepository,
  ) {}

  async list(input: PublicGalleryEntryListInput): Promise<PublicGalleryEntryListView> {
    const limit = this.resolvePageSize(input.limit);
    const after =
      input.cursor === undefined || input.cursor === ''
        ? undefined
        : decodePublicGalleryEntryCursor(input.cursor);

    // Over-fetch by one: that extra row answers "is there a next page" without
    // a second COUNT, and is discarded rather than returned.
    const rows = await this.gallery.listPublished({ limit: limit + 1, after });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: page.flatMap(toSummary),
      hasNext,
      nextCursor: hasNext ? this.cursorAfter(page) : null,
    };
  }

  async detail(slug: string): Promise<PublicGalleryEntryDetailView> {
    const found = await this.gallery.findPublishedBySlug(slug);
    if (found === undefined || found.assets.length === 0) {
      // §10 — a published entry whose every image has been withdrawn is a
      // broken public page, so it answers exactly as an unknown slug does.
      throw publicGalleryEntryNotFound();
    }
    const linked = await this.resolveLinkedProduct(found.entry.linkedProductId);
    return toPublicGalleryEntryDetail(found, linked);
  }

  /**
   * The linked Product's public summary, or `null`.
   *
   * `APP11-B01` deliberately let an operator link a product they are still
   * preparing, so the stored link is not a promise that the product is public.
   * The question is asked of the Catalog public read port — the one place that
   * owns publication visibility — and a product that does not resolve there
   * yields `null` rather than a leaked id, name or status. It never affects
   * whether the gallery entry itself is visible.
   *
   * Detail only. The feed does not carry a linked product, because resolving
   * one per card is exactly the N+1 §12 forbids and no approved feed card
   * shows it.
   */
  private async resolveLinkedProduct(
    productId: string | undefined,
  ): Promise<PublicGalleryLinkedProduct | null> {
    if (productId === undefined) {
      return null;
    }
    const row = await this.products.findPublishedSummaryById(productId);
    return row === undefined ? null : toPublicGalleryLinkedProduct(row);
  }

  /**
   * `resolveLimit` clamps a large page size and rejects a nonsensical one. The
   * `RangeError` it throws is a transport-free contract failure, so it is
   * translated here rather than escaping as a 500.
   */
  private resolvePageSize(limit: number | undefined): number {
    try {
      return resolveLimit(limit);
    } catch {
      throw publicGalleryEntryQueryInvalid();
    }
  }

  /** The position of the last row actually returned. */
  private cursorAfter(page: readonly PublicGalleryEntryListRow[]): string | null {
    const last = page[page.length - 1];
    if (last === undefined) {
      return null;
    }
    return encodePublicGalleryEntryCursor({ displayOrder: last.displayOrder, id: last.id });
  }
}

/**
 * Projects one feed row, dropping any that somehow carries no cover.
 *
 * Unreachable through the delivered repository, whose `exists` term is the same
 * predicate that resolves the cover. A `flatMap` over an assertion because the
 * alternative — a non-null assertion — would turn a future repository change
 * into a card advertising `undefined` as an image address.
 */
function toSummary(row: PublicGalleryEntryListRow): PublicGalleryEntrySummary[] {
  return row.coverAssetId === undefined ? [] : [toPublicGalleryEntrySummary(row, row.coverAssetId)];
}
