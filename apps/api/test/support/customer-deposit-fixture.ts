/**
 * Shared fixture for the `APP7-B03` customer deposit suites.
 *
 * Boots nothing of its own: the suites use `createApiIntegrationContext`, so the
 * whole application, the real controllers, the real global pipe and exception
 * filter, the real `AuthorizeSecureLink`, the real `ReauthorizeSecureGrant`, the
 * real `StepUpEvidenceResolver`, the real idempotency store and the canonical
 * AGG-15/AGG-16 repositories all run.
 *
 * **Nothing under test is overridden.** The digest is the real one — the fixture
 * mints a token, computes its digest with the same `digestSecret` the resolvers
 * use, and stores only the digest — so a passing test proves the peppered HMAC
 * path rather than a stubbed comparison. The step-up window is the real
 * published `secure_grant` policy, so a suite wanting a *lapsed* step-up
 * back-dates `verified_at` instead of stubbing the reader.
 *
 * ### Orders and obligations come from the canonical writers
 *
 * `seedOrderChain` is the delivered AGG-15 chain fixture; the order is created
 * through `OrderRepository.createFromAcceptedQuotation` and the two obligations
 * through `PaymentObligationRepository.createForOrder` — the one implementations
 * `APP7-W01-C1` consolidated into `@embroidery/persistence`, inside a real
 * transaction. So what B03 reads back is an order and a pair of obligations the
 * production writers actually wrote.
 *
 * It does **not** run the `APP7-W01` worker. The conversion job is W01's
 * behaviour and re-running it here would make a B03 failure ambiguous; the
 * canonical repositories are the seam both share.
 *
 * The peppers are synthetic values set on `process.env` for the duration of the
 * suite and restored afterwards. No `.env` file is read, written or consulted
 * (`CLAUDE.md` §8a), and no credential is rotated.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { generateHumanCode } from '@embroidery/domain-types';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  PolicyConfigurationRepository,
  TransactionManager,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { SECURE_GRANT_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-grant-policy';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../src/modules/customer/domain/secret/app4-secret-digest';
import { seedOrderChain } from '../../src/modules/order/tests/integration/order-fixture';
import { ORDER_REPOSITORY } from '../../src/modules/order/domain/repositories/order.repository';
import type {
  OrderId,
  OrderRepository,
} from '../../src/modules/order/domain/repositories/order.repository';

/** The three published routes, under the global API prefix. */
export const DEPOSIT_ROUTES = {
  read: `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit`,
  attempts: `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit/attempts`,
  qr: `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit/qr`,
} as const;

/**
 * The exact amounts `seedOrderChain`'s accepted quotation version carries.
 *
 * Restated here so an assertion names the figure it expects rather than reading
 * it back out of the row it is meant to be checking.
 */
export const SEEDED_DEPOSIT_AMOUNT = '765000.00';
export const SEEDED_REMAINING_AMOUNT = '1785000.00';

/** The step-up window the fixture publishes, in seconds. */
export const STEP_UP_WINDOW_SECONDS = 15 * 60;

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app7-b03-test-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app7-b03-test-secure-link-pepper-0002',
};

/**
 * Sets the synthetic peppers, before the application is compiled.
 *
 * Must run **before** `createApiIntegrationContext`: `App4SecretPepperProvider`
 * reads the environment when its provider is constructed.
 */
export function applyDepositSecretEnv(): () => void {
  const previous = Object.keys(TEST_PEPPERS).map((name) => [name, process.env[name]] as const);
  for (const [name, value] of Object.entries(TEST_PEPPERS)) {
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface SeededDeposit {
  readonly orderId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly customRequestId: string;
  readonly token: string;
  readonly grantId: string;
  readonly depositObligationId: string;
  readonly remainingObligationId: string;
  readonly challengeId: string;
}

export interface SeedDepositOptions {
  /** Absent means no step-up at all — the GRD-003 refusal path. */
  readonly stepUpVerifiedSecondsAgo?: number | undefined;
  readonly grantStatus?: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly grantExpiresInMinutes?: number;
  readonly suffix?: string;
}

/** Publishes the two policies the secure surface reads, both fail-closed. */
export async function publishDepositPolicies(
  app: INestApplication,
  database: DisposableDatabase,
): Promise<void> {
  const adminId = await ensureAdmin(database);
  const policies = app.get(PolicyConfigurationRepository);
  await app.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP7-B03 integration fixture.');
    await policies.publishVersion({
      configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
      value: { maxRequestsPerIpPerMinute: 600 },
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP7-B03 integration fixture.',
    });
    await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP7-B03 integration fixture.');
    await policies.publishVersion({
      configKey: SECURE_GRANT_POLICY_KEY,
      value: { standardTtlSeconds: 7 * 24 * 60 * 60, stepUpWindowSeconds: STEP_UP_WINDOW_SECONDS },
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP7-B03 integration fixture.',
    });
  });
}

/**
 * One order at `AWAITING_DEPOSIT` with both obligations and a live link.
 *
 * The REMAINING obligation is created and then left entirely alone, which is
 * what makes "B03 never exposes or touches it" a checkable claim rather than an
 * assertion about code that never had one to touch.
 */
export async function seedDeposit(
  app: INestApplication,
  database: DisposableDatabase,
  options: SeedDepositOptions = {},
): Promise<SeededDeposit> {
  const db = database.client.db;
  const fixture = await seedOrderChain(
    { disposable: database },
    options.suffix ?? newId().slice(0, 8),
  );

  // `seedOrderChain` stores a placeholder digest, because every suite before
  // this one reached the grant by id rather than by token. Replaced with the
  // real peppered digest of a token this fixture mints, so the resolver runs its
  // production lookup.
  const token = mintToken();
  const grantStatus = options.grantStatus ?? 'ACTIVE';
  const expiresAt = new Date(Date.now() + (options.grantExpiresInMinutes ?? 60 * 24 * 7) * 60_000);
  await db.execute(sql`
    update secure_access_grants
       set token_hash = ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
           status = ${grantStatus},
           expires_at = ${expiresAt},
           revoked_at = ${grantStatus === 'REVOKED' ? sql`now()` : sql`null`},
           revoke_reason = ${grantStatus === 'REVOKED' ? 'APP7-B03 integration fixture.' : null}
     where id = ${fixture.grantId}
  `);

  // The chain fixture seeds a VERIFIED STEP_UP already; its freshness is what
  // GRD-003 judges, so the suite states it explicitly rather than inheriting it.
  if (options.stepUpVerifiedSecondsAgo === undefined) {
    // Not deleted: `fk_approval_snapshots__step_up_challenge_id` retains the
    // challenge that authorized the design approval, and a customer who has
    // never re-verified since still has that row. Repurposed to SUBMISSION,
    // which is the truthful shape of 'this customer has no STEP_UP' —
    // `StepUpEvidenceResolver` pins the purpose exactly.
    await db.execute(
      sql`update contact_verification_challenges set purpose = 'SUBMISSION' where id = ${fixture.challengeId}`,
    );
  } else {
    const verifiedAt = new Date(Date.now() - options.stepUpVerifiedSecondsAgo * 1_000);
    await db.execute(sql`
      update contact_verification_challenges
         set verified_at = ${verifiedAt}, expires_at = ${new Date(verifiedAt.getTime() + 600_000)}
       where id = ${fixture.challengeId}
    `);
  }

  const orderId = newId() as OrderId;
  // The canonical generator, so the code the reference is derived from is the
  // exact shape  draws.
  const orderCode = generateHumanCode('ORD-', randomBytes);
  const orders = app.get<OrderRepository>(ORDER_REPOSITORY);
  const obligations = app.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
  const transactions = app.get(TransactionManager);

  const depositObligationId = newId() as ObligationId;
  const remainingObligationId = newId() as ObligationId;

  await transactions.runInTransaction(async () => {
    await orders.createFromAcceptedQuotation({
      id: orderId,
      code: orderCode,
      customRequestId: fixture.customRequestId,
      acceptedQuotationVersionId: fixture.quotationVersionId,
      approvalSnapshotId: fixture.approvalSnapshotId,
      items: [
        {
          position: 1,
          skuId: fixture.skuId,
          customerOwnedProductId: undefined,
          productName: 'Tee',
          variantLabel: 'Black / M',
          sizeLabel: undefined,
          quantity: 25,
          unitPriceAmount: '100000.00',
          lineTotalAmount: '2500000.00',
        },
      ],
    });
    // INV-04 — both obligations, in the creating transaction, exactly as W01
    // writes them.
    await obligations.createForOrder({
      id: depositObligationId,
      orderId,
      kind: 'DEPOSIT',
      amount: SEEDED_DEPOSIT_AMOUNT,
      sourceQuotationVersionId: fixture.quotationVersionId,
    });
    await obligations.createForOrder({
      id: remainingObligationId,
      orderId,
      kind: 'REMAINING',
      amount: SEEDED_REMAINING_AMOUNT,
      sourceQuotationVersionId: fixture.quotationVersionId,
    });
  });

  return {
    orderId,
    orderCode,
    customerId: fixture.customerId,
    customRequestId: fixture.customRequestId,
    token,
    grantId: fixture.grantId,
    depositObligationId,
    remainingObligationId,
    challengeId: fixture.challengeId,
  };
}

/**
 * A live `REQUEST_ACCESS` link on a request that has **no order yet**.
 *
 * The state every request is in between approval and the `APP7-W01` conversion.
 * Seeded as its own case rather than by deleting an order, because an order that
 * was created and removed leaves a chain no production state ever produces.
 */
export async function seedGrantWithoutOrder(
  database: DisposableDatabase,
): Promise<{ readonly token: string; readonly grantId: string }> {
  const db = database.client.db;
  const customerId = newId();
  const requestId = newId();
  const grantId = newId();
  const token = mintToken();

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, 'APP7 B03 Unconverted Customer', now())
  `);
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${requestId},
            ${`REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`},
            ${customerId}, 'APPROVED')
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${grantId}, ${customerId}, ${requestId},
            ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
            'REQUEST_ACCESS', 'ACTIVE', now() + interval '7 days')
  `);

  return { token, grantId };
}

/** The `payment_attempts` rows of one obligation, newest last. */
export async function attemptsOf(
  database: DisposableDatabase,
  obligationId: string,
): Promise<AttemptRow[]> {
  const { rows } = await database.client.db.execute<AttemptRow>(sql`
    select id, status, method, amount, currency_code, provider_key, provider_ref,
           grant_id, step_up_challenge_id
      from payment_attempts
     where payment_obligation_id = ${obligationId}
     order by created_at asc
  `);
  return rows;
}

export interface AttemptRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly method: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly provider_key: string | null;
  readonly provider_ref: string | null;
  readonly grant_id: string | null;
  readonly step_up_challenge_id: string | null;
}

/** The whole payment-and-order state a zero-write claim is checked against. */
export async function paymentSnapshot(
  database: DisposableDatabase,
  deposit: SeededDeposit,
): Promise<unknown> {
  const { rows } = await database.client.db.execute(sql`
    select
      (select row_to_json(o) from (
         select status, updated_at from orders where id = ${deposit.orderId}
       ) o) as ordering,
      (select json_agg(row_to_json(p) order by p.kind) from (
         select kind, status, amount, currency_code, satisfied_by_attempt_id, satisfied_at,
                updated_at
           from payment_obligations where order_id = ${deposit.orderId}
       ) p) as obligations,
      (select coalesce(json_agg(row_to_json(a) order by a.id), '[]'::json) from (
         select id, status, amount, updated_at from payment_attempts
          where payment_obligation_id in (
            ${deposit.depositObligationId}, ${deposit.remainingObligationId})
       ) a) as attempts,
      (select count(*) from payment_reconciliations) as reconciliations,
      (select count(*) from payment_provider_events) as provider_events,
      (select count(*) from refunds) as refunds
  `);
  return rows[0];
}

/** `policy_configuration_versions.created_by_admin_id` is NOT NULL. */
async function ensureAdmin(database: DisposableDatabase): Promise<string> {
  const db = database.client.db;
  const existing = await db.execute<{ id: string }>(sql`select id from admin_accounts limit 1`);
  const found = existing.rows[0]?.id;
  if (found !== undefined) return found;

  const adminId = newId();
  await db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`app7-b03-${adminId}@example.test`}, 'APP7 B03 Fixture', 'ACTIVE')
  `);
  return adminId;
}
