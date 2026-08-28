/**
 * `APP9-E01` journey **2B** — the verified balance reaches the worker, and the
 * inventory it finds there is left exactly as it was.
 *
 * ### Why this journey lives in `apps/worker`
 *
 * `apps/api` may not import `apps/worker`, so `APP9-E01` meets in the database
 * rather than in one process. This file drives the **real** worker runtime —
 * real registry, real claim through `WorkerJobQueueRepository`, real lease, real
 * `JobExecutionService`, real execution idempotency, real
 * `InventoryPersistenceModule` — against a disposable PostgreSQL, exactly as a
 * deployed worker would. The API half asserts the produced `payment.verified`
 * row column by column; this half consumes a row of that asserted shape.
 *
 * ### What `APP9-W01` already answered, and what E01 asks instead
 *
 * `W01` proved the row-level behaviour of the balance no-op on an order that had
 * **never** been reserved: the payload parses, the job succeeds, nothing is
 * written. None of that is re-proved here.
 *
 * `E01` asks the composed question, which is the one that matters to a real
 * order: the order has *already* been reserved by APP8, because its deposit was
 * verified months earlier and that reservation is what production consumed. So
 * this file drives the DEPOSIT delivery first, through the same runtime, and
 * then asks whether the balance delivery disturbs the reservation set it finds
 * — the "no second inventory reservation" claim in its only meaningful form.
 *
 * Serial and single-attempt by design: `runOnce` claims from the whole queue,
 * so the cases here are happy paths that leave nothing retryable behind.
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
import {
  settleRemainingAndAnnounce,
  type SeededRemainingSettlement,
} from './app9-e01-remaining-fixture';

interface ReservationRow extends Record<string, unknown> {
  readonly id: string;
  readonly sku_stock_id: string;
  readonly quantity: number;
  readonly status: string;
}

/** The frozen line quantity and the shelf it is reserved from. */
const LINE_QUANTITY = 6;
const ON_HAND = 40;

describe('APP9-E01 J2B — a verified REMAINING payment reaches the worker and reserves nothing', () => {
  let context: InventoryReservationContext;
  let order: SeededOrder;
  let balance: SeededRemainingSettlement;
  /** The reservation set the DEPOSIT delivery left behind, read before the balance ran. */
  let reservationsBeforeBalance: readonly ReservationRow[];
  let outcome: string;

  beforeAll(async () => {
    context = await startInventoryReservationWorker('app9-e01-j2b');
    order = await seedDepositPaidOrder(context.disposable, {
      suffix: 'e01j2b',
      items: [{ sku: 'a', quantity: LINE_QUANTITY }],
      stock: { a: ON_HAND },
    });

    // APP8's half, driven through the real runtime: the official reservation the
    // balance delivery must find and leave alone.
    await appendPaymentVerifiedEvent(context.disposable, order);
    expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    reservationsBeforeBalance = await reservations();

    // APP9's half: the balance settled and announced exactly as `APP9-B03`'s
    // verification transaction commits it.
    balance = await settleRemainingAndAnnounce(context.disposable, order);
    outcome = (await context.runOnce())?.outcome ?? 'NOT_CLAIMED';
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  function reservations(): Promise<ReservationRow[]> {
    return context.rows<ReservationRow>(
      sql`SELECT id, sku_stock_id, quantity, status
            FROM inventory_reservations
           WHERE order_id = ${order.orderId}
           ORDER BY id`,
    );
  }

  function ledgerCount(kind: string): Promise<number> {
    return countRows(
      context,
      sql`SELECT count(*) AS count FROM inventory_ledger_entries
           WHERE order_id = ${order.orderId} AND entry_kind = ${kind}`,
    );
  }

  it('E01-11 — succeeds through the ordinary terminal path, with no dead-letter', async () => {
    expect(outcome).toBe('SUCCEEDED');

    // The same terminal state a reservation reaches. No DEAD_LETTER, no row left
    // PENDING for an operator to chase.
    const event = await context.rows<{ status: string }>(
      sql`SELECT status FROM outbox_events WHERE aggregate_id = ${balance.attemptId}`,
    );
    expect(event).toHaveLength(1);
    expect(event[0]?.status).toBe('DISPATCHED');

    // Filed in the ordinary attempt ledger, under the outbox event id every
    // other handler's attempts are keyed by. No reservation-specific evidence
    // table, and no error class.
    const attempts = await context.rows<{ outcome: string; error_class: string | null }>(
      sql`SELECT outcome, error_class FROM background_job_attempts
           WHERE job_kind = 'INVENTORY_RESERVATION' AND job_key = ${balance.eventId.toString()}`,
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('SUCCEEDED');
    expect(attempts[0]?.error_class).toBeNull();
  });

  it('E01-12 — leaves the deposit’s reservation set and the shelf exactly as it found them', async () => {
    // The reservation the DEPOSIT delivery created, still the only one and
    // byte-identical. A second reservation is the specific defect the delivered
    // `obligationKind` literal exists to prevent, and it would show up here as a
    // second row rather than as a changed quantity.
    const after = await reservations();
    expect(after).toHaveLength(1);
    expect(after).toEqual(reservationsBeforeBalance);
    expect(Number(after[0]?.quantity)).toBe(LINE_QUANTITY);
    expect(after[0]?.status).toBe('RESERVED');

    // Counted per `entry_kind`, never as a total: a second effect of a different
    // kind hides inside a sum (`APP8-B02` §9).
    expect(await ledgerCount('RESERVED')).toBe(1);
    expect(await ledgerCount('RESERVATION_RELEASED')).toBe(0);
    expect(await ledgerCount('CONSUMED')).toBe(0);

    // `sku_stocks` carries no reserved column — committed reservations *are* the
    // rows above — so what remains to prove is that on-hand did not move either.
    const stock = await context.rows<{ quantity_on_hand: number }>(
      sql`SELECT quantity_on_hand FROM sku_stocks WHERE sku_id = ${order.skuIds['a'] as string}`,
    );
    expect(stock).toHaveLength(1);
    expect(Number(stock[0]?.quantity_on_hand)).toBe(ON_HAND);

    // And the balance delivery filed no idempotency record of its own: the no-op
    // is stateless, so a redelivery cannot diverge from this one.
    expect(
      await countRows(
        context,
        sql`SELECT count(*) AS count FROM idempotency_records
             WHERE operation_namespace = 'inventory.reserve' AND scope_key = ${order.orderId}`,
      ),
    ).toBe(1);
  });
});
