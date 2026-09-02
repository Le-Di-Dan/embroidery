/**
 * Test-only helpers for the `APP12-B04` `ORDER_ACCESS` and `FULL` payment
 * suites.
 *
 * ## The grant is the runtime's; only its credential is adopted
 *
 * `APP12-B04` issues the `ORDER_ACCESS` grant inside the order-creation
 * transaction and hands the plaintext token to the APP4 notification path,
 * which seals it into an encrypted envelope. Only a peppered HMAC is stored, and
 * nothing anywhere inverts one — which is the property under test, not an
 * obstacle to be worked around.
 *
 * So {@link adoptOrderAccessToken} **re-credentials** the grant the runtime
 * wrote: it mints a well-formed token, digests it with the same peppered HMAC
 * the server uses, and replaces `token_hash` on that row. Everything else about
 * the grant — its id, its scope, its `order_id`, its customer, its status, its
 * expiry, the audit row and the notification intent behind it — is exactly what
 * production wrote. The alternative, inserting a whole grant from SQL, would
 * have made every suite below an assertion about the fixture rather than about
 * issuance.
 *
 * The digest is computed here as an **independent** statement of
 * `HMAC-SHA-256(pepper, token)` in base64 rather than by importing
 * `digestSecret`, on the rule `secure-link-fixture.ts` records: a test that
 * computes an expected value with the function it is testing proves only that
 * the function equals itself.
 *
 * The pepper is read from the environment at call time because
 * `createApiIntegrationContext` generates a fresh one per context and keeps it
 * set for that context's lifetime.
 *
 * ## Step-up
 *
 * Opening a payment attempt requires GRD-003 evidence — a fresh `VERIFIED`
 * `STEP_UP` challenge on one of the customer's own verified contacts, resolved
 * server-side. {@link seedStepUp} inserts exactly that row and nothing else: no
 * code is guessed, no digest is bypassed and the production resolver is the one
 * that finds it.
 */
import { createHmac, randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import type { ApiIntegrationTestContext } from './api-integration-context';

/** The `APP12-B04` public routes, under the global API prefix. */
export const ORDER_READ_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/ready-made-orders/current`;
export const FULL_PAYMENT_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/orders/full-payment`;
export const FULL_PAYMENT_QR_ROUTE = `${FULL_PAYMENT_ROUTE}/qr`;
export const FULL_PAYMENT_ATTEMPTS_ROUTE = `${FULL_PAYMENT_ROUTE}/attempts`;

/** The delivered `APP4-B06` resolver, and the two custom lanes B04 must not open. */
export const RESOLVE_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/secure-links/resolve`;
export const DEPOSIT_READ_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit`;

export interface GrantRow extends Record<string, unknown> {
  readonly id: string;
  readonly customer_id: string;
  readonly custom_request_id: string | null;
  readonly order_id: string | null;
  readonly scope_kind: string;
  readonly status: string;
  readonly token_hash: string;
  readonly expires_at: string;
}

/** Every grant naming this order, whatever its state. */
export async function grantsForOrder(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<GrantRow[]> {
  const { rows } = await context.database.client.db.execute<GrantRow>(sql`
    select id, customer_id, custom_request_id, order_id, scope_kind, status, token_hash, expires_at
    from secure_access_grants where order_id = ${orderId} order by created_at asc, id asc
  `);
  return [...rows];
}

/**
 * The digest as the server computes it, stated independently.
 *
 * Reads the pepper the running context installed, so it cannot silently digest
 * against a stale value from a previous suite.
 */
export function digestFor(token: string): string {
  const pepper = process.env['SECURE_LINK_TOKEN_SECRET_PEPPER'];
  if (pepper === undefined || pepper === '') {
    throw new Error('No SECURE_LINK_TOKEN_SECRET_PEPPER is installed for this context.');
  }
  return createHmac('sha256', pepper).update(token, 'utf8').digest('base64');
}

/** A well-formed token in the issued shape: 43 base64url characters. */
export function syntheticAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Re-credentials the order's live `ORDER_ACCESS` grant and returns the token.
 *
 * Refuses rather than seeding when no such grant exists: an order created
 * without one is the failure `APP12-B04` §6 exists to prevent, and a fixture
 * that quietly created the missing row would hide it.
 */
export async function adoptOrderAccessToken(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<{ readonly token: string; readonly grantId: string }> {
  const live = (await grantsForOrder(context, orderId)).filter(
    (grant) => grant.status === 'ACTIVE' && grant.scope_kind === 'ORDER_ACCESS',
  );
  const grant = live[0];
  if (grant === undefined || live.length !== 1) {
    throw new Error(
      `Expected exactly one ACTIVE ORDER_ACCESS grant on order ${orderId}, found ${String(live.length)}.`,
    );
  }

  const token = syntheticAccessToken();
  await context.database.client.db.execute(sql`
    update secure_access_grants set token_hash = ${digestFor(token)} where id = ${grant.id}
  `);
  return { token, grantId: grant.id };
}

/**
 * Seeds a fresh `VERIFIED` `STEP_UP` on the customer's primary contact.
 *
 * `verifiedSecondsAgo` is how GRD-003's window is exercised: the published
 * policy decides the length, and a suite proving the refusal back-dates the
 * proof rather than stubbing the reader.
 */
export async function seedStepUp(
  context: ApiIntegrationTestContext,
  customerId: string,
  verifiedSecondsAgo = 0,
): Promise<string> {
  const db = context.database.client.db;
  const { rows } = await db.execute<{ id: string; contact_kind: string; normalized_value: string }>(
    sql`select id, contact_kind, normalized_value from customer_contact_points
        where customer_id = ${customerId} and is_primary = true limit 1`,
  );
  const contact = rows[0];
  if (contact === undefined) {
    throw new Error(`Customer ${customerId} has no primary contact to step up on.`);
  }

  const challengeId = newId();
  const verifiedAt = new Date(Date.now() - verifiedSecondsAgo * 1_000);
  await db.execute(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status,
       expires_at, verified_at)
    values (${challengeId}, ${contact.id}, ${contact.contact_kind}, ${contact.normalized_value},
            'STEP_UP', ${`step-up-${challengeId}`}, 'VERIFIED',
            ${new Date(verifiedAt.getTime() + 600_000)}, ${verifiedAt})
  `);
  return challengeId;
}

/** Every payment attempt on this order, with the obligation each belongs to. */
export async function attemptsForOrder(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<{ readonly id: string; readonly obligation_id: string; readonly amount: string }[]> {
  const { rows } = await context.database.client.db.execute<{
    id: string;
    obligation_id: string;
    amount: string;
  }>(sql`
    select a.id, a.payment_obligation_id as obligation_id, a.amount
    from payment_attempts a
    join payment_obligations o on o.id = a.payment_obligation_id
    where o.order_id = ${orderId}
    order by a.created_at asc, a.id asc
  `);
  return [...rows];
}
