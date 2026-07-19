/**
 * TBL-038 `customer_owned_products` — the customer-supplied product of one
 * request (CTX-ORD, AGG-13). **Never a SKU** (INV-13).
 *
 * Columns: COL-TBL038-01..04 (-04 ×2) · Constraints: CST-001, CST-027
 * (IDX-029), CST-066 (dims > 0 when set)
 * Relationships: REL-063 (first edge — → custom_requests)
 * Indexes: IDX-029 (constraint-created)
 * Owner: Ordering module.
 *
 * **By construction this table has no `sku_id`, no stock columns and no
 * price authority** (INV-13, dictionary note verbatim): a customer-provided
 * garment is represented here and only here — it never enters Catalog, never
 * gets a `sku_stocks` row, and order items will reference it through their
 * own COP path (REL-076, G15), not through a fake SKU. Ownership is derived
 * through the request's customer (request-bound child, CST-027 `UQ 0..1` —
 * at most one COP per request), which is exactly the authorization scope.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, numeric, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { customRequests } from './custom-requests';

export const customerOwnedProducts = pgTable(
  'customer_owned_products',
  {
    id: idColumn().notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    physicalWidthMm: numeric('physical_width_mm'),
    physicalHeightMm: numeric('physical_height_mm'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_customer_owned_products', columns: [t.id] }),
    // CST-027 / IDX-029 — at most one COP per request (0..1).
    unique('uq_customer_owned_products__request').on(t.customRequestId),
    // REL-063 (COP edge) — requests are retain-class; history survives.
    foreignKey({
      name: 'fk_customer_owned_products__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // CST-066 instance — dimensions positive when set (NULL passes).
    check(
      'ck_customer_owned_products__dims_positive',
      sql`${t.physicalWidthMm} > 0 and ${t.physicalHeightMm} > 0`,
    ),
  ],
);
