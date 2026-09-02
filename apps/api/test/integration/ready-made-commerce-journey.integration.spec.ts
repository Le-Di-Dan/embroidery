/**
 * `APP12-B05` §40, §41 — the whole Ready-Made backend journey, once, against a
 * disposable database and the real worker.
 *
 * ```text
 * publicReadyMadeOrder_create        AWAITING_SHIPPING_FEE, reservation RESERVED
 * adminOrderShipping_save            AWAITING_PAYMENT, FULL PENDING
 * publicOrderFullPayment_qr          the transfer instruction the customer pays against
 * publicOrderFullPayment_initiate    one PENDING attempt
 * adminPaymentAttempt_verify         FULL SATISFIED, reservation CONSUMED,
 *                                    READY_FOR_DELIVERY
 * (the real expiry sweep runs)       nothing happens — the order is not expirable
 * adminOrder_dispatch                DELIVERED, shipping FROZEN
 * adminOrder_complete                COMPLETED
 * ```
 *
 * Every step is an HTTP call to a delivered operation or the built worker in its
 * own process. There is no SQL write anywhere in this file: the database is only
 * ever read, and the one `UPDATE` the sibling race suite needs to make a
 * reservation *due* is deliberately absent here, because this journey is the
 * one where nothing is meant to lapse.
 *
 * No real bank transfer happens and none could: the Admin verification **is**
 * the manual-transfer authority (`APP7-G01` §1), no provider is contacted and
 * `payment_provider_events` stays empty.
 *
 * The customer's `ORDER_ACCESS` projection is read after every transition,
 * because a status the operator can see and the customer cannot is a delivered
 * order nobody told them about.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  countForOrder,
  createReadyMadeOrder,
  dataOf,
  obligationsOf,
  orderOf,
  reservationOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  FULL_PAYMENT_QR_ROUTE,
  FULL_PAYMENT_ROUTE,
  ORDER_READ_ROUTE,
  seedStepUp,
} from '../support/ready-made-access-fixture';
import {
  completeOrder,
  customArtifactCounts,
  dispatchOrder,
  ledgerOf,
  reservationsOf,
  shippingDetailOf,
  stockOf,
  verifyAttempt,
} from '../support/ready-made-fulfillment-fixture';
import {
  startWorkerExpiryProcess,
  type WorkerExpiryProcess,
} from '../support/worker-expiry-process';

interface OpenedAttempt {
  readonly attemptId: string;
  readonly amount: string;
  readonly transferReference: string;
}

interface OrderProjection {
  readonly status: string;
  readonly terminationReason?: string;
}

interface FullPaymentProjection {
  readonly fullPaymentStatus: string;
  readonly payable: boolean;
}

const ON_HAND = 10;
const QUANTITY = 2;
const UNIT_PRICE = 250_000;
const FEE = '30000';
/** `250000 × 2 + 30000`, the arithmetic `BR-021` and `APP12-B03` fixed. */
const PAYABLE = '530000.00';

describe('APP12-B05 — the Ready-Made backend journey, end to end', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;
  let sweep: WorkerExpiryProcess;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b05_journey');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
    sweep = await startWorkerExpiryProcess(context);
  }, 300_000);

  afterAll(async () => {
    await sweep?.close();
    await context?.close();
  });

  const readOrder = async (token: string): Promise<OrderProjection> =>
    dataOf<OrderProjection>(
      await request(serverOf(context)).post(ORDER_READ_ROUTE).send({ token }).expect(200),
    );

  const readPayment = async (token: string): Promise<FullPaymentProjection> =>
    dataOf<FullPaymentProjection>(
      await request(serverOf(context)).post(FULL_PAYMENT_ROUTE).send({ token }).expect(200),
    );

  it('carries one order from checkout to COMPLETED through delivered operations only', async () => {
    // ── 1. Checkout ────────────────────────────────────────────────────────
    const order = await createReadyMadeOrder(context, {
      label: 'journey',
      unitPrice: UNIT_PRICE,
      quantity: QUANTITY,
      quantityOnHand: ON_HAND,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);

    expect((await orderOf(context, order.orderId)).status).toBe('AWAITING_SHIPPING_FEE');
    expect((await reservationOf(context, order.orderId)).status).toBe('RESERVED');
    expect(await stockOf(context, order.fixture.skuId)).toEqual({
      onHand: ON_HAND,
      reserved: QUANTITY,
      available: ON_HAND - QUANTITY,
    });
    expect((await readOrder(token)).status).toBe('AWAITING_SHIPPING_FEE');
    // §25 — before the fee there is no obligation to be payable or unpayable.
    expect(await obligationsOf(context, order.orderId)).toHaveLength(0);

    // ── 2. The Admin prices the shipping ───────────────────────────────────
    await request(serverOf(context))
      .put(SHIPPING_ROUTE(order.orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount: FEE }))
      .expect(200);

    expect((await orderOf(context, order.orderId)).status).toBe('AWAITING_PAYMENT');
    const priced = await obligationsOf(context, order.orderId);
    expect(priced).toHaveLength(1);
    expect(priced[0]).toMatchObject({ kind: 'FULL', status: 'PENDING', amount: PAYABLE });
    expect(await readPayment(token)).toEqual(
      expect.objectContaining({ fullPaymentStatus: 'PENDING', payable: true }),
    );

    // ── 3. The customer takes the transfer instruction and starts paying ───
    await seedStepUp(context, order.fixture.customerId);
    await request(serverOf(context))
      .post(FULL_PAYMENT_QR_ROUTE)
      .send({ token })
      .expect(200)
      .expect('content-type', /image\/png/);

    const attempt = dataOf<OpenedAttempt>(
      await request(serverOf(context))
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', `b05-journey-${order.orderId}`)
        .send({ token })
        .expect(201),
    );
    expect(attempt.amount).toBe(PAYABLE);
    expect(attempt.transferReference).toMatch(/^ORD[0-9A-Z]{10}FL$/);

    // ── 4. The Admin verifies the transfer that arrived ────────────────────
    const decision = dataOf<{
      attemptStatus: string;
      depositStatus: string;
      orderStatus: string;
      replayed: boolean;
    }>(
      await verifyAttempt(context, cookie, attempt.attemptId, {
        observedAmount: attempt.amount,
        observedTransferReference: attempt.transferReference,
      }).expect(200),
    );
    expect(decision).toMatchObject({
      attemptStatus: 'SUCCEEDED',
      depositStatus: 'SATISFIED',
      orderStatus: 'READY_FOR_DELIVERY',
      replayed: false,
    });

    // …and the whole settlement committed together.
    expect((await reservationOf(context, order.orderId)).status).toBe('CONSUMED');
    expect(await stockOf(context, order.fixture.skuId)).toEqual({
      onHand: ON_HAND - QUANTITY,
      reserved: 0,
      available: ON_HAND - QUANTITY,
    });
    const consumed = (await ledgerOf(context, order.orderId)).filter(
      (row) => row.entry_kind === 'CONSUMED',
    );
    expect(consumed).toHaveLength(1);
    expect(consumed[0]).toMatchObject({ quantity: QUANTITY, on_hand_delta: -QUANTITY });

    // The customer sees a paid, non-payable order and keeps their access.
    expect(await readOrder(token)).toEqual(
      expect.objectContaining({ status: 'READY_FOR_DELIVERY' }),
    );
    expect((await readOrder(token)).terminationReason).toBeUndefined();
    expect(await readPayment(token)).toEqual(
      expect.objectContaining({ fullPaymentStatus: 'SATISFIED', payable: false }),
    );

    // ── 5. The sweep runs and finds nothing to do ──────────────────────────
    const beforeSweep = await stockOf(context, order.fixture.skuId);
    await sweep.runPass();
    expect((await orderOf(context, order.orderId)).status).toBe('READY_FOR_DELIVERY');
    expect((await reservationOf(context, order.orderId)).status).toBe('CONSUMED');
    expect(await stockOf(context, order.fixture.skuId)).toEqual(beforeSweep);

    // ── 6. Dispatch ────────────────────────────────────────────────────────
    const dispatched = dataOf<{ status: string; shippingStatus: string }>(
      await dispatchOrder(context, cookie, order.orderId).expect(200),
    );
    expect(dispatched).toMatchObject({ status: 'DELIVERED', shippingStatus: 'FROZEN' });
    expect((await shippingDetailOf(context, order.orderId)).frozen_at).not.toBeNull();
    expect((await readOrder(token)).status).toBe('DELIVERED');

    // ── 7. Completion ──────────────────────────────────────────────────────
    const completed = dataOf<{ status: string }>(
      await completeOrder(context, cookie, order.orderId).expect(200),
    );
    expect(completed.status).toBe('COMPLETED');
    expect((await readOrder(token)).status).toBe('COMPLETED');

    // ── 8. What the journey never created ──────────────────────────────────
    expect(await customArtifactCounts(context, order.orderId)).toEqual({
      productionJobs: 0,
      depositObligations: 0,
      remainingObligations: 0,
    });
    expect(await reservationsOf(context, order.orderId)).toHaveLength(1);
    expect(await countForOrder(context, 'payment_attempts', order.orderId)).toBe(1);
    expect(await countForOrder(context, 'payment_reconciliations', order.orderId)).toBe(1);
    expect(await obligationsOf(context, order.orderId)).toHaveLength(1);

    // No provider was contacted, and none could have been: the manual
    // verification path writes no provider event and IMP-O007 stays open.
    const { rows } = await context.database.client.db.execute<{ count: string }>(sql`
      select count(*)::text as count from payment_provider_events
    `);
    expect(Number(rows[0]?.count ?? '0')).toBe(0);
  }, 300_000);
});
