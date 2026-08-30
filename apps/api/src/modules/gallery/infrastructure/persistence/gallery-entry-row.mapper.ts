/**
 * Row → domain mapping for the gallery entry contracts (TBL-064).
 *
 * Separated from the repository so the persistence class stays inside the
 * `CLAUDE.md` §6 review threshold, and so the two projections — the narrow
 * showcase one and the wide Admin authoring one — sit side by side where a
 * column added to one and forgotten in the other is visible.
 *
 * Every nullable column becomes `undefined` here rather than travelling as
 * `null`: `null` is a persistence fact, and letting it past this boundary means
 * every consumer has to handle two spellings of "absent".
 */
import type { GalleryEntryState, schema } from '@embroidery/database';

import type {
  AdminGalleryEntry,
  GalleryEntry,
  GalleryEntryId,
} from '../../domain/repositories/gallery-entry.repository';

export type GalleryEntryRow = typeof schema.galleryEntries.$inferSelect;

export function toEntry(row: GalleryEntryRow): GalleryEntry {
  return {
    id: row.id as GalleryEntryId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as GalleryEntryState,
    linkedProductId: row.linkedProductId ?? undefined,
  };
}

export function toAdminEntry(row: GalleryEntryRow): AdminGalleryEntry {
  return {
    id: row.id as GalleryEntryId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as GalleryEntryState,
    displayOrder: row.displayOrder,
    linkedProductId: row.linkedProductId ?? undefined,
    seoTitle: row.seoTitle ?? undefined,
    seoDescription: row.seoDescription ?? undefined,
    isIndexable: row.isIndexable,
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
