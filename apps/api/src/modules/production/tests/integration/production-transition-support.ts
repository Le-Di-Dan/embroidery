/**
 * The `APP8-B04`-specific seeding and state-forcing helpers.
 *
 * Kept beside `admin-production-context.ts` rather than inside it: the harness
 * boots one application and owns the canonical writers, while these functions
 * arrange the *particular* states a transition suite must refuse from — a
 * deposit walked back after the order row already says `DEPOSIT_PAID`, an
 * approval pointer moved after a job was frozen from the old one, a reservation
 * released out from under a planned job.
 *
 * Each of them forces a state the delivered application paths deliberately do
 * not offer, which is exactly why they are here and not in the use case. Two use
 * raw SQL for that reason and say so; the reservation release goes through the
 * canonical `SkuStockRepository`, because a release *is* a delivered operation
 * and faking it would prove less.
 *
 * Test-only.
 */
import type { ReservationId } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import type { OrderItem } from '../../../order/domain/repositories/order.repository';
import type { OrderFixture } from '../../../order/tests/integration/order-fixture';
import type { AdminProductionTestContext } from './admin-production-context';

/** The Catalog display copy `seedOrderChain`'s approval snapshot freezes. */
const PRODUCT_NAME = 'Tee';
const VARIANT_LABEL = 'Black / M';

/** One frozen Catalog line. `skuId` is overridden by the multi-SKU cases. */
export function catalogItem(fixture: OrderFixture, position: number, quantity: number): OrderItem {
  return {
    position,
    skuId: fixture.skuId,
    customerOwnedProductId: undefined,
    productName: PRODUCT_NAME,
    variantLabel: VARIANT_LABEL,
    sizeLabel: undefined,
    quantity,
    unitPriceAmount: '100000.00',
    lineTotalAmount: `${quantity * 100000}.00`,
  };
}

/** The customer-owned product a COP approval snapshot was taken against. */
export async function customerOwnedProductOf(
  context: AdminProductionTestContext,
  approvalSnapshotId: string,
): Promise<string> {
  const [row] = (
    await context.disposable.client.db.execute<{ customer_owned_product_id: string }>(
      sql`select customer_owned_product_id from approval_snapshots where id = ${approvalSnapshotId}`,
    )
  ).rows;
  if (row?.customer_owned_product_id === undefined) {
    throw new Error('That approval snapshot is not a customer-owned one.');
  }
  return row.customer_owned_product_id;
}

/**
 * Walks the DEPOSIT obligation back to `PENDING` while the order row keeps
 * saying `DEPOSIT_PAID`.
 *
 * Raw SQL, and it has to be: no delivered path un-satisfies an obligation, which
 * is the point. The divergence it creates is what separates "the start reads the
 * order's status" from "the start asks the one deposit authority" — under the
 * first reading this state starts production, under the second it refuses.
 */
export async function unsatisfyDeposit(
  context: AdminProductionTestContext,
  orderId: string,
): Promise<void> {
  await context.disposable.client.db.execute(sql`
    update payment_obligations
       set status = 'PENDING', satisfied_at = null, satisfied_by_attempt_id = null
     where order_id = ${orderId} and kind = 'DEPOSIT'
  `);
}

/**
 * Moves `orders.current_approval_snapshot_id` after a job was frozen from the
 * old one.
 *
 * Raw SQL for the same reason: ADR-DB3-003 r4 *permits* a post-approval revision
 * to repoint that column and no delivered path does so yet
 * (`FU-APP8-B03-03`). The suite forces the state to prove the conservative half
 * — a start against an approval the order no longer names is refused rather than
 * silently produced — without inventing the revision workflow that would
 * legitimately create it.
 */
export async function repointOrderApproval(
  context: AdminProductionTestContext,
  orderId: string,
  approvalSnapshotId: string,
): Promise<void> {
  await context.disposable.client.db.execute(sql`
    update orders set current_approval_snapshot_id = ${approvalSnapshotId} where id = ${orderId}
  `);
}

/**
 * Releases every reservation an order still holds, through the canonical writer.
 *
 * A delivered operation, so it is driven rather than faked: what the suite then
 * proves is that a start meets a genuinely released reservation, with the
 * `RESERVATION_RELEASED` ledger row a real release leaves behind.
 */
export async function releaseAllReservations(
  context: AdminProductionTestContext,
  orderId: string,
  reason: string,
): Promise<void> {
  const rows = await context.reservationsOf(orderId);
  // `inventory_ledger_entries.admin_id` has a real FK, so the seeded operator
  // is used rather than a minted id.
  const adminId = await seededAdminId(context);
  for (const row of rows) {
    if (row.status !== 'RESERVED') {
      continue;
    }
    await context.inTransaction(() =>
      context
        .stockWriter()
        .releaseReservation(row.id as ReservationId, reason, { kind: 'ADMIN', adminId }),
    );
  }
}

async function seededAdminId(context: AdminProductionTestContext): Promise<string> {
  const [row] = (
    await context.disposable.client.db.execute<{ id: string }>(
      sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
    )
  ).rows;
  if (row === undefined) {
    throw new Error('No ACTIVE admin account was seeded.');
  }
  return row.id;
}
