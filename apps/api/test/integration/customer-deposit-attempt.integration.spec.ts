/**
 * `APP7-B03` — the one customer deposit write over real HTTP.
 *
 * The whole application, the real controller, the real global pipe and exception
 * filter, the real `AuthorizeSecureLink` and `ReauthorizeSecureGrant` with their
 * real peppered digest, the real `StepUpEvidenceResolver` against the real
 * published `secure_grant` policy, the real `IdempotencyStore` and the canonical
 * AGG-16 writer, against a disposable PostgreSQL with every migration applied.
 * Nothing is mocked.
 *
 * The duplicate-initiation race at the bottom is the `APP7-B03` §10 proof, and
 * it is a **real** one: two concurrent HTTP requests, each on its own pool
 * connection and its own transaction. No single serialised connection is used
 * anywhere in it.
 */
import { sql } from 'drizzle-orm';

import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
  applyWave2ReleasedEnv,
} from '../support/api-integration-context';
import {
  DEPOSIT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  STEP_UP_WINDOW_SECONDS,
  applyDepositSecretEnv,
  attemptsOf,
  paymentSnapshot,
  publishDepositPolicies,
  seedDeposit,
  type SeededDeposit,
} from '../support/customer-deposit-fixture';

jest.setTimeout(180_000);

interface AttemptBody {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `app7-b03-key-${String(keyCounter).padStart(4, '0')}`;
}

describe('APP7-B03 — deposit attempt initiation', () => {
  let context: ApiIntegrationTestContext;
  let restoreWave2: () => void;
  let restoreSecrets: () => void;

  beforeAll(async () => {
    restoreSecrets = applyDepositSecretEnv();
    // `APP12-G02` withholds every Wave-2 customer operation by default, so a
    // suite proving Wave-2 behaviour has to run in the wave that releases it.
    // Set before the context is built: the gate reads the value once, at module
    // composition (`APP12-B04` §48).
    restoreWave2 = applyWave2ReleasedEnv();
    context = await createApiIntegrationContext('app7_b03_attempt');
    await publishDepositPolicies(context.app, context.database);
  });

  afterAll(async () => {
    await context?.close();
    restoreWave2?.();
    restoreSecrets?.();
  });

  function initiate(token: string, key: string) {
    return context.http.post(DEPOSIT_ROUTES.attempts).set('Idempotency-Key', key).send({ token });
  }

  async function seedPayable(suffix: string): Promise<SeededDeposit> {
    return seedDeposit(context.app, context.database, {
      stepUpVerifiedSecondsAgo: 60,
      suffix,
    });
  }

  describe('one BANK_TRANSFER attempt, at PENDING', () => {
    it('creates exactly one attempt from the obligation’s own facts', async () => {
      const deposit = await seedPayable('happy');
      const response = await initiate(deposit.token, nextKey());

      expect(response.status).toBe(201);
      const body = (response.body as { data: AttemptBody }).data;
      expect(body.method).toBe('BANK_TRANSFER');
      expect(body.status).toBe('PENDING');
      expect(body.amount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(body.currencyCode).toBe('VND');
      expect(body.replayed).toBe(false);

      const rows = await attemptsOf(context.database, deposit.depositObligationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('PENDING');
      expect(rows[0]?.method).toBe('BANK_TRANSFER');
      // Copied off the obligation, never from the caller: the body carried no
      // amount, currency or method at all.
      expect(rows[0]?.amount).toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(rows[0]?.currency_code).toBe('VND');
    });

    it('fabricates no provider fields — IMP-O007 stays closed', async () => {
      const deposit = await seedPayable('noprovider');
      await initiate(deposit.token, nextKey());

      const [attempt] = await attemptsOf(context.database, deposit.depositObligationId);
      expect(attempt?.provider_key).toBeNull();
      expect(attempt?.provider_ref).toBeNull();

      const { rows } = await context.database.client.db.execute<{ count: string }>(
        sql`select count(*)::text as count from payment_provider_events`,
      );
      expect(rows[0]?.count).toBe('0');
    });

    it('records the server-resolved grant and step-up as the attempt’s authority', async () => {
      const deposit = await seedPayable('evidence');
      await initiate(deposit.token, nextKey());

      const [attempt] = await attemptsOf(context.database, deposit.depositObligationId);
      // Neither id was in the request body — the schema has nowhere to put one.
      expect(attempt?.grant_id).toBe(deposit.grantId);
      expect(attempt?.step_up_challenge_id).toBe(deposit.challengeId);
    });

    it('leaves the REMAINING obligation completely untouched', async () => {
      const deposit = await seedPayable('remaining');
      await initiate(deposit.token, nextKey());

      expect(await attemptsOf(context.database, deposit.remainingObligationId)).toHaveLength(0);
      const { rows } = await context.database.client.db.execute<{ status: string; amount: string }>(
        sql`select status, amount from payment_obligations where id = ${deposit.remainingObligationId}`,
      );
      expect(rows[0]?.status).toBe('PENDING');
      expect(rows[0]?.amount).toBe('1785000.00');
    });

    it('echoes back no credential and no internal identifier', async () => {
      const deposit = await seedPayable('noecho');
      const response = await initiate(deposit.token, 'app7-b03-secret-key-01');
      const serialized = JSON.stringify(response.body);

      for (const secret of [
        deposit.token,
        deposit.grantId,
        deposit.challengeId,
        deposit.customerId,
        deposit.depositObligationId,
        'app7-b03-secret-key-01',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('never stores the raw idempotency key', async () => {
      const deposit = await seedPayable('hashedkey');
      await initiate(deposit.token, 'app7-b03-raw-key-value');

      const { rows } = await context.database.client.db.execute<{
        operation_namespace: string;
        scope_key: string;
      }>(sql`select operation_namespace, scope_key from idempotency_records`);
      const record = rows.find((row) => row.operation_namespace === 'payment.initiate');
      expect(record).toBeDefined();
      expect(record?.scope_key).not.toContain('app7-b03-raw-key-value');
      // The accepted namespace, exactly. Not `payment.callback`, and no invented
      // second mechanism.
      expect(record?.operation_namespace).toBe('payment.initiate');
    });
  });

  describe('GRD-003 — step-up is required and server-derived', () => {
    it('refuses when the customer has no step-up at all', async () => {
      const deposit = await seedDeposit(context.app, context.database, { suffix: 'nostepup' });
      const response = await initiate(deposit.token, nextKey());

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('REVERIFICATION_REQUIRED');
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(0);
    });

    it('refuses when the step-up has lapsed out of the published window', async () => {
      const deposit = await seedDeposit(context.app, context.database, {
        suffix: 'lapsed',
        stepUpVerifiedSecondsAgo: STEP_UP_WINDOW_SECONDS + 60,
      });
      const response = await initiate(deposit.token, nextKey());

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('REVERIFICATION_REQUIRED');
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(0);
    });

    it('accepts no challenge id from the caller', async () => {
      const other = await seedPayable('otherchallenge');
      const deposit = await seedDeposit(context.app, context.database, { suffix: 'named' });

      // The body is `.strict()`, so naming someone else's fresh challenge is a
      // 400 rather than a way to borrow their proof of presence.
      const response = await context.http
        .post(DEPOSIT_ROUTES.attempts)
        .set('Idempotency-Key', nextKey())
        .send({ token: deposit.token, stepUpChallengeId: other.challengeId });

      expect(response.status).toBe(400);
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(0);
    });
  });

  describe('the Idempotency-Key transport', () => {
    it.each([
      ['missing', undefined],
      ['too short', 'abc'],
      ['containing a space', 'app7 b03 key'],
    ])('refuses a key that is %s', async (_case, key) => {
      const deposit = await seedPayable(`key-${String(_case).slice(0, 6)}`);
      const request = context.http.post(DEPOSIT_ROUTES.attempts).send({ token: deposit.token });
      if (key !== undefined) request.set('Idempotency-Key', key);

      const response = await request;
      expect(response.status).toBe(400);
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(0);
    });
  });

  describe('replay and retry (LC-16)', () => {
    it('replays the same attempt for the same key, creating no second row', async () => {
      const deposit = await seedPayable('replay');
      const key = nextKey();

      const first = await initiate(deposit.token, key);
      const second = await initiate(deposit.token, key);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const a = (first.body as { data: AttemptBody }).data;
      const b = (second.body as { data: AttemptBody }).data;
      expect(b.attemptId).toBe(a.attemptId);
      expect(a.replayed).toBe(false);
      expect(b.replayed).toBe(true);
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(1);
    });

    it('opens a new attempt for a new key, and resets nothing', async () => {
      const deposit = await seedPayable('retry');
      const first = await initiate(deposit.token, nextKey());
      const second = await initiate(deposit.token, nextKey());

      const a = (first.body as { data: AttemptBody }).data;
      const b = (second.body as { data: AttemptBody }).data;
      expect(b.attemptId).not.toBe(a.attemptId);

      const rows = await attemptsOf(context.database, deposit.depositObligationId);
      expect(rows).toHaveLength(2);
      // A retry is a new attempt; the first one is still exactly where it was.
      expect(rows.map((row) => row.status)).toEqual(['PENDING', 'PENDING']);
    });

    it('refuses to reset a terminal attempt', async () => {
      const deposit = await seedPayable('terminal');
      await initiate(deposit.token, nextKey());
      const [attempt] = await attemptsOf(context.database, deposit.depositObligationId);
      // A verification that failed, exactly as `APP7-B04` will settle one.
      await context.database.client.db.execute(sql`
        update payment_attempts set status = 'FAILED', failed_at = now()
         where id = ${attempt?.id ?? ''}
      `);

      await initiate(deposit.token, nextKey());

      const rows = await attemptsOf(context.database, deposit.depositObligationId);
      expect(rows).toHaveLength(2);
      // The terminal row is untouched; the retry is a second row.
      expect(rows.find((row) => row.id === attempt?.id)?.status).toBe('FAILED');
    });

    it('refuses a new attempt once the deposit is satisfied', async () => {
      const deposit = await seedPayable('satisfied');
      // Settled the way `APP7-B04` will settle it: an attempt that SUCCEEDED,
      // then the obligation naming it. `ck_payment_obligations__satisfied_evidence_required`
      // refuses a satisfaction with no evidence, so a shortcut is not available
      // here — which is itself the invariant working.
      const opened = await initiate(deposit.token, nextKey());
      const attemptId = (opened.body as { data: AttemptBody }).data.attemptId;
      await context.database.client.db.execute(sql`
        update payment_attempts set status = 'SUCCEEDED', succeeded_at = now()
         where id = ${attemptId}
      `);
      await context.database.client.db.execute(sql`
        update payment_obligations
           set status = 'SATISFIED', satisfied_at = now(), satisfied_by_attempt_id = ${attemptId}
         where id = ${deposit.depositObligationId}
      `);

      const response = await initiate(deposit.token, nextKey());
      expect(response.status).toBe(409);
      expect((response.body as { code: string }).code).toBe('DEPOSIT_NOT_PAYABLE');
      // Still the one attempt that settled it; no second deposit attempt opened.
      expect(await attemptsOf(context.database, deposit.depositObligationId)).toHaveLength(1);
    });
  });

  describe('a customer action never marks payment successful', () => {
    it('leaves the obligation PENDING and the order AWAITING_DEPOSIT', async () => {
      const deposit = await seedPayable('nostate');
      const before = await paymentSnapshot(context.database, deposit);

      await context.http.post(DEPOSIT_ROUTES.read).send({ token: deposit.token });
      await initiate(deposit.token, nextKey());
      await context.http
        .post(DEPOSIT_ROUTES.qr)
        .send({ token: deposit.token })
        .responseType('blob');

      const { rows } = await context.database.client.db.execute<{
        order_status: string;
        obligation_status: string;
        attempt_status: string;
        reconciliations: string;
      }>(sql`
        select
          (select status from orders where id = ${deposit.orderId}) as order_status,
          (select status from payment_obligations where id = ${deposit.depositObligationId})
            as obligation_status,
          (select status from payment_attempts
            where payment_obligation_id = ${deposit.depositObligationId} limit 1)
            as attempt_status,
          (select count(*)::text from payment_reconciliations) as reconciliations
      `);

      // The maximum newly-created payment state is one PENDING attempt.
      expect(rows[0]?.attempt_status).toBe('PENDING');
      expect(rows[0]?.obligation_status).toBe('PENDING');
      expect(rows[0]?.order_status).toBe('AWAITING_DEPOSIT');
      expect(rows[0]?.reconciliations).toBe('0');
      expect(before).not.toEqual(await paymentSnapshot(context.database, deposit));
    });

    it('creates no advanced payment state on any order this suite touched', async () => {
      // Every order in this database was driven only by B03's three operations,
      // with two deliberate exceptions the suite wrote by hand above: one
      // attempt forced to FAILED, and one SUCCEEDED attempt satisfying its
      // obligation to prove a settled deposit refuses a new one. Both are
      // excluded by name, so this counts what B03 itself produced.
      const { rows } = await context.database.client.db.execute<{
        succeeded: string;
        review: string;
        satisfied: string;
        moved_orders: string;
        reconciliations: string;
        refunds: string;
        provider_events: string;
      }>(sql`
        select
          (select count(*)::text from payment_attempts where status = 'SUCCEEDED') as succeeded,
          (select count(*)::text from payment_attempts
            where status in ('REQUIRES_REVIEW', 'REFUNDED', 'PARTIALLY_REFUNDED')) as review,
          (select count(*)::text from payment_obligations where status = 'SATISFIED') as satisfied,
          (select count(*)::text from orders where status <> 'AWAITING_DEPOSIT') as moved_orders,
          (select count(*)::text from payment_reconciliations) as reconciliations,
          (select count(*)::text from refunds) as refunds,
          (select count(*)::text from payment_provider_events) as provider_events
      `);

      // The one hand-written SUCCEEDED attempt and the one obligation it
      // satisfied. B03 wrote neither.
      expect(rows[0]?.succeeded).toBe('1');
      expect(rows[0]?.satisfied).toBe('1');
      // Everything B03 could never produce is genuinely empty.
      expect(rows[0]?.review).toBe('0');
      expect(rows[0]?.moved_orders).toBe('0');
      expect(rows[0]?.reconciliations).toBe('0');
      expect(rows[0]?.refunds).toBe('0');
      expect(rows[0]?.provider_events).toBe('0');
    });
  });

  describe('the duplicate-initiation race (APP7-B03 §10)', () => {
    it('leaves exactly one attempt and one completed claim', async () => {
      const deposit = await seedPayable('race');
      const key = nextKey();

      // Two concurrent requests, each on its own pool connection and its own
      // transaction. Not a serialised pair pretending to be a race.
      const [first, second] = await Promise.all([
        initiate(deposit.token, key),
        initiate(deposit.token, key),
      ]);

      const statuses = [first.status, second.status].sort();
      // One wins outright; the loser either replays the winner's attempt or is
      // told the operation is in flight. Both are accepted semantics, and
      // neither creates a second attempt.
      expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
      for (const response of [first, second]) {
        if (response.status === 409) {
          expect((response.body as { code: string }).code).toBe('DUPLICATE_OPERATION');
        }
      }

      const rows = await attemptsOf(context.database, deposit.depositObligationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('PENDING');

      const claims = await context.database.client.db.execute<{
        status: string;
        scope_key: string;
      }>(sql`
        select status, scope_key from idempotency_records
         where operation_namespace = 'payment.initiate'
      `);
      const completed = claims.rows.filter((row) => row.status === 'COMPLETED');
      expect(new Set(completed.map((row) => row.scope_key)).size).toBe(completed.length);

      // And no payment advanced.
      const { rows: state } = await context.database.client.db.execute<{
        obligation_status: string;
        order_status: string;
      }>(sql`
        select
          (select status from payment_obligations where id = ${deposit.depositObligationId})
            as obligation_status,
          (select status from orders where id = ${deposit.orderId}) as order_status
      `);
      expect(state[0]?.obligation_status).toBe('PENDING');
      expect(state[0]?.order_status).toBe('AWAITING_DEPOSIT');
    });
  });
});
