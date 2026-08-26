/**
 * `APP9-B03` — Admin verification of a `REMAINING` attempt, and `TR-LC14-06`.
 *
 * The whole application runs against real PostgreSQL: the real
 * `AuthenticatedAdminGuard` against a real `admin_sessions` row, the real
 * `StaffOriginGuard` and `StaffJsonBodyGuard`, the real Zod pipe, the real
 * envelope and the canonical AGG-15/AGG-16 writers. Nothing is mocked, and every
 * post-condition is read back out of the database with raw SQL rather than out
 * of the response that claimed it.
 *
 * The five cases are `APP9-B03` §17's. `APP7-B04`'s three suites keep owning the
 * deposit's own mismatch, terminal-state and race paths; only its success path
 * is re-proved here, as the §17 Case 4 regression for the shared code B03
 * generalised.
 */
import { sql } from 'drizzle-orm';

import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  countDownstreamWrites,
  createAdminPaymentContext,
  readAttempt,
  readObligation,
  readOrderStatus,
  seedVerifiableAttempt,
  type AdminPaymentTestContext,
  type Envelope,
} from '../support/admin-payment-fixture';
import {
  SEEDED_REMAINING_AMOUNT,
  obligationSnapshot,
  readOutboxFor,
  readTransitions,
  seedRemainingAttempt,
  type SeededRemainingAttempt,
} from '../support/admin-final-payment-fixture';

jest.setTimeout(240_000);

const PAYMENT_VERIFIED = 'payment.verified';

interface DecisionBody {
  readonly attemptId: string;
  readonly attemptStatus: string;
  readonly depositObligationId: string;
  readonly depositStatus: string;
  readonly orderId: string;
  readonly orderStatus: string;
  readonly reconciliationAction: string;
  readonly replayed: boolean;
}

describe('APP9-B03 — Admin final-payment verification and TR-LC14-06', () => {
  let context: AdminPaymentTestContext;

  beforeAll(async () => {
    context = await createAdminPaymentContext('app9_b03');
  });

  afterAll(async () => {
    await context?.close();
  });

  function verify(attemptId: string) {
    return context.ctx.http
      .post(ADMIN_PAYMENT_ROUTES.verify(attemptId))
      .set('Cookie', context.cookie())
      .set('Origin', ADMIN_ORIGIN);
  }

  /** The command an operator sends for a correct balance transfer. */
  function matchingCommand(seeded: SeededRemainingAttempt) {
    return {
      observedAmount: SEEDED_REMAINING_AMOUNT,
      observedTransferReference: seeded.expectedRemainingReference,
      note: 'Matched against the bank statement line for the balance.',
    };
  }

  function dataOf(response: { body: unknown }): DecisionBody {
    return (response.body as Envelope<DecisionBody>).data;
  }

  function codeOf(response: { body: unknown }): string {
    return (response.body as { code?: string }).code ?? '';
  }

  // ── Case 1 — REMAINING success ─────────────────────────────────────────────

  describe('Case 1 — a matching balance transfer settles and dispatches, atomically', () => {
    let seeded: SeededRemainingAttempt;
    let response: Awaited<ReturnType<ReturnType<typeof verify>['send']>>;

    beforeAll(async () => {
      seeded = await seedRemainingAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03ok',
      });
      response = await verify(seeded.attemptId).send(matchingCommand(seeded));
    });

    it('answers 200 with the committed decision', () => {
      expect(response.status).toBe(200);
      const body = dataOf(response);
      expect(body.attemptId).toBe(seeded.attemptId);
      expect(body.attemptStatus).toBe('SUCCEEDED');
      // The published field keeps its APP7 name and now carries the obligation
      // this decision acted on — the REMAINING one.
      expect(body.depositObligationId).toBe(seeded.remainingObligationId);
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('READY_FOR_DELIVERY');
      expect(body.replayed).toBe(false);
    });

    it('settles the attempt in the database', async () => {
      const attempt = await readAttempt(context.ctx.database, seeded.attemptId);
      expect(attempt?.status).toBe('SUCCEEDED');
      expect(attempt?.succeeded_at).not.toBeNull();
      // No provider exists in this flow; neither column is fabricated.
      expect(attempt?.provider_key).toBeNull();
      expect(attempt?.provider_ref).toBeNull();
    });

    it('satisfies the REMAINING obligation by that exact attempt, and leaves DEPOSIT alone', async () => {
      const remaining = await readObligation(context.ctx.database, seeded.remainingObligationId);
      expect(remaining?.status).toBe('SATISFIED');
      expect(remaining?.satisfied_by_attempt_id).toBe(seeded.attemptId);

      // Per kind, because a total cannot tell the two obligations apart. The
      // deposit must be untouched: no attempt, no reconciliation, still PENDING.
      expect(await obligationSnapshot(context.ctx.database, seeded.orderId)).toEqual([
        {
          kind: 'DEPOSIT',
          status: 'PENDING',
          satisfied_by_attempt_id: null,
          attempts: '0',
          reconciliations: '0',
        },
        {
          kind: 'REMAINING',
          status: 'SATISFIED',
          satisfied_by_attempt_id: seeded.attemptId,
          attempts: '1',
          reconciliations: '1',
        },
      ]);
    });

    it('appends the reconciliation bound to this attempt and obligation', async () => {
      const { rows } = await context.ctx.database.client.db.execute<{
        payment_attempt_id: string;
        payment_obligation_id: string;
        resolved_status: string;
        amount: string;
        bank_reference: string;
      }>(sql`
        select payment_attempt_id, payment_obligation_id, resolved_status,
               amount::text as amount, bank_reference
          from payment_reconciliations
         where payment_obligation_id = ${seeded.remainingObligationId}
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payment_attempt_id).toBe(seeded.attemptId);
      expect(rows[0]?.resolved_status).toBe('SUCCEEDED');
      expect(rows[0]?.amount).toBe(SEEDED_REMAINING_AMOUNT);
      // The memo the operator observed, which is the RM one.
      expect(rows[0]?.bank_reference).toBe(seeded.expectedRemainingReference);
    });

    it('moves the order through TR-LC14-06 and appends exactly that transition', async () => {
      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe(
        'READY_FOR_DELIVERY',
      );

      const transitions = await readTransitions(context.ctx.database, seeded.orderId);
      const last = transitions[transitions.length - 1];
      expect(last?.from_status).toBe('AWAITING_FINAL_PAYMENT');
      expect(last?.to_status).toBe('READY_FOR_DELIVERY');
      // The order is moved by the Admin whose transaction settled the payment —
      // not by a system actor, because no worker performs TR-LC14-06.
      expect(last?.actor_kind).toBe('ADMIN');
      expect(last?.event_kind).toBe('STATE_CHANGE');
      // Exactly one move out of AWAITING_FINAL_PAYMENT, not two.
      expect(transitions.filter((row) => row.to_status === 'READY_FOR_DELIVERY')).toHaveLength(1);
    });

    it('emits payment.verified exactly once, carrying REMAINING', async () => {
      const rows = await readOutboxFor(context.ctx.database, seeded.attemptId);
      const verified = rows.filter((row) => row.event_type === PAYMENT_VERIFIED);
      expect(verified).toHaveLength(1);
      expect(verified[0]?.payload).toEqual({
        paymentAttemptId: seeded.attemptId,
        paymentObligationId: seeded.remainingObligationId,
        // The whole point of the checkpoint. A hard-coded 'DEPOSIT' here would
        // tell the reservation consumer to reserve stock a second time for an
        // order that has already been produced.
        obligationKind: 'REMAINING',
        orderId: seeded.orderId,
      });
      // No second event type was minted alongside it.
      expect(rows.map((row) => row.event_type)).toEqual([PAYMENT_VERIFIED]);
    });

    it('writes nothing APP8 owns — no reservation, ledger entry or production job', async () => {
      // B03 is a producer. The consumer is APP9-W01's, and it is deliberately
      // still broken; nothing here does its work synchronously instead.
      expect(await countDownstreamWrites(context.ctx.database)).toBe(0);
    });
  });

  // ── Case 2 — wrong order state ─────────────────────────────────────────────

  describe('Case 2 — a balance verified before TR-LC14-05 refuses and writes nothing', () => {
    it('refuses at PRODUCTION_COMPLETED, leaving every row untouched', async () => {
      // The discriminating state: the obligation is live and PENDING and the
      // attempt is perfectly verifiable, so only the order's own position can
      // refuse this. It is also the state a real operator would hit — verifying
      // a transfer before opening final payment.
      const seeded = await seedRemainingAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03early',
        status: 'PRODUCTION_COMPLETED',
      });

      const before = {
        attempt: await readAttempt(context.ctx.database, seeded.attemptId),
        obligations: await obligationSnapshot(context.ctx.database, seeded.orderId),
        transitions: await readTransitions(context.ctx.database, seeded.orderId),
        outbox: await readOutboxFor(context.ctx.database, seeded.attemptId),
        status: await readOrderStatus(context.ctx.database, seeded.orderId),
      };

      const response = await verify(seeded.attemptId).send(matchingCommand(seeded));

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('PAYMENT_ORDER_NOT_AWAITING_PAYMENT');

      // Not "mostly unchanged": every row this transaction could have touched,
      // re-read. The refusal is deliberately placed before the match verdict, so
      // even a perfectly matching transfer settles nothing here.
      expect(await readAttempt(context.ctx.database, seeded.attemptId)).toEqual(before.attempt);
      expect(await obligationSnapshot(context.ctx.database, seeded.orderId)).toEqual(
        before.obligations,
      );
      expect(await readTransitions(context.ctx.database, seeded.orderId)).toEqual(
        before.transitions,
      );
      expect(await readOutboxFor(context.ctx.database, seeded.attemptId)).toEqual(before.outbox);
      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe(before.status);
      expect(before.status).toBe('PRODUCTION_COMPLETED');
      // And in particular no reconciliation was appended — the review branch,
      // which does write one, must not be reachable from a wrong-state order.
      expect(before.obligations.every((row) => row.reconciliations === '0')).toBe(true);
    });
  });

  // ── Case 3 — replay ────────────────────────────────────────────────────────

  describe('Case 3 — a retried balance verification commits nothing a second time', () => {
    it('returns the committed truth with replayed: true and duplicates no write', async () => {
      const seeded = await seedRemainingAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03replay',
      });
      const command = matchingCommand(seeded);

      const first = await verify(seeded.attemptId).send(command);
      expect(first.status).toBe(200);
      expect(dataOf(first).replayed).toBe(false);

      const after = {
        obligations: await obligationSnapshot(context.ctx.database, seeded.orderId),
        transitions: await readTransitions(context.ctx.database, seeded.orderId),
        outbox: await readOutboxFor(context.ctx.database, seeded.attemptId),
      };

      const replay = await verify(seeded.attemptId).send(command);

      expect(replay.status).toBe(200);
      const body = dataOf(replay);
      expect(body.replayed).toBe(true);
      // Committed truth, not a conflict: a retry after a lost response must not
      // read as "the payment failed". Note the order has already left the source
      // state, so the replay branch must run *before* the source-state guard.
      expect(body.attemptStatus).toBe('SUCCEEDED');
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('READY_FOR_DELIVERY');

      expect(await obligationSnapshot(context.ctx.database, seeded.orderId)).toEqual(
        after.obligations,
      );
      expect(await readTransitions(context.ctx.database, seeded.orderId)).toEqual(
        after.transitions,
      );
      expect(await readOutboxFor(context.ctx.database, seeded.attemptId)).toEqual(after.outbox);
      // Stated separately from the deep-equal above, because "exactly one
      // payment.verified" is the property W01 will depend on.
      expect(after.outbox.filter((row) => row.event_type === PAYMENT_VERIFIED)).toHaveLength(1);
    });
  });

  // ── Case 4 — DEPOSIT regression ────────────────────────────────────────────

  describe('Case 4 — deposit verification is unchanged', () => {
    it('still moves AWAITING_DEPOSIT → DEPOSIT_PAID and emits DEPOSIT', async () => {
      // The shared chain resolver, the shared recorder and the shared error
      // vocabulary all changed. This is the narrow proof that the delivered
      // APP7-B04 success path did not.
      const seeded = await seedVerifiableAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03dep',
      });

      const response = await verify(seeded.attemptId).send({
        observedAmount: SEEDED_DEPOSIT_AMOUNT,
        // The DC memo. The kind-aware resolver must still expect this one for a
        // deposit attempt, not the RM one.
        observedTransferReference: seeded.expectedReference,
        note: 'Matched against the bank statement line for the deposit.',
      });

      expect(response.status).toBe(200);
      const body = dataOf(response);
      expect(body.attemptStatus).toBe('SUCCEEDED');
      expect(body.depositObligationId).toBe(seeded.depositObligationId);
      expect(body.depositStatus).toBe('SATISFIED');
      expect(body.orderStatus).toBe('DEPOSIT_PAID');

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe('DEPOSIT_PAID');
      const transitions = await readTransitions(context.ctx.database, seeded.orderId);
      expect(transitions[transitions.length - 1]?.from_status).toBe('AWAITING_DEPOSIT');
      expect(transitions[transitions.length - 1]?.to_status).toBe('DEPOSIT_PAID');

      const verified = (await readOutboxFor(context.ctx.database, seeded.attemptId)).filter(
        (row) => row.event_type === PAYMENT_VERIFIED,
      );
      expect(verified).toHaveLength(1);
      expect(verified[0]?.payload.obligationKind).toBe('DEPOSIT');
      expect(verified[0]?.payload.paymentObligationId).toBe(seeded.depositObligationId);

      // And the balance is left exactly where APP7-W01 created it.
      const snapshot = await obligationSnapshot(context.ctx.database, seeded.orderId);
      expect(snapshot.find((row) => row.kind === 'REMAINING')).toEqual({
        kind: 'REMAINING',
        status: 'PENDING',
        satisfied_by_attempt_id: null,
        attempts: '0',
        reconciliations: '0',
      });
    });
  });

  // ── Case 5 — the kind is derived, never chosen ─────────────────────────────

  describe('Case 5 — the kind comes from the locked obligation row, not the caller', () => {
    it('expects the RM memo for a balance and routes the DC memo to review', async () => {
      // The sharpest available proof that the expected facts are derived from
      // the obligation's kind: the *deposit's* memo for this very order is a
      // real, correctly-formed reference, and it is still wrong here. A resolver
      // that had kept deriving DC would have matched it and dispatched the order.
      const seeded = await seedRemainingAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03kind',
      });

      const response = await verify(seeded.attemptId).send({
        observedAmount: SEEDED_REMAINING_AMOUNT,
        observedTransferReference: seeded.expectedReference,
        note: 'Operator pasted the deposit memo by mistake.',
      });

      // A mismatch is a committed review, not a 409 (APP7-B04 §18).
      expect(response.status).toBe(200);
      expect(dataOf(response).attemptStatus).toBe('REQUIRES_REVIEW');
      expect(dataOf(response).depositStatus).toBe('PENDING');
      // The order did not move, and is reported at its real state rather than at
      // the deposit literal the APP7 fallback used to name.
      expect(dataOf(response).orderStatus).toBe('AWAITING_FINAL_PAYMENT');

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe(
        'AWAITING_FINAL_PAYMENT',
      );
      expect(await readOutboxFor(context.ctx.database, seeded.attemptId)).toEqual([]);
      expect(await obligationSnapshot(context.ctx.database, seeded.orderId)).toEqual([
        {
          kind: 'DEPOSIT',
          status: 'PENDING',
          satisfied_by_attempt_id: null,
          attempts: '0',
          reconciliations: '0',
        },
        {
          kind: 'REMAINING',
          status: 'PENDING',
          satisfied_by_attempt_id: null,
          attempts: '1',
          reconciliations: '1',
        },
      ]);
    });
  });

  // ── Case 7 — review regression, because shared code changed ────────────────

  describe('Case 7 — the shared review operation still escalates without settling', () => {
    it('escalates a balance attempt, moving no order and emitting no event', async () => {
      // `adminPaymentAttempt_review` shares the chain resolver and the recorder,
      // both of which B03 changed, so its behaviour is re-proved. It gained one
      // thing only: a REMAINING attempt now reaches it instead of being refused
      // as not verifiable. It still settles nothing and moves nothing.
      const seeded = await seedRemainingAttempt(context.ctx.app, context.ctx.database, {
        suffix: 'b03review',
      });

      const response = await context.ctx.http
        .post(ADMIN_PAYMENT_ROUTES.review(seeded.attemptId))
        .set('Cookie', context.cookie())
        .set('Origin', ADMIN_ORIGIN)
        .send({ reviewReason: 'No matching line on the statement yet.' });

      expect(response.status).toBe(200);
      const body = dataOf(response);
      expect(body.attemptStatus).toBe('REQUIRES_REVIEW');
      expect(body.depositObligationId).toBe(seeded.remainingObligationId);
      expect(body.depositStatus).toBe('PENDING');
      expect(body.orderStatus).toBe('AWAITING_FINAL_PAYMENT');

      expect(await readOrderStatus(context.ctx.database, seeded.orderId)).toBe(
        'AWAITING_FINAL_PAYMENT',
      );
      expect(await readOutboxFor(context.ctx.database, seeded.attemptId)).toEqual([]);
      expect(
        (await readObligation(context.ctx.database, seeded.remainingObligationId))?.status,
      ).toBe('PENDING');
    });
  });
});
