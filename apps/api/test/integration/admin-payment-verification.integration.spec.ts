/**
 * `APP7-B04` — the Admin deposit read and the successful verification, over
 * real HTTP against real PostgreSQL.
 *
 * The whole application runs: the real `AuthenticatedAdminGuard` against a real
 * `admin_sessions` row, the real `StaffOriginGuard` and `StaffJsonBodyGuard`,
 * the real Zod pipe, the real envelope and the canonical AGG-15/AGG-16 writers.
 * Nothing is mocked, and every post-condition is read back out of the database
 * with raw SQL rather than out of the response that claimed it.
 *
 * The sibling `-refusals` suite owns the mismatch, review and terminal-state
 * paths; `-races` owns CC-10, the same-attempt race and the rollback proof. The
 * split keeps each inside the 600-line test limit and gives each one review
 * object.
 */
import { sql } from 'drizzle-orm';
import { newId } from '@embroidery/database';

import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  countAudit,
  countDownstreamWrites,
  countOutbox,
  countRows,
  createAdminPaymentContext,
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

interface EvidenceBody {
  readonly evidenceId: string;
  readonly assetStatus: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly previewEligible: boolean;
}
interface AttemptBody {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly reviewReason?: string;
  readonly evidence: readonly EvidenceBody[];
}
interface PaymentsBody {
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly origin: string;
  readonly currentObligation?: {
    readonly obligationId: string;
    readonly kind: string;
    readonly status: string;
    readonly expectedAmount: string;
    readonly expectedCurrencyCode: string;
    readonly expectedTransferReference: string;
    readonly satisfiedByAttemptId?: string;
  };
  readonly attempts: readonly AttemptBody[];
  readonly reconciliations: readonly {
    readonly action: string;
    readonly resolvedStatus?: string;
    readonly amount?: string;
    readonly reason: string;
    readonly adminId: string;
    readonly bankReference?: string;
  }[];
}
interface DecisionBody {
  readonly attemptId: string;
  readonly attemptStatus: string;
  readonly depositStatus: string;
  readonly orderStatus: string;
  readonly reconciliationAction: string;
  readonly replayed: boolean;
}

describe('APP7-B04 — Admin deposit read and manual verification', () => {
  let context: AdminPaymentTestContext;

  beforeAll(async () => {
    context = await createAdminPaymentContext('app7_b04_verify');
  });

  afterAll(async () => {
    await context?.close();
  });

  const authed = {
    get: (path: string) =>
      context.ctx.http.get(path).set('Cookie', context.cookie()).set('Origin', ADMIN_ORIGIN),
    post: (path: string) =>
      context.ctx.http.post(path).set('Cookie', context.cookie()).set('Origin', ADMIN_ORIGIN),
  };

  async function seed(suffix: string): Promise<SeededAttempt> {
    return seedVerifiableAttempt(context.ctx.app, context.ctx.database, { suffix });
  }

  describe('the Admin deposit read', () => {
    it('reports the exact DEPOSIT facts, the derived DC reference and the attempt', async () => {
      const seeded = await seed('read1');

      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const body = (response.body as Envelope<PaymentsBody>).data;

      expect(body.orderId).toBe(seeded.orderId);
      expect(body.orderCode).toBe(seeded.orderCode);
      expect(body.orderStatus).toBe('AWAITING_DEPOSIT');
      // APP12-A02-C1 moved the obligation's own facts under currentObligation
      // and added origin. A custom order still collects its DEPOSIT, and the
      // kind is published rather than implied by the field name.
      expect(body.origin).toBe('CUSTOM');
      const obligation = body.currentObligation;
      expect(obligation?.kind).toBe('DEPOSIT');
      expect(obligation?.obligationId).toBe(seeded.depositObligationId);
      expect(obligation?.status).toBe('PENDING');
      // The obligation's own frozen column — never a 40 % share recomputed here.
      expect(obligation?.expectedAmount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(obligation?.expectedCurrencyCode).toBe('VND');
      expect(obligation?.expectedTransferReference).toBe(seeded.expectedReference);
      expect(obligation?.expectedTransferReference).toMatch(/^[A-Z0-9]{15}$/);
      expect(obligation?.satisfiedByAttemptId).toBeUndefined();

      expect(body.attempts).toHaveLength(1);
      const attempt = body.attempts[0] as AttemptBody;
      expect(attempt.attemptId).toBe(seeded.attemptId);
      expect(attempt.method).toBe('BANK_TRANSFER');
      expect(attempt.status).toBe('PENDING');
      expect(attempt.amount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(attempt.currencyCode).toBe('VND');
      expect(attempt.reviewReason).toBeUndefined();
    });

    it('answers an attempt with no evidence with an empty array, not a refusal', async () => {
      const seeded = await seed('read2');
      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const body = (response.body as Envelope<PaymentsBody>).data;
      expect((body.attempts[0] as AttemptBody).evidence).toEqual([]);
    });

    it('reports each evidence state truthfully, and marks only ACCEPTED previewable', async () => {
      const seeded = await seed('evidence');
      // One image per state the operator is entitled to distinguish. Bound
      // directly through the association table rather than by driving B05's
      // upload pipeline: that pipeline is B05's behaviour and re-running it here
      // would make a B04 failure ambiguous about which checkpoint broke.
      await bindEvidence(seeded.attemptId, 'INSPECTING', 'image/png', 111);
      await bindEvidence(seeded.attemptId, 'ACCEPTED', 'image/jpeg', 222);
      await bindEvidence(seeded.attemptId, 'REJECTED', 'image/webp', 333);

      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const evidence = ((response.body as Envelope<PaymentsBody>).data.attempts[0] as AttemptBody)
        .evidence;

      expect(evidence).toHaveLength(3);
      const byStatus = new Map(evidence.map((item) => [item.assetStatus, item]));
      expect([...byStatus.keys()].sort()).toEqual(['ACCEPTED', 'INSPECTING', 'REJECTED']);
      expect(byStatus.get('INSPECTING')?.mediaType).toBe('image/png');
      expect(byStatus.get('INSPECTING')?.byteSize).toBe(111);
      expect(byStatus.get('ACCEPTED')?.byteSize).toBe(222);
      expect(byStatus.get('REJECTED')?.byteSize).toBe(333);

      // `previewEligible` is `assetStatus === ACCEPTED` and nothing else. It is
      // a delivery hint for `APP7-B06`, never a payment fact.
      expect(byStatus.get('ACCEPTED')?.previewEligible).toBe(true);
      expect(byStatus.get('INSPECTING')?.previewEligible).toBe(false);
      expect(byStatus.get('REJECTED')?.previewEligible).toBe(false);

      // The association id is published; the asset id and every storage fact
      // are not — B04 serves no byte and hands out no key.
      const serialized = JSON.stringify(evidence);
      expect(serialized).not.toContain('storage');
      expect(serialized).not.toContain('checksum');
      for (const item of evidence) {
        expect(item.evidenceId).toMatch(/^[0-9a-f-]{36}$/);
      }

      // And none of it changed a payment state: an ACCEPTED screenshot is not
      // a payment, and a REJECTED one is not a failure.
      expect((await readObligation(context.ctx.database, seeded.depositObligationId)).status).toBe(
        'PENDING',
      );
      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('AWAITING_DEPOSIT');
    });

    it('verifies normally with evidence present — evidence is not a verification input', async () => {
      const seeded = await seed('evidence2');
      // A rejected screenshot, which a guard keyed on evidence would refuse.
      await bindEvidence(seeded.attemptId, 'REJECTED', 'image/png', 444);

      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Ảnh không đọc được nhưng tiền đã về đủ.',
        })
        .expect(200);

      expect((await readObligation(context.ctx.database, seeded.depositObligationId)).status).toBe(
        'SATISFIED',
      );
      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('DEPOSIT_PAID');
    });

    it('never exposes the REMAINING obligation, though the order has one', async () => {
      const seeded = await seed('read3');
      const remaining = await readObligation(context.ctx.database, seeded.remainingObligationId);
      expect(remaining.kind).toBe('REMAINING');

      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(seeded.remainingObligationId);
      expect(serialized.toLowerCase()).not.toContain('remaining');
    });

    it('discloses no storage internal, provider field or credential', async () => {
      const seeded = await seed('read4');
      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const serialized = JSON.stringify(response.body).toLowerCase();
      for (const forbidden of [
        'storagekey',
        'bucket',
        'checksum',
        'fingerprint',
        'providerkey',
        'providerref',
        'tokenhash',
        'grantid',
        'stepupchallengeid',
        'accountnumber',
        '970418',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(serialized).not.toContain(seeded.token.toLowerCase());
    });

    it('orders attempts deterministically, oldest first', async () => {
      const seeded = await seed('read5');
      const { openAttempt } = await import('../support/admin-payment-fixture');
      const second = await openAttempt(context.ctx.app, seeded.depositObligationId);
      // Two rows can share a `created_at` millisecond, so the id is the real
      // tie-breaker. Forced to the same instant here so the assertion tests the
      // tie-breaker rather than the clock.
      await context.ctx.database.client.db.execute(sql`
        update payment_attempts set created_at = '2026-01-01T00:00:00Z'
         where payment_obligation_id = ${seeded.depositObligationId}
      `);

      const first = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const again = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const idsOf = (raw: unknown): string[] =>
        (raw as Envelope<PaymentsBody>).data.attempts.map((one) => one.attemptId);

      expect(idsOf(first.body)).toEqual(idsOf(again.body));
      expect(idsOf(first.body).sort()).toEqual([seeded.attemptId, second].sort());
    });

    it('writes nothing — the read is zero-write', async () => {
      const seeded = await seed('read6');
      const before = await snapshot(seeded);
      await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      expect(await snapshot(seeded)).toEqual(before);
    });

    it('refuses an unknown order with a 404 and no leak', async () => {
      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(newId())).expect(404);
      expect((response.body as { code: string }).code).toBe('ORDER_NOT_FOUND');
    });

    it('refuses a malformed order id with a 400', async () => {
      await authed.get(`/api/admin/orders/not-a-uuid/payments`).expect(400);
    });

    it('refuses an unauthenticated caller with a 401', async () => {
      const seeded = await seed('read7');
      await context.ctx.http.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(401);
    });
  });

  describe('the successful verification', () => {
    it('settles the attempt, satisfies the deposit and moves the order, atomically', async () => {
      const seeded = await seed('verify1');
      const downstreamBefore = await countDownstreamWrites(context.ctx.database);
      const providerBefore = await countRows(
        context.ctx.database,
        sql`select count(*)::text as count from payment_provider_events`,
      );

      const response = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          // The whole-đồng spelling of the stored `765000.00`, deliberately: an
          // operator reads a bank statement, not a numeric column.
          observedAmount: '765000',
          observedTransferReference: seeded.expectedReference,
          note: 'Đã đối chiếu sao kê ngân hàng.',
        })
        .expect(200);

      const body = (response.body as Envelope<DecisionBody>).data;
      expect(body.attemptStatus).toBe('SUCCEEDED');
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('DEPOSIT_PAID');
      expect(body.reconciliationAction).toBe('MANUAL_MATCH');
      expect(body.replayed).toBe(false);

      // Read back from the database, not from the response that claimed it.
      const attempt = await readAttempt(context.ctx.database, seeded.attemptId);
      expect(attempt.status).toBe('SUCCEEDED');
      expect(attempt.succeeded_at).not.toBeNull();

      const obligation = await readObligation(context.ctx.database, seeded.depositObligationId);
      expect(obligation.status).toBe('SATISFIED');
      expect(obligation.satisfied_by_attempt_id).toBe(seeded.attemptId);
      expect(obligation.satisfied_at).not.toBeNull();

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('DEPOSIT_PAID');

      // The REMAINING obligation is untouched: APP9 owns its collection.
      const remaining = await readObligation(context.ctx.database, seeded.remainingObligationId);
      expect(remaining.status).toBe('PENDING');
      expect(remaining.satisfied_by_attempt_id).toBeNull();

      // Exactly one reconciliation, carrying the observed facts as evidence.
      const reconciliations = await readReconciliations(context.ctx.database, seeded.attemptId);
      expect(reconciliations).toHaveLength(1);
      const record = reconciliations[0];
      expect(record?.action).toBe('MANUAL_MATCH');
      expect(record?.resolved_status).toBe('SUCCEEDED');
      expect(record?.amount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(record?.bank_reference).toBe(seeded.expectedReference);
      expect(record?.reason).toBe('Đã đối chiếu sao kê ngân hàng.');
      expect(record?.payment_obligation_id).toBe(seeded.depositObligationId);
      // The operator, derived from the session — never accepted from the body.
      expect(record?.admin_id).toMatch(/^[0-9a-f-]{36}$/);

      // SE-007, exactly once, with a secret-free payload.
      expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(1);
      const { rows } = await context.ctx.database.client.db.execute<{ payload: unknown }>(sql`
        select payload from outbox_events
         where event_type = 'payment.verified' and aggregate_id = ${seeded.attemptId}
      `);
      expect(rows[0]?.payload).toEqual({
        paymentAttemptId: seeded.attemptId,
        paymentObligationId: seeded.depositObligationId,
        obligationKind: 'DEPOSIT',
        orderId: seeded.orderId,
      });

      // The critical audit LC-16 TR-03 requires, once.
      expect(
        await countAudit(context.ctx.database, 'payment_attempt.verified', seeded.attemptId),
      ).toBe(1);

      // Manual verification writes no provider event: IMP-O007 stays open.
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from payment_provider_events`,
        ),
      ).toBe(providerBefore);

      // And nothing APP8 owns.
      expect(await countDownstreamWrites(context.ctx.database)).toBe(downstreamBefore);
    });

    it('verifies a correct transfer with zero evidence — evidence is never a guard', async () => {
      const seeded = await seed('verify2');
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from payment_transfer_evidence
               where payment_attempt_id = ${seeded.attemptId}`,
        ),
      ).toBe(0);

      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Không có ảnh chụp, đã kiểm tra sao kê.',
        })
        .expect(200);

      expect((await readObligation(context.ctx.database, seeded.depositObligationId)).status).toBe(
        'SATISFIED',
      );
    });

    it('reports the committed truth on the Admin read afterwards', async () => {
      const seeded = await seed('verify3');
      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'Đã nhận đủ tiền cọc.',
        })
        .expect(200);

      const response = await authed.get(ADMIN_PAYMENT_ROUTES.read(seeded.orderId)).expect(200);
      const body = (response.body as Envelope<PaymentsBody>).data;
      expect(body.orderStatus).toBe('DEPOSIT_PAID');
      expect(body.currentObligation?.kind).toBe('DEPOSIT');
      expect(body.currentObligation?.status).toBe('SATISFIED');
      expect(body.currentObligation?.satisfiedByAttemptId).toBe(seeded.attemptId);
      expect((body.attempts[0] as AttemptBody).status).toBe('SUCCEEDED');
      // The reference is derived, so it is the same value it was before payment.
      expect(body.currentObligation?.expectedTransferReference).toBe(seeded.expectedReference);
      expect(body.reconciliations).toHaveLength(1);
      expect(body.reconciliations[0]?.action).toBe('MANUAL_MATCH');
      expect(body.reconciliations[0]?.resolvedStatus).toBe('SUCCEEDED');
    });

    it('converges on a retry whose first response was lost, writing nothing twice', async () => {
      const seeded = await seed('verify4');
      const command = {
        observedAmount: SEEDED_DEPOSIT_AMOUNT,
        observedTransferReference: seeded.expectedReference,
        note: 'Đã đối chiếu sao kê.',
      };
      await authed.post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId)).send(command).expect(200);

      // The retry. It must not read as a failure to the operator's screen, and
      // it must add no second effect anywhere.
      const retry = await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .send(command)
        .expect(200);
      const body = (retry.body as Envelope<DecisionBody>).data;
      expect(body.replayed).toBe(true);
      expect(body.attemptStatus).toBe('SUCCEEDED');
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('DEPOSIT_PAID');

      expect(await readReconciliations(context.ctx.database, seeded.attemptId)).toHaveLength(1);
      expect(await countOutbox(context.ctx.database, 'payment.verified', seeded.attemptId)).toBe(1);
      expect(
        await countAudit(context.ctx.database, 'payment_attempt.verified', seeded.attemptId),
      ).toBe(1);
      // One transition row, so the order moved once.
      expect(
        await countRows(
          context.ctx.database,
          sql`select count(*)::text as count from order_transitions
               where order_id = ${seeded.orderId} and to_status = 'DEPOSIT_PAID'`,
        ),
      ).toBe(1);
    });

    it('refuses a verify that states no Origin, and one that is not JSON', async () => {
      const seeded = await seed('verify5');
      const body = {
        observedAmount: SEEDED_DEPOSIT_AMOUNT,
        observedTransferReference: seeded.expectedReference,
        note: 'x',
      };
      await context.ctx.http
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .set('Cookie', context.cookie())
        .set('Origin', 'http://evil.example')
        .send(body)
        .expect(403);
      await authed
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(body))
        .expect(415);
      // And still nothing moved.
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('PENDING');
    });

    it('refuses an unauthenticated verify with a 401 and no effect', async () => {
      const seeded = await seed('verify6');
      await context.ctx.http
        .post(ADMIN_PAYMENT_ROUTES.verify(seeded.attemptId))
        .set('Origin', ADMIN_ORIGIN)
        .send({
          observedAmount: SEEDED_DEPOSIT_AMOUNT,
          observedTransferReference: seeded.expectedReference,
          note: 'x',
        })
        .expect(401);
      expect((await readAttempt(context.ctx.database, seeded.attemptId)).status).toBe('PENDING');
      expect((await readObligation(context.ctx.database, seeded.depositObligationId)).status).toBe(
        'PENDING',
      );
    });
  });

  /**
   * One customer-upload asset in the given state, bound to one attempt.
   *
   * The lane is `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`, the same pair
   * `PAYMENT_EVIDENCE_INTAKE_LANE` writes, because the read filters on exactly
   * that scope — an asset outside it is absent rather than returned, and a
   * fixture that seeded some other kind would silently prove nothing.
   */
  async function bindEvidence(
    attemptId: string,
    status: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<void> {
    const assetId = newId();
    await context.ctx.database.client.db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
      values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
              ${`b04/evidence/${assetId}`}, ${mimeType}, ${sizeBytes}, ${status})
    `);
    await context.ctx.database.client.db.execute(sql`
      insert into payment_transfer_evidence (id, payment_attempt_id, asset_id)
      values (${newId()}, ${attemptId}, ${assetId})
    `);
  }

  /** The whole payment-and-order state a zero-write claim is checked against. */
  async function snapshot(seeded: SeededAttempt): Promise<unknown> {
    const { rows } = await context.ctx.database.client.db.execute(sql`
      select
        (select status from orders where id = ${seeded.orderId}) as order_status,
        (select updated_at from orders where id = ${seeded.orderId}) as order_updated,
        (select status from payment_obligations where id = ${seeded.depositObligationId}) as ob,
        (select count(*) from payment_attempts
          where payment_obligation_id = ${seeded.depositObligationId}) as attempts,
        (select count(*) from payment_reconciliations) as reconciliations,
        (select count(*) from outbox_events) as outbox,
        (select count(*) from audit_events) as audits,
        (select count(*) from order_transitions where order_id = ${seeded.orderId}) as transitions
    `);
    return rows[0];
  }
});
