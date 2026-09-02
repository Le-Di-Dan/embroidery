/**
 * `APP12-B04` — the customer `FULL` payment surface: read, QR, initiate and the
 * reused transfer-evidence lane, end to end against a real database.
 *
 * Every order is created by the production `publicReadyMadeOrder_create` and
 * priced by the production `adminOrderShipping_save`; every payment call goes
 * through the real HTTP routes with a real `ORDER_ACCESS` grant. Nothing here
 * fabricates an obligation, an attempt or a payable state — the one exception is
 * the terminal states an expiry sweep or `APP12-B05` produces, which have no
 * runtime path yet and say so where they are constructed.
 *
 * The money assertions use `APP12-B04` §39's exact example throughout:
 * `250000 + 30000 = 280000`, corrected to `250000 + 45000 = 295000`.
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
  errorCodeOf,
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
  syntheticAccessToken,
} from '../support/ready-made-access-fixture';

interface FullPaymentPayload {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly fullPaymentStatus: string;
  readonly fullPaymentAmount: string;
  readonly currencyCode: string;
  readonly payable: boolean;
  readonly bankInstructions: Record<string, string>;
  readonly accessExpiresAt: string;
}

interface AttemptPayload {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}

describe('APP12-B04 — the Ready-Made FULL payment surface', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_b04_full');
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

  /** One priced, payable order with a live grant and a fresh step-up. */
  async function payableOrder(label: string, fee = '30000') {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: 250_000,
      quantity: 1,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await setFee(order.orderId, fee).expect(200);
    await seedStepUp(context, order.fixture.customerId);
    return { ...order, token };
  }

  /** §14 — before the fee there is no obligation, so nothing is payable. */
  describe('before the shipping fee', () => {
    it('refuses the read, the QR and an initiation with one identical 404', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'prefee',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);
      await seedStepUp(context, order.fixture.customerId);

      // No provisional obligation was created to have something to refuse.
      expect(await obligationsOf(context, order.orderId)).toHaveLength(0);

      for (const response of [
        await readPayment(token),
        await downloadQr(token),
        await initiate(token, `prefee-${order.orderId}`),
      ]) {
        expect(response.status).toBe(404);
        expect(errorCodeOf(response)).toBe('SECURE_LINK_UNAVAILABLE');
      }

      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
    });
  });

  /** §15, §16, §17 — the read and the QR, at the exact composed amount. */
  describe('the payable surface', () => {
    it('publishes the live obligation amount, the FL memo and no internal id', async () => {
      const order = await payableOrder('read');
      const response = await readPayment(order.token);
      expect(response.status).toBe(200);

      const view = dataOf<FullPaymentPayload>(response);
      expect(view.fullPaymentStatus).toBe('PENDING');
      expect(view.fullPaymentAmount).toBe('280000.00');
      expect(view.currencyCode).toBe('VND');
      expect(view.payable).toBe(true);
      // `APP7-G01` §4's frozen format with this checkpoint's kind code.
      expect(view.bankInstructions['transferReference']).toMatch(
        /^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}FL$/,
      );

      const body = JSON.stringify(response.body);
      const [obligation] = await obligationsOf(context, order.orderId);
      expect(body).not.toContain(order.orderId);
      expect(body).not.toContain(obligation?.id ?? 'never');
      expect(body).not.toContain(order.fixture.customerId);
    });

    it('streams a QR PNG that is never cached and names no order fact', async () => {
      const order = await payableOrder('qr');
      const response = await downloadQr(order.token);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).not.toContain(order.orderId);
      expect(Buffer.isBuffer(response.body)).toBe(true);
      // Downloading changes nothing: no attempt, no state move.
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
    });
  });

  /** §18, §19 — one attempt, bound to the live obligation, at its amount. */
  describe('initiating a payment attempt', () => {
    it('opens one PENDING BANK_TRANSFER attempt for the exact amount', async () => {
      const order = await payableOrder('initiate');
      const response = await initiate(order.token, `init-${order.orderId}`);

      expect(response.status).toBe(201);
      const view = dataOf<AttemptPayload>(response);
      expect(view.method).toBe('BANK_TRANSFER');
      expect(view.status).toBe('PENDING');
      expect(view.amount).toBe('280000.00');
      expect(view.replayed).toBe(false);
      expect(view.transferReference).toMatch(/FL$/);

      const attempts = await attemptsForOrder(context, order.orderId);
      expect(attempts).toHaveLength(1);
      const [live] = await obligationsOf(context, order.orderId);
      expect(attempts[0]?.obligation_id).toBe(live?.id);
      expect(attempts[0]?.amount).toBe('280000.00');

      // Not a payment: the obligation and the order are untouched.
      expect(live?.status).toBe('PENDING');
    });

    it('replays the same attempt for the same Idempotency-Key', async () => {
      const order = await payableOrder('replayinit');
      const key = `replay-${order.orderId}`;

      const first = dataOf<AttemptPayload>(await initiate(order.token, key));
      const second = await initiate(order.token, key);
      expect(second.status).toBe(201);

      const replayed = dataOf<AttemptPayload>(second);
      expect(replayed.attemptId).toBe(first.attemptId);
      expect(replayed.replayed).toBe(true);
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(1);
    });

    it('refuses without a fresh step-up, and writes nothing', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'nostepup',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);
      await setFee(order.orderId, '30000').expect(200);
      // Deliberately no step-up: the customer verified to *place* the order,
      // which GRD-003 does not accept as proof of presence now.

      const response = await initiate(token, `nostepup-${order.orderId}`);
      expect(response.status).toBe(403);
      expect(errorCodeOf(response)).toBe('REVERIFICATION_REQUIRED');
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
    });

    it('refuses a step-up that has fallen outside the published window', async () => {
      const order = await createReadyMadeOrder(context, {
        label: 'stalestepup',
        unitPrice: 250_000,
        quantity: 1,
      });
      const { token } = await adoptOrderAccessToken(context, order.orderId);
      await setFee(order.orderId, '30000').expect(200);
      // The published window is fifteen minutes; this proof is an hour old.
      await seedStepUp(context, order.fixture.customerId, 3_600);

      expect((await initiate(token, `stale-${order.orderId}`)).status).toBe(403);
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
    });
  });

  /** §20, §21, §39 — a fee correction, and what happens to the old attempt. */
  describe('a shipping-fee correction after an attempt exists', () => {
    it('leaves the old attempt under the superseded obligation and prices the new one', async () => {
      const order = await payableOrder('supersede');
      const firstAttempt = dataOf<AttemptPayload>(
        await initiate(order.token, `sup-a-${order.orderId}`),
      );
      expect(firstAttempt.amount).toBe('280000.00');

      // The Admin corrects the fee. B03 supersedes the predecessor and creates
      // a successor priced from the *frozen subtotal*, not from the old total.
      await setFee(order.orderId, '45000').expect(200);

      const obligations = await obligationsOf(context, order.orderId);
      expect(obligations).toHaveLength(2);
      const superseded = obligations.find((row) => row.status === 'SUPERSEDED');
      const live = obligations.find((row) => row.status === 'PENDING');
      expect(superseded?.amount).toBe('280000.00');
      expect(live?.amount).toBe('295000.00');
      expect(superseded?.superseded_by_obligation_id).toBe(live?.id);

      // The customer's read and QR now describe the successor.
      const view = dataOf<FullPaymentPayload>(await readPayment(order.token));
      expect(view.fullPaymentAmount).toBe('295000.00');
      expect((await downloadQr(order.token)).status).toBe(200);

      // The old attempt is history under the obligation it was opened against,
      // and was not migrated to its successor.
      const attempts = await attemptsForOrder(context, order.orderId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.obligation_id).toBe(superseded?.id);
      expect(attempts[0]?.amount).toBe('280000.00');

      // A new initiation binds the successor at the successor's amount. The
      // same key is free again because the idempotency scope is the obligation.
      await seedStepUp(context, order.fixture.customerId);
      const nextAttempt = dataOf<AttemptPayload>(
        await initiate(order.token, `sup-a-${order.orderId}`),
      );
      expect(nextAttempt.replayed).toBe(false);
      expect(nextAttempt.amount).toBe('295000.00');

      const after = await attemptsForOrder(context, order.orderId);
      expect(after).toHaveLength(2);
      expect(after[1]?.obligation_id).toBe(live?.id);
    });
  });

  /** §25, §26 — terminal orders and settled payments are not re-initiable. */
  describe('states that are no longer payable', () => {
    it('refuses the QR and a new attempt once the order is cancelled', async () => {
      const order = await payableOrder('cancelled');

      // The terminal state the expiry sweep produces. Written directly: driving
      // the worker is `APP12-B03-C1`'s suite, and what is under test here is
      // what the customer surface does when it meets the state.
      await context.database.client.db.execute(sql`
        update payment_obligations set status = 'CANCELLED'
        where order_id = ${order.orderId} and status = 'PENDING'
      `);
      await context.database.client.db.execute(sql`
        update orders set status = 'CANCELLED', cancelled_reason = 'Reservation window expired.'
        where id = ${order.orderId}
      `);

      // No live obligation at all, so every operation gives the one 404.
      for (const response of [
        await readPayment(order.token),
        await downloadQr(order.token),
        await initiate(order.token, `cancel-${order.orderId}`),
      ]) {
        expect(response.status).toBe(404);
      }
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(0);
    });

    it('reports a satisfied payment honestly but refuses to reopen it', async () => {
      const order = await payableOrder('satisfied');
      const attempt = dataOf<AttemptPayload>(await initiate(order.token, `sat-${order.orderId}`));

      // Fixture authority only: `APP12-B05` owns verification, so no runtime
      // path reaches SATISFIED yet. The evidence is not faked away —
      // `ck_payment_obligations__satisfied_evidence_required` and G-DB7-33
      // demand a SUCCEEDED attempt matching the amount, and this is that one.
      await context.database.client.db.execute(sql`
        update payment_attempts set status = 'SUCCEEDED', succeeded_at = now()
        where id = ${attempt.attemptId}
      `);
      await context.database.client.db.execute(sql`
        update payment_obligations
        set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attempt.attemptId}
        where order_id = ${order.orderId} and status = 'PENDING'
      `);

      // The read stays available and tells the truth.
      const view = dataOf<FullPaymentPayload>(await readPayment(order.token));
      expect(view.fullPaymentStatus).toBe('SATISFIED');
      expect(view.payable).toBe(false);

      // The two operations that *act* refuse.
      expect((await downloadQr(order.token)).status).toBe(409);
      await seedStepUp(context, order.fixture.customerId);
      const refused = await initiate(order.token, `sat2-${order.orderId}`);
      expect(refused.status).toBe(409);
      expect(errorCodeOf(refused)).toBe('FULL_PAYMENT_NOT_PAYABLE');
      expect(await attemptsForOrder(context, order.orderId)).toHaveLength(1);
    });
  });

  /** §28 — one order's token reaches no other order's payment. */
  describe('cross-order isolation', () => {
    it('never lets order A’s token read, price or pay order B', async () => {
      const a = await payableOrder('crossa', '30000');
      const b = await payableOrder('crossb', '55000');

      expect(dataOf<FullPaymentPayload>(await readPayment(a.token)).fullPaymentAmount).toBe(
        '280000.00',
      );
      expect(dataOf<FullPaymentPayload>(await readPayment(b.token)).fullPaymentAmount).toBe(
        '305000.00',
      );

      // Each initiation lands on its own obligation; neither can name the
      // other, because no operation on this surface takes an order id.
      await initiate(a.token, `cross-${a.orderId}`).expect(201);
      expect(await attemptsForOrder(context, b.orderId)).toHaveLength(0);
    });

    it('refuses an unknown token on every operation', async () => {
      const token = syntheticAccessToken();
      expect((await readPayment(token)).status).toBe(404);
      expect((await downloadQr(token)).status).toBe(404);
      expect((await initiate(token, 'unknown-key-0001')).status).toBe(404);
    });
  });
});
