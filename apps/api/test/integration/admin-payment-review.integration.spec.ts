/**
 * `APP7-B04` — the mismatch path, the explicit review, and terminal-state
 * integrity, over real HTTP against real PostgreSQL.
 *
 * The claim every one of these proves is the same: **nothing that is not an
 * exact match may ever satisfy a deposit.** An under-payment, an over-payment, a
 * wrong reference, a deliberate escalation and a settled attempt each end
 * somewhere different, and none of them ends at `DEPOSIT_PAID`.
 *
 * The sibling `-verification` suite owns the read and the success path; `-races`
 * owns CC-10, the same-attempt race and the rollback proof.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  countAudit,
  countOutbox,
  countRows,
  createAdminPaymentContext,
  openAttempt,
  readAttempt,
  readObligation,
  readOrderStatus,
  readReconciliations,
  seedVerifiableAttempt,
  type AdminPaymentTestContext,
  type Envelope,
  type SeededAttempt,
} from '../support/admin-payment-fixture';

jest.setTimeout(240_000);

interface DecisionBody {
  readonly attemptId: string;
  readonly attemptStatus: string;
  readonly depositStatus: string;
  readonly orderStatus: string;
  readonly reconciliationAction: string;
  readonly replayed: boolean;
}

describe('APP7-B04 — mismatch, explicit review and terminal-state integrity', () => {
  let context: AdminPaymentTestContext;

  beforeAll(async () => {
    context = await createAdminPaymentContext('app7_b04_review');
  });

  afterAll(async () => {
    await context?.close();
  });

  const authed = {
    post: (path: string) =>
      context.ctx.http.post(path).set('Cookie', context.cookie()).set('Origin', ADMIN_ORIGIN),
  };

  async function seed(suffix: string): Promise<SeededAttempt> {
    return seedVerifiableAttempt(context.ctx.app, context.ctx.database, { suffix });
  }

  /** Every post-condition a non-satisfying decision must leave behind. */
  async function expectDepositUntouched(seeded: SeededAttempt): Promise<void> {
    const obligation = await readObligation(context.ctx.database, seeded.depositObligationId);
    expect(obligation.status).toBe('PENDING');
    expect(obligation.satisfied_by_attempt_id).toBeNull();
    expect(obligation.satisfied_at).toBeNull();
    expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('AWAITING_DEPOSIT');
    expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(0);
    expect(
      await countAudit(context.ctx.database, 'payment_attempt.verified', seeded.attemptId),
    ).toBe(0);
    expect(
      await countRows(
        context.ctx.database,
        sql`select count(*)::text as count from payment_provider_events`,
      ),
    ).toBe(0);
  }

  describe('a mismatched observation is routed to durable review, never to success', () => {
    it('routes an under-payment to REQUIRES_REVIEW with the operator’s reason', async () => {
      const seeded = await seed('under');

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          // One đồng short of `765000.00`. There is no tolerance.
          observedAmount: '764999',
          observedTransferReference: seeded.expectedReference,
          note: 'Khách chuyển thiếu 1.000đ so với số tiền cọc.',
        })
        .expect(200);

      const body = (response.body as Envelope<DecisionBody>).data;
      expect(body.attemptStatus).toBe('REQUIRES_REVIEW');
      expect(body.depositStatus).toBe('PENDING');
      expect(body.orderStatus).toBe('AWAITING_DEPOSIT');
      expect(body.reconciliationAction).toBe('MANUAL_MATCH');

      const attempt = await readAttempt(context.ctx.database, seeded.attemptId);
      expect(attempt.status).toBe('REQUIRES_REVIEW');
      // `ck_payment_attempts__review_reason_required` — mandatory on entry.
      expect(attempt.review_reason).toBe('Khách chuyển thiếu 1.000đ so với số tiền cọc.');
      expect(attempt.succeeded_at).toBeNull();

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations).toHaveLength(1);
      expect(reconciliations[0]?.resolved_status).toBe('REQUIRES_REVIEW');
      // The observed figure is recorded as evidence of exactly what contradicted.
      expect(reconciliations[0]?.amount).toBe('764999.00');

      expect(
        await countAudit(context.ctx.database, 'payment_attempt.review_required', seeded.attemptId),
      ).toBe(1);
      await expectDepositUntouched(seeded);
    });

    it('routes an over-payment to REQUIRES_REVIEW, not to success', async () => {
      const seeded = await seed('over');
      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: '900000',
          observedTransferReference: seeded.expectedReference,
          note: 'Khách chuyển dư.',
        })
        .expect(200);
      expect((response.body as Envelope<DecisionBody>).data.attemptStatus).toBe('REQUIRES_REVIEW');
      await expectDepositUntouched(seeded);
    });

    it('routes a wrong reference to REQUIRES_REVIEW even when the amount is exact', async () => {
      const seeded = await seed('refmismatch');
      // Another order's reference: the right shape, the wrong order. A shape
      // check alone would have accepted this, which is why equality is proved
      // against the order's own derived value server-side.
      const other = await seed('refmismatch-other');

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: other.expectedReference,
          note: 'Nội dung chuyển khoản không khớp mã đơn.',
        })
        .expect(200);

      expect((response.body as Envelope<DecisionBody>).data.attemptStatus).toBe('REQUIRES_REVIEW');
      await expectDepositUntouched(seeded);
      // And the *other* order is untouched too — a mismatched reference never
      // reaches across to the order it names.
      await expectDepositUntouched(other);
    });

    it('records a non-canonical memo as evidence instead of rejecting it (APP7-B04-C1)', async () => {
      const seeded = await seed('noncanonical');
      // The exact defect `APP7-B04-C1` corrects. B04 validated the **observed**
      // memo against the pattern of the **derived** reference, so a customer who
      // typed the right characters in lowercase produced a `400` and the
      // contradiction was never recorded anywhere. An observed bank memo is
      // evidence about the outside world, not an identifier this system issues.
      const lowercase = seeded.expectedReference.toLowerCase();
      expect(lowercase).not.toBe(seeded.expectedReference);

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: lowercase,
          note: 'Nội dung chuyển khoản viết thường, không khớp mã đã cấp.',
        })
        // Not a 400. It reaches the business logic and commits a durable review.
        .expect(200);

      const body = (response.body as Envelope<DecisionBody>).data;
      expect(body.attemptStatus).toBe('REQUIRES_REVIEW');
      expect(body.depositStatus).toBe('PENDING');
      expect(body.orderStatus).toBe('AWAITING_DEPOSIT');

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations).toHaveLength(1);
      // Persisted verbatim. A later audit must be able to tell what the customer
      // was instructed to use from what the transaction actually contained, so
      // the stored value is neither uppercased nor normalised toward the
      // expected one.
      expect(reconciliations[0]?.bank_reference).toBe(lowercase);
      expect(reconciliations[0]?.resolved_status).toBe('REQUIRES_REVIEW');

      // And accepting it at the boundary did not make it equivalent.
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe(
        'REQUIRES_REVIEW',
      );
      await expectDepositUntouched(seeded);
    });

    it('accepts an observed memo longer than any invented bound, untruncated (APP7-B04-FD1)', async () => {
      const seeded = await seed('longmemo');
      // Well past the 2000-character ceiling `APP7-B04-C1` had borrowed from the
      // note field. `payment_reconciliations.bank_reference` is `text` with no
      // length authority, so nothing in this path may decide such a memo cannot
      // exist — and nothing may quietly shorten it either.
      const long = `${seeded.expectedReference}-${'x'.repeat(5_000)}`;
      expect(long.length).toBeGreaterThan(2_000);

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: long,
          note: 'Nội dung chuyển khoản dài bất thường.',
        })
        // Not a 400: the request boundary imposes no length of its own.
        .expect(200);

      expect((response.body as Envelope<DecisionBody>).data.attemptStatus).toBe('REQUIRES_REVIEW');

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations).toHaveLength(1);
      // Byte-for-byte, and the length is asserted separately so a silent
      // truncation to 2000 could not pass by prefix equality.
      expect(reconciliations[0]?.bank_reference).toBe(long);
      expect(reconciliations[0]?.bank_reference?.length).toBe(long.length);

      // A long memo is still a mismatch, not a success.
      await expectDepositUntouched(seeded);
    });

    it('resolves a REQUIRES_REVIEW attempt when the operator then verifies it exactly', async () => {
      const seeded = await seed('resolve');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: '700000',
          observedTransferReference: seeded.expectedReference,
          note: 'Chưa rõ, chờ đối chiếu.',
        })
        .expect(200);
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe(
        'REQUIRES_REVIEW',
      );

      // LC-16 `TR-LC16-06`: REQUIRES_REVIEW -> a resolved state, by an Admin,
      // with a reconciliation record. The same verify operation does it.
      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Đã đối chiếu lại sao kê, tiền về đủ.',
        })
        .expect(200);

      const body = (response.body as Envelope<DecisionBody>).data;
      expect(body.attemptStatus).toBe('SUCCEEDED');
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('DEPOSIT_PAID');
      // The action names the work: an open review was taken up and answered.
      expect(body.reconciliationAction).toBe('RESOLVE_REVIEW');

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations.map((row) => row.action)).toEqual(['MANUAL_MATCH', 'RESOLVE_REVIEW']);
      expect(reconciliations.map((row) => row.resolved_status)).toEqual([
        'REQUIRES_REVIEW',
        'SUCCEEDED',
      ]);
      expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(1);
    });
  });

  describe('the explicit review operation', () => {
    it('routes the attempt to review, satisfies nothing and emits nothing', async () => {
      const seeded = await seed('explicit');

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
        .send({ reviewReason: 'Nội dung chuyển khoản không đọc được trên sao kê.' })
        .expect(200);

      const body = (response.body as Envelope<DecisionBody>).data;
      expect(body.attemptStatus).toBe('REQUIRES_REVIEW');
      expect(body.depositStatus).toBe('PENDING');
      expect(body.orderStatus).toBe('AWAITING_DEPOSIT');
      expect(body.replayed).toBe(false);

      const attempt = await readAttempt(context.ctx.database, seeded.attemptId);
      expect(attempt.status).toBe('REQUIRES_REVIEW');
      expect(attempt.review_reason).toBe('Nội dung chuyển khoản không đọc được trên sao kê.');

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations).toHaveLength(1);
      expect(reconciliations[0]?.action).toBe('MANUAL_MATCH');
      expect(reconciliations[0]?.resolved_status).toBe('REQUIRES_REVIEW');
      // No figure was stated, so none is recorded — not a fabricated zero.
      expect(reconciliations[0]?.amount).toBeNull();
      expect(reconciliations[0]?.bank_reference).toBeNull();

      await expectDepositUntouched(seeded);
    });

    it('records an observed amount and reference when the operator states them', async () => {
      const seeded = await seed('explicit2');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
        .send({
          reviewReason: 'Có hai giao dịch cùng nội dung.',
          observedAmount: '765000',
          observedTransferReference: seeded.expectedReference,
        })
        .expect(200);

      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations[0]?.amount).toBe('765000.00');
      expect(reconciliations[0]?.bank_reference).toBe(seeded.expectedReference);
      await expectDepositUntouched(seeded);
    });

    it('requires a reason — a body of spaces is a 400 with no effect', async () => {
      const seeded = await seed('explicit3');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
        .send({ reviewReason: '   ' })
        .expect(400);
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('PENDING');
      expect(await readReconciliations(context.ctx.database, seeded.attemptId)).toHaveLength(0);
    });

    it('rejects a body that tries to name the status, the operator or the order', async () => {
      const seeded = await seed('explicit4');
      for (const extra of [
        { toStatus: 'SUCCEEDED' },
        { adminId: newId() },
        { orderId: newId() },
        { resolvedStatus: 'SUCCEEDED' },
        { evidencePresent: true },
        { expectedAmount: '1' },
      ]) {
        await authed
          .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
          .send({ reviewReason: 'x', ...extra })
          .expect(400);
      }
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('PENDING');
    });
  });

  describe('terminal states never regress', () => {
    it('refuses a second verification of a SUCCEEDED attempt with different facts', async () => {
      const seeded = await seed('terminal1');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Đã xác nhận.',
        })
        .expect(200);

      // Not the same logical verification — a different observed amount — so it
      // is a conflict, not a replay.
      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: '1',
          observedTransferReference: seeded.expectedReference,
          note: 'Nhầm.',
        })
        .expect(409);
      expect((response.body as { code: string }).code).toBe('PAYMENT_ATTEMPT_ALREADY_SETTLED');

      // The committed decision stands and gained no second record.
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('SUCCEEDED');
      expect(await readReconciliations(context.ctx.database, seeded.attemptId)).toHaveLength(1);
      expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(1);
    });

    it('refuses to route a SUCCEEDED attempt back into review', async () => {
      const seeded = await seed('terminal2');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Đã xác nhận.',
        })
        .expect(200);

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
        .send({ reviewReason: 'Muốn xem lại.' })
        .expect(409);
      expect((response.body as { code: string }).code).toBe('PAYMENT_ATTEMPT_ALREADY_SETTLED');
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('SUCCEEDED');
      expect((await readObligation(context.ctx.database, seeded.depositObligationId)).status).toBe(
        'SATISFIED',
      );
    });

    it('preserves the winner when a second attempt on the same deposit is verified', async () => {
      const seeded = await seed('winner');
      const loser = await openAttempt(context.ctx.app, seeded.depositObligationId);

      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Giao dịch thứ nhất.',
        })
        .expect(200);

      // The second attempt is exact too, and is still refused: the deposit is
      // already satisfied and a second satisfying application must not happen.
      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(loser))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Giao dịch thứ hai.',
        })
        .expect(409);
      expect((response.body as { code: string }).code).toBe('DEPOSIT_NOT_PAYABLE');

      const obligation = await readObligation(context.ctx.database, seeded.depositObligationId);
      expect(obligation.satisfied_by_attempt_id).toBe(seeded.attemptId);
      expect((await readAttempt(context.ctx.database, loser)).status).toBe('PENDING');
      expect(await readReconciliations(context.ctx.database, loser)).toHaveLength(0);
      expect(await countOutbox(context.ctx.database, 'payment.verified', loser)).toBe(0);
    });

    it('refuses to verify an attempt on the REMAINING obligation', async () => {
      const seeded = await seed('remaining');
      const remainingAttempt = await openAttempt(context.ctx.app, seeded.remainingObligationId);

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(remainingAttempt))
        .send({
          observedAmount: '1785000',
          observedTransferReference: seeded.expectedReference,
          note: 'Thu nốt phần còn lại.',
        })
        .expect(409);
      expect((response.body as { code: string }).code).toBe('PAYMENT_ATTEMPT_NOT_VERIFIABLE');

      expect((await readAttempt(context.ctx.database, remainingAttempt)).status).toBe('PENDING');
      expect(
        (await readObligation(context.ctx.database, seeded.remainingObligationId)).status,
      ).toBe('PENDING');
      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('AWAITING_DEPOSIT');
    });

    it('refuses an unknown attempt with a 404', async () => {
      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(newId()))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: 'ORD7K3MPQ2XVDDC',
          note: 'x',
        })
        .expect(404);
      expect((response.body as { code: string }).code).toBe('PAYMENT_ATTEMPT_NOT_FOUND');
    });
  });
});
