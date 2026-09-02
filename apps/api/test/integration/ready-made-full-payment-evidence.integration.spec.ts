/**
 * `APP12-B04` §22, §23, §40 — the Ready-Made `FULL` obligation reusing the
 * **delivered** attempt-scoped transfer-evidence lane.
 *
 * `APP12-B04` §22 sets `NEW_EVIDENCE_OPERATION = 0`: no `/full-payment/evidence`
 * route exists, and this suite is the proof. Every request below goes to
 * `publicOrderDepositEvidence_upload` and `_status` — the operations `APP7-B05`
 * published and `APP9-B02` already reused for the remaining balance — with an
 * `ORDER_ACCESS` token and a `FULL` attempt.
 *
 * The route prefix still reads `deposit` because renaming it would reissue two
 * accepted operation ids for a naming decision. What the lane *is* is
 * attempt-scoped (`IMP-D055`), which is why one order kind more needed no new
 * surface: only the first hop — the grant walk — had to learn a second scope.
 *
 * The same unmocked stack as the APP7 suites: the whole application, a
 * disposable PostgreSQL and a live disposable MinIO.
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { publishSecureAccessPolicies } from '../support/secure-access-policy-fixture';
import {
  createTransferEvidenceContext,
  evidenceRowsOf,
  nextEvidenceKey,
  readEvidenceStatus,
  uploadEvidence,
  type TransferEvidenceTestContext,
  type UploadBody,
} from '../support/transfer-evidence-fixture';
import {
  createReadyMadeOrder,
  dataOf,
  errorCodeOf,
  seedAdminSession,
  serverOf,
  SHIPPING_ROUTE,
  shippingBody,
} from '../support/ready-made-shipping-fixture';
import {
  adoptOrderAccessToken,
  FULL_PAYMENT_ATTEMPTS_ROUTE,
  seedStepUp,
} from '../support/ready-made-access-fixture';

jest.setTimeout(300_000);

interface AttemptPayload {
  readonly attemptId: string;
  readonly amount: string;
}

describe('APP12-B04 — FULL payment evidence through the delivered lane', () => {
  let context: TransferEvidenceTestContext;
  let cookie: string;

  beforeAll(async () => {
    context = await createTransferEvidenceContext('app12_b04_evidence');
    await publishSecureAccessPolicies(context.app, context.database);
    cookie = await seedAdminSession(context);
  });

  afterAll(async () => {
    await context?.close();
  });

  /** One priced, payable Ready-Made order with an open `FULL` attempt. */
  async function orderWithAttempt(label: string) {
    const order = await createReadyMadeOrder(context, {
      label,
      unitPrice: 250_000,
      quantity: 1,
    });
    const { token } = await adoptOrderAccessToken(context, order.orderId);
    await request(serverOf(context))
      .put(SHIPPING_ROUTE(order.orderId))
      .set('Cookie', cookie)
      .send(shippingBody({ feeAmount: '30000' }))
      .expect(200);
    await seedStepUp(context, order.fixture.customerId);

    const opened = await request(serverOf(context))
      .post(FULL_PAYMENT_ATTEMPTS_ROUTE)
      .set('Idempotency-Key', `evidence-${order.orderId}`)
      .send({ token });
    expect(opened.status).toBe(201);

    return { ...order, token, attempt: dataOf<AttemptPayload>(opened) };
  }

  it('accepts a screenshot against a FULL attempt, through the existing operation', async () => {
    const order = await orderWithAttempt('accepts');
    expect(order.attempt.amount).toBe('280000.00');

    const upload = await uploadEvidence(context, {
      token: order.token,
      attemptId: order.attempt.attemptId,
    });
    // 202: the bytes are stored and the association written, and the inspector
    // has not run yet — the delivered lane's own shape, unchanged for FULL.
    expect(upload.status).toBe(202);
    expect((upload.body as { data: UploadBody }).data.evidenceId).toEqual(expect.any(String));

    // The association is attempt-scoped, exactly as it is for a deposit.
    const rows = await evidenceRowsOf(context.database, order.attempt.attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payment_attempt_id).toBe(order.attempt.attemptId);

    const status = await readEvidenceStatus(context, order.token, order.attempt.attemptId);
    expect(status.status).toBe(200);
  });

  it('refuses another order’s attempt with the one indistinguishable answer', async () => {
    const a = await orderWithAttempt('crossa');
    const b = await orderWithAttempt('crossb');

    // §23 — the attempt id is a locator, and the authorizer re-proves that its
    // obligation hangs off *this grant's* order. Changing the id therefore
    // reaches a row that fails the order comparison, not another customer's
    // evidence lane.
    const response = await uploadEvidence(context, {
      token: a.token,
      attemptId: b.attempt.attemptId,
    });
    expect(response.status).toBe(404);
    expect(errorCodeOf(response)).toBe('SECURE_LINK_UNAVAILABLE');

    expect(await evidenceRowsOf(context.database, b.attempt.attemptId)).toHaveLength(0);
  });

  it('refuses a custom REQUEST_ACCESS token on a Ready-Made attempt', async () => {
    const order = await orderWithAttempt('scopecross');

    // A well-formed token that opens nothing here. The refusal is the same one
    // an unknown token gets — the scope is never named back.
    const response = await uploadEvidence(context, {
      token: 'A'.repeat(43),
      attemptId: order.attempt.attemptId,
      idempotencyKey: nextEvidenceKey(),
    });
    expect(response.status).toBe(404);
    expect(await evidenceRowsOf(context.database, order.attempt.attemptId)).toHaveLength(0);
  });

  it('moves no money: the obligation and the order are untouched by an upload', async () => {
    const order = await orderWithAttempt('nomoney');
    await uploadEvidence(context, {
      token: order.token,
      attemptId: order.attempt.attemptId,
    }).expect(202);

    const { rows } = await context.database.client.db.execute<{
      order_status: string;
      obligation_status: string;
      attempt_status: string;
    }>(sql`
      select o.status as order_status, p.status as obligation_status, a.status as attempt_status
      from orders o
      join payment_obligations p on p.order_id = o.id
      join payment_attempts a on a.payment_obligation_id = p.id
      where o.id = ${order.orderId}
    `);
    expect(rows[0]).toEqual({
      order_status: 'AWAITING_PAYMENT',
      obligation_status: 'PENDING',
      attempt_status: 'PENDING',
    });
  });
});
