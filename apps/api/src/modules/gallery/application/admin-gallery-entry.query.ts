/**
 * The two Admin gallery read operations (`APP11-B01` §8, §10).
 *
 * Keyset paging only: DB5 chose it for every launch-critical list, and an
 * offset page would drift under a concurrent create — the operator would see an
 * entry twice or miss one entirely while paging. There is no total count, for
 * the same reason the Admin product list has none.
 *
 * A malformed cursor is a client error and must never be treated as "start from
 * the beginning": a caller paging through the gallery would silently restart and
 * process every entry a second time.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { GalleryEntryState } from '@embroidery/database';

import { adminGalleryEntryError } from '../domain/admin-gallery-entry.errors';
import {
  GALLERY_ENTRY_REPOSITORY,
  type AdminGalleryEntry,
  type GalleryEntryId,
  type GalleryEntryRepository,
} from '../domain/repositories/gallery-entry.repository';
import {
  toDetailView,
  toSummaryView,
  type AdminGalleryEntryDetailView,
  type AdminGalleryEntryListView,
} from './admin-gallery-entry.projection';

export interface ListAdminGalleryEntriesInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: GalleryEntryState | undefined;
}

@Injectable()
export class AdminGalleryEntryQuery {
  constructor(@Inject(GALLERY_ENTRY_REPOSITORY) private readonly entries: GalleryEntryRepository) {}

  async detail(galleryEntryId: string): Promise<AdminGalleryEntryDetailView> {
    const entry = await this.entries.findAuthoringById(galleryEntryId as GalleryEntryId);
    if (entry === undefined) {
      throw adminGalleryEntryError('GALLERY_ENTRY_NOT_FOUND');
    }
    const links = await this.entries.listAssetLinks(entry.id);
    return toDetailView(entry, links);
  }

  /**
   * One keyset page.
   *
   * The default carries **no status filter**: the Admin list is where an
   * operator finds a draft to finish and an archived entry to review, so
   * silently hiding either would make the list a lie about the gallery.
   * Ordering is `display_order ASC, id ASC` — the curated order the store is
   * presented in, with the tie-breaker DB5 requires.
   */
  async list(input: ListAdminGalleryEntriesInput): Promise<AdminGalleryEntryListView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const rows = await this.entries.listAuthoring({
      status: input.status,
      after,
      limit,
    });

    const page = buildPage(rows, limit, (entry: AdminGalleryEntry) => ({
      sortValue: String(entry.displayOrder),
      tieBreaker: entry.id,
    }));

    // Media for the whole page in one round trip, never one query per entry.
    const assets = await this.entries.summarizeAssets(page.items.map((entry) => entry.id));

    return {
      items: page.items.map((entry) => toSummaryView(entry, assets.get(entry.id))),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasNext: page.nextCursor !== undefined,
    };
  }
}

/** The exact spelling `String(displayOrder)` produces, and nothing else. */
const DECIMAL_INTEGER = /^(?:0|-?[1-9]\d*)$/;

function decodePosition(
  cursor: string | undefined,
): { readonly displayOrder: number; readonly id: string } | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    // Matched as text before it is converted: `Number('')` is 0 and
    // `Number(' 1e3 ')` is 1000, so a coercion alone would accept spellings no
    // page ever published and resume from a position the caller never saw.
    if (!DECIMAL_INTEGER.test(decoded.sortValue)) {
      throw adminGalleryEntryError('GALLERY_ENTRY_CURSOR_INVALID');
    }
    const displayOrder = Number(decoded.sortValue);
    if (!Number.isSafeInteger(displayOrder)) {
      throw adminGalleryEntryError('GALLERY_ENTRY_CURSOR_INVALID');
    }
    return { displayOrder, id: decoded.tieBreaker };
  } catch {
    throw adminGalleryEntryError('GALLERY_ENTRY_CURSOR_INVALID');
  }
}
