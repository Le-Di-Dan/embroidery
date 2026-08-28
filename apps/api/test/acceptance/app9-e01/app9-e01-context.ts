/**
 * The `APP9-E01` acceptance harness — API side.
 *
 * ### What it boots
 *
 * One real HTTP application carrying **every** delivered APP9 surface at once,
 * because `createAdminPaymentContext` composes the whole `AppModule`: the B01
 * lifecycle route, the B02 customer final-payment trio, the B03 Admin
 * verification, the B04 shipping detail and the B05 dispatch/completion pair,
 * against one disposable PostgreSQL with every migration applied. That single
 * injector is the point — each `B0n` suite booted the modules it owned, so it
 * could say "no route here could have done that"; `E01` asks the opposite
 * question, whether the slices *compose* on one order.
 *
 * ### Why it is built on the delivered fixtures rather than beside them
 *
 * `admin-payment-fixture` already boots the application, bootstraps one operator
 * and logs it in through the real staff session route;
 * `customer-deposit-fixture` already mints a `REQUEST_ACCESS` token whose
 * peppered digest is the one the resolver looks up, and creates both `CST-039`
 * obligations through the canonical AGG-16 writer;
 * `customer-final-payment-fixture` already owns the legal LC-14 walk. Re-seeding
 * any of that here would be a second, drifting copy of APP7's order shape.
 *
 * What this file adds is only what E01 needs and no suite before it had: an
 * order parked at `PRODUCTION_COMPLETED` with a live `PENDING` `REMAINING`
 * obligation and **no** final-payment entry yet — the exact state Journey 1A's
 * `adminOrder_transition` is supposed to move — plus the row readers the four
 * journeys assert against.
 *
 * ### Nothing under test is overridden
 *
 * No guard is stubbed, no repository doubled and no provider replaced. The real
 * `AuthenticatedAdminGuard` runs against a real session cookie minted by a real
 * login, and the real `AuthorizeSecureLink` runs against a real peppered digest.
 * Every credential is synthetic, minted per run, and no `.env` file is read or
 * written (`CLAUDE.md` §8a).
 *
 * ### What is seeded, and what is not
 *
 * Only prerequisite state APP9 consumes and no APP9 operation produces: the
 * Catalog/commission chain, the order, both obligations and the LC-14 walk to
 * `PRODUCTION_COMPLETED`. The `DEPOSIT` obligation is deliberately left
 * `PENDING` with no attempt — the same choice `admin-final-payment-fixture`
 * records, and for the same reason: every assertion that the deposit stayed
 * untouched is then about a row a defect could plausibly have moved.
 *
 * Every final-payment entry, attempt, verification, obligation settlement,
 * shipping detail, snapshot, transition and outbox row is produced by an owning
 * APP9 operation over HTTP. None is written by this harness.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';

import type { DisposableDatabase } from '@embroidery/database/testing';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../src/bootstrap/api-application';
import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  createAdminPaymentContext,
  type AdminPaymentTestContext,
} from '../../support/admin-payment-fixture';
import {
  DEPOSIT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_REMAINING_AMOUNT,
  mintToken,
  seedDeposit,
  seedGrantWithoutOrder,
  type SeededDeposit,
} from '../../support/customer-deposit-fixture';
import {
  FINAL_PAYMENT_ROUTES,
  advanceOrderTo,
  publishFinalPaymentPolicies,
} from '../../support/customer-final-payment-fixture';

export {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  FINAL_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_REMAINING_AMOUNT,
  mintToken,
  seedGrantWithoutOrder,
};
export type { SeededDeposit };

/**
 * The frozen `shipping_fee_amount` of `seedOrderChain`'s accepted quotation
 * version, and therefore the fee baseline before any shipping detail exists
 * (`APP9-B04` §4). Journey 3A saves **this exact figure**, which is what makes
 * the write a genuine no-change save rather than one that merely happened not to
 * trip the recalculation.
 */
export const BASELINE_SHIPPING_FEE = '50000.00';

/** The order total, restated so an assertion can rule it out by name. */
export const SEEDED_ORDER_TOTAL = '2550000.00';

/** The delivered APP9 routes this acceptance package drives, under the prefix. */
export const E01_ROUTES = {
  transition: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/transitions`,
  shipping: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/shipping-detail`,
  dispatch: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/dispatch`,
  completion: (orderId: string) => `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/completion`,
  /** APP7-B05's attempt-scoped evidence lane, which `APP9-B02` generalised. */
  evidenceStatus: `${DEPOSIT_ROUTES.attempts.replace('/attempts', '')}/evidence/status`,
} as const;

/** Tables E01 counts rows in, to prove an effect happened exactly once. */
export type CountableTable =
  | 'order_transitions'
  | 'payment_obligations'
  | 'payment_attempts'
  | 'payment_reconciliations'
  | 'outbox_events'
  | 'shipping_details'
  | 'shipping_snapshots'
  | 'shipping_fee_acknowledgements'
  | 'inventory_reservations'
  | 'inventory_ledger_entries';

export interface ObligationRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly satisfied_by_attempt_id: string | null;
  readonly superseded_by_obligation_id: string | null;
  readonly attempts: string;
}

export interface TransitionRow extends Record<string, unknown> {
  readonly from_status: string;
  readonly to_status: string;
  readonly event_kind: string;
  readonly actor_kind: string;
  readonly admin_id: string | null;
}

/**
 * The whole `outbox_events` row, not a projection.
 *
 * The payload is what Journey 2A exists to get right and what Journey 2B's
 * worker half consumes: a `REMAINING` settlement announced as `DEPOSIT` would
 * pass any count-only assertion while telling the reservation consumer to
 * reserve stock a second time.
 */
export interface OutboxRow extends Record<string, unknown> {
  readonly event_type: string;
  readonly aggregate_kind: string;
  readonly aggregate_id: string;
  readonly payload_schema_version: number;
  readonly payload: {
    readonly paymentAttemptId?: string;
    readonly paymentObligationId?: string;
    readonly obligationKind?: string;
    readonly orderId?: string;
  };
}

export interface ShippingDetailRow extends Record<string, unknown> {
  readonly id: string;
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly address_line: string;
  readonly province: string;
  readonly country_code: string;
  readonly fee_amount: string | null;
  readonly currency_code: string;
  readonly carrier_name: string | null;
  readonly tracking_code: string | null;
  readonly status: string;
  readonly frozen_at: string | null;
}

export interface SnapshotRow extends Record<string, unknown> {
  readonly shipping_detail_id: string;
  readonly recipient_name: string;
  readonly recipient_phone: string;
  readonly address_line: string;
  readonly province: string;
  readonly country_code: string;
  readonly fee_amount: string;
  readonly currency_code: string;
  readonly carrier_name: string | null;
  readonly tracking_code: string | null;
}

export interface App9AcceptanceContext {
  readonly admin: AdminPaymentTestContext;
  readonly database: DisposableDatabase;
  /** One order at `PRODUCTION_COMPLETED`, both obligations, one live link. */
  seedProductionCompletedOrder(suffix?: string): Promise<SeededDeposit>;
  orderStatus(orderId: string): Promise<string>;
  obligationsOf(orderId: string): Promise<ObligationRow[]>;
  transitionsOf(orderId: string): Promise<TransitionRow[]>;
  outboxFor(attemptId: string): Promise<OutboxRow[]>;
  shippingDetailOf(orderId: string): Promise<ShippingDetailRow | undefined>;
  snapshotsOf(orderId: string): Promise<SnapshotRow[]>;
  countRows(table: CountableTable): Promise<number>;
  close(): Promise<void>;
}

export async function createApp9AcceptanceContext(label: string): Promise<App9AcceptanceContext> {
  const admin = await createAdminPaymentContext(label);
  const database = admin.ctx.database;

  try {
    // The two fail-closed policies the secure customer surface reads. Published
    // through the canonical `PolicyConfigurationRepository`, not inserted.
    await publishFinalPaymentPolicies(admin.ctx.app, database);
  } catch (error: unknown) {
    await admin.close();
    throw error;
  }

  const db = database.client.db;

  return {
    admin,
    database,
    seedProductionCompletedOrder: async (suffix) => {
      const seeded = await seedDeposit(admin.ctx.app, database, {
        // A fresh step-up, so GRD-003 is satisfied for the acting customer
        // operations. Its freshness is stated rather than inherited.
        stepUpVerifiedSecondsAgo: 60,
        suffix: suffix ?? randomBytes(4).toString('hex'),
      });
      // Deliberately short of `AWAITING_FINAL_PAYMENT`: reaching it is Journey
      // 1A's assertion, and a fixture that walked there would prove nothing.
      await advanceOrderTo(admin.ctx.app, seeded.orderId, 'PRODUCTION_COMPLETED');
      return seeded;
    },
    orderStatus: async (orderId) => {
      const { rows } = await db.execute<{ status: string }>(
        sql`select status from orders where id = ${orderId}`,
      );
      return rows[0]?.status ?? 'MISSING';
    },
    obligationsOf: async (orderId) => {
      const { rows } = await db.execute<ObligationRow>(sql`
        select o.id, o.kind, o.status, o.amount::text as amount, o.currency_code,
               o.satisfied_by_attempt_id, o.superseded_by_obligation_id,
               (select count(*)::text from payment_attempts a
                 where a.payment_obligation_id = o.id) as attempts
          from payment_obligations o
         where o.order_id = ${orderId}
         order by o.kind, o.created_at
      `);
      return rows;
    },
    transitionsOf: async (orderId) => {
      const { rows } = await db.execute<TransitionRow>(sql`
        select from_status, to_status, event_kind, actor_kind, admin_id
          from order_transitions
         where order_id = ${orderId}
         order by id asc
      `);
      return rows;
    },
    outboxFor: async (attemptId) => {
      const { rows } = await db.execute<OutboxRow>(sql`
        select event_type, aggregate_kind, aggregate_id, payload_schema_version, payload
          from outbox_events
         where aggregate_id = ${attemptId}
         order by created_at asc, id asc
      `);
      return rows;
    },
    shippingDetailOf: async (orderId) => {
      const { rows } = await db.execute<ShippingDetailRow>(sql`
        select id, recipient_name, recipient_phone, address_line, province, country_code,
               fee_amount::text as fee_amount, currency_code, carrier_name, tracking_code,
               status, frozen_at::text as frozen_at
          from shipping_details
         where order_id = ${orderId}
      `);
      return rows[0];
    },
    snapshotsOf: async (orderId) => {
      const { rows } = await db.execute<SnapshotRow>(sql`
        select shipping_detail_id, recipient_name, recipient_phone, address_line, province,
               country_code, fee_amount::text as fee_amount, currency_code,
               carrier_name, tracking_code
          from shipping_snapshots
         where order_id = ${orderId}
         order by id asc
      `);
      return rows;
    },
    countRows: async (table) => {
      // `sql.raw` on a value from a closed union, never from a test's input:
      // ten literal table names, each spelled in `CountableTable`.
      const { rows } = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from ${sql.raw(table)}`,
      );
      return Number(rows[0]?.count ?? '0');
    },
    close: () => admin.close(),
  };
}

/** The envelope's `data`, typed. Narrowed here, at one boundary. */
export function dataOf<T>(response: { readonly body: unknown }): T {
  return (response.body as { readonly data: T }).data;
}

/** The envelope's error `code`, narrowed at the same one boundary. */
export function codeOf(response: { readonly body: unknown }): string {
  return (response.body as { readonly code?: string }).code ?? '';
}

/** A caller-chosen idempotency key in the delivered accepted alphabet. */
export function newIdempotencyKey(): string {
  return `app9-e01-${randomBytes(8).toString('hex')}`;
}
