/**
 * TBL-017 `product_media` — one product↔asset media association
 * (CTX-CAT, AGG-06, `assoc`).
 *
 * Columns: COL-TBL017-01..04 · Constraints: CST-001, CST-013 (IDX-015),
 * role closed set (COL-TBL017-03 `(CK)`), and the `APP12-M01.DB1` gallery
 * invariants — one Asset per Product, one position per Product, positions
 * bounded to `0..MAX_PRODUCT_MEDIA_ITEMS - 1`, and the primary role pinned to
 * position 0 in both directions (migration 0039)
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
 *
 * ### What the database guarantees, and what it deliberately does not
 *
 * `APP12-M01.DB1` makes the gallery's *structural* rules defensive — they hold
 * against any writer, including a hand-run `INSERT`. Four of them are row- or
 * pair-local and are therefore expressible as constraints:
 *
 * ```text
 * no duplicate Asset per Product       uq_product_media__product_asset
 * no duplicate position per Product    uq_product_media__product_display_order
 * positions bounded to 0..19           ck_product_media__display_order_bounded
 * THUMBNAIL iff position 0             ck_product_media__primary_role_at_zero
 * ```
 *
 * Two more rules are **not** here, and their absence is a decision rather than
 * an omission: that a non-empty selection contains position 0, and that its
 * positions are contiguous `0..N-1`. Both are statements about a *set* of rows,
 * which no row CHECK can read, and a constraint trigger written only to make
 * the sentence "exactly one primary when media exists" true would fire on every
 * intermediate state of the legitimate delete-then-insert replacement the Admin
 * write performs. They are owned by the domain (`ProductMediaSelection`) and
 * proved there. The four above are what the schema can honestly claim.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { assets } from '../asset/assets';
import { products } from './products';

/** COL-TBL017-03 closed role set (DB4). */
export const PRODUCT_MEDIA_ROLES = ['GALLERY', 'THUMBNAIL', 'DETAIL'] as const;
export type ProductMediaRole = (typeof PRODUCT_MEDIA_ROLES)[number];

/**
 * How `APP2-B02` assigns roles to an ordered Admin media selection (IMP-D032).
 *
 * `role` is NOT NULL with no default and is part of the row's uniqueness key,
 * so a selection cannot be stored without deciding it. The locked rule keeps
 * the operator's ordering as the only input: the first Asset becomes the single
 * `THUMBNAIL`, every following Asset is `GALLERY` at its zero-based request
 * position. `DETAIL` is out of APP2-B02 scope — nothing selects it, so nothing
 * writes it.
 */
export const PRODUCT_MEDIA_PRIMARY_ROLE = 'THUMBNAIL' as const satisfies ProductMediaRole;
export const PRODUCT_MEDIA_SECONDARY_ROLE = 'GALLERY' as const satisfies ProductMediaRole;

/**
 * The canonical maximum number of media a Product may carry (`APP12-M01.DB1`,
 * `MAX_PRODUCT_IMAGES = 20`).
 *
 * One value, four consumers: the `display_order` bound migration 0039
 * installs, the domain cap in `ProductMediaSelection`, the `maxItems` the
 * Admin write contract publishes, and the tests of all three. It lives beside
 * the role tuple because that is where the gate already put the values the
 * migration derives from — a second copy in the API is how one bound silently
 * becomes two bounds.
 *
 * The bound is on *positions*, so the highest legal `display_order` is
 * `MAX_PRODUCT_MEDIA_ITEMS - 1`.
 */
export const MAX_PRODUCT_MEDIA_ITEMS = 20;

/** Roles `APP2-B02` may write; `DETAIL` is deliberately excluded. */
export const APP2_PRODUCT_MEDIA_ROLES = [
  PRODUCT_MEDIA_PRIMARY_ROLE,
  PRODUCT_MEDIA_SECONDARY_ROLE,
] as const;

/** The primary role as a DDL string literal; see the CHECK below for why. */
function primaryRoleLiteral() {
  return sql.raw(`'${PRODUCT_MEDIA_PRIMARY_ROLE}'`);
}

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
    // CST-013 / IDX-015, tightened by APP12-M01.DB1 — one association per
    // (product, asset). `role` used to be part of this key, which let one
    // Asset appear twice in the same Product under two roles; a gallery whose
    // ordering is its contract cannot contain the same picture twice. The
    // `product_id` prefix is unchanged, so the media-by-product lookup IDX-015
    // has always served keeps its index (DB5 catalog rejection entry R07).
    unique('uq_product_media__product_asset').on(t.productId, t.assetId),
    // One row per position, so the ordering is a bijection and not a suggestion.
    unique('uq_product_media__product_display_order').on(t.productId, t.displayOrder),
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
    // Positions are zero-based and bounded by the canonical cap. Rendered with
    // `sql.raw` for the same reason `stateCheck` renders its literals that way:
    // an interpolated value becomes a bound parameter, and drizzle-kit writes
    // the literal text `$1` into the migration file — installing a constraint
    // that does not mean what this schema says.
    check(
      'ck_product_media__display_order_bounded',
      sql`${t.displayOrder} >= 0 and ${t.displayOrder} < ${sql.raw(String(MAX_PRODUCT_MEDIA_ITEMS))}`,
    ),
    // The primary role and position 0 imply each other. Both directions are
    // needed: the forward half alone would allow a second THUMBNAIL further
    // down the strip, and the reverse half alone would allow a position 0 that
    // no public reader recognises as the primary.
    check(
      'ck_product_media__primary_role_at_zero',
      sql`(${t.displayOrder} = 0 and ${t.role} = ${primaryRoleLiteral()}) or (${t.displayOrder} > 0 and ${t.role} <> ${primaryRoleLiteral()})`,
    ),
  ],
);
