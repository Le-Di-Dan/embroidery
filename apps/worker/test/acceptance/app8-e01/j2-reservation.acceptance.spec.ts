/**
 * `APP8-E01` journey **J2** — a verified deposit hands the order to APP8, and
 * the worker creates the exact official reservation set.
 *
 * ### Why this journey lives in `apps/worker`
 *
 * `apps/api` may not import `apps/worker`, so `APP8-E01` meets in the database
 * rather than in one process. This file drives the **real** worker runtime —
 * real registry, real claim through `WorkerJobQueueRepository`, real lease, real
 * `JobExecutionService`, real execution idempotency, real
 * `InventoryPersistenceModule` — against a disposable PostgreSQL, exactly as a
 * deployed worker would. The API journeys `J3`/`J4` then continue from the same
 * canonical AGG-07 writer this path calls.
 *
 * ### What is E01's question, and what is already W01's answer
 *
 * `APP8-W01` proved the row-level behaviours: aggregation, the COP no-op, the
 * insufficiency rollback, the missing-anchor refusal, the stale-deposit refusal,
 * the multi-SKU all-or-nothing set and the idempotency record. None of that is
 * re-proved here, and no failing case is driven in this file at all.
 *
 * What `E01` asks instead is whether the **handoff shape** is the one the Admin
 * production surface consumes: one active reservation keyed by `(order, SKU)`,
 * carrying the aggregated frozen quantity, with the goods still on the shelf —
 * because `APP8-B04`'s start looks the reservation up exactly that way and its
 * whole contract is that the units leave at *start*, not at reservation.
 *
 * Serial and single-attempt by design: `runOnce` claims from the whole queue, so
 * the cases here are happy paths that leave nothing retryable behind.
 */
import { sql } from '@embroidery/database';

import {
  countRows,
  startInventoryReservationWorker,
  type InventoryReservationContext,
} from '../../../src/jobs/inventory-reservation/tests/inventory-reservation-context';
import {
  appendPaymentVerifiedEvent,
  seedDepositPaidOrder,
  type SeededOrder,
} from '../../../src/jobs/inventory-reservation/tests/inventory-reservation-fixture';

interface ReservationRow extends Record<string, unknown> {
  readonly id: string;
  readonly sku_stock_id: string;
  readonly sku_id: string;
  readonly quantity: number;
  readonly status: string;
}

describe('APP8-E01 J2 — payment.verified becomes the official reservation', () => {
  let context: InventoryReservationContext;

  beforeAll(async () => {
    context = await startInventoryReservationWorker('app8-e01-j2');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  /**
   * The reservations as `APP8-B04`'s coordinator resolves them: joined to the
   * anchor so the SKU — the key the Admin start looks up by — is visible, and
   * restricted to the active state that start requires.
   */
  function activeReservations(order: SeededOrder): Promise<ReservationRow[]> {
    return context.rows<ReservationRow>(
      sql`SELECT r.id, r.sku_stock_id, s.sku_id, r.quantity, r.status
            FROM inventory_reservations r
            JOIN sku_stocks s ON s.id = r.sku_stock_id
           WHERE r.order_id = ${order.orderId} AND r.status = 'RESERVED'
           ORDER BY s.sku_id`,
    );
  }

  function ledgerCount(order: SeededOrder, kind: string): Promise<number> {
    return countRows(
      context,
      sql`SELECT count(*) AS count FROM inventory_ledger_entries
           WHERE order_id = ${order.orderId} AND entry_kind = ${kind}`,
    );
  }

  function onHand(order: SeededOrder, stockId: string): Promise<number> {
    return countRows(
      context,
      sql`SELECT quantity_on_hand AS count FROM sku_stocks WHERE id = ${stockId}`,
    ).then((value) => value);
  }

  // ---------------------------------------------------------------------------
  // E01-04 — a Catalog order, reserved once, with the goods still on the shelf.
  // ---------------------------------------------------------------------------
  describe('E01-04 — a Catalog order reserves exactly its frozen quantity', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      // Two frozen lines on one SKU: the reservation identity is `(order, SKU)`
      // per CST-016, never per order item, so the two lines must converge on one
      // row carrying their sum.
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'e01-04',
        items: [
          { sku: 'a', quantity: 4 },
          { sku: 'a', quantity: 6 },
        ],
        stock: { a: 40 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('creates one RESERVED row per (order, SKU) carrying the aggregated quantity', async () => {
      const rows = await activeReservations(order);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.sku_id).toBe(order.skuIds['a']);
      expect(rows[0]?.sku_stock_id).toBe(order.stockIds['a']);
      expect(Number(rows[0]?.quantity)).toBe(10);
      expect(rows[0]?.status).toBe('RESERVED');
    });

    it('appends the RESERVED ledger effect exactly once and issues no goods', async () => {
      expect(await ledgerCount(order, 'RESERVED')).toBe(1);
      // The reservation moves availability, never on-hand. `APP8-B04`'s start
      // is what takes the units off the shelf, and it has not run.
      expect(await ledgerCount(order, 'CONSUMED')).toBe(0);
      await expect(onHand(order, order.stockIds['a'] as string)).resolves.toBe(40);
    });
  });

  // ---------------------------------------------------------------------------
  // E01-05 — the mixed order: Catalog reserves, COP fabricates nothing.
  // ---------------------------------------------------------------------------
  describe('E01-05 — a mixed Catalog + customer-owned order stays truthful', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'e01-05',
        items: [
          { sku: 'a', quantity: 7 },
          { cop: true, quantity: 3 },
        ],
        stock: { a: 20 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('reserves the Catalog portion and invents no inventory identity for the COP line', async () => {
      const rows = await activeReservations(order);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.sku_id).toBe(order.skuIds['a']);
      expect(Number(rows[0]?.quantity)).toBe(7);

      // The COP line reaches inventory not at all: no second reservation, and
      // no stock anchor beyond the one Catalog SKU's (INV-13).
      const anchors = await countRows(
        context,
        sql`SELECT count(*) AS count FROM sku_stocks s
             WHERE s.sku_id IN (
               SELECT sku_id FROM order_items
                WHERE order_id = ${order.orderId} AND sku_id IS NOT NULL)`,
      );
      expect(anchors).toBe(1);
      expect(await ledgerCount(order, 'RESERVED')).toBe(1);

      // And the result is still a valid production subject: the order carries
      // one Catalog item and one customer-owned item, which is exactly the
      // reservation summary `APP8-B03`'s detail publishes.
      const items = await context.rows<{ catalog: string; cop: string }>(
        sql`SELECT count(*) FILTER (WHERE sku_id IS NOT NULL)::text AS catalog,
                   count(*) FILTER (WHERE customer_owned_product_id IS NOT NULL)::text AS cop
              FROM order_items WHERE order_id = ${order.orderId}`,
      );
      expect(items[0]).toEqual({ catalog: '1', cop: '1' });
    });
  });

  // ---------------------------------------------------------------------------
  // E01-06 — the at-least-once outbox contract converges.
  // ---------------------------------------------------------------------------
  describe('E01-06 — a redelivered payment.verified converges on one reservation set', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'e01-06',
        items: [{ sku: 'a', quantity: 5 }],
        stock: { a: 30 },
      });
      // Two outbox rows for one verification — the redelivery the outbox's
      // at-least-once contract permits. Both are claimed and executed through
      // the real runtime, one attempt at a time.
      await appendPaymentVerifiedEvent(context.disposable, order);
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('holds one reservation, one quantity and one ledger effect after both deliveries', async () => {
      const rows = await activeReservations(order);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]?.quantity)).toBe(5);
      // The lesson `APP8-B02` §9 recorded: count a specific `entry_kind`, never
      // a total, or a second effect of a different kind hides inside the sum.
      expect(await ledgerCount(order, 'RESERVED')).toBe(1);
      expect(await ledgerCount(order, 'RESERVATION_RELEASED')).toBe(0);
      expect(await ledgerCount(order, 'CONSUMED')).toBe(0);
      // Availability moved once, so the shelf is still whole.
      await expect(onHand(order, order.stockIds['a'] as string)).resolves.toBe(30);
    });
  });
});
