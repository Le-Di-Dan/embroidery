/**
 * APP12-DB01 — the Ready-Made side of the seed chain, and the row builders both
 * APP12-DB01 suites use.
 *
 * `seedPaymentAttemptChain` already builds the whole custom chain (customer →
 * request → quotation → version → design case → version → approval snapshot →
 * order → obligation → attempt), so this module adds only what Ready-Made needs
 * on top of it: a purchasable SKU and its stock line, plus small builders for
 * the four row shapes the invariant matrix inserts over and over.
 *
 * Raw SQL on purpose, same as the APP7 fixture: this is setup for the physical
 * rules, not a test of Catalog or Inventory persistence. Every value is
 * synthetic.
 *
 * Test-only. Not exported from the package entrypoint.
 */
import { sql } from 'drizzle-orm';

import type { DatabaseClient } from '../client/create-database-client';
import { newId } from '../primitives/identifiers';

type Db = DatabaseClient['db'];

export interface ReadyMadeSubject {
  readonly skuId: string;
  readonly skuStockId: string;
}

/** One active SKU on the fixture's variant, with a stock line to reserve against. */
export async function seedReadyMadeSubject(
  db: Db,
  productVariantId: string,
): Promise<ReadyMadeSubject> {
  const skuId = newId();
  const skuStockId = newId();

  await db.execute(sql`
    insert into skus (id, product_variant_id, code, currency_code, is_active)
    values (${skuId}, ${productVariantId}, ${`SKU-${skuId}`}, 'VND', true)
  `);
  await db.execute(sql`
    insert into sku_stocks (id, sku_id, quantity_on_hand)
    values (${skuStockId}, ${skuId}, 25)
  `);

  return { skuId, skuStockId };
}

export interface OrderRow {
  readonly id?: string;
  readonly origin: string;
  readonly status: string;
  readonly customerId: string;
  readonly customRequestId?: string | null;
  readonly quotationVersionId?: string | null;
  readonly approvalSnapshotId?: string | null;
}

/** Inserts one order exactly as given — the caller decides what is legal. */
export async function insertOrder(db: Db, row: OrderRow): Promise<string> {
  const id = row.id ?? newId();
  await db.execute(sql`
    insert into orders
      (id, code, origin, custom_request_id, customer_id, accepted_quotation_version_id,
       current_approval_snapshot_id, status, total_amount, currency_code)
    values (${id}, ${`ORD-${id}`}, ${row.origin}, ${row.customRequestId ?? null},
            ${row.customerId}, ${row.quotationVersionId ?? null},
            ${row.approvalSnapshotId ?? null}, ${row.status}, 1000000.00, 'VND')
  `);
  return id;
}

export interface OrderItemRow {
  readonly orderId: string;
  readonly position?: number;
  readonly skuId?: string | null;
  readonly customerOwnedProductId?: string | null;
  readonly approvalSnapshotId?: string | null;
}

export async function insertOrderItem(db: Db, row: OrderItemRow): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into order_items
      (id, order_id, position, sku_id, customer_owned_product_id, product_name,
       quantity, unit_price_amount, line_total_amount, currency_code, approval_snapshot_id)
    values (${id}, ${row.orderId}, ${row.position ?? 1}, ${row.skuId ?? null},
            ${row.customerOwnedProductId ?? null}, 'Tee', 2, 150000.00, 300000.00, 'VND',
            ${row.approvalSnapshotId ?? null})
  `);
  return id;
}

export interface ObligationRow {
  readonly orderId: string;
  readonly kind: string;
  readonly status?: string;
  readonly sourceQuotationVersionId?: string | null;
}

export async function insertObligation(db: Db, row: ObligationRow): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into payment_obligations
      (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
    values (${id}, ${row.orderId}, ${row.kind}, 300000.00, 'VND', ${row.status ?? 'PENDING'},
            ${row.sourceQuotationVersionId ?? null})
  `);
  return id;
}

export interface GrantRow {
  readonly customerId: string;
  readonly scopeKind: string;
  readonly customRequestId?: string | null;
  readonly orderId?: string | null;
  readonly status?: string;
}

export async function insertGrant(db: Db, row: GrantRow): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, order_id, token_hash, scope_kind, status, expires_at)
    values (${id}, ${row.customerId}, ${row.customRequestId ?? null}, ${row.orderId ?? null},
            ${`h-${id}`}, ${row.scopeKind}, ${row.status ?? 'ACTIVE'}, now() + interval '1 hour')
  `);
  return id;
}
