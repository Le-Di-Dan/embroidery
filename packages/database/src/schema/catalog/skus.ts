/**
 * TBL-014 `skus` — one sellable SKU **definition** (CTX-CAT, AGG-06).
 *
 * Columns: COL-TBL014-01..05 · Constraints: CST-001, CST-012 (IDX-014),
 * CST-063 (override ≥ 0), CST-068, DEV-DB6-005
 * Relationships: REL-022 (→ product_variants, composition)
 * Indexes: IDX-014 (constraint-created), IDX-069 (P1 required, with group)
 * Owner: Catalog module — **definition side only**.
 *
 * Stock lives in the Inventory context (REL-026 "inventory truth split"):
 * this table carries no quantity_on_hand, no reserved quantity and no
 * low-stock threshold. `sku_stocks` (G6) will hold the 1–1 stock row keyed
 * on this table's stable id; archiving a SKU definition never deletes it,
 * so inventory and historical references stay valid.
 *
 * `price_override_amount` is the optional SKU-level display price; NULL means
 * the product's base price applies. Same INV-12 rule as products: history
 * copies by value, so this is never a historical source.
 *
 * `code` is the business SKU code — a technical exact identifier, unique
 * globally, bytewise comparison.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import {
  amount,
  currencyCode,
  currencyScaleCheck,
  nonNegativeAmountCheck,
} from '../../primitives/money';
import { productVariants } from './product-variants';

export const skus = pgTable(
  'skus',
  {
    id: idColumn().notNull(),
    productVariantId: idReference('product_variant_id').notNull(),
    code: text('code').notNull(),
    priceOverrideAmount: amount('price_override_amount'),
    currencyCode: currencyCode().notNull(),
    isActive: boolean('is_active').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_skus', columns: [t.id] }),
    // CST-012 / IDX-014 — business SKU code identity.
    unique('uq_skus__code').on(t.code),
    foreignKey({
      name: 'fk_skus__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    // CST-063 instance — NULL passes (no override), a set value is ≥ 0.
    check('ck_skus__price_override_non_negative', nonNegativeAmountCheck(t.priceOverrideAmount)),
    // CST-068 instance.
    check('ck_skus__currency_allowed', sql`${t.currencyCode} = 'VND'`),
    // DEV-DB6-005.
    check('ck_skus__currency_scale', currencyScaleCheck(t.priceOverrideAmount, t.currencyCode)),
    // IDX-069 — Q-02/Q-03 SKUs by variant.
    index('ix_skus__variant').on(t.productVariantId),
  ],
);
