/**
 * Shared fixture for the `APP7-B04` Admin payment suites.
 *
 * Boots the whole application through `createApiIntegrationContext`, so the real
 * `AuthenticatedAdminGuard`, `StaffOriginGuard`, `StaffJsonBodyGuard`, the real
 * Zod pipe, the real envelope interceptor and the real exception filter all run.
 * **Nothing under test is overridden**, and the Admin session is a real one: the
 * fixture bootstraps a staff account and logs in over HTTP, so a passing test
 * exercises the production cookie-and-session path rather than a stubbed guard.
 *
 * ### Orders, obligations and attempts come from the canonical writers
 *
 * `seedDeposit` is `APP7-B03`'s delivered fixture — the order through
 * `OrderRepository.createFromAcceptedQuotation`, both obligations through
 * `PaymentObligationRepository.createForOrder`. The attempt is opened through
 * `PaymentObligationRepository.openAttempt`, the same method B03's initiation
 * route calls, inside a real transaction. So what B04 verifies is a row the
 * production writer actually wrote, at the amount and currency it actually
 * copies off the obligation.
 *
 * It does **not** drive B03's HTTP surface to create the attempt. That would
 * require the grant, the step-up window and both policies, and would make a B04
 * failure ambiguous about which checkpoint broke; the canonical repository is
 * the seam both share.
 *
 * The peppers are synthetic values set on
 * `process.env` for the duration of the suite. No `.env` file is read, written
 * or consulted (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * Test-only.
 */
import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { newId } from '@embroidery/database';
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
import { BootstrapStaffUseCase } from '../../src/modules/identity/application/bootstrap-staff.use-case';
import { LoginRateLimiter } from '../../src/modules/identity/infrastructure/rate-limit/login-rate-limiter';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from './api-integration-context';
import {
  applyDepositSecretEnv,
  seedDeposit,
  SEEDED_DEPOSIT_AMOUNT,
  type SeededDeposit,
} from './customer-deposit-fixture';

export const ADMIN_ORIGIN = 'http://admin.embroidery.local';
const ADMIN_EMAIL = 'app7b04@example.test';
const ADMIN_PASSWORD = 'operator-secret-b04-123';

/** The deposit amount `seedOrderChain`'s accepted quotation version carries. */
export { SEEDED_DEPOSIT_AMOUNT };

/** The three published routes, under the global API prefix. */
export const ADMIN_PAYMENT_ROUTES = {
  read: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/payments`,
  verify: (attemptId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/payment-attempts/${attemptId}/verify`,
  review: (attemptId: string) =>
    `/${GLOBAL_ROUTE_PREFIX}/admin/payment-attempts/${attemptId}/review`,
} as const;

export interface Envelope<T> {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data: T;
}

export interface AdminPaymentTestContext {
  readonly ctx: ApiIntegrationTestContext;
  readonly cookie: () => string;
  close(): Promise<void>;
}

/**
 * Boots the application, bootstraps one Admin and logs in.
 *
 * The env restorers run in reverse order in {@link AdminPaymentTestContext.close},
 * so a suite leaves the process exactly as it found it.
 */
export async function createAdminPaymentContext(
  label: string,
  /**
   * Optional provider overrides, applied before `compile()`.
   *
   * Used by the rollback proof alone, which replaces the decision recorder with
   * one that throws so a failure lands inside the verification transaction. It
   * is a **testing-module** seam: no fault-injection flag exists in the runtime,
   * and every other suite compiles exactly the graph production does.
   */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<AdminPaymentTestContext> {
  // The merchant bank values are applied by `createApiIntegrationContext`
  // itself; only the APP4 peppers and the staff origin allowlist are this
  // fixture's to set. B04 uses neither bank value nor pepper directly — both are
  // composition requirements of sibling modules in the same `AppModule`.
  const restoreSecrets = applyDepositSecretEnv();
  const previousOrigins = process.env['STAFF_ALLOWED_ORIGINS'];
  process.env['STAFF_ALLOWED_ORIGINS'] = ADMIN_ORIGIN;

  let ctx: ApiIntegrationTestContext;
  try {
    ctx = await createApiIntegrationContext(label, configure);
  } catch (error: unknown) {
    restoreSecrets();
    throw error;
  }

  await ctx.app.get(BootstrapStaffUseCase).bootstrap({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    displayName: 'APP7 B04 Operator',
    rotate: false,
  });
  ctx.app.get(LoginRateLimiter).reset();

  const response = await ctx.http
    .post(`/${GLOBAL_ROUTE_PREFIX}/staff/session`)
    .set('Origin', ADMIN_ORIGIN)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const session = cookies.find((value) => value.startsWith('adm_session='));
  if (session === undefined) {
    await ctx.close();

    restoreSecrets();
    throw new Error('login set no adm_session cookie');
  }
  const cookie = session.split(';')[0] as string;

  return {
    ctx,
    cookie: () => cookie,
    close: async () => {
      await ctx.close();
      restoreSecrets();
      if (previousOrigins === undefined) delete process.env['STAFF_ALLOWED_ORIGINS'];
      else process.env['STAFF_ALLOWED_ORIGINS'] = previousOrigins;
    },
  };
}

export interface SeededAttempt extends SeededDeposit {
  readonly attemptId: string;
  /** `ORD` + the order code body + `DC`, as the server derives it. */
  readonly expectedReference: string;
}

/**
 * One order at `AWAITING_DEPOSIT`, both obligations, and one `PENDING`
 * `BANK_TRANSFER` attempt with **no** evidence.
 *
 * The zero-evidence shape is the default deliberately: `APP7-B04` §10 makes a
 * correct transfer with no screenshots fully verifiable, and a fixture that
 * always attached one would hide a guard that had crept in.
 */
export async function seedVerifiableAttempt(
  app: INestApplication,
  database: DisposableDatabase,
  options: { readonly suffix?: string } = {},
): Promise<SeededAttempt> {
  const deposit = await seedDeposit(app, database, {
    suffix: options.suffix ?? newId().slice(0, 8),
    stepUpVerifiedSecondsAgo: 60,
  });
  const attemptId = await openAttempt(app, deposit.depositObligationId, deposit.grantId);
  return {
    ...deposit,
    attemptId,
    expectedReference: `ORD${deposit.orderCode.slice('ORD-'.length)}DC`,
  };
}

/**
 * Opens one more `BANK_TRANSFER` attempt on an existing obligation.
 *
 * Used by the CC-10 proof, where two eligible attempts on one deposit race. The
 * canonical `openAttempt` copies the amount and currency off the obligation row,
 * so both competitors are exact by construction — which is what makes the race
 * about the arbiter rather than about which one happened to be right.
 */
export async function openAttempt(
  app: INestApplication,
  obligationId: string,
  grantId?: string,
): Promise<string> {
  const obligations = app.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
  const transactions = app.get(TransactionManager);
  const id = newId() as AttemptId;
  await transactions.runInTransaction(async () => {
    const obligation = await obligations.findById(obligationId as ObligationId);
    if (obligation === undefined) {
      throw new Error('seedVerifiableAttempt: the deposit obligation was not created.');
    }
    await obligations.openAttempt({
      id,
      paymentObligationId: obligationId as ObligationId,
      amount: obligation.amount,
      method: 'BANK_TRANSFER',
      grantId,
    });
  });
  return id;
}

/** Row readers. Raw SQL, so an assertion reads the database and not a projection. */

export interface AttemptRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly method: string;
  readonly amount: string;
  readonly review_reason: string | null;
  readonly succeeded_at: string | null;
  readonly provider_key: string | null;
  readonly provider_ref: string | null;
}

export async function readAttempt(
  database: DisposableDatabase,
  attemptId: string,
): Promise<AttemptRow> {
  const { rows } = await database.client.db.execute<AttemptRow>(sql`
    select id, status, method, amount, review_reason, succeeded_at, provider_key, provider_ref
      from payment_attempts where id = ${attemptId}
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no payment_attempts row ${attemptId}`);
  return row;
}

export interface ObligationRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly amount: string;
  readonly satisfied_by_attempt_id: string | null;
  readonly satisfied_at: string | null;
}

export async function readObligation(
  database: DisposableDatabase,
  obligationId: string,
): Promise<ObligationRow> {
  const { rows } = await database.client.db.execute<ObligationRow>(sql`
    select id, kind, status, amount, satisfied_by_attempt_id, satisfied_at
      from payment_obligations where id = ${obligationId}
  `);
  const row = rows[0];
  if (row === undefined) throw new Error(`no payment_obligations row ${obligationId}`);
  return row;
}

export async function readOrderStatus(
  database: DisposableDatabase,
  orderId: string,
): Promise<string> {
  const { rows } = await database.client.db.execute<{ status: string }>(
    sql`select status from orders where id = ${orderId}`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`no orders row ${orderId}`);
  return row.status;
}

export interface ReconciliationRow extends Record<string, unknown> {
  readonly id: string;
  readonly payment_attempt_id: string | null;
  readonly payment_obligation_id: string | null;
  readonly action: string;
  readonly resolved_status: string | null;
  readonly amount: string | null;
  readonly reason: string;
  readonly admin_id: string;
  readonly bank_reference: string | null;
}

export async function readReconciliations(
  database: DisposableDatabase,
  attemptId: string,
): Promise<ReconciliationRow[]> {
  const { rows } = await database.client.db.execute<ReconciliationRow>(sql`
    select id::text as id, payment_attempt_id, payment_obligation_id, action, resolved_status,
           amount, reason, admin_id, bank_reference
      from payment_reconciliations where payment_attempt_id = ${attemptId}
     order by id asc
  `);
  return rows;
}

export async function countRows(
  database: DisposableDatabase,
  query: ReturnType<typeof sql>,
): Promise<number> {
  const { rows } = await database.client.db.execute<{ count: string }>(query);
  return Number(rows[0]?.count ?? 0);
}

export async function countOutbox(
  database: DisposableDatabase,
  eventType: string,
  aggregateId: string,
): Promise<number> {
  return countRows(
    database,
    sql`select count(*)::text as count from outbox_events
         where event_type = ${eventType} and aggregate_id = ${aggregateId}`,
  );
}

export async function countAudit(
  database: DisposableDatabase,
  action: string,
  targetId: string,
): Promise<number> {
  return countRows(
    database,
    sql`select count(*)::text as count from audit_events
         where action = ${action} and target_id = ${targetId}`,
  );
}

/** Every write APP8 owns and B04 must never perform. */
export async function countDownstreamWrites(database: DisposableDatabase): Promise<number> {
  return countRows(
    database,
    sql`select (
          (select count(*) from inventory_reservations) +
          (select count(*) from inventory_soft_holds) +
          (select count(*) from inventory_ledger_entries) +
          (select count(*) from production_jobs) +
          (select count(*) from production_specifications)
        )::text as count`,
  );
}
