/**
 * Seeding for the `APP9-B02` customer final-payment suite.
 *
 * Built **on** `customer-deposit-fixture`, not beside it. That fixture already
 * creates the whole chain this surface walks — a real customer, a real custom
 * request, a `REQUEST_ACCESS` grant whose row holds the peppered digest of a
 * token it mints, an order created through `OrderRepository`, and *both*
 * `CST-039` obligations written by the canonical AGG-16 writer in one
 * transaction. Re-seeding any of that here would be a second, drifting copy of
 * APP7's order-conversion shape, and the point of B02 is that it reuses APP7's
 * foundation.
 *
 * What this module adds is the one thing APP9 changed: the order's LC-14
 * position. `seedDeposit` leaves it at `AWAITING_DEPOSIT`, where the balance
 * exists but is not payable; `advanceOrderTo` walks it forward through the legal
 * LC-14 path using the canonical `OrderRepository.transition`, never an `update`
 * statement, so the states these cases assert against are states the production
 * writer actually produces.
 */
import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type AttemptId,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { ORDER_REPOSITORY } from '../../src/modules/order/domain/repositories/order.repository';
import type {
  OrderId,
  OrderRepository,
} from '../../src/modules/order/domain/repositories/order.repository';
import {
  seedDeposit,
  type SeedDepositOptions,
  type SeededDeposit,
} from './customer-deposit-fixture';

export {
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_REMAINING_AMOUNT,
  applyDepositSecretEnv as applyFinalPaymentSecretEnv,
  attemptsOf,
  mintToken,
  publishDepositPolicies as publishFinalPaymentPolicies,
  seedGrantWithoutOrder,
  type SeededDeposit,
} from './customer-deposit-fixture';

export const FINAL_PAYMENT_ROUTES = {
  read: `/${GLOBAL_ROUTE_PREFIX}/public/orders/final-payment`,
  qr: `/${GLOBAL_ROUTE_PREFIX}/public/orders/final-payment/qr`,
  attempts: `/${GLOBAL_ROUTE_PREFIX}/public/orders/final-payment/attempts`,
} as const;

/**
 * The legal LC-14 walk to each state a B02 case needs.
 *
 * Spelled out rather than searched for: `ALLOWED` is authority, and a fixture
 * that discovered its own path could silently start seeding through a move
 * `DB3_LIFECYCLE_SPECIFICATIONS.md` never sanctioned.
 */
const PATH_TO: Readonly<Partial<Record<OrderState, readonly OrderState[]>>> = {
  AWAITING_DEPOSIT: [],
  DEPOSIT_PAID: ['DEPOSIT_PAID'],
  IN_PRODUCTION: ['DEPOSIT_PAID', 'IN_PRODUCTION'],
  PRODUCTION_COMPLETED: ['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED'],
  AWAITING_FINAL_PAYMENT: [
    'DEPOSIT_PAID',
    'IN_PRODUCTION',
    'PRODUCTION_COMPLETED',
    'AWAITING_FINAL_PAYMENT',
  ],
  // `ON_HOLD` out of the payable state, which is the one non-payable position a
  // customer can plausibly be looking at their payment page from.
  ON_HOLD: [
    'DEPOSIT_PAID',
    'IN_PRODUCTION',
    'PRODUCTION_COMPLETED',
    'AWAITING_FINAL_PAYMENT',
    'ON_HOLD',
  ],
  READY_FOR_DELIVERY: [
    'DEPOSIT_PAID',
    'IN_PRODUCTION',
    'PRODUCTION_COMPLETED',
    'AWAITING_FINAL_PAYMENT',
    'READY_FOR_DELIVERY',
  ],
};

export interface SeedFinalPaymentOptions extends SeedDepositOptions {
  /** Where to leave the order. Defaults to the one payable state. */
  readonly status?: OrderState;
}

/**
 * Seeds the whole chain and leaves the order in the requested LC-14 state.
 *
 * The obligations are untouched: `REMAINING` stays `PENDING` at whatever amount
 * `APP7-W01`'s writer produced. A case that needs it `SUPERSEDED` or `SATISFIED`
 * says so explicitly through the helpers below, so no test's premise is hidden
 * inside this function.
 */
export async function seedFinalPayment(
  app: INestApplication,
  database: DisposableDatabase,
  options: SeedFinalPaymentOptions = {},
): Promise<SeededDeposit> {
  const seeded = await seedDeposit(app, database, options);
  await advanceOrderTo(app, seeded.orderId, options.status ?? 'AWAITING_FINAL_PAYMENT');
  return seeded;
}

/**
 * One legal LC-14 move, through the canonical writer.
 *
 * For a case that has already seeded its order somewhere and needs the next step
 * only. `advanceOrderTo` always replays the whole path from `AWAITING_DEPOSIT`,
 * so calling it on an order that has already moved would ask the repository for
 * a transition it correctly refuses.
 */
export async function transitionOrderTo(
  app: INestApplication,
  orderId: string,
  to: OrderState,
): Promise<void> {
  const orders = app.get<OrderRepository>(ORDER_REPOSITORY);
  await app.get(TransactionManager).runInTransaction(() =>
    orders.transition({
      id: orderId as OrderId,
      to,
      actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
      ...(to === 'ON_HOLD' ? { reason: 'Seeded hold.' } : {}),
      correlationId: newId(),
    }),
  );
}

/** Walks one order forward from `AWAITING_DEPOSIT` through the canonical writer. */
export async function advanceOrderTo(
  app: INestApplication,
  orderId: string,
  status: OrderState,
): Promise<void> {
  const orders = app.get<OrderRepository>(ORDER_REPOSITORY);
  const transactions = app.get(TransactionManager);

  for (const to of PATH_TO[status] ?? []) {
    await transactions.runInTransaction(() =>
      orders.transition({
        id: orderId as OrderId,
        to,
        actor: { kind: 'SYSTEM', systemJobKey: 'test.seed' },
        ...(to === 'ON_HOLD' ? { reason: 'Seeded hold.' } : {}),
        correlationId: newId(),
      }),
    );
  }
}

/**
 * Supersedes one obligation directly.
 *
 * `APP9-B04` owns the real shipping-fee recalculation that produces this state,
 * and it is not delivered. Writing the status rather than inventing a
 * recalculation path is the honest way to reach the row shape B02 must refuse
 * on: what B02 is responsible for is *not resolving a non-live obligation*, and
 * the status column is exactly what `findLiveForOrder` filters on.
 */
export async function supersedeObligation(
  database: DisposableDatabase,
  obligationId: string,
): Promise<void> {
  await database.client.db.execute(
    sql`update payment_obligations set status = 'SUPERSEDED' where id = ${obligationId}`,
  );
}

/**
 * Leaves one obligation `SATISFIED`, by the canonical route.
 *
 * Not an `update`: `ck_payment_obligations__satisfied_evidence_required` refuses
 * a satisfied row with no satisfying attempt, and G-DB7-06/G-DB7-33 require that
 * attempt to belong to the obligation, to have `SUCCEEDED`, and to match its
 * amount and currency. So the fixture walks the two AGG-16 writers `APP9-B03`
 * will walk — `settleAttempt` then `satisfy` — against an attempt the customer
 * surface itself opened. The state Case G reads is therefore a state production
 * can actually produce, which is the only version of it worth asserting on.
 *
 * The Admin verification *transaction* is still `APP9-B03`'s and is not
 * simulated here: no reconciliation is appended and no order is moved.
 */
export async function satisfyThroughVerification(
  app: INestApplication,
  obligationId: string,
  attemptId: string,
): Promise<void> {
  const obligations = app.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
  const transactions = app.get(TransactionManager);
  const at = new Date();

  await transactions.runInTransaction(async () => {
    await obligations.settleAttempt(attemptId as AttemptId, 'SUCCEEDED', at);
    await obligations.satisfy(obligationId as ObligationId, attemptId as AttemptId, at);
  });
}

export interface ObligationSnapshotRow extends Record<string, unknown> {
  readonly kind: string;
  readonly status: string;
  readonly amount: string;
  readonly attempts: string;
}

/**
 * Per-kind obligation state and attempt count for one order.
 *
 * Per **kind**, deliberately: a total attempt count cannot tell "one attempt was
 * opened on the balance" from "one was opened on the deposit", which is the
 * exact confusion every case in this suite exists to rule out.
 */
export async function obligationSnapshot(
  database: DisposableDatabase,
  orderId: string,
): Promise<ObligationSnapshotRow[]> {
  const { rows } = await database.client.db.execute<ObligationSnapshotRow>(sql`
    select o.kind,
           o.status,
           o.amount::text as amount,
           (select count(*)::text from payment_attempts a
             where a.payment_obligation_id = o.id) as attempts
      from payment_obligations o
     where o.order_id = ${orderId}
     order by o.kind
  `);
  return rows;
}
