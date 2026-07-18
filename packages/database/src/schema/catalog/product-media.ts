/**
 * TBL-017 `product_media` — one product↔asset media association
 * (CTX-CAT, AGG-06, `assoc`).
 *
 * Columns: COL-TBL017-01..04 · Constraints: CST-001, CST-013 (IDX-015),
 * role closed set (COL-TBL017-03 `(CK)`)
 * Relationships: REL-025 ×2 (→ products; → assets)
 * Indexes: IDX-015 (constraint-created; its `product_id` prefix serves
 * media-by-product, which is why DB5's redundancy review rejected a separate
 * ordering index — catalog rejection entry R07)
 * Owner: Catalog module — the *semantic association* only (ADR-DB4-003).
 *
 * Asset metadata (storage key, MIME, size, checksum, classification) lives on
 * the G4 `assets` row and is **not** duplicated here. Associating an asset
 * with a product does not change the asset's private-original policy — which
 * derivative is surfaced publicly is application policy, not schema.
 */
import { check, foreignKey, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { assets } from '../asset/assets';
import { products } from './products';

/** COL-TBL017-03 closed role set (DB4). */
export const PRODUCT_MEDIA_ROLES = ['GALLERY', 'THUMBNAIL', 'DETAIL'] as const;
export type ProductMediaRole = (typeof PRODUCT_MEDIA_ROLES)[number];

export const productMedia = pgTable(
  'product_media',
  {
    id: idColumn().notNull(),
    productId: idReference('product_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    role: text('role').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_product_media', columns: [t.id] }),
    // CST-013 / IDX-015 — one association per (product, asset, role).
    unique('uq_product_media__product_asset_role').on(t.productId, t.assetId, t.role),
    foreignKey({
      name: 'fk_product_media__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    // REL-025 — a referenced asset cannot be hard-deleted out from under a
    // published association; tombstone coordination owns the ordering.
    foreignKey({
      name: 'fk_product_media__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    check('ck_product_media__role_allowed', stateCheck(t.role, PRODUCT_MEDIA_ROLES)),
  ],
);
