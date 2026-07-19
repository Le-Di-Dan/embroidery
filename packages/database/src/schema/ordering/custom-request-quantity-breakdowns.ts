/**
 * TBL-039 `custom_request_quantity_breakdowns` — one (variant/size →
 * quantity) line of a request's Quantity Breakdown value object
 * (CTX-ORD, AGG-13).
 *
 * Columns: COL-TBL039-01..04 · Constraints: CST-001, CST-028 (IDX-030),
 * CST-062 (quantity > 0)
 * Relationships: REL-063 (second edge — → custom_requests), REL-064
 * (→ product_variants, nullable — NULL for COP lines)
 * Indexes: IDX-030 (constraint-created; its `custom_request_id` prefix
 * serves lines-by-request, so no separate FK index exists)
 * Owner: Ordering module.
 *
 * **Not a resurrected Request Item aggregate** (CON-075 stays rejected,
 * table-catalog note verbatim): this is a storage child normalising the
 * quantity VO — no own lifecycle, no state column, no commercial fields, no
 * public identity, no independent repository boundary. The root request owns
 * every invariant. Lines are mutable until the request reaches QUOTED
 * (app-guarded — the boundary is the request's state, a cross-row fact, so
 * no CHECK is faked here).
 *
 * `size_label` is free-form for COP/B2B lines; the CST-028 unique treats
 * NULL variant / NULL size as distinct dimensions per PostgreSQL semantics —
 * the app normalises labels before insert (DB1/DB2 normalization rules).
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { customRequests } from './custom-requests';
import { productVariants } from '../catalog/product-variants';

export const customRequestQuantityBreakdowns = pgTable(
  'custom_request_quantity_breakdowns',
  {
    id: idColumn().notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    productVariantId: idReference('product_variant_id'),
    sizeLabel: text('size_label'),
    quantity: integer('quantity').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_custom_request_quantity_breakdowns', columns: [t.id] }),
    // CST-028 / IDX-030 — one line per (request, variant, size).
    unique('uq_request_quantity_breakdowns__request_variant_size').on(
      t.customRequestId,
      t.productVariantId,
      t.sizeLabel,
    ),
    foreignKey({
      name: 'fk_custom_request_quantity_breakdowns__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-064 — NULL for COP lines; variants are archive-only.
    foreignKey({
      name: 'fk_custom_request_quantity_breakdowns__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    // CST-062 instance — a zero/negative quantity line is not a request line.
    check('ck_custom_request_quantity_breakdowns__quantity_positive', sql`${t.quantity} > 0`),
  ],
);
