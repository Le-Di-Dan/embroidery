/**
 * `APP12-B04` §37, §38 — the two races the customer payment surface has to
 * survive, against a real PostgreSQL with real row locks.
 *
 * Both are about the same failure: acting on a world that has moved. The
 * customer's browser holds a payable amount and a QR from a read that happened
 * seconds ago, and between that read and their initiation either the stock
 * reservation lapsed or an operator corrected the shipping fee. The initiation
 * must never trust the earlier read — which is why it re-resolves the grant
 * under its row lock, re-reads the live obligation and re-checks payability
 * inside its own transaction rather than accepting anything the client carries.
 *
 * ### What is driven, and what is constructed
 *
 * §38 is a genuine race: two real HTTP requests are dispatched without awaiting
 * each other, so the database arbitrates them exactly as it would in
 * production, and the assertion is on the committed rows afterwards.
 *
 * §37 is deliberately **sequential**, because that is the shape of the hazard:
 * the customer read first and initiates afterwards. The expiry itself is
 * `APP12-B03-C1`'s subject and is proved there against the real worker process;
 * what is under test here is what this surface does once that transition has
 * committed, so the terminal state is applied directly and said to be.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createReadyMadeOrder,
  dataOf,
  obligationsOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  attemptsForOrder,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  FULL_PAYMENT_QR_ROUTE,
  FULL_PAYMENT_ROUTE,
  seedStepUp,
} from '../support/ready-made-access-fixture';

interface FullPaymentPayload {
  readonly fullPaymentAmount: string;
  readonly payable: boolean;
}

describe('APP12-B04 — payment races', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b04_races');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  const readPayment = (token: string) =>
    request(serverOf(context)).post(FULL_PAYMENT_ROUTE).send({ token });

  const downloadQr = (token: string) =>
    request(serverOf(context)).post(FULL_PAYMENT_QR_ROUTE).send({ token });

  const initiate = (token: string, key: string) =>
    request(serverOf(context))
      .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
      .set('Idempotency-Key', key)
      .send({ token });

  const setFee = (orderId: string, feeAmount: string) =>
    request(serverOf(context))
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }));

  async function payableOrder(label: string) {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: 250_000,
      quantity: 1,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await setFee(order.orderId, '30000').expect(200);
    await seedStepUp(context, order.fixture.customerId);
    return { ...order, token };
  }

  /** §37 — a read and a QR taken before the window closed authorise nothing. */
  it('refuses an initiation after the reservation has lapsed, however fresh the read was', async () => {
    const order = await payableOrder('expiryrace');

    // The customer's browser: a payable read and a downloaded QR.
    const before = dataOf<FullPaymentPayload>(await readPayment(order.token));
    expect(before.payable).toBe(true);
    expect(before.fullPaymentAmount).toBe('280000.00');
    expect((await downloadQr(order.token)).status).toBe(200);

    // The expiry sweep commits between the two customer actions. This is the
    // exact terminal state `expire-reservations.usecase.ts` writes — the sweep
    // itself is proved against the real worker process in `APP12-B03-C1`.
    await context.database.client.db.execute(sql`
      update inventory_reservations set status = 'EXPIRED' where order_id = ${order.orderId}
    `);
    await context.database.client.db.execute(sql`
      update payment_obligations set status = 'CANCELLED'
      where order_id = ${order.orderId} and status = 'PENDING'
    `);
    await context.database.client.db.execute(sql`
      update orders set status = 'CANCELLED', cancelled_reason = 'Reservation window expired.'
      where id = ${order.orderId}
    `);

    // The initiation re-reads everything and refuses. Nothing about the earlier
    // read, the earlier QR or the earlier payable answer is consulted.
    const refused = await initiate(order.token, `expiry-${order.orderId}`);
    expect(refused.status).toBe(404);
    expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
  });

  /**
   * §38 — an initiation and a fee correction, dispatched together.
   *
   * Either ordering is legitimate and the suite asserts the invariant rather
   * than the winner: whichever obligation an attempt ended up on, its amount is
   * **that obligation's** amount. A predecessor's figure sitting on a successor
   * is the one outcome that must be impossible, because it is money the
   * customer would transfer and an operator would fail to reconcile.
   */
  it('never binds a predecessor amount to the successor obligation', async () => {
    const order = await payableOrder('feerace');

    const [initiated, corrected] = await Promise.all([
      initiate(order.token, `race-${order.orderId}`),
      setFee(order.orderId, '45000'),
    ]);

    // The Admin write is the authority on the fee and must have succeeded or
    // refused cleanly; it never leaves a half-applied correction.
    expect([200, 409]).toContain(corrected.status);
    expect([201, 404, 409]).toContain(initiated.status);

    const obligations = await obligationsOf(context, order.orderId);
    const byId = new Map(obligations.map((row) => [row.id, row]));
    const live = obligations.filter((row) => row.status === 'PENDING');
    // Exactly one live FULL survives, whichever way the two landed —
    // `uq_payment_obligations__order_kind__live` is the arbiter.
    expect(live).toHaveLength(1);

    for (const attempt of await attemptsForOrder(context, order.orderId)) {
      const obligation = byId.get(attempt.obligation_id);
      expect(obligation).toBeDefined();
      expect(attempt.amount).toBe(obligation?.amount);
    }

    // Whatever happened, the customer's next read is the live obligation's own
    // figure and the composition never compounded.
    const after = dataOf<FullPaymentPayload>(await readPayment(order.token));
    expect(after.fullPaymentAmount).toBe(live[0]?.amount);
    expect(['280000.00', '295000.00']).toContain(after.fullPaymentAmount);
  });
});
