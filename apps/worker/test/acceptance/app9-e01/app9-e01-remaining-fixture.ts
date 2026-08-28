/**
 * The one shape `APP9-E01`'s worker half adds — the `REMAINING` half of a
 * settled order.
 *
 * Built **on** `inventory-reservation-fixture`, not beside it: that fixture
 * already seeds the whole Catalog/commission chain, the order, the stock
 * anchors, the `DEPOSIT` obligation and its succeeded attempt, and appends the
 * SE-007 outbox row exactly as `PaymentDecisionRecorder.recordVerified` writes
 * it. Re-seeding any of that here would be a second, drifting copy.
 *
 * What this module adds is the pair `APP9-B03`'s verification commits and no
 * worker fixture had before: a **`SATISFIED` `REMAINING` obligation** with its
 * own `SUCCEEDED` attempt, so the `payment.verified` row the worker consumes
 * names obligation and attempt rows that actually exist and actually carry the
 * `REMAINING` kind — rather than borrowing the deposit's ids and relabelling
 * them in the payload.
 *
 * ### Why this file exists at all, and what it deliberately does not claim
 *
 * `apps/api` may not import `apps/worker`, so `APP9-E01` meets in the database:
 * the API half (`apps/api/test/acceptance/app9-e01`) drives the real Admin
 * verification and asserts the produced `outbox_events` row **column by column**
 * — event type, aggregate kind, aggregate id, payload schema version and all
 * four payload keys — and this file inserts a row of exactly that asserted
 * shape for the real worker runtime to claim. The two are kept honest by that
 * shared, asserted column list; neither half hands the other a live row, and
 * this file does not pretend otherwise.
 *
 * Test-only.
 */
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';

import type { SeededOrder } from '../../../src/jobs/inventory-reservation/tests/inventory-reservation-fixture';

/** The balance amount, distinct from the fixture's `300000.00` deposit. */
const REMAINING_AMOUNT = '700000.00';

export interface SeededRemainingSettlement {
  readonly obligationId: string;
  readonly attemptId: string;
  /** The `outbox_events.id` of the appended `payment.verified` row. */
  readonly eventId: bigint;
}

/**
 * Settles the balance of an already-seeded order and announces it.
 *
 * The three writes `APP9-B03`'s verification transaction commits, in its order:
 * the obligation, the attempt that satisfies it, and the SE-007 row naming both
 * with `obligationKind: 'REMAINING'`.
 */
export async function settleRemainingAndAnnounce(
  disposable: DisposableDatabase,
  order: SeededOrder,
  quotationVersionId?: string,
): Promise<SeededRemainingSettlement> {
  const db = disposable.client.db;
  const obligationId = newId();
  const attemptId = newId();

  // `source_quotation_version_id` is the deposit obligation's own, read back
  // rather than passed in, so the pair is attributed to one accepted quotation
  // exactly as `APP7-W01`'s conversion writes it.
  const source =
    quotationVersionId ??
    (
      await executeRaw<{ source_quotation_version_id: string }>(
        db,
        sql`SELECT source_quotation_version_id FROM payment_obligations
             WHERE id = ${order.paymentObligationId}`,
      )
    )[0]?.source_quotation_version_id;

  await executeRaw(
    db,
    sql`INSERT INTO payment_obligations
          (id, order_id, kind, amount, currency_code, status, source_quotation_version_id)
        VALUES (${obligationId}, ${order.orderId}, 'REMAINING', ${REMAINING_AMOUNT}, 'VND',
                'PENDING', ${source})`,
  );
  await executeRaw(
    db,
    sql`INSERT INTO payment_attempts
          (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
        VALUES (${attemptId}, ${obligationId}, ${REMAINING_AMOUNT}, 'VND', 'BANK_TRANSFER',
                'SUCCEEDED', now())`,
  );
  // `ck_payment_obligations__satisfied_evidence_required` refuses a SATISFIED
  // row without both columns, which is why the attempt is written first.
  await executeRaw(
    db,
    sql`UPDATE payment_obligations
           SET status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attemptId}
         WHERE id = ${obligationId}`,
  );

  const rows = await executeRaw<{ id: string }>(
    db,
    sql`
      INSERT INTO outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, next_attempt_at)
      VALUES
        ('payment.verified', 'PAYMENT_ATTEMPT', ${attemptId},
         ${JSON.stringify({
           paymentAttemptId: attemptId,
           paymentObligationId: obligationId,
           obligationKind: 'REMAINING',
           orderId: order.orderId,
         })}::jsonb,
         1, 'PENDING', 0, now())
      RETURNING id
    `,
  );

  return { obligationId, attemptId, eventId: BigInt((rows[0] as { id: string }).id) };
}
