/**
 * A verified Ready-Made `FULL` payment reaches the worker and changes nothing,
 * against a real PostgreSQL (`APP12-H03-C1` §7, §8, §9).
 *
 * ### The defect
 *
 * `APP12-B05` made `FULL` verifiable and `PaymentDecisionRecorder` writes the
 * obligation's **real** kind into `payment.verified`. This consumer's closed set
 * knew two kinds, so every verified Ready-Made payment arrived as
 * `JOB_PAYLOAD_INVALID` and dead-lettered terminally — observed in a
 * production-like cluster by `APP12-H03`. It is `FU-APP8-W01-01` a second time,
 * one obligation kind later.
 *
 * ### The state this seeds, and why it is that state
 *
 * The order is seeded **as `APP12-B05` leaves it**, not as it is before
 * verification: the `FULL` obligation `SATISFIED` by a real `SUCCEEDED`
 * attempt, the inventory reservation already `CONSUMED`, on-hand already
 * decremented, a `CONSUMED` ledger entry already written, and the order at
 * `READY_FOR_DELIVERY`. That is the whole point — the verifying transaction did
 * the inventory work synchronously and appended this event afterwards, so by
 * the time the worker claims the row the sale is complete.
 *
 * The API half of that journey (Admin verify → consume → decrement → append) is
 * proven by `APP12-B05`'s own integration suite; duplicating it here would test
 * the producer, and what is under test is the consumer's response to what the
 * producer already wrote.
 *
 * Every assertion is on database rows, and each counts a **specific**
 * `entry_kind` or status rather than a total: a total hides a second effect of a
 * different kind landing on the same reservation (`APP8-B02` §9).
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

import {
  countRows,
  startInventoryReservationWorker,
  type InventoryReservationContext,
} from './inventory-reservation-context';

const ON_HAND_AFTER_SALE = 7;
const SOLD_QUANTITY = 3;

interface SeededReadyMadeOrder {
  readonly orderId: string;
  readonly skuId: string;
  readonly skuStockId: string;
  readonly reservationId: string;
  readonly obligationId: string;
  readonly attemptId: string;
}

/** A Ready-Made order in exactly the state a committed `APP12-B05` leaves. */
async function seedVerifiedReadyMadeOrder(
  disposable: DisposableDatabase,
  suffix: string,
): Promise<SeededReadyMadeOrder> {
  const db = disposable.client.db;
  const ids = {
    customer: newId(),
    category: newId(),
    product: newId(),
    variant: newId(),
    sku: newId(),
    stock: newId(),
    order: newId(),
    reservation: newId(),
    obligation: newId(),
    attempt: newId(),
  };

  await executeRaw(
    db,
    sql`insert into customers (id, display_name, verified_at)
        values (${ids.customer}, ${`Ready-Made Customer ${suffix}`}, now())`,
  );
  await executeRaw(
    db,
    sql`insert into categories (id, name, slug, status, display_order, is_indexable)
        values (${ids.category}, 'Cat', ${`cat-${ids.category}`}, 'PUBLISHED', 1, true)`,
  );
  await executeRaw(
    db,
    sql`insert into products
          (id, category_id, name, slug, base_price_amount, currency_code, status,
           is_display_out_of_stock, display_order, is_indexable)
        values (${ids.product}, ${ids.category}, 'Tee', ${`tee-${ids.product}`}, 150000, 'VND',
                'PUBLISHED', false, 1, true)`,
  );
  await executeRaw(
    db,
    sql`insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
        values (${ids.variant}, ${ids.product}, 'Black', 'M', 1, true)`,
  );
  await executeRaw(
    db,
    sql`insert into skus (id, product_variant_id, code, currency_code, is_active)
        values (${ids.sku}, ${ids.variant}, ${`SKU-${ids.sku}`}, 'VND', true)`,
  );
  // On-hand is what the sale left: the verification already decremented it.
  await executeRaw(
    db,
    sql`insert into sku_stocks (id, sku_id, quantity_on_hand)
        values (${ids.stock}, ${ids.sku}, ${ON_HAND_AFTER_SALE})`,
  );

  await executeRaw(
    db,
    sql`insert into orders (id, code, origin, customer_id, status, total_amount, currency_code)
        values (${ids.order}, ${`ORD-${ids.order}`}, 'READY_MADE', ${ids.customer},
                'READY_FOR_DELIVERY', 450000.00, 'VND')`,
  );
  await executeRaw(
    db,
    sql`insert into order_items
          (id, order_id, position, sku_id, product_name, variant_label, size_label,
           quantity, unit_price_amount, line_total_amount, currency_code)
        values (${newId()}, ${ids.order}, 1, ${ids.sku}, 'Tee', 'Black', 'M',
                ${SOLD_QUANTITY}, 150000.00, 450000.00, 'VND')`,
  );

  // The hold `APP12-B02` took at checkout, as `APP12-B05` left it: consumed,
  // with its expiry cleared, and its ledger entry already written.
  await executeRaw(
    db,
    sql`insert into inventory_reservations (id, sku_stock_id, order_id, quantity, status, expires_at)
        values (${ids.reservation}, ${ids.stock}, ${ids.order}, ${SOLD_QUANTITY},
                'CONSUMED', null)`,
  );
  await executeRaw(
    db,
    sql`insert into inventory_ledger_entries
          (sku_stock_id, order_id, reservation_id, entry_kind, quantity, on_hand_delta, actor_kind)
        values (${ids.stock}, ${ids.order}, ${ids.reservation}, 'CONSUMED',
                ${SOLD_QUANTITY}, ${-SOLD_QUANTITY}, 'SYSTEM')`,
  );

  // A `FULL` obligation carries no source quotation version
  // (`ck_payment_obligations__source_by_kind`), and a SATISFIED one needs real
  // evidence (`ck_payment_obligations__satisfied_evidence_required`) — so a
  // genuine SUCCEEDED attempt is written rather than the constraint worked around.
  await executeRaw(
    db,
    sql`insert into payment_obligations
          (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
        values (${ids.obligation}, ${ids.order}, 'FULL', 450000.00, 'VND', 'PENDING', null)`,
  );
  await executeRaw(
    db,
    sql`insert into payment_attempts
          (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
        values (${ids.attempt}, ${ids.obligation}, 450000.00, 'VND', 'BANK_TRANSFER',
                'SUCCEEDED', now())`,
  );
  await executeRaw(
    db,
    sql`update payment_obligations
        set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${ids.attempt}
        where id = ${ids.obligation}`,
  );

  return {
    orderId: ids.order,
    skuId: ids.sku,
    skuStockId: ids.stock,
    reservationId: ids.reservation,
    obligationId: ids.obligation,
    attemptId: ids.attempt,
  };
}

/** The SE-007 row, exactly as `PaymentDecisionRecorder.recordVerified` writes it. */
async function appendFullPaymentVerified(
  disposable: DisposableDatabase,
  order: SeededReadyMadeOrder,
): Promise<bigint> {
  const rows = await executeRaw<{ id: string }>(
    disposable.client.db,
    sql`insert into outbox_events
          (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
           status, attempt_count, next_attempt_at)
        values ('payment.verified', 'PAYMENT_ATTEMPT', ${order.attemptId},
                ${JSON.stringify({
                  paymentAttemptId: order.attemptId,
                  paymentObligationId: order.obligationId,
                  obligationKind: 'FULL',
                  orderId: order.orderId,
                })}::jsonb,
                1, 'PENDING', 0, now())
        returning id`,
  );
  return BigInt(String(rows[0]?.id));
}

describe('APP12-H03-C1 Ready-Made FULL payment.verified (integration)', () => {
  let context: InventoryReservationContext;
  let order: SeededReadyMadeOrder;
  let eventIds: readonly bigint[];
  let outcomes: readonly string[];

  beforeAll(async () => {
    context = await startInventoryReservationWorker('app12-h03-c1-ready-made-full');

    order = await seedVerifiedReadyMadeOrder(context.disposable, 'full');
    // Two rows, so redelivery is proven inside this case rather than by a second
    // seeded order: at-least-once permits the duplicate, and a no-op that were
    // secretly stateful would diverge on the second delivery.
    eventIds = [
      await appendFullPaymentVerified(context.disposable, order),
      await appendFullPaymentVerified(context.disposable, order),
    ];
    const first = await context.runOnce();
    const second = await context.runOnce();
    outcomes = [first?.outcome ?? 'NOT_CLAIMED', second?.outcome ?? 'NOT_CLAIMED'];
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  it('succeeds on both deliveries, with no retry and no dead-letter', () => {
    // Before this correction both were `FAILED_TERMINAL` with
    // `JOB_PAYLOAD_INVALID`, on the first attempt, forever.
    expect(outcomes).toEqual(['SUCCEEDED', 'SUCCEEDED']);
  });

  it('completes both outbox rows through the delivered success path', async () => {
    const events = await context.rows<{ status: string; last_error: string | null }>(
      sql`select status, last_error from outbox_events
          where aggregate_id = ${order.attemptId} order by id`,
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.status)).toEqual(['DISPATCHED', 'DISPATCHED']);
    expect(events.every((event) => event.last_error === null)).toBe(true);
  });

  it('files one SUCCEEDED attempt per delivery, and no terminal failure', async () => {
    const attempts = await context.rows<{ outcome: string; error_class: string | null }>(
      sql`select outcome, error_class from background_job_attempts
          where job_kind = 'INVENTORY_RESERVATION'
            AND job_key IN (${eventIds[0]?.toString()}, ${eventIds[1]?.toString()})
          order by id`,
    );

    expect(attempts).toHaveLength(2);
    expect(attempts.every((row) => row.outcome === 'SUCCEEDED')).toBe(true);
    expect(attempts.every((row) => row.error_class === null)).toBe(true);
  });

  it('creates no second reservation and leaves the first CONSUMED', async () => {
    const reservations = await context.rows<{ id: string; status: string }>(
      sql`select id, status from inventory_reservations where order_id = ${order.orderId}`,
    );

    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.id).toBe(order.reservationId);
    expect(reservations[0]?.status).toBe('CONSUMED');
  });

  it('decrements no stock a second time', async () => {
    const stock = await context.rows<{ quantity_on_hand: number }>(
      sql`select quantity_on_hand from sku_stocks where id = ${order.skuStockId}`,
    );

    expect(stock[0]?.quantity_on_hand).toBe(ON_HAND_AFTER_SALE);
  });

  it('writes no ledger entry of any kind', async () => {
    // Counted per kind, never as a total: a RESERVED row and a second CONSUMED
    // row are different defects, and both must be zero.
    expect(
      await countRows(
        context,
        sql`select count(*) as count from inventory_ledger_entries
            where order_id = ${order.orderId} and entry_kind = 'RESERVED'`,
      ),
    ).toBe(0);
    expect(
      await countRows(
        context,
        sql`select count(*) as count from inventory_ledger_entries
            where order_id = ${order.orderId} and entry_kind = 'CONSUMED'`,
      ),
    ).toBe(1);
  });

  it('records no reservation idempotency claim', async () => {
    // The handler returned before `reserve()`, so the `inventory.reserve`
    // namespace was never entered — which is what makes this a no-op rather
    // than a reservation that happened to find nothing to do.
    expect(
      await countRows(
        context,
        sql`select count(*) as count from idempotency_records
            where operation_namespace = 'inventory.reserve' and scope_key = ${order.orderId}`,
      ),
    ).toBe(0);
  });

  it('leaves the order and its obligation exactly as the verification left them', async () => {
    const rows = await context.rows<{ status: string }>(
      sql`select status from orders where id = ${order.orderId}`,
    );
    expect(rows[0]?.status).toBe('READY_FOR_DELIVERY');

    const obligations = await context.rows<{ status: string; satisfied_by_attempt_id: string }>(
      sql`select status, satisfied_by_attempt_id from payment_obligations
          where order_id = ${order.orderId}`,
    );
    expect(obligations).toHaveLength(1);
    expect(obligations[0]?.status).toBe('SATISFIED');
    expect(obligations[0]?.satisfied_by_attempt_id).toBe(order.attemptId);
  });
});
