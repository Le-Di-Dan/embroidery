/**
 * TBL-065 `gallery_entry_assets` — one gallery↔asset association: public
 * derivatives only (CTX-GAL, AGG-18, `assoc`).
 *
 * Columns: COL-TBL065-01..03 · Constraints: CST-001, CST-043 (IDX-050)
 * Relationships: REL-095 ×2 (→ gallery_entries, → assets)
 * Indexes: IDX-050 (constraint-created; `gallery_entry_id` prefix serves
 * Q-04 assets-by-entry, same rejection class as media/version associations
 * — DB5 catalog rejection entry R08)
 * Owner: Gallery module — the association only; Asset owns classification.
 *
 * **CST-123 (public derivatives only):** classification lives on the
 * joined `assets` row (`assets.classification`, COL-TBL022-02), never on
 * this association — an index cannot enforce it, so this stays an
 * application check backed by D7-12 representation tests (same treatment
 * as `product_media`).
 *
 * Unlike `design_version_assets` (frozen with an immutable version), DB4's
 * table catalog marks this association plain **mutable** — a curator may
 * re-order or swap entry images at any time; there is no frozen-review
 * boundary here, so `updated_at` is present.
 */
import { foreignKey, integer, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { galleryEntries } from './gallery-entries';
import { assets } from '../asset/assets';

export const galleryEntryAssets = pgTable(
  'gallery_entry_assets',
  {
    id: idColumn().notNull(),
    galleryEntryId: idReference('gallery_entry_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_gallery_entry_assets', columns: [t.id] }),
    // CST-043 / IDX-050 — one association per (entry, asset).
    unique('uq_gallery_entry_assets__entry_asset').on(t.galleryEntryId, t.assetId),
    foreignKey({
      name: 'fk_gallery_entry_assets__gallery_entry_id',
      columns: [t.galleryEntryId],
      foreignColumns: [galleryEntries.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_gallery_entry_assets__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
  ],
);
