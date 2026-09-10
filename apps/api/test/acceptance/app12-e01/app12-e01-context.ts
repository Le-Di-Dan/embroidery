/**
 * The `APP12-E01` Wave-1 commerce regression harness — API side.
 *
 * ### What it boots, and why one context
 *
 * One real HTTP application carrying every delivered Wave-1 Ready-Made surface
 * at once — checkout, `ORDER_ACCESS`, shipping fee, `FULL` payment, Admin
 * verification, dispatch, completion, the Admin order read — against one
 * disposable PostgreSQL with every migration applied, plus the real
 * reservation-expiry sweep in its own worker process.
 *
 * The per-checkpoint suites each proved one operation. `APP12-B02`'s
 * concurrency suite owns oversell, `APP12-B03`'s owns concurrent fee writes,
 * `APP12-B05`'s owns verification against the sweep, and `APP12-B05`'s journey
 * suite owns the happy path. None of them is re-run here. What this harness
 * exists for is the question none of them asks: whether those slices still
 * **compose** into one Wave-1 system after `APP12-U01`'s corrections — and
 * whether the negatives stay negative when every module is present in one
 * injector rather than the handful each suite booted.
 *
 * ### Built on the delivered fixtures, never beside them
 *
 * Every seeder, route constant and row reader comes from the canonical
 * `ready-made-*` fixtures. Re-seeding the catalog, the customer, the challenge
 * or the order shape here would be a second copy that drifts from the one the
 * owning checkpoints maintain.
 *
 * ### Nothing under test is overridden
 *
 * No guard stubbed, no repository doubled, no provider replaced. The real
 * `AuthenticatedAdminGuard` runs against a real session cookie; the real
 * `ORDER_ACCESS` resolver runs against a real peppered digest. Every credential
 * is synthetic and minted per run, and no `.env` file is read or written
 * (`CLAUDE.md` §8a).
 *
 * ### Where a low-level write is allowed, and where it is not
 *
 * `APP12-E01` §6: a fixture may establish an exact race or expiry prerequisite
 * when concurrency or recovery is the subject. Three writes qualify, and they are
 * the only ones in this suite — {@link makeReservationDue},
 * {@link expireOrderAccess} and {@link revokeOrderAccess}. Each establishes a
 * prerequisite no delivered operation can produce: elapsed time, or the
 * revocation whose own Admin surface `APP4-B07` owns and E01 is not re-proving.
 * Nothing else here writes commercial state — orders, obligations, attempts,
 * reservations, snapshots and transitions are all produced by delivered
 * operations over HTTP.
 *
 * All commercial writes land in the disposable database this harness creates and
 * drops. The shared development world is never opened.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../../src/bootstrap/api-application';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../../support/api-integration-context';
import { publishSecureAccessPolicies } from '../../support/secure-access-policy-fixture';
import {
  createReadyMadeOrder,
  dataOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
  type PricedOrder,
} from '../../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  ORDER_READ_ROUTE,
  seedStepUp,
} from '../../support/ready-made-access-fixture';
import { verifyAttempt } from '../../support/ready-made-fulfillment-fixture';
import {
  startWorkerExpiryProcess,
  type WorkerExpiryProcess,
} from '../../support/worker-expiry-process';

export { dataOf, serverOf };

/** The Admin read the operator's order screen is built from (`APP12-A02`). */
export const ADMIN_ORDER_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}`;

/** The Admin list the operator reaches an order from. */
export const ADMIN_ORDER_LIST_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/admin/orders`;

/** The `APP4-B06` public resolver every secure link lands on. */
export const RESOLVE_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/secure-links/resolve`;

export interface E01Context {
  readonly api: ApiIntegrationTestContext;
  /** An `ACTIVE` operator session cookie. */
  readonly cookie: string;
  /** The real reservation-expiry sweep, in its own process. */
  readonly sweep: WorkerExpiryProcess;
  close(): Promise<void>;
}

export async function openE01Context(label: string): Promise<E01Context> {
  const api = await createApiIntegrationContext(label);
  await publishSecureAccessPolicies(api.app, api.database);
  const cookie = await seedAdminSession(api);
  const sweep = await startWorkerExpiryProcess(api);
  return {
    api,
    cookie,
    sweep,
    async close() {
      await sweep.close();
      await api.close();
    },
  };
}

/** One order created through the public command, plus its adopted access token. */
export interface E01Order extends PricedOrder {
  readonly token: string;
}

export async function placeOrder(
  context: E01Context,
  options: { label: string; unitPrice: number; quantity: number; quantityOnHand?: number },
): Promise<E01Order> {
  const priced = await createReadyMadeOrder(context.api, options);
  const { token } = await adoptOrderAccessToken(context.api, priced.orderId);
  return { ...priced, token };
}

/** The operator prices the shipping. Returns the write receipt. */
export function confirmFee(context: E01Context, orderId: string, feeAmount: string): request.Test {
  return request(serverOf(context.api))
    .put(SHIPPING_ROUTE(orderId))
    .set('Cookie', context.cookie)
    .send(shippingBody({ feeAmount }));
}

export interface OpenedAttempt {
  readonly attemptId: string;
  readonly amount: string;
  readonly transferReference: string;
}

/**
 * Opens one `FULL` payment attempt as the customer.
 *
 * The step-up evidence GRD-003 requires is seeded first, because no delivered
 * operation issues a `STEP_UP` challenge to a test — the production resolver is
 * still the one that finds it.
 */
export async function openFullAttempt(
  context: E01Context,
  order: E01Order,
  idempotencyKey: string,
): Promise<OpenedAttempt> {
  await seedStepUp(context.api, order.fixture.customerId);
  return dataOf<OpenedAttempt>(
    await request(serverOf(context.api))
      .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
      .set('Idempotency-Key', idempotencyKey)
      .send({ token: order.token })
      .expect(201),
  );
}

/** The operator confirms the exact figures the customer's own screen showed. */
export function verifyExactly(context: E01Context, attempt: OpenedAttempt): request.Test {
  return verifyAttempt(context.api, context.cookie, attempt.attemptId, {
    observedAmount: attempt.amount,
    observedTransferReference: attempt.transferReference,
  });
}

/** The customer's own projection of their order. */
export async function readCustomerOrder<T>(context: E01Context, token: string): Promise<T> {
  return dataOf<T>(
    await request(serverOf(context.api)).post(ORDER_READ_ROUTE).send({ token }).expect(200),
  );
}

/**
 * Makes an order's reservation due, so the real sweep has something to find.
 *
 * The first of the three permitted low-level writes (`APP12-E01` §6). Time is the
 * prerequisite and no operation can advance it; the sweep itself, the
 * cancellation, the release and the ledger entry all remain the worker's.
 */
export async function makeReservationDue(context: E01Context, orderId: string): Promise<void> {
  await context.api.database.client.db.execute(sql`
    update inventory_reservations
    set expires_at = now() - interval '1 minute'
    where order_id = ${orderId} and status = 'RESERVED'
  `);
}

/**
 * Ages this order's `ORDER_ACCESS` grant past its expiry.
 *
 * The second permitted low-level write, for the same reason as the first: the
 * prerequisite is elapsed time, which no operation produces. The grant itself —
 * its digest, scope, customer and audit row — is the one order creation wrote.
 */
export async function expireOrderAccess(context: E01Context, orderId: string): Promise<void> {
  await context.api.database.client.db.execute(sql`
    update secure_access_grants
    set expires_at = now() - interval '1 minute'
    where order_id = ${orderId} and status = 'ACTIVE'
  `);
}

/**
 * Revokes this order's `ORDER_ACCESS` grant.
 *
 * Distinct from expiry on purpose: §14 requires the two to be covered
 * separately, and a refusal that only handled the clock would leave a revoked
 * credential working.
 */
export async function revokeOrderAccess(context: E01Context, orderId: string): Promise<void> {
  await context.api.database.client.db.execute(sql`
    update secure_access_grants
    set status = 'REVOKED', revoked_at = now(),
        revoke_reason = 'APP12-E01 §14 revoked-grant regression'
    where order_id = ${orderId} and status = 'ACTIVE'
  `);
}

/** `count(*)` over one table for one order, for the §7 exactly-once truth table. */
export async function countRows(
  context: E01Context,
  query: ReturnType<typeof sql>,
): Promise<number> {
  const { rows } = await context.api.database.client.db.execute<{ count: string }>(query);
  return Number(rows[0]?.count ?? '0');
}

/** Status transitions this order actually recorded, in order. */
export async function transitionsOf(
  context: E01Context,
  orderId: string,
): Promise<readonly string[]> {
  const { rows } = await context.api.database.client.db.execute<{ to_status: string }>(sql`
    select to_status from order_transitions
    where order_id = ${orderId} order by created_at asc, id asc
  `);
  return rows.map((row) => row.to_status);
}
