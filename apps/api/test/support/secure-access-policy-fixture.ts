/**
 * The two fail-closed policies every secure-access surface reads
 * (`APP12-B04`).
 *
 * `secure_link.resolve` sizes the anonymous abuse budget and `secure_grant`
 * carries the grant TTL and the GRD-003 step-up window. Both readers raise
 * rather than defaulting, which is the point — an unconfigured deployment
 * refuses instead of guessing how long one OTP may authorise money.
 *
 * Before `APP12-B04` only the custom surfaces needed them. This checkpoint
 * issues an `ORDER_ACCESS` grant **inside the Ready-Made order-creation
 * transaction**, so `SecureGrantPolicyReader.require()` is now on the Wave-1
 * checkout path: an API booted against a database with no published
 * `secure_grant` version refuses to create an order at all. That is the correct
 * production posture — an order its own customer could never open is worse than
 * a refused checkout — so the suites satisfy it here rather than weakening it
 * there.
 *
 * A **shared** helper rather than a copy in each Ready-Made suite, and
 * deliberately not an import of `customer-deposit-fixture.publishDepositPolicies`:
 * that one belongs to APP7's own seeded chain and pulls its whole deposit
 * fixture in with it. This publishes two policy versions and nothing else.
 *
 * Test-only.
 */
import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { SECURE_GRANT_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-grant-policy';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../src/modules/customer/domain/grant/secure-link-policy';

/**
 * A generous per-IP budget.
 *
 * Every secure-token request in one suite arrives from the same Supertest
 * source, so the production ceiling would make an unrelated assertion fail as a
 * 429 the day someone adds another case. The limiter has its own suite; this
 * one must not be a second, accidental test of it.
 */
const RESOLVE_REQUESTS_PER_MINUTE = 600;

/** Seven days, the delivered `ADR-DB3-004` grant TTL. */
const GRANT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Fifteen minutes. Long enough that no suite races it, short enough to be real. */
export const STEP_UP_WINDOW_SECONDS = 900;

/**
 * Publishes both policies against the disposable database.
 *
 * Idempotent per context in the only sense that matters: calling it twice
 * publishes a second version of each key with the same value, and the reader
 * takes the effective one, so a suite that calls it in more than one `beforeAll`
 * still sees exactly these numbers.
 */
export async function publishSecureAccessPolicies(
  app: INestApplication,
  database: DisposableDatabase,
): Promise<void> {
  const adminId = await ensurePolicyAdmin(database);
  const policies = app.get(PolicyConfigurationRepository);

  await app.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(SECURE_LINK_RESOLVE_POLICY_KEY, 'APP12-B04 integration fixture.');
    await policies.publishVersion({
      configKey: SECURE_LINK_RESOLVE_POLICY_KEY,
      value: { maxRequestsPerIpPerMinute: RESOLVE_REQUESTS_PER_MINUTE },
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP12-B04 integration fixture.',
    });

    await policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'APP12-B04 integration fixture.');
    await policies.publishVersion({
      configKey: SECURE_GRANT_POLICY_KEY,
      value: {
        standardTtlSeconds: GRANT_TTL_SECONDS,
        stepUpWindowSeconds: STEP_UP_WINDOW_SECONDS,
      },
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP12-B04 integration fixture.',
    });
  });
}

/**
 * `policy_configuration_versions.created_by_admin_id` is NOT NULL, so a
 * publication needs an author.
 *
 * Reuses whatever account the suite already has and otherwise creates a
 * `DISABLED` one. `DISABLED` rather than `ACTIVE` is the point: CST-003 admits
 * **at most one ACTIVE admin** through a partial unique index, so a fixture
 * that minted an active operator here would collide with the one the suite
 * logs in with — and which of the two ran first would decide whether the suite
 * passed. The author of a seeded policy version is not the operator under test,
 * and saying so in its status is more truthful than racing for the slot.
 */
async function ensurePolicyAdmin(database: DisposableDatabase): Promise<string> {
  const db = database.client.db;
  const { rows } = await db.execute<{ id: string }>(
    sql`select id from admin_accounts order by created_at asc limit 1`,
  );
  const existing = rows[0];
  if (existing !== undefined) {
    return existing.id;
  }

  const adminId = newId();
  await db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`policy-${adminId}@example.test`}, 'Policy Fixture', 'DISABLED')
  `);
  return adminId;
}
