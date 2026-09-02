/**
 * `APP12-B03` — the Ready-Made shipping fee, the exact payable total and the
 * `FULL` obligation lifecycle, end to end against a real database through the
 * real HTTP surface.
 *
 * Every order under test is created by the production
 * `publicReadyMadeOrder_create` command and priced through the production
 * `adminOrderShipping_save`, behind the real `AuthenticatedAdminGuard`. Nothing
 * here fabricates an order row, an obligation or a reservation in order to
 * assert about it — with one deliberate exception, the `SATISFIED` case (§38),
 * which has no runtime path to reach until `APP12-B05` and says so where it is
 * constructed.
 *
 * The absences are asserted as loudly as the writes: no acknowledgement row, no
 * payment attempt, no `DEPOSIT`, no `REMAINING`, no second reservation. The
 * failure modes this checkpoint can actually produce are partial writes and
 * money composed from the wrong source, so both are checked directly against
 * committed rows rather than through the response alone.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  countForOrder,
  createReadyMadeOrder,
  dataOf,
  errorCodeOf,
  obligationsOf,
  orderOf,
  reservationOf,
  satisfyLiveFullObligation,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
  type SavedPayload,
} from '../support/ready-made-shipping-fixture';

const DAY_MS = 86_400_000;

describe('APP12-B03 — Ready-Made shipping fee and FULL obligation', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b03_fee');
    // `APP12-B04` composed the ORDER_ACCESS grant issuer into order creation, so
    // the fail-closed `secure_grant` policy is now on the Wave-1 checkout path:
    // without a published version this command refuses rather than committing an
    // order its own customer could never open.
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const put = (orderId: string, body: Record<string, unknown>) =>
    request(serverOf(context)).put(SHIPPING_ROUTE(orderId)).set('Cookie', cookie).send(body);

  const get = (orderId: string) =>
    request(serverOf(context)).get(SHIPPING_ROUTE(orderId)).set('Cookie', cookie);

  /** §29 — the read serves a Ready-Made order, before and after pricing. */
  describe('the Admin read', () => {
    it('reports a null fee before confirmation and the exact fee after it', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'read',
        unitPrice: 250_000,
        quantity: 1,
      });

      // Before: `APP12-B02` created the detail with no fee. Null is "not
      // priced", and it is a different fact from a zero fee.
      const before = await get(orderId);
      expect(before.status).toBe(200);
      expect(dataOf<{ feeAmount: string | null }>(before).feeAmount).toBeNull();

      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);

      const after = await get(orderId);
      expect(dataOf<{ feeAmount: string | null }>(after).feeAmount).toBe('30000.00');

      // The read is behind the real guard.
      await request(serverOf(context)).get(SHIPPING_ROUTE(orderId)).expect(401);
    });
  });

  /** §12–§17, §35 — the first confirmation, in full. */
  describe('the first fee confirmation', () => {
    let orderId: string;
    let body: SavedPayload;
    let createdAt: number;

    beforeAll(async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'first',
        unitPrice: 250_000,
        quantity: 1,
      });
      orderId = order.orderId;
      expect(order.subtotal).toBe('250000.00');

      const initial = await reservationOf(context, orderId);
      createdAt = Date.parse(initial.expires_at ?? '');

      const response = await put(orderId, shippingBody({ feeAmount: '30000' }));
      expect(response.status).toBe(200);
      body = dataOf<SavedPayload>(response);
    });

    it('composes 250000 + 30000 = 280000 exactly', () => {
      expect(body.detail.feeAmount).toBe('30000.00');
      expect(body.fee.changed).toBe(true);
      expect(body.fee.payableTotalAmount).toBe('280000.00');
    });

    it('reports no previous fee, because none had been priced', () => {
      // §11 — a pending fee is an absence. Reporting `0.00` here would say the
      // operator had previously chosen free shipping.
      expect(body.fee.previousFeeAmount).toBeNull();
      expect(body.fee.supersededObligationId).toBeNull();
    });

    it('reports no acknowledgement, rather than a false one', () => {
      // §7 — Ready-Made requires none at any point, so `null` says "not
      // applicable" where `false` would say "looked for and not found".
      expect(body.fee.acknowledged).toBeNull();
      expect(body.fee.remainingObligationId).toBeNull();
      expect(body.fee.remainingAmount).toBeNull();
    });

    it('creates exactly one PENDING FULL with no quotation source', async () => {
      const rows = await obligationsOf(context, orderId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe('FULL');
      expect(rows[0]?.status).toBe('PENDING');
      expect(rows[0]?.amount).toBe('280000.00');
      // §13 / `ck_payment_obligations__source_by_kind`.
      expect(rows[0]?.source_quotation_version_id).toBeNull();
      expect(rows[0]?.id).toBe(body.fee.fullObligationId);
    });

    it('creates no DEPOSIT, no REMAINING and no payment attempt', async () => {
      const kinds = (await obligationsOf(context, orderId)).map((one) => one.kind);
      expect(kinds).not.toContain('DEPOSIT');
      expect(kinds).not.toContain('REMAINING');
      // §26 — B03 creates obligations only.
      expect(await countForOrder(context, 'payment_attempts', orderId)).toBe(0);
    });

    it('creates no shipping-fee acknowledgement', async () => {
      // §7 — the table is never written on this path, and never read.
      expect(await countForOrder(context, 'shipping_fee_acknowledgements', orderId)).toBe(0);
    });

    it('moves the order to AWAITING_PAYMENT with a total equal to the FULL amount', async () => {
      const order = await orderOf(context, orderId);
      expect(order.status).toBe('AWAITING_PAYMENT');
      // §14 — the two figures are the same figure.
      expect(order.total_amount).toBe('280000.00');
      expect(order.total_amount).toBe(body.fee.payableTotalAmount);
    });

    it('reuses the same reservation and resets its window to +24h', async () => {
      const reservation = await reservationOf(context, orderId);
      expect(reservation.status).toBe('RESERVED');

      const resetTo = Date.parse(reservation.expires_at ?? '');
      // §16 — measured from the confirmation instant, so it is strictly later
      // than the creation-time deadline it replaced.
      expect(resetTo).toBeGreaterThan(createdAt);
      expect(Math.abs(resetTo - (Date.now() + DAY_MS))).toBeLessThan(60_000);
    });
  });

  /** §18, §37 — a correction supersedes rather than edits. */
  describe('a fee correction while PENDING', () => {
    it('supersedes the predecessor and recomposes the total from the subtotal', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'correct',
        unitPrice: 250_000,
        quantity: 1,
      });

      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);
      const afterFirst = await reservationOf(context, orderId);

      const response = await put(orderId, shippingBody({ feeAmount: '45000' }));
      expect(response.status).toBe(200);
      const body = dataOf<SavedPayload>(response);

      // §35 — 250000 + 45000, not 280000 + 45000.
      expect(body.fee.payableTotalAmount).toBe('295000.00');
      expect(body.fee.previousFeeAmount).toBe('30000.00');
      expect(body.fee.changed).toBe(true);

      const rows = await obligationsOf(context, orderId);
      expect(rows).toHaveLength(2);
      const [predecessor, successor] = rows;

      // §25 — the predecessor keeps the figure it was payable at.
      expect(predecessor?.status).toBe('SUPERSEDED');
      expect(predecessor?.amount).toBe('280000.00');
      expect(predecessor?.superseded_by_obligation_id).toBe(successor?.id);

      expect(successor?.status).toBe('PENDING');
      expect(successor?.amount).toBe('295000.00');
      expect(successor?.kind).toBe('FULL');
      expect(successor?.source_quotation_version_id).toBeNull();

      // §27 — exactly one live FULL.
      expect(
        rows.filter((one) => one.status === 'PENDING' || one.status === 'SATISFIED'),
      ).toHaveLength(1);

      // §28 — the order stays payable, at the new figure.
      const order = await orderOf(context, orderId);
      expect(order.status).toBe('AWAITING_PAYMENT');
      expect(order.total_amount).toBe('295000.00');

      // §16 — the correction does **not** grant another 24 hours.
      const afterCorrection = await reservationOf(context, orderId);
      expect(afterCorrection.id).toBe(afterFirst.id);
      expect(afterCorrection.expires_at).toBe(afterFirst.expires_at);

      // §21 — one recalculation record, and no acknowledgement.
      expect(await countForOrder(context, 'payment_reconciliations', orderId)).toBe(1);
      expect(await countForOrder(context, 'shipping_fee_acknowledgements', orderId)).toBe(0);
      expect(await countForOrder(context, 'payment_attempts', orderId)).toBe(0);
    });

    it('does not compound across two successive corrections', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'twice',
        unitPrice: 250_000,
        quantity: 1,
      });

      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);
      await put(orderId, shippingBody({ feeAmount: '45000' })).expect(200);
      const third = await put(orderId, shippingBody({ feeAmount: '10000' })).expect(200);

      // 250000 + 10000. Not 295000 + 10000, and not 280000 - 20000 + 10000.
      expect(dataOf<SavedPayload>(third).fee.payableTotalAmount).toBe('260000.00');
      expect((await orderOf(context, orderId)).total_amount).toBe('260000.00');
    });
  });

  /** §19 — a replay changes nothing. */
  describe('an unchanged-fee replay', () => {
    it('creates no second FULL, no reconciliation and no window extension', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'replay',
        unitPrice: 250_000,
        quantity: 1,
      });

      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);
      const before = {
        obligations: await obligationsOf(context, orderId),
        reservation: await reservationOf(context, orderId),
        order: await orderOf(context, orderId),
      };

      const replay = await put(orderId, shippingBody({ feeAmount: '30000' }));
      expect(replay.status).toBe(200);
      const body = dataOf<SavedPayload>(replay);
      expect(body.fee.changed).toBe(false);
      expect(body.fee.previousFeeAmount).toBe('30000.00');
      expect(body.fee.supersededObligationId).toBeNull();
      // The live obligation is still reported, so the operator sees what stands.
      expect(body.fee.fullObligationId).toBe(before.obligations[0]?.id);

      expect(await obligationsOf(context, orderId)).toEqual(before.obligations);
      expect(await reservationOf(context, orderId)).toEqual(before.reservation);
      expect(await orderOf(context, orderId)).toEqual(before.order);
      expect(await countForOrder(context, 'payment_reconciliations', orderId)).toBe(0);
    });

    it('still applies a non-fee edit on the same replay', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'nonfee',
        unitPrice: 250_000,
        quantity: 1,
      });

      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);
      const response = await put(
        orderId,
        shippingBody({ feeAmount: '30000', addressLine: '99 Corrected Street' }),
      ).expect(200);

      expect(dataOf<SavedPayload>(response).fee.changed).toBe(false);
      const detail = dataOf<{ addressLine: string }>(await get(orderId));
      expect(detail.addressLine).toBe('99 Corrected Street');
    });
  });

  /** §11, §35 — an explicit zero fee is a commercial decision. */
  describe('free shipping', () => {
    it('treats an explicit 0 as priced, not as pending', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'free',
        unitPrice: 250_000,
        quantity: 1,
      });

      const response = await put(orderId, shippingBody({ feeAmount: '0' })).expect(200);
      const body = dataOf<SavedPayload>(response);

      expect(body.detail.feeAmount).toBe('0.00');
      expect(body.fee.payableTotalAmount).toBe('250000.00');
      expect((await orderOf(context, orderId)).status).toBe('AWAITING_PAYMENT');

      // And the stored fee reads back as zero rather than as null.
      expect(dataOf<{ feeAmount: string | null }>(await get(orderId)).feeAmount).toBe('0.00');
    });
  });

  /** §36 — the frozen subtotal wins over a repriced Catalog. */
  describe('the frozen merchandise subtotal', () => {
    it('prices from order history after the Catalog price moves', async () => {
      const { orderId, fixture } = await createReadyMadeOrder(context, {
        label: 'frozen',
        unitPrice: 250_000,
        quantity: 1,
      });

      // The Catalog moves under the order, exactly as a real reprice would.
      await context.database.client.db.execute(
        sql`update products set base_price_amount = '999000.00' where id = ${fixture.productId}`,
      );

      const response = await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);
      // 250000 + 30000, never 999000 + 30000.
      expect(dataOf<SavedPayload>(response).fee.payableTotalAmount).toBe('280000.00');
      expect((await orderOf(context, orderId)).total_amount).toBe('280000.00');
    });
  });

  /** §9, §23 — a cancelled order is not revived by pricing it. */
  describe('lifecycle refusals', () => {
    it('refuses a fee on a cancelled order and writes nothing', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'cancelled',
        unitPrice: 250_000,
        quantity: 1,
      });

      await context.database.client.db.execute(
        sql`update orders set status = 'CANCELLED', cancelled_reason = 'B03 suite fixture.'
            where id = ${orderId}`,
      );

      const response = await put(orderId, shippingBody({ feeAmount: '30000' }));
      expect(response.status).toBe(409);
      expect(errorCodeOf(response)).toBe('ORDER_SHIPPING_FEE_NOT_SETTABLE');

      expect(await obligationsOf(context, orderId)).toHaveLength(0);
      expect(dataOf<{ feeAmount: string | null }>(await get(orderId)).feeAmount).toBeNull();
      expect((await orderOf(context, orderId)).status).toBe('CANCELLED');
    });

    it('refuses a fee when the reservation is no longer held', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'norsv',
        unitPrice: 250_000,
        quantity: 1,
      });

      await context.database.client.db.execute(
        sql`update inventory_reservations set status = 'EXPIRED', terminalized_at = now()
            where order_id = ${orderId}`,
      );

      const response = await put(orderId, shippingBody({ feeAmount: '30000' }));
      expect(response.status).toBe(409);
      expect(errorCodeOf(response)).toBe('ORDER_RESERVATION_NOT_HELD');
      expect(await obligationsOf(context, orderId)).toHaveLength(0);
      expect((await orderOf(context, orderId)).status).toBe('AWAITING_SHIPPING_FEE');
    });

    it('refuses a malformed or fractional fee before opening a transaction', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'badfee',
        unitPrice: 250_000,
        quantity: 1,
      });

      // A fractional đồng: representable in `numeric(14,2)`, rejected by the
      // VND scale CHECK, so refused here as input.
      const fractional = await put(orderId, shippingBody({ feeAmount: '30000.50' }));
      expect(fractional.status).toBe(409);
      expect(errorCodeOf(fractional)).toBe('SHIPPING_FEE_NOT_APPLICABLE');

      // A negative fee is refused by the DTO before it ever reaches the rule.
      const negative = await put(orderId, shippingBody({ feeAmount: '-1' }));
      expect(negative.status).toBe(400);

      expect(await obligationsOf(context, orderId)).toHaveLength(0);
      expect((await orderOf(context, orderId)).status).toBe('AWAITING_SHIPPING_FEE');
    });
  });

  /** §22, §38 — a settled FULL is not reopened. */
  describe('a SATISFIED FULL', () => {
    it('refuses a fee change with every commercial fact unchanged', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'settled',
        unitPrice: 250_000,
        quantity: 1,
      });
      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);

      // Constructed through fixture authority alone. `APP12-B05` owns FULL
      // verification and B03 must not implement it, so no runtime path reaches
      // this state — the helper writes a genuine SUCCEEDED attempt and satisfies
      // the obligation by it, because the schema demands that evidence.
      await satisfyLiveFullObligation(context, orderId);

      const before = {
        obligations: await obligationsOf(context, orderId),
        reservation: await reservationOf(context, orderId),
        order: await orderOf(context, orderId),
      };

      const response = await put(orderId, shippingBody({ feeAmount: '45000' }));
      expect(response.status).toBe(409);
      expect(errorCodeOf(response)).toBe('SHIPPING_FEE_CHANGE_NOT_AVAILABLE');

      // §22 — zero mutation, on every axis.
      expect(await obligationsOf(context, orderId)).toEqual(before.obligations);
      expect(await reservationOf(context, orderId)).toEqual(before.reservation);
      expect(await orderOf(context, orderId)).toEqual(before.order);
      expect(dataOf<{ feeAmount: string | null }>(await get(orderId)).feeAmount).toBe('30000.00');
    });

    it('still allows a non-fee edit on a settled order', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'settled2',
        unitPrice: 250_000,
        quantity: 1,
      });
      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);

      await satisfyLiveFullObligation(context, orderId);

      // The same fee, a different address — the pre-freeze edit APP9 allows.
      const response = await put(
        orderId,
        shippingBody({ feeAmount: '30000', addressLine: '7 Late Correction' }),
      );
      expect(response.status).toBe(200);
      expect(dataOf<SavedPayload>(response).fee.changed).toBe(false);
      expect(dataOf<{ addressLine: string }>(await get(orderId)).addressLine).toBe(
        '7 Late Correction',
      );
    });
  });

  /** §27, §28 — the verification and ORDER_ACCESS boundaries stay closed. */
  describe('checkpoint boundaries', () => {
    it('does not move a priced order towards delivery', async () => {
      const { orderId } = await createReadyMadeOrder(context, {
        label: 'boundary',
        unitPrice: 250_000,
        quantity: 1,
      });
      await put(orderId, shippingBody({ feeAmount: '30000' })).expect(200);

      // §27 — `AWAITING_PAYMENT` is where B03 stops. B05 owns what follows.
      expect((await orderOf(context, orderId)).status).toBe('AWAITING_PAYMENT');
      expect(await countForOrder(context, 'payment_attempts', orderId)).toBe(0);
    });
  });
});
