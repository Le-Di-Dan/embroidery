/**
 * TBL-052 `quotation_line_items` — one frozen pricing line inside a
 * quotation version (CTX-QUO, AGG-14, `ver (child)`).
 *
 * Columns: COL-TBL052-01..08 (-07 ×2) · Constraints: CST-001, CST-037
 * (IDX-040), CST-062 instance (quantity > 0), CST-066 instance (money
 * non-negative)
 * Relationships: REL-066 (→ quotation_versions, restrict), REL-069
 * (→ skus, nullable, restrict — display reference only)
 * Indexes: IDX-040 (constraint-created)
 * Owner: Quotation module.
 *
 * **Immutable with their version.** Frozen alongside `quotation_versions`
 * once sent (INV-02); there is no S24 trigger target here because the
 * parent version's own freeze already makes rows under it structurally
 * unreachable for correction — a correction is a new version, never an
 * UPDATE on an existing line.
 *
 * `sku_id` is a **display/reference-only** FK (REL-069, INV-12): the frozen
 * `description`/`unit_price_amount`/`line_total_amount` values are the
 * priced facts, never re-derived from the live `skus` row. `line_kind`
 * distinguishes the priced-fact category (`DIGITIZING_FEE` feeds the S5
 * refund default elsewhere); it is a closed CHECK set, not a catalog table.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { quotationVersions } from './quotation-versions';
import { skus } from '../catalog/skus';

export const QUOTATION_LINE_KINDS = [
  'PRODUCT',
  'EMBROIDERY',
  'DIGITIZING_FEE',
  'SHIPPING',
  'ADJUSTMENT',
  'OTHER',
] as const;
export type QuotationLineKind = (typeof QUOTATION_LINE_KINDS)[number];

export const quotationLineItems = pgTable(
  'quotation_line_items',
  {
    id: idColumn().notNull(),
    quotationVersionId: idReference('quotation_version_id').notNull(),
    position: integer('position').notNull(),
    lineKind: text('line_kind').notNull(),
    description: text('description').notNull(),
    skuId: idReference('sku_id'),
    quantity: integer('quantity').notNull(),
    unitPriceAmount: numeric('unit_price_amount', { precision: 14, scale: 2 }).notNull(),
    lineTotalAmount: numeric('line_total_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_quotation_line_items', columns: [t.id] }),
    // CST-037 / IDX-040 — line positions never duplicated within a version.
    unique('uq_quotation_line_items__qversion_position').on(t.quotationVersionId, t.position),
    // REL-066 — lines are never deleted while their version exists.
    foreignKey({
      name: 'fk_quotation_line_items__quotation_version_id',
      columns: [t.quotationVersionId],
      foreignColumns: [quotationVersions.id],
    }).onDelete('restrict'),
    // REL-069 — display/reference only; catalog rows are archive-only.
    foreignKey({
      name: 'fk_quotation_line_items__sku_id',
      columns: [t.skuId],
      foreignColumns: [skus.id],
    }).onDelete('restrict'),
    check(
      'ck_quotation_line_items__line_kind_allowed',
      sql`${t.lineKind} in ('PRODUCT', 'EMBROIDERY', 'DIGITIZING_FEE', 'SHIPPING', 'ADJUSTMENT', 'OTHER')`,
    ),
    check('ck_quotation_line_items__quantity_positive', sql`${t.quantity} > 0`),
    check('ck_quotation_line_items__unit_price_non_negative', sql`${t.unitPriceAmount} >= 0`),
    check('ck_quotation_line_items__line_total_non_negative', sql`${t.lineTotalAmount} >= 0`),
    check('ck_quotation_line_items__currency_vnd', sql`${t.currencyCode} = 'VND'`),
  ],
);
