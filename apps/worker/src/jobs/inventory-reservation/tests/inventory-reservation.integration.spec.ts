/**
 * `payment.verified` → the order's official inventory reservation, against a
 * real PostgreSQL (`APP8-W01` §19.1, cases 1–9).
 *
 * The whole runtime is live: the row is claimed through
 * `WorkerJobQueueRepository`, leased, executed by `JobExecutionService` and
 * completed through the guarded seam, using the canonical
 * `@embroidery/persistence` inventory implementation. So what these assertions
 * observe is what a deployed worker would write, and the redelivery case
 * exercises the delivered execution idempotency rather than a stand-in for it.
 *
 * Every assertion is on database rows, not on return values — and the ledger
 * assertions count a **specific `entry_kind`** rather than a total, which is the
 * lesson `APP8-B02` §9 recorded: a total hides a second effect of a different
 * kind landing on the same reservation.
 */
import { sql } from '@embroidery/database';

import { JobHandlerRegistry } from '../../../runtime/registry/job-handler.registry';
import {
  countRows,
  runNextAttempt,
  startInventoryReservationWorker,
  type InventoryReservationContext,
} from './inventory-reservation-context';
import {
  appendPaymentVerifiedEvent,
  seedDepositPaidOrder,
  type SeededOrder,
} from './inventory-reservation-fixture';

interface ReservationRow extends Record<string, unknown> {
  readonly id: string;
  readonly sku_stock_id: string;
  readonly order_id: string;
  readonly quantity: number;
  readonly status: string;
  readonly expires_at: string | null;
}

describe('APP8-W01 payment.verified inventory reservation (integration)', () => {
  let context: InventoryReservationContext;

  beforeAll(async () => {
    context = await startInventoryReservationWorker('app8-w01-reservation');
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  function reservations(order: SeededOrder): Promise<ReservationRow[]> {
    return context.rows<ReservationRow>(
      sql`SELECT * FROM inventory_reservations WHERE order_id = ${order.orderId}
          ORDER BY sku_stock_id`,
    );
  }

  /** `RESERVED` ledger rows for this order, counted by kind (never a total). */
  function reservedLedgerCount(order: SeededOrder): Promise<number> {
    return countRows(
      context,
      sql`SELECT count(*) AS count FROM inventory_ledger_entries
          WHERE order_id = ${order.orderId} AND entry_kind = 'RESERVED'`,
    );
  }

  function stockRowCount(order: SeededOrder): Promise<number> {
    return countRows(
      context,
      sql`SELECT count(*) AS count FROM sku_stocks
          WHERE sku_id IN (
            SELECT sku_id FROM order_items
            WHERE order_id = ${order.orderId} AND sku_id IS NOT NULL
          )`,
    );
  }

  /**
   * Drives one failing job all the way to its dead-letter, and returns both
   * attempt outcomes.
   *
   * Two reasons, and the second is not optional. It proves the bounded retry the
   * runtime owns — an operational refusal retries once and then dead-letters,
   * never loops. And it leaves the queue **empty** before the next case seeds:
   * `runOnce` claims whatever row is due across the whole queue, so a case that
   * left a retryable job behind would have its successor claim that job instead
   * of its own, and the assertion would be about someone else's order.
   */
  async function drainToDeadLetter(): Promise<readonly [string, string]> {
    const first = await context.runOnce();
    const second = await runNextAttempt(context);
    return [first?.outcome ?? 'NOT_CLAIMED', second.outcome];
  }

  it('registers exactly one production handler for payment.verified', () => {
    const registry = context.get<JobHandlerRegistry>(JobHandlerRegistry);
    const registered = registry.registeredTypes();

    // The claim filter is exactly the registered types, so this is also the
    // proof that a live worker asks the queue for `payment.verified` at all —
    // which nothing did before this checkpoint.
    expect(registered).toContainEqual({
      eventType: 'payment.verified',
      jobKind: 'INVENTORY_RESERVATION',
    });
    expect(registered.filter((type) => type.eventType === 'payment.verified')).toHaveLength(1);
  });

  describe('case 1 — Catalog-only, one SKU', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c1',
        items: [{ sku: 'a', quantity: 4 }],
        stock: { a: 10 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('creates exactly one reservation, for the frozen quantity, on the right anchor', async () => {
      const rows = await reservations(order);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.quantity).toBe(4);
      expect(rows[0]?.status).toBe('RESERVED');
      expect(rows[0]?.sku_stock_id).toBe(order.stockIds['a']);
      expect(rows[0]?.order_id).toBe(order.orderId);
    });

    it('appends the RESERVED ledger effect exactly once', async () => {
      expect(await reservedLedgerCount(order)).toBe(1);
    });

    it('writes a no-expiry reservation and does not touch on-hand', async () => {
      // `PO-APP8-002`: `expires_at = NULL` is this table's explicit no-expiry
      // marker. Reserving commits availability; only consumption reduces on-hand.
      const rows = await reservations(order);
      expect(rows[0]?.expires_at).toBeNull();

      const [stock] = await context.rows<{ quantity_on_hand: number }>(
        sql`SELECT quantity_on_hand FROM sku_stocks WHERE id = ${order.stockIds['a']}`,
      );
      expect(stock?.quantity_on_hand).toBe(10);
    });

    it('records the SYSTEM actor the accepted authority names', async () => {
      // `PO-APP8-003`: SYSTEM is the actor for the payment.verified consumer.
      const [entry] = await context.rows<{ actor_kind: string; system_job_key: string | null }>(
        sql`SELECT actor_kind, system_job_key FROM inventory_ledger_entries
            WHERE order_id = ${order.orderId} AND entry_kind = 'RESERVED'`,
      );
      expect(entry?.actor_kind).toBe('SYSTEM');
      expect(entry?.system_job_key).toBe('inventory.reserve');
    });
  });

  describe('case 2 — two Catalog items on one SKU aggregate into one reservation', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c2',
        items: [
          { sku: 'x', quantity: 2 },
          { sku: 'x', quantity: 3 },
        ],
        stock: { x: 10 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('creates ONE reservation whose quantity is the sum', async () => {
      // `CST-016` allows one active RESERVED row per (order, stock). A per-item
      // implementation would have collided with that index on the second insert.
      const rows = await reservations(order);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.quantity).toBe(5);
    });

    it('appends one RESERVED ledger effect, not two', async () => {
      expect(await reservedLedgerCount(order)).toBe(1);
    });
  });

  describe('case 3 — mixed Catalog + COP', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c3',
        items: [
          { sku: 'a', quantity: 2 },
          { cop: true, quantity: 7 },
          { sku: 'b', quantity: 1 },
        ],
        stock: { a: 10, b: 10 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('reserves the Catalog quantities only, and never the COP quantity', async () => {
      const rows = await reservations(order);

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.quantity).sort()).toEqual([1, 2]);
      // The COP item's 7 appears nowhere: not as a third reservation, and not
      // added to either Catalog quantity.
      expect(rows.some((row) => row.quantity === 7)).toBe(false);
    });

    it('fabricates no SKU and no stock row for the COP item', async () => {
      // Two `skus` rows were seeded and two anchors created; the COP item added
      // neither. `sku_stocks` is counted through the order's own Catalog SKUs.
      expect(await stockRowCount(order)).toBe(2);
      expect(await reservedLedgerCount(order)).toBe(2);
    });
  });

  describe('case 4 — COP-only is a successful inventory no-op', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c4',
        items: [{ cop: true, quantity: 3 }],
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('succeeds with zero reservations, zero stock rows and zero ledger effects', async () => {
      // `PO-APP8-001` Option A: the absence is expected behaviour, never an
      // error, so this must not retry or dead-letter.
      expect(await reservations(order)).toHaveLength(0);
      expect(await stockRowCount(order)).toBe(0);
      expect(await reservedLedgerCount(order)).toBe(0);
    });
  });

  describe('case 5 — a redelivered payment.verified converges', () => {
    let order: SeededOrder;

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c5',
        items: [
          { sku: 'a', quantity: 2 },
          { sku: 'b', quantity: 3 },
        ],
        stock: { a: 10, b: 10 },
      });
      // Two outbox rows for one verification: the redelivery the outbox's
      // at-least-once contract permits. Both are claimed and executed through
      // the real runtime, one attempt at a time.
      await appendPaymentVerifiedEvent(context.disposable, order);
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
      expect((await context.runOnce())?.outcome).toBe('SUCCEEDED');
    }, 300_000);

    it('leaves one reservation per SKU, with no doubled quantity', async () => {
      const rows = await reservations(order);

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.quantity).sort()).toEqual([2, 3]);
    });

    it('appends no duplicate RESERVED ledger effect', async () => {
      expect(await reservedLedgerCount(order)).toBe(2);
    });

    it('holds exactly one completed inventory.reserve record for the order', async () => {
      const records = await context.rows<{ status: string }>(
        sql`SELECT status FROM idempotency_records
            WHERE operation_namespace = 'inventory.reserve' AND scope_key = ${order.orderId}`,
      );

      expect(records).toHaveLength(1);
      expect(records[0]?.status).toBe('COMPLETED');
    });
  });

  describe('case 6 — insufficient stock', () => {
    let order: SeededOrder;
    let attempts: readonly [string, string];

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c6',
        items: [{ sku: 'a', quantity: 9 }],
        stock: { a: 4 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      attempts = await drainToDeadLetter();
    }, 300_000);

    it('creates no reservation and no ledger effect', async () => {
      expect(await reservations(order)).toHaveLength(0);
      expect(await reservedLedgerCount(order)).toBe(0);
    });

    it('never oversubscribes: on-hand is untouched and no quantity was reduced', async () => {
      // Not silently reduced to 4, not backordered, not substituted.
      const [stock] = await context.rows<{ quantity_on_hand: number }>(
        sql`SELECT quantity_on_hand FROM sku_stocks WHERE id = ${order.stockIds['a']}`,
      );
      expect(stock?.quantity_on_hand).toBe(4);
    });

    it('leaves no committed idempotency claim behind', async () => {
      // The claim shares the reservation's transaction, so the rollback removes
      // it — a retry claims again rather than replaying a failure as success.
      expect(
        await countRows(
          context,
          sql`SELECT count(*) AS count FROM idempotency_records
              WHERE operation_namespace = 'inventory.reserve' AND scope_key = ${order.orderId}`,
        ),
      ).toBe(0);
    });

    it('dead-letters at the attempt cap rather than retrying forever', async () => {
      // The runtime owns bounded retry; W01 invents no loop and no notification.
      // `TR-LC17-04`'s "admin alerted" is this dead-letter row.
      expect(attempts).toEqual(['FAILED_RETRYABLE', 'FAILED_TERMINAL']);
      const [event] = await context.rows<{ status: string }>(
        sql`SELECT o.status FROM outbox_events o
            WHERE o.aggregate_id = ${order.paymentAttemptId}`,
      );
      expect(event?.status).toBe('DEAD_LETTER');
    });
  });

  describe('case 7 — a multi-SKU set is all-or-nothing', () => {
    let order: SeededOrder;
    let attempts: readonly [string, string];

    beforeAll(async () => {
      // Labels sort to a < b, and requirements are locked in ascending SKU id,
      // which the fixture assigns in sorted-label order. So `a` is processed
      // first and would succeed on its own; `b` is short and fails second.
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c7',
        items: [
          { sku: 'a', quantity: 2 },
          { sku: 'b', quantity: 8 },
        ],
        stock: { a: 10, b: 3 },
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      attempts = await drainToDeadLetter();
    }, 300_000);

    it('fails the whole attempt, then dead-letters', () => {
      expect(attempts).toEqual(['FAILED_RETRYABLE', 'FAILED_TERMINAL']);
    });

    it('commits NO reservation for the order, including the one that succeeded', async () => {
      // The transaction is the atomicity: the first SKU's insert and its ledger
      // row roll back with the second SKU's refusal. No compensating release is
      // written to imitate this.
      expect(await reservations(order)).toHaveLength(0);
    });

    it('commits no reservation ledger effect for the whole attempt', async () => {
      expect(await reservedLedgerCount(order)).toBe(0);
    });

    it('is not vacuous: the same order reserves both SKUs once the shortfall is fixed', async () => {
      // Without this, "0 reservations" could mean the first requirement was
      // never reachable rather than rolled back. Here the *only* thing that
      // changes is `b`'s on-hand — `TR-LC17-04`'s own stated resolution, "admin
      // restock" — and the identical order then reserves `a` **and** `b`. So the
      // earlier zero was the rollback of a reservation that had already been
      // created inside the failed transaction, which is exactly §7's claim.
      await context.rows(
        sql`UPDATE sku_stocks SET quantity_on_hand = 20 WHERE id = ${order.stockIds['b']}`,
      );
      await appendPaymentVerifiedEvent(context.disposable, order);
      expect((await runNextAttempt(context)).outcome).toBe('SUCCEEDED');

      const rows = await reservations(order);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.quantity).sort()).toEqual([2, 8]);
      expect(await reservedLedgerCount(order)).toBe(2);
    });
  });

  describe('case 8 — a missing stock anchor is an operational failure', () => {
    let order: SeededOrder;
    let attempts: readonly [string, string];

    beforeAll(async () => {
      // `stock` omits the label, so the SKU exists with no `sku_stocks` row.
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c8',
        items: [{ sku: 'a', quantity: 1 }],
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      attempts = await drainToDeadLetter();
    }, 300_000);

    it('flows through the existing worker failure semantics', () => {
      // Retried on the global schedule and dead-lettered at the cap — the
      // delivered path an operator queries, not a new manual-review subsystem.
      expect(attempts).toEqual(['FAILED_RETRYABLE', 'FAILED_TERMINAL']);
    });

    it('does NOT lazily create the anchor', async () => {
      // `APP8-B01` made anchor creation an Admin inventory operation. A paid
      // order referencing an uninitialised SKU must not create a zero-stock row.
      expect(await stockRowCount(order)).toBe(0);
    });

    it('creates no reservation', async () => {
      expect(await reservations(order)).toHaveLength(0);
    });
  });

  describe('case 9 — a stale event whose deposit is not satisfied', () => {
    let order: SeededOrder;
    let attempts: readonly [string, string];

    beforeAll(async () => {
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c9',
        items: [{ sku: 'a', quantity: 1 }],
        stock: { a: 10 },
        depositStatus: 'PENDING',
      });
      await appendPaymentVerifiedEvent(context.disposable, order);
      attempts = await drainToDeadLetter();
    }, 300_000);

    it('never reserves, and reaches the operator through the delivered path', () => {
      expect(attempts).toEqual(['FAILED_RETRYABLE', 'FAILED_TERMINAL']);
    });

    it('is blocked by the shared DepositEligibilityPort, not by a worker predicate', async () => {
      // The order, the SKU and the stock are all valid; the only thing missing
      // is the SATISFIED obligation. The refusal therefore comes from
      // `ReservationEligibilityGuard` inside the canonical repository — the one
      // implementation of GRD-013 — because the worker holds no deposit check
      // of its own to have caught it first.
      expect(await reservations(order)).toHaveLength(0);
      expect(await reservedLedgerCount(order)).toBe(0);
    });
  });
  describe('case 10 — a verified REMAINING payment is consumed, and reserves nothing', () => {
    let order: SeededOrder;
    let outcomes: readonly string[];
    let eventIds: readonly bigint[];

    beforeAll(async () => {
      // `FU-APP8-W01-01`: before `APP9-W01` this exact row was refused by the
      // payload parser as `JOB_PAYLOAD_INVALID` and dead-lettered terminally.
      order = await seedDepositPaidOrder(context.disposable, {
        suffix: 'c10',
        items: [{ sku: 'a', quantity: 3 }],
        stock: { a: 10 },
      });
      // Two rows, so redelivery is proven inside this case rather than by a
      // second seeded order: at-least-once permits the duplicate, and a no-op
      // that were secretly stateful would diverge on the second delivery.
      eventIds = [
        await appendPaymentVerifiedEvent(context.disposable, order, {
          obligationKind: 'REMAINING',
        }),
        await appendPaymentVerifiedEvent(context.disposable, order, {
          obligationKind: 'REMAINING',
        }),
      ];
      const first = await context.runOnce();
      const second = await context.runOnce();
      outcomes = [first?.outcome ?? 'NOT_CLAIMED', second?.outcome ?? 'NOT_CLAIMED'];
    }, 300_000);

    it('succeeds on both deliveries, with no retry and no dead-letter', () => {
      expect(outcomes).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    });

    it('completes both outbox rows through the delivered success path', async () => {
      const events = await context.rows<{ status: string }>(
        sql`SELECT status FROM outbox_events
            WHERE aggregate_id = ${order.paymentAttemptId}`,
      );

      // The same terminal state a reservation reaches. No DEAD_LETTER, no row
      // left PENDING for an operator to chase, and no "consumed remaining
      // payments" table invented to record that the handler was here.
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.status)).toEqual(['DISPATCHED', 'DISPATCHED']);
    });

    it('files one SUCCEEDED attempt per delivery in the ordinary ledger', async () => {
      // `job_key` is the outbox event id — the same linkage every other handler's
      // attempts are filed under. No reservation-specific evidence table.
      const attemptRows = await context.rows<{ outcome: string; error_class: string | null }>(
        sql`SELECT outcome, error_class FROM background_job_attempts
            WHERE job_kind = 'INVENTORY_RESERVATION'
              AND job_key IN (${eventIds[0]?.toString()}, ${eventIds[1]?.toString()})
            ORDER BY id`,
      );

      expect(attemptRows).toHaveLength(2);
      expect(attemptRows.every((row) => row.outcome === 'SUCCEEDED')).toBe(true);
      expect(attemptRows.every((row) => row.error_class === null)).toBe(true);
    });

    it('creates no reservation, no ledger effect and no idempotency record', async () => {
      expect(await reservations(order)).toHaveLength(0);
      expect(await reservedLedgerCount(order)).toBe(0);
      expect(
        await countRows(
          context,
          sql`SELECT count(*) AS count FROM idempotency_records
              WHERE operation_namespace = 'inventory.reserve' AND scope_key = ${order.orderId}`,
        ),
      ).toBe(0);
    });

    it('leaves the SKU anchor untouched', async () => {
      // `sku_stocks` carries no reserved column: committed stock *is* the
      // `inventory_reservations` rows, which the assertion above counts at zero.
      // What remains to prove is that on-hand was not moved either.
      const stock = await context.rows<{ quantity_on_hand: number }>(
        sql`SELECT quantity_on_hand FROM sku_stocks
            WHERE sku_id = ${order.skuIds['a'] as string}`,
      );

      expect(stock).toHaveLength(1);
      expect(stock[0]?.quantity_on_hand).toBe(10);
    });
  });
});
