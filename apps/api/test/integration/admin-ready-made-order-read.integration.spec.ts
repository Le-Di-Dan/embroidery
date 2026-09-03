/**
 * `APP12-A02-C1` — the origin-aware Admin order and payment reads, end to end
 * against a real database through the real HTTP surface.
 *
 * ### What this exists to prove
 *
 * `APP12-A02`'s contract preflight found the delivered Admin reads unusable for
 * half the shop, and proved it live: with one `READY_MADE` order present,
 * `GET /api/admin/orders` and `GET /api/admin/orders/{id}` answered **500** —
 * the queue failing for its *custom* rows too, because it maps row by row
 * inside one request — and `GET .../payments` answered **404 ORDER_NOT_FOUND**
 * because its obligation lookup filtered `kind = 'DEPOSIT'` in SQL. Every case
 * below is one of those failures, inverted.
 *
 * Every order under test is created by the production
 * `publicReadyMadeOrder_create` command and priced through the production
 * `adminOrderShipping_save`, behind the real `AuthenticatedAdminGuard`. Nothing
 * fabricates an order row, an obligation or an attempt in order to assert about
 * it: a mapper that refuses a legitimate row can only be caught by a row the
 * legitimate writer actually wrote.
 *
 * The mixed-queue case seeds a **custom** order beside a Ready-Made one, since
 * the defect's worst property was collateral: the assertion that matters is not
 * that the Ready-Made row appears, but that the custom row still does.
 */

import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  createReadyMadeOrder,
  dataOf,
  obligationsOf,
  reservationOf,
  seedAdminSession,
  shippingBody,
  SHIPPING_ROUTE,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  seedStepUp,
} from '../support/ready-made-access-fixture';
import { seedDeposit } from '../support/customer-deposit-fixture';

const QUEUE_ROUTE = '/api/admin/orders';
const detailRoute = (orderId: string): string => `/api/admin/orders/${orderId}`;
const paymentsRoute = (orderId: string): string => `/api/admin/orders/${orderId}/payments`;

interface QueueItem {
  readonly orderId: string;
  readonly code: string;
  readonly status: string;
  readonly origin: string;
  readonly customRequestId?: string;
}
interface QueueBody {
  readonly items: readonly QueueItem[];
  readonly hasNext: boolean;
  readonly nextCursor?: string;
}
interface DetailItem {
  readonly position: number;
  readonly subjectKind: string;
  readonly skuId?: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPriceAmount: string;
  readonly lineTotalAmount: string;
  readonly approvalSnapshotId?: string;
}
interface DetailBody {
  readonly orderId: string;
  readonly status: string;
  readonly origin: string;
  readonly customRequestId?: string;
  readonly acceptedQuotationVersionId?: string;
  readonly currentApprovalSnapshotId?: string;
  readonly totalAmount: string;
  readonly paymentDeadline?: string;
  readonly items: readonly DetailItem[];
}
interface ObligationBody {
  readonly obligationId: string;
  readonly kind: string;
  readonly status: string;
  readonly expectedAmount: string;
  readonly expectedCurrencyCode: string;
  readonly expectedTransferReference: string;
  readonly satisfiedByAttemptId?: string;
}
interface PaymentsBody {
  readonly orderId: string;
  readonly orderStatus: string;
  readonly origin: string;
  readonly currentObligation?: ObligationBody;
  readonly attempts: readonly {
    readonly attemptId: string;
    readonly status: string;
    readonly amount: string;
    readonly evidence: readonly { readonly evidenceId: string; readonly assetStatus: string }[];
  }[];
  readonly reconciliations: readonly { readonly action: string }[];
}

describe('APP12-A02-C1 — origin-aware Admin order and payment reads', () => {
  let context: ApiIntegrationTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createApiIntegrationContext('app12_a02_c1_read');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  /** Prices a Ready-Made order through the production Admin command. */
  async function setFee(orderId: string, feeAmount: string): Promise<void> {
    await context.http
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount }))
      .expect(200);
  }

  /**
   * One priced Ready-Made order carrying a real customer FULL attempt.
   *
   * The attempt is opened through the delivered public command — same body
   * carrier, same idempotency header, same step-up requirement production uses —
   * so the id the Admin read publishes is one a customer actually created.
   */
  async function orderWithAttempt(
    label: string,
    fee: string,
  ): Promise<{ readonly orderId: string; readonly token: string; readonly attemptId: string }> {
    const made = await createReadyMadeOrder(context, {
      label,
      unitPrice: 500_000,
      quantity: 1,
    });
    const { token } = await adoptOrderAccessToken(context, made.orderId);
    await setFee(made.orderId, fee);
    await seedStepUp(context, made.fixture.customerId);

    const opened = await context.http
      .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
      .set('Idempotency-Key', `a02c1-${label}`)
      .send({ token })
      .expect(201);
    return {
      orderId: made.orderId,
      token,
      attemptId: (opened.body as { data: { attemptId: string } }).data.attemptId,
    };
  }

  describe('the queue', () => {
    it('serves a mixed page without failing, and reports each row’s own origin', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1queue',
        unitPrice: 200_000,
        quantity: 1,
      });

      // A real custom order beside it, seeded through the delivered AGG-15
      // chain and created by `OrderRepository.createFromAcceptedQuotation` —
      // the canonical writer. Not a hand-written `orders` row: the collateral
      // claim below is that a *legitimately written* custom order still renders
      // on a page a Ready-Made order shares, and a fabricated row would prove
      // the fixture rather than the system.
      const custom = await seedDeposit(context.app, context.database, { suffix: 'c1mixed' });

      const body = dataOf<QueueBody>(
        await context.http.get(QUEUE_ROUTE).set('Cookie', cookie).expect(200),
      );

      const readyMade = body.items.find((item) => item.orderId === made.orderId);
      const customRow = body.items.find((item) => item.orderId === custom.orderId);

      // The Ready-Made row renders at all — the 500 this correction removed.
      expect(readyMade?.origin).toBe('READY_MADE');
      expect(readyMade?.status).toBe('AWAITING_SHIPPING_FEE');
      // No fabricated custom chain stands in for the absent one.
      expect(readyMade?.customRequestId).toBeUndefined();

      // The collateral half, and the reason the defect was a Wave-1 blocker:
      // the custom row on the same page is still served, still truthful.
      expect(customRow?.origin).toBe('CUSTOM');
      expect(customRow?.customRequestId).toBe(custom.customRequestId);
    }, 120_000);

    it('filters on origin in SQL, in both directions and neither', async () => {
      const onlyReadyMade = dataOf<QueueBody>(
        await context.http
          .get(QUEUE_ROUTE)
          .query({ origin: 'READY_MADE' })
          .set('Cookie', cookie)
          .expect(200),
      );
      expect(onlyReadyMade.items.length).toBeGreaterThan(0);
      expect(onlyReadyMade.items.every((item) => item.origin === 'READY_MADE')).toBe(true);

      const onlyCustom = dataOf<QueueBody>(
        await context.http
          .get(QUEUE_ROUTE)
          .query({ origin: 'CUSTOM' })
          .set('Cookie', cookie)
          .expect(200),
      );
      expect(onlyCustom.items.length).toBeGreaterThan(0);
      expect(onlyCustom.items.every((item) => item.origin === 'CUSTOM')).toBe(true);

      const both = dataOf<QueueBody>(
        await context.http.get(QUEUE_ROUTE).set('Cookie', cookie).expect(200),
      );
      // Unfiltered is the union, so neither filter is hiding a row from the
      // other and the default is still "every origin".
      expect(both.items).toHaveLength(onlyReadyMade.items.length + onlyCustom.items.length);
    }, 120_000);

    it('pages the filtered set, so a narrow page is a full page', async () => {
      // The property a client-side filter cannot have. With `limit=1` over a
      // filtered set, the cursor must walk Ready-Made rows only — a page cut
      // before filtering would return an empty page with `hasNext: true`.
      await createReadyMadeOrder(context, { label: 'c1page', unitPrice: 150_000, quantity: 1 });

      const first = dataOf<QueueBody>(
        await context.http
          .get(QUEUE_ROUTE)
          .query({ origin: 'READY_MADE', limit: 1 })
          .set('Cookie', cookie)
          .expect(200),
      );
      expect(first.items).toHaveLength(1);
      expect(first.items[0]?.origin).toBe('READY_MADE');
      expect(first.hasNext).toBe(true);

      const second = dataOf<QueueBody>(
        await context.http
          .get(QUEUE_ROUTE)
          .query({ origin: 'READY_MADE', limit: 1, cursor: first.nextCursor })
          .set('Cookie', cookie)
          .expect(200),
      );
      expect(second.items).toHaveLength(1);
      expect(second.items[0]?.origin).toBe('READY_MADE');
      // A real page boundary: the second page is a different row.
      expect(second.items[0]?.orderId).not.toBe(first.items[0]?.orderId);
    }, 120_000);

    it('accepts the two Ready-Made statuses it could not name before', async () => {
      const body = dataOf<QueueBody>(
        await context.http
          .get(QUEUE_ROUTE)
          .query({ status: 'AWAITING_SHIPPING_FEE' })
          .set('Cookie', cookie)
          .expect(200),
      );
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.status === 'AWAITING_SHIPPING_FEE')).toBe(true);

      // The invented states stay refused by the schema, not silently ignored.
      await context.http
        .get(QUEUE_ROUTE)
        .query({ status: 'PAID' })
        .set('Cookie', cookie)
        .expect(400);
      await context.http
        .get(QUEUE_ROUTE)
        .query({ origin: 'READYMADE' })
        .set('Cookie', cookie)
        .expect(400);
    }, 120_000);
  });

  describe('the detail', () => {
    it('serves a Ready-Made order with its frozen lines and no fabricated chain', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1detail',
        unitPrice: 250_000,
        quantity: 2,
      });

      const body = dataOf<DetailBody>(
        await context.http.get(detailRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );

      expect(body.origin).toBe('READY_MADE');
      expect(body.status).toBe('AWAITING_SHIPPING_FEE');
      // The whole custom chain absent, not empty-stringed and not invented.
      expect(body.customRequestId).toBeUndefined();
      expect(body.acceptedQuotationVersionId).toBeUndefined();
      expect(body.currentApprovalSnapshotId).toBeUndefined();

      // The frozen line, as `APP12-B02` wrote it. Read from `order_items`, not
      // reconstructed from a live Catalog row.
      expect(body.items).toHaveLength(1);
      const line = body.items[0] as DetailItem;
      expect(line.subjectKind).toBe('CATALOG');
      expect(line.skuId).toBeDefined();
      expect(line.quantity).toBe(2);
      expect(line.unitPriceAmount).toBe('250000.00');
      expect(line.lineTotalAmount).toBe('500000.00');
      // A Ready-Made line approved nothing, so it carries no snapshot id.
      expect(line.approvalSnapshotId).toBeUndefined();
      // The order total is the frozen merchandise subtotal before pricing.
      expect(body.totalAmount).toBe(made.subtotal);
    }, 120_000);

    it('publishes the payment deadline as the reservation’s own committed instant', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1deadline',
        unitPrice: 100_000,
        quantity: 1,
      });

      const body = dataOf<DetailBody>(
        await context.http.get(detailRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );

      // Read, never recomputed: it equals the reservation row byte for byte,
      // which `now + a window constant` could not be made to do reliably.
      const reservation = await reservationOf(context, made.orderId);
      expect(body.paymentDeadline).toBe(new Date(reservation.expires_at as string).toISOString());
    }, 120_000);

    it('drops the deadline once nothing RESERVED stands', async () => {
      // Driven to that state by the **system**, not by an UPDATE: verifying the
      // FULL payment consumes the hold (`APP12-B05`), which is the ordinary way
      // a live reservation stops standing. A hand-written status change would
      // prove the fixture rather than that the read follows real committed
      // state.
      const { orderId, attemptId } = await orderWithAttempt('c1consumed', '12000.00');

      const before = dataOf<DetailBody>(
        await context.http.get(detailRoute(orderId)).set('Cookie', cookie).expect(200),
      );
      expect(before.paymentDeadline).toBeDefined();

      const payments = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(orderId)).set('Cookie', cookie).expect(200),
      );
      const expected = payments.currentObligation as ObligationBody;
      await context.http
        .post(`/api/admin/payment-attempts/${attemptId}/verify`)
        .set('Cookie', cookie)
        .send({
          observedAmount: expected.expectedAmount,
          observedTransferReference: expected.expectedTransferReference,
          note: 'Đã nhận đủ tiền.',
        })
        .expect(200);

      // The stock is committed, so there is no window left to count down to.
      const after = dataOf<DetailBody>(
        await context.http.get(detailRoute(orderId)).set('Cookie', cookie).expect(200),
      );
      expect(after.status).toBe('READY_FOR_DELIVERY');
      expect(after.paymentDeadline).toBeUndefined();

      const reservation = await reservationOf(context, orderId);
      expect(reservation.status).not.toBe('RESERVED');
    }, 120_000);
  });

  describe('the payment read', () => {
    it('answers 200 with nothing to collect before the first shipping fee', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1prefee',
        unitPrice: 300_000,
        quantity: 1,
      });

      // The exact 404 this correction removed. An unpriced order is a real
      // order, and the Admin detail opens on it routinely.
      const body = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );

      expect(body.origin).toBe('READY_MADE');
      expect(body.orderStatus).toBe('AWAITING_SHIPPING_FEE');
      expect(body.currentObligation).toBeUndefined();
      expect(body.attempts).toEqual([]);
      expect(body.reconciliations).toEqual([]);

      // And nothing was fabricated in the database to make that answer.
      expect(await obligationsOf(context, made.orderId)).toHaveLength(0);
    }, 120_000);

    it('publishes the FULL obligation the shipping fee created, with the FL memo', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1postfee',
        unitPrice: 400_000,
        quantity: 1,
      });
      await setFee(made.orderId, '30000.00');

      const body = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );

      expect(body.orderStatus).toBe('AWAITING_PAYMENT');
      const obligation = body.currentObligation as ObligationBody;
      expect(obligation.kind).toBe('FULL');
      expect(obligation.status).toBe('PENDING');

      // The obligation's own persisted amount, byte for byte — not recomposed
      // here from the subtotal plus the fee, even though both are known.
      const [live] = (await obligationsOf(context, made.orderId)).filter(
        (row) => row.status === 'PENDING',
      );
      expect(obligation.expectedAmount).toBe(live?.amount);
      expect(obligation.expectedCurrencyCode).toBe('VND');

      // The FULL memo, not the deposit's. `…FL`, never `…DC`.
      expect(obligation.expectedTransferReference).toMatch(/FL$/);
      expect(obligation.expectedTransferReference).not.toMatch(/DC$/);
      expect(obligation.expectedTransferReference).toMatch(/^[A-Z0-9]{15}$/);

      // No attempt has been opened yet, so the workbench has nothing to verify.
      expect(body.attempts).toEqual([]);
    }, 120_000);

    it('publishes the current attempt id, which is what makes verify addressable', async () => {
      const { orderId, attemptId } = await orderWithAttempt('c1attempt', '25000.00');

      const body = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(orderId)).set('Cookie', cookie).expect(200),
      );

      // The single fact `APP12-A02` could not obtain: `adminPaymentAttempt_verify`
      // is addressed by an attempt id, and until this correction no Admin read
      // published one for a FULL attempt.
      expect(body.attempts).toHaveLength(1);
      expect(body.attempts[0]?.attemptId).toBe(attemptId);
      expect(body.attempts[0]?.status).toBe('PENDING');
      expect(body.attempts[0]?.amount).toBe(body.currentObligation?.expectedAmount);
    }, 120_000);

    it('isolates a superseded predecessor and its attempt from the successor', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1supersede',
        unitPrice: 600_000,
        quantity: 1,
      });
      await setFee(made.orderId, '20000.00');

      // FULL A, with an attempt against it.
      const firstRead = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );
      const obligationA = firstRead.currentObligation?.obligationId;
      await seedStepUp(context, made.fixture.customerId);
      const { token } = await adoptOrderAccessToken(context, made.orderId);
      const openedA = await context.http
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', 'a02c1-supersede')
        .send({ token })
        .expect(201);
      const attemptA = (openedA.body as { data: { attemptId: string } }).data.attemptId;

      // The operator corrects the fee: A is superseded, B becomes live.
      await setFee(made.orderId, '45000.00');

      const afterRead = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );
      const obligationB = afterRead.currentObligation as ObligationBody;

      expect(obligationB.obligationId).not.toBe(obligationA);
      expect(obligationB.status).toBe('PENDING');

      // Asserted per obligation against committed rows, because a count across
      // the order cannot tell a supersede from a duplicate.
      const rows = await obligationsOf(context, made.orderId);
      expect(rows.find((row) => row.id === obligationA)?.status).toBe('SUPERSEDED');
      expect(rows.find((row) => row.id === obligationB.obligationId)?.status).toBe('PENDING');

      // The predecessor's attempt is **not** presented as the successor's. The
      // read lists attempts from the live obligation's own id, so the isolation
      // is a property of the query rather than of a filter afterwards.
      expect(afterRead.attempts.map((attempt) => attempt.attemptId)).not.toContain(attemptA);
      expect(afterRead.attempts).toEqual([]);

      // And the memo cannot be used to tell them apart — it is derived from the
      // order code, so both obligations carry the same one. This is why the
      // obligation id is the discriminator and the reference never is.
      expect(obligationB.expectedTransferReference).toBe(
        firstRead.currentObligation?.expectedTransferReference,
      );
    }, 120_000);

    it('keeps reporting a satisfied FULL rather than falling back to “no payment”', async () => {
      const made = await createReadyMadeOrder(context, {
        label: 'c1satisfied',
        unitPrice: 350_000,
        quantity: 1,
      });
      await setFee(made.orderId, '15000.00');

      await seedStepUp(context, made.fixture.customerId);
      const { token } = await adoptOrderAccessToken(context, made.orderId);
      const opened = await context.http
        .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
        .set('Idempotency-Key', 'a02c1-satisfied')
        .send({ token })
        .expect(201);
      const attemptId = (opened.body as { data: { attemptId: string } }).data.attemptId;

      const before = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );
      const expected = before.currentObligation as ObligationBody;

      // The delivered Admin verification command, addressed by the attempt id
      // this read published — the whole point of the correction.
      await context.http
        .post(`/api/admin/payment-attempts/${attemptId}/verify`)
        .set('Cookie', cookie)
        .send({
          observedAmount: expected.expectedAmount,
          observedTransferReference: expected.expectedTransferReference,
          note: 'Đã nhận đủ tiền.',
        })
        .expect(200);

      const after = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );

      // Backend truth, read back rather than assumed.
      expect(after.orderStatus).toBe('READY_FOR_DELIVERY');
      expect(after.currentObligation?.kind).toBe('FULL');
      expect(after.currentObligation?.status).toBe('SATISFIED');
      expect(after.currentObligation?.satisfiedByAttemptId).toBe(attemptId);
      expect(after.attempts[0]?.status).toBe('SUCCEEDED');
      // A satisfied obligation stays readable — reconciliation history is what
      // an operator returns to the screen for.
      expect(after.reconciliations.length).toBeGreaterThan(0);
    }, 120_000);

    it('still answers the custom deposit exactly as APP7 did', async () => {
      // The regression that matters most: widening the read must not change
      // what a custom order says. Proved against a real custom order through
      // the same route in `admin-payment-verification.integration.spec.ts`;
      // here the narrower claim is that origin selects the DEPOSIT lane and
      // that a Ready-Made order never reaches it.
      const made = await createReadyMadeOrder(context, {
        label: 'c1lane',
        unitPrice: 100_000,
        quantity: 1,
      });
      await setFee(made.orderId, '10000.00');

      const body = dataOf<PaymentsBody>(
        await context.http.get(paymentsRoute(made.orderId)).set('Cookie', cookie).expect(200),
      );
      // No DEPOSIT and no REMAINING is ever presented for a Ready-Made order.
      expect(body.currentObligation?.kind).toBe('FULL');
      const kinds = (await obligationsOf(context, made.orderId)).map((row) => row.kind);
      expect(kinds).not.toContain('DEPOSIT');
      expect(kinds).not.toContain('REMAINING');
    }, 120_000);
  });
});
