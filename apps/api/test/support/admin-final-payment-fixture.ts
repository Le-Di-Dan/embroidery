/**
 * Seeding for the `APP9-B03` Admin final-payment verification suite.
 *
 * Built on the two delivered fixtures rather than beside them: `APP7-B04`'s
 * `admin-payment-fixture` for the booted application, the bootstrapped operator
 * and the row readers, and `APP9-B02`'s `customer-final-payment-fixture` for the
 * canonical LC-14 walk. What is added here is the one shape neither of them
 * produces on its own — an order sitting at `AWAITING_FINAL_PAYMENT` with a
 * `PENDING` `BANK_TRANSFER` attempt against its **`REMAINING`** obligation.
 *
 * Every state is produced by the canonical writers. The order is moved by
 * `OrderRepository.transition` and the attempt is opened by
 * `PaymentObligationRepository.openAttempt`, so what the suite verifies against
 * is what production would have created.
 */
import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import { openAttempt, type SeededAttempt } from './admin-payment-fixture';
import { seedDeposit, SEEDED_REMAINING_AMOUNT } from './customer-deposit-fixture';
import { advanceOrderTo } from './customer-final-payment-fixture';

export { SEEDED_REMAINING_AMOUNT };

/**
 * One order at `AWAITING_FINAL_PAYMENT`, both obligations, and one `PENDING`
 * `BANK_TRANSFER` attempt on the `REMAINING` one.
 *
 * The **deposit** obligation is deliberately left `PENDING` with no attempt of
 * its own. That is not realistic — a real order reaches production with its
 * deposit satisfied — and it is the point: every assertion this suite makes
 * about the deposit staying untouched is then about a row that a defect could
 * plausibly have moved, rather than about one already in its final state.
 */
export interface SeededRemainingAttempt extends SeededAttempt {
  /** `ORD` + the order code body + `RM`, as the server derives it. */
  readonly expectedRemainingReference: string;
}

export async function seedRemainingAttempt(
  app: INestApplication,
  database: DisposableDatabase,
  options: {
    readonly suffix?: string;
    readonly status?: 'AWAITING_FINAL_PAYMENT' | 'PRODUCTION_COMPLETED';
  } = {},
): Promise<SeededRemainingAttempt> {
  const seeded = await seedDeposit(app, database, {
    suffix: options.suffix ?? newId().slice(0, 8),
    stepUpVerifiedSecondsAgo: 60,
  });

  await advanceOrderTo(app, seeded.orderId, options.status ?? 'AWAITING_FINAL_PAYMENT');

  const attemptId = await openAttempt(app, seeded.remainingObligationId, seeded.grantId);

  return {
    ...seeded,
    attemptId,
    // The DC memo, kept from the base fixture's contract so a case can prove the
    // wrong one is refused.
    expectedReference: `ORD${seeded.orderCode.slice('ORD-'.length)}DC`,
    expectedRemainingReference: `ORD${seeded.orderCode.slice('ORD-'.length)}RM`,
  };
}

export interface OutboxRow extends Record<string, unknown> {
  readonly event_type: string;
  readonly aggregate_id: string;
  readonly payload: {
    readonly paymentAttemptId?: string;
    readonly paymentObligationId?: string;
    readonly obligationKind?: string;
    readonly orderId?: string;
  };
}

/**
 * Every outbox row for one attempt, payload included.
 *
 * The payload is what B03 exists to get right, so the suite reads it rather than
 * counting rows: a `REMAINING` settlement announced as `DEPOSIT` would pass any
 * count-only assertion while telling the reservation consumer to reserve stock a
 * second time.
 */
export async function readOutboxFor(
  database: DisposableDatabase,
  attemptId: string,
): Promise<OutboxRow[]> {
  const { rows } = await database.client.db.execute<OutboxRow>(sql`
    select event_type, aggregate_id, payload
      from outbox_events
     where aggregate_id = ${attemptId}
     order by created_at asc, id asc
  `);
  return rows;
}

export interface TransitionRow extends Record<string, unknown> {
  readonly from_status: string;
  readonly to_status: string;
  readonly event_kind: string;
  readonly actor_kind: string;
}

export async function readTransitions(
  database: DisposableDatabase,
  orderId: string,
): Promise<TransitionRow[]> {
  const { rows } = await database.client.db.execute<TransitionRow>(sql`
    select from_status, to_status, event_kind, actor_kind
      from order_transitions
     where order_id = ${orderId}
     order by id asc
  `);
  return rows;
}

export interface ObligationSnapshotRow extends Record<string, unknown> {
  readonly kind: string;
  readonly status: string;
  readonly satisfied_by_attempt_id: string | null;
  readonly attempts: string;
  readonly reconciliations: string;
}

/**
 * Per-kind obligation state, attempt count and reconciliation count.
 *
 * Per **kind** deliberately: a total across the order cannot tell "the balance
 * was settled" from "the deposit was settled", which is the exact confusion this
 * checkpoint has to rule out on every case.
 */
export async function obligationSnapshot(
  database: DisposableDatabase,
  orderId: string,
): Promise<ObligationSnapshotRow[]> {
  const { rows } = await database.client.db.execute<ObligationSnapshotRow>(sql`
    select o.kind,
           o.status,
           o.satisfied_by_attempt_id,
           (select count(*)::text from payment_attempts a
             where a.payment_obligation_id = o.id) as attempts,
           (select count(*)::text from payment_reconciliations r
             where r.payment_obligation_id = o.id) as reconciliations
      from payment_obligations o
     where o.order_id = ${orderId}
     order by o.kind
  `);
  return rows;
}
