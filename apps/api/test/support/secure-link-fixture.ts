/**
 * Fixture for the `APP4-B06` public secure-link suites.
 *
 * Seeds the six persistence states the resolver has to answer identically, plus
 * one live grant it has to resolve. Everything is raw SQL against the disposable
 * database, exactly as `order-fixture.ts` seeds its own chain: the grant states
 * below are the *product* of `APP4-B05`'s lifecycle, and driving them through
 * that lifecycle would make these tests assertions about B05 rather than about
 * what B06 does when it meets each state.
 *
 * The Custom Request rows are **fixture scaffolding — not an APP5 submission.**
 * APP5 is not implemented; `secure_access_grants.custom_request_id` is NOT NULL
 * with an FK RESTRICT, so a grant cannot exist without one.
 *
 * Test-only.
 */
import { createHmac } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

/**
 * A synthetic pepper for the whole suite, generated per run.
 *
 * Never a checked-in literal: a fixed pepper in the repository is credential
 * material whether or not anything real is peppered with it.
 */
export const TEST_LINK_PEPPER = `b06-link-${newId()}`;

/**
 * The APP4 secret environment a booted API needs before it can digest anything.
 *
 * Both peppers, not just the link one: `loadApp4SecretPepperConfig` validates
 * the **pair** — each at least 32 characters, and distinct from one another and
 * from the envelope key — so supplying one leaves the provider refusing and
 * every resolve answering 500. Applied as synthetic per-run values rather than
 * by weakening the production requirement.
 */
export function applyApp4SecretEnv(): () => void {
  const values = [
    ['SECURE_LINK_TOKEN_SECRET_PEPPER', TEST_LINK_PEPPER],
    ['VERIFICATION_CODE_SECRET_PEPPER', `b06-code-${newId()}`],
  ] as const;
  const previous = values.map(([name]) => [name, process.env[name]] as const);
  for (const [name, value] of values) process.env[name] = value;

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/**
 * The digest as the server computes it.
 *
 * Reproduced here rather than imported from `app4-secret-digest.ts` on purpose:
 * a test that computes the expected value with the same function it is testing
 * proves only that the function equals itself. This is the *independent*
 * statement of `HMAC-SHA-256(pepper, token)` in base64, so a change to the
 * production digest breaks these suites rather than silently following them.
 */
export function expectedDigest(token: string): string {
  return createHmac('sha256', TEST_LINK_PEPPER).update(token, 'utf8').digest('base64');
}

/** A well-formed token in P01's issued shape: 43 base64url characters. */
export function syntheticToken(label: string): string {
  const body = label.replace(/[^A-Za-z0-9_-]/g, '');
  return `${body}${'x'.repeat(43)}`.slice(0, 43);
}

export interface SeededGrant {
  readonly grantId: string;
  readonly customerId: string;
  readonly customRequestId: string;
  readonly token: string;
  /**
   * The instant actually stored.
   *
   * Returned because it comes from the **database** clock (`now() + interval`),
   * not the test's. A suite that assumed a fixed "now" would pass or fail
   * depending on the wall-clock date it ran on, which is the kind of test that
   * goes green for a year and then fails on a Tuesday.
   */
  readonly expiresAt: Date;
}

export interface SeedGrantOptions {
  readonly label: string;
  /** LC-03 state. Defaults to a live grant. */
  readonly status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  /** Set in the past to seed an expired grant. */
  readonly expiresInHours?: number;
  readonly revokeReason?: string;
  /** Marks this grant superseded by another — the reissue chain. */
  readonly supersededBy?: string;
  /**
   * A scope the resolver does not accept.
   *
   * `GRANT_SCOPE_KINDS` has one member and a CHECK enforces it, so a genuine
   * wrong-scope row cannot be inserted. See the suite for how that case is
   * covered instead.
   */
  readonly scopeKind?: string;
}

/**
 * Seeds one customer, one Custom Request and one grant in the requested state.
 *
 * Each call creates its own customer and request, so a suite can hold six grants
 * at once without CST-009 — one ACTIVE grant per (customer, request) — refusing
 * the second insert.
 */
export async function seedGrant(
  database: DisposableDatabase,
  options: SeedGrantOptions,
): Promise<SeededGrant> {
  const db = database.client.db;
  const customerId = newId();
  const contactId = newId();
  const customRequestId = newId();
  const grantId = newId();
  const token = syntheticToken(options.label);
  const status = options.status ?? 'ACTIVE';
  const hours = options.expiresInHours ?? 24;

  await db.execute(sql`
    insert into customers (id, display_name, verified_at)
    values (${customerId}, ${`B06 ${options.label}`}, now())
  `);
  await db.execute(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactId}, ${customerId}, 'EMAIL', ${`b06-${customerId}@example.com`},
            ${`b06-${customerId}@example.com`}, true, now(), 'OTP')
  `);
  // Fixture scaffolding — not an APP5 submission.
  await db.execute(sql`
    insert into custom_requests (id, code, customer_id, status)
    values (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'NEW')
  `);
  await db.execute(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at,
       revoked_at, revoke_reason, superseded_by_grant_id)
    values (${grantId}, ${customerId}, ${customRequestId}, ${expectedDigest(token)},
            ${options.scopeKind ?? 'REQUEST_ACCESS'}, ${status},
            now() + make_interval(hours => ${hours}),
            ${status === 'REVOKED' ? sql`now()` : sql`null`},
            ${options.revokeReason ?? null},
            ${options.supersededBy ?? null})
  `);

  const stored = await db.execute<{ expires_at: Date }>(
    sql`select expires_at from secure_access_grants where id = ${grantId}`,
  );

  return {
    grantId,
    customerId,
    customRequestId,
    token,
    expiresAt: new Date(stored.rows[0]?.expires_at ?? 0),
  };
}

/** The published `secure_link.resolve` value (`APP4-G01`). Restated by no production file. */
export const RESOLVE_POLICY = { maxRequestsPerIpPerMinute: 30 };

/**
 * Publishes a policy value through its canonical versioned path — no shortcut.
 *
 * Goes through the real `PolicyConfigurationRepository` rather than raw SQL: the
 * two-table shape (`policy_configurations` plus an immutable version row, linked
 * by `current_version_id`) is exactly what a hand-written insert gets subtly
 * wrong, and the reader under test resolves through that link.
 */
export async function publishPolicy(
  app: INestApplication,
  database: DisposableDatabase,
  configKey: string,
  value: Record<string, unknown>,
): Promise<void> {
  const adminId = await ensureAdmin(database);
  const policies = app.get(PolicyConfigurationRepository);
  await app.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(configKey, 'APP4 integration fixture.');
    await policies.publishVersion({
      configKey,
      value,
      valueSchemaVersion: 1,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      createdByAdminId: adminId,
      reason: 'APP4-B06 integration fixture.',
    });
  });
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
    values (${adminId}, ${`b06-${adminId}@example.com`}, 'B06 Fixture', 'ACTIVE')
  `);
  return adminId;
}
