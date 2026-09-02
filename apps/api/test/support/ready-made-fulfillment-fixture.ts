/**
 * Test-only helpers for the `APP12-B05` verification and fulfilment suites.
 *
 * Everything here **reads** committed state or drives a real HTTP route. There
 * is no writer: `APP12-B05` is the checkpoint that makes FULL verification,
 * dispatch and completion reachable through production paths, so a fixture that
 * manufactured a `CONSUMED` reservation or a `READY_FOR_DELIVERY` order would be
 * asserting against its own SQL rather than against the command under test.
 *
 * The one exception the delivered fixtures already carry —
 * `satisfyLiveFullObligation` in `ready-made-shipping-fixture.ts` — stays where
 * it is and is *not* used by the success paths below, which reach `SATISFIED`
 * through `adminPaymentAttempt_verify` itself.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import type { ApiIntegrationTestContext } from './api-integration-context';
import { serverOf } from './ready-made-shipping-fixture';

/** The delivered Admin operations `APP12-B05` reuses, unchanged. */
export const VERIFY_ROUTE = (attemptId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/payment-attempts/${attemptId}/verify`;
export const DISPATCH_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/dispatch`;
export const COMPLETE_ROUTE = (orderId: string): string =>
  `/${GLOBAL_ROUTE_PREFIX}/admin/orders/${orderId}/completion`;

export interface LedgerRow extends Record<string, unknown> {
  readonly entry_kind: string;
  readonly quantity: number;
  readonly on_hand_delta: number;
  readonly reservation_id: string | null;
}

/** Verifies one attempt through the real Admin operation. */
export function verifyAttempt(
  context: ApiIntegrationTestContext,
  cookie: string,
  attemptId: string,
  body: { observedAmount: string; observedTransferReference: string; note?: string },
): request.Test {
  return request(serverOf(context))
    .post(VERIFY_ROUTE(attemptId))
    .set('Cookie', cookie)
    .send({ note: 'Transfer seen on the bank statement.', ...body });
}

export function dispatchOrder(
  context: ApiIntegrationTestContext,
  cookie: string,
  orderId: string,
): request.Test {
  return request(serverOf(context)).post(DISPATCH_ROUTE(orderId)).set('Cookie', cookie).send({});
}

export function completeOrder(
  context: ApiIntegrationTestContext,
  cookie: string,
  orderId: string,
): request.Test {
  return request(serverOf(context)).post(COMPLETE_ROUTE(orderId)).set('Cookie', cookie).send({});
}

/**
 * The SKU's committed on-hand balance and what still stands against it.
 *
 * `available` is computed here the way the public projection computes it —
 * on-hand minus every *active* hold and reservation — so a suite can assert
 * that consuming a reservation moves units out of on-hand **without** changing
 * what a shopper may still buy. That equality is the whole point of §28: a
 * terminal reservation must not hand its units back.
 */
export async function stockOf(
  context: ApiIntegrationTestContext,
  skuId: string,
): Promise<{ readonly onHand: number; readonly reserved: number; readonly available: number }> {
  const { rows } = await context.database.client.db.execute<{
    on_hand: number;
    reserved: string;
  }>(sql`
    select s.quantity_on_hand as on_hand,
           coalesce((select sum(r.quantity) from inventory_reservations r
                     where r.sku_stock_id = s.id and r.status = 'RESERVED'), 0)::text as reserved
    from sku_stocks s where s.sku_id = ${skuId}
  `);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`No stock anchor for SKU ${skuId}.`);
  }
  const onHand = Number(row.on_hand);
  const reserved = Number(row.reserved);
  return { onHand, reserved, available: onHand - reserved };
}

/** Every inventory ledger entry written for one order, oldest first. */
export async function ledgerOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<LedgerRow[]> {
  const { rows } = await context.database.client.db.execute<LedgerRow>(sql`
    select entry_kind, quantity, on_hand_delta, reservation_id
    from inventory_ledger_entries where order_id = ${orderId}
    order by created_at asc, id asc
  `);
  return [...rows];
}

/** Every reservation the order has ever held, so "no second one" is provable. */
export async function reservationsOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<{ readonly id: string; readonly status: string; readonly quantity: number }[]> {
  const { rows } = await context.database.client.db.execute<{
    id: string;
    status: string;
    quantity: number;
  }>(sql`
    select id, status, quantity from inventory_reservations
    where order_id = ${orderId} order by id asc
  `);
  return [...rows];
}

/**
 * `count(*)` over the custom-commerce artifacts a Ready-Made order must never
 * grow (`APP12-B05` §26).
 *
 * Each is counted through the column that actually links it to an order, and
 * `production_jobs` is the one that matters most: it is what would exist if
 * Ready-Made had been routed through the custom fulfilment lifecycle.
 */
export async function customArtifactCounts(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<Record<'productionJobs' | 'depositObligations' | 'remainingObligations', number>> {
  const db = context.database.client.db;
  const { rows } = await db.execute<{
    production_jobs: string;
    deposits: string;
    remainings: string;
  }>(sql`
    select
      (select count(*) from production_jobs where order_id = ${orderId})::text as production_jobs,
      (select count(*) from payment_obligations
        where order_id = ${orderId} and kind = 'DEPOSIT')::text as deposits,
      (select count(*) from payment_obligations
        where order_id = ${orderId} and kind = 'REMAINING')::text as remainings
  `);
  const row = rows[0];
  return {
    productionJobs: Number(row?.production_jobs ?? '0'),
    depositObligations: Number(row?.deposits ?? '0'),
    remainingObligations: Number(row?.remainings ?? '0'),
  };
}

/** The order's shipping detail state, for the freeze assertions. */
export async function shippingDetailOf(
  context: ApiIntegrationTestContext,
  orderId: string,
): Promise<{ readonly status: string; readonly frozen_at: string | null }> {
  const { rows } = await context.database.client.db.execute<{
    status: string;
    frozen_at: string | null;
  }>(sql`select status, frozen_at from shipping_details where order_id = ${orderId}`);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`No shipping detail for order ${orderId}.`);
  }
  return row;
}
