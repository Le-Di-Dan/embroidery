/**
 * Test-only helpers for the `APP12-B03` Ready-Made shipping-fee suites.
 *
 * A **separate** context from `shipping-detail-context.ts`, which is APP9's and
 * is already 599 lines against a 600-line cap — and, more to the point, seeds
 * custom orders through the quotation chain, which is precisely what a
 * Ready-Made order does not have. This one drives the real
 * `publicReadyMadeOrder_create` command instead, so every order these suites
 * price is one `APP12-B02` actually produced rather than one a fixture
 * assembled to look like it.
 *
 * The disposable database comes from `createApiIntegrationContext`, which wires
 * the whole `AppModule`: both the public creation command and the Admin
 * shipping routes are the production ones, behind the production guards.
 *
 * The admin session token is synthetic, minted per context, never asserted on
 * and never printed. No OTP, digest or pepper is constructed here.
 */
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { hashToken } from '../../src/modules/identity/infrastructure/crypto/session-token.service';
import type { ApiIntegrationTestContext } from './api-integration-context';
import {
  createBody,
  seedReadyMadeContext,
  type ReadyMadeFixture,
} from './ready-made-order-fixture';

export const ADMIN_COOKIE_NAME = 'adm_session';

/** The one canonical Admin route, under the global API prefix. */
export const SHIPPING_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/shipping-detail`;

export const CREATE_ROUTE = `/${GLOBAL_ROUTE_PREFIX}/public/ready-made-orders`;

/** The envelope's `data`, typed. Narrowed at one boundary. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`, narrowed at the same boundary. */
export function errorCodeOf(response: { readonly body: unknown }): string {
  return (response.body as { readonly code?: string }).code ?? '';
}

/** A complete, valid body. Cases override only the field they are about. */
export function shippingBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recipientName: 'Nguyễn Thị Mai',
    recipientPhone: '0901234567',
    addressLine: '12 Nguyễn Huệ',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
    ...overrides,
  };
}

/** The published fee half of `adminOrderShipping_save`'s receipt. */
export interface FeePayload {
  readonly changed: boolean;
  readonly previousFeeAmount: string | null;
  readonly acknowledged: boolean | null;
  readonly supersededObligationId: string | null;
  readonly remainingObligationId: string | null;
  readonly remainingAmount: string | null;
  readonly fullObligationId: string | null;
  readonly payableTotalAmount: string | null;
}

export interface SavedPayload {
  readonly detail: { readonly status: string; readonly feeAmount: string | null };
  readonly fee: FeePayload;
}

export interface ObligationRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly amount: string;
  readonly superseded_by_obligation_id: string | null;
  readonly source_quotation_version_id: string | null;
}

export interface ReservationRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly expires_at: string | null;
}

/** Mints an ACTIVE admin session and returns the cookie header value. */
export async function seedAdminSession(context: ApiIntegrationTestContext): Promise<string> {
  const db = context.database.client.db;
  const adminId = newId();
  await db.execute(sql`
    insert into admin_accounts (id, email, display_name, status)
    values (${adminId}, ${`b03-${adminId}@example.test`}, 'B03 Operator', 'ACTIVE')
  `);

  const rawToken = randomBytes(32).toString('base64url');
  await db.execute(sql`
    insert into admin_sessions (id, admin_account_id, token_hash, status, expires_at)
    values (${newId()}, ${adminId}, ${hashToken(rawToken)}, 'ACTIVE',
            ${new Date(Date.now() + 30 * 60 * 1_000)})
  `);
  return `${ADMIN_COOKIE_NAME}=${rawToken}`;
}

export interface PricedOrder {
  readonly orderId: string;
  readonly fixture: ReadyMadeFixture;
  /** `sum(order_items.line_total_amount)` as created — the frozen subtotal. */
  readonly subtotal: string;
}

/**
 * Creates one real Ready-Made order through the public command.
 *
 * `unitPrice × quantity` is stated by the caller so a suite can assert an exact
 * subtotal without reading it back from the row it is about to test.
 */
export async function createReadyMadeOrder(
  context: ApiIntegrationTestContext,
  options: { label: string; unitPrice: number; quantity: number; quantityOnHand?: number },
): Promise<PricedOrder> {
  const fixture = await seedReadyMadeContext(context.database, {
    label: options.label,
    basePriceAmount: options.unitPrice,
    quantityOnHand: options.quantityOnHand ?? 50,
  });

  const response = await context.http
    .post(CREATE_ROUTE)
    .send(createBody(fixture, { quantity: options.quantity }));
  if (response.status !== 201) {
    throw new Error(`Ready-Made order creation failed: ${response.status} ${response.text}`);
  }

  const { rows } = await context.database.client.db.execute<{ id: string; total_amount: string }>(
    sql`select id, total_amount from orders where origin = 'READY_MADE'
        order by created_at desc limit 1`,
  );
  const order = rows[0];
  if (order === undefined) {
    throw new Error('Ready-Made order creation reported success but wrote no row.');
  }
  return { orderId: order.id, fixture, subtotal: order.total_amount };
}

/** Every payment obligation the order carries, oldest first. */
export async function obligationsOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<ObligationRow[]> {
  const { rows } = await context.database.client.db.execute<ObligationRow>(sql`
    select id, kind, status, amount, superseded_by_obligation_id, source_quotation_version_id
    from payment_obligations where order_id = ${orderId} order by created_at asc, id asc
  `);
  return [...rows];
}

/** The order's one reservation. */
export async function reservationOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<ReservationRow> {
  const { rows } = await context.database.client.db.execute<ReservationRow>(sql`
    select id, status, expires_at from inventory_reservations
    where order_id = ${orderId} order by id asc limit 1
  `);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`No reservation for order ${orderId}.`);
  }
  return row;
}

/** One order's committed status and total, read fresh. */
export async function orderOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<{ readonly status: string; readonly total_amount: string }> {
  const { rows } = await context.database.client.db.execute<{
    status: string;
    total_amount: string;
  }>(sql`select status, total_amount from orders where id = ${orderId}`);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`No order ${orderId}.`);
  }
  return row;
}

/**
 * Marks the order's live `FULL` obligation `SATISFIED`, with real evidence.
 *
 * **Fixture authority only.** `APP12-B05` owns FULL verification and `APP12-B03`
 * must not implement it, so no runtime path reaches this state yet — and it has
 * to be reachable for `§38`, which is the refusal that protects money a customer
 * has already paid.
 *
 * The evidence is not faked away: `ck_payment_obligations__satisfied_evidence_required`
 * demands both `satisfied_at` and `satisfied_by_attempt_id`, and `G-DB7-33`
 * demands the attempt match the obligation's amount and currency. So a genuine
 * `SUCCEEDED` attempt is inserted for exactly that amount and the obligation is
 * satisfied by it. Writing a status without the attempt would be constructing a
 * state the schema forbids and then testing behaviour against it.
 *
 * The attempt this creates is a fixture's, never `APP12-B03`'s — the
 * checkpoint's own "no payment attempt" assertions run on orders that never
 * pass through here.
 */
export async function satisfyLiveFullObligation(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<void> {
  const db = context.database.client.db;
  const { rows } = await db.execute<{ id: string; amount: string }>(sql`
    select id, amount from payment_obligations
    where order_id = ${orderId} and kind = 'FULL' and status = 'PENDING' limit 1
  `);
  const obligation = rows[0];
  if (obligation === undefined) {
    throw new Error(`No live PENDING FULL on order ${orderId}.`);
  }

  const attemptId = newId();
  await db.execute(sql`
    insert into payment_attempts
      (id, payment_obligation_id, amount, currency_code, method, status, succeeded_at)
    values (${attemptId}, ${obligation.id}, ${obligation.amount}, 'VND',
            'BANK_TRANSFER', 'SUCCEEDED', now())
  `);
  await db.execute(sql`
    update payment_obligations
    set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attemptId}
    where id = ${obligation.id}
  `);
}

/** `count(*)` over one whitelisted table, scoped to one order. */
export async function countForOrder(
  context: ApiIntegrationTestContext,
  table: 'payment_attempts' | 'shipping_fee_acknowledgements' | 'payment_reconciliations',
  orderId: string,
): Promise<number> {
  const db = context.database.client.db;
  // `payment_attempts` and `payment_reconciliations` hang off the obligation,
  // not the order, so each is counted through its own join rather than through
  // a column it does not have.
  const query =
    table === 'shipping_fee_acknowledgements'
      ? sql`select count(*)::text as count from shipping_fee_acknowledgements
            where order_id = ${orderId}`
      : table === 'payment_attempts'
        ? sql`select count(*)::text as count from payment_attempts a
              join payment_obligations o on o.id = a.payment_obligation_id
              where o.order_id = ${orderId}`
        : sql`select count(*)::text as count from payment_reconciliations r
              join payment_obligations o on o.id = r.payment_obligation_id
              where o.order_id = ${orderId}`;

  const { rows } = await db.execute<{ count: string }>(query);
  return Number(rows[0]?.count ?? '0');
}

/** The HTTP server, for suites that build their own Supertest agents. */
export function serverOf(context: ApiIntegrationTestContext): Server {
  return context.app.getHttpServer() as Server;
}
