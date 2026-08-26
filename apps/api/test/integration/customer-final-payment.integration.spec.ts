/**
 * `APP9-B02` — the three customer final-payment operations over real HTTP.
 *
 * The whole application, the real controllers, the real global pipe and
 * exception filter, the real `AuthorizeSecureLink` with its real peppered
 * digest, the canonical AGG-15 and AGG-16 repositories, the real
 * `OrderRepository.transition` for every LC-14 move, and the real QR encoder,
 * against a disposable PostgreSQL with every migration applied. Nothing is
 * mocked.
 *
 * The eight cases below are `APP9-B02` §16's A–H. They are grouped by the
 * property each proves rather than by operation, because the properties are what
 * a reviewer must be able to check: that the balance resolved is the live
 * `REMAINING` one and never the deposit, that the payable window really gates
 * the two acting operations, that a settled balance cannot be reopened, that two
 * grants cannot see each other's orders, and that the reused evidence lane
 * reaches a `REMAINING` attempt without weakening any of that.
 */
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { depositTransferReference } from '../../src/modules/payment/domain/deposit/deposit-reference';
import { remainingTransferReference } from '../../src/modules/payment/domain/final-payment/final-payment-reference';
import {
  createApiIntegrationContext,
  MERCHANT_BANK_TEST_CONFIG,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import { DEPOSIT_ROUTES } from '../support/customer-deposit-fixture';
import {
  FINAL_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_REMAINING_AMOUNT,
  applyFinalPaymentSecretEnv,
  transitionOrderTo,
  attemptsOf,
  mintToken,
  obligationSnapshot,
  publishFinalPaymentPolicies,
  satisfyThroughVerification,
  seedFinalPayment,
  seedGrantWithoutOrder,
  supersedeObligation,
  type SeededDeposit,
} from '../support/customer-final-payment-fixture';

jest.setTimeout(240_000);

interface FinalPaymentBody {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly finalPaymentStatus: string;
  readonly finalPaymentAmount: string;
  readonly currencyCode: string;
  readonly payable: boolean;
  readonly bankInstructions: {
    readonly bankBin: string;
    readonly bankDisplayName: string;
    readonly accountNumber: string;
    readonly accountName: string;
    readonly transferReference: string;
  };
  readonly accessExpiresAt: string;
}

interface AttemptBody {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}

describe('APP9-B02 — the customer final-payment surface', () => {
  let context: ApiIntegrationTestContext;
  let restoreSecrets: () => void;

  beforeAll(async () => {
    restoreSecrets = applyFinalPaymentSecretEnv();
    context = await createApiIntegrationContext('app9_b02');
    await publishFinalPaymentPolicies(context.app, context.database);
  });

  afterAll(async () => {
    await context?.close();
    restoreSecrets?.();
  });

  /** One fresh chain per case: these cases move order state, so none may share. */
  function seed(options: Parameters<typeof seedFinalPayment>[2] = {}) {
    return seedFinalPayment(context.app, context.database, {
      stepUpVerifiedSecondsAgo: 60,
      suffix: newSuffix(),
      ...options,
    });
  }

  function readFinalPayment(token: string) {
    return context.http.post(FINAL_PAYMENT_ROUTES.read).send({ token });
  }

  function qr(token: string) {
    return context.http.post(FINAL_PAYMENT_ROUTES.qr).send({ token }).responseType('blob');
  }

  function initiate(token: string, key: string) {
    return context.http
      .post(FINAL_PAYMENT_ROUTES.attempts)
      .set('Idempotency-Key', key)
      .send({ token });
  }

  function dataOf(response: { body: unknown }): FinalPaymentBody {
    return (response.body as { data: FinalPaymentBody }).data;
  }

  function codeOf(response: { body: unknown }): string {
    return (response.body as { code?: string }).code ?? '';
  }

  // ── Case A — current/read success ──────────────────────────────────────────

  describe('Case A — the read publishes the live REMAINING obligation and nothing else', () => {
    let order: SeededDeposit;

    beforeAll(async () => {
      order = await seed();
    });

    it('returns the obligation’s own frozen amount, never the deposit and never a recomputed balance', async () => {
      const body = dataOf(await readFinalPayment(order.token));

      expect(body.finalPaymentAmount).toBe(SEEDED_REMAINING_AMOUNT);
      expect(body.currencyCode).toBe('VND');
      // The three values a defect would substitute: the deposit's amount, the
      // order total, and the total minus the deposit — which here happens to
      // equal the right answer only because the fixture is consistent, so the
      // deposit and the total are what actually discriminate.
      expect(body.finalPaymentAmount).not.toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(body.finalPaymentAmount).not.toBe('2550000.00');
    });

    it('reports both states separately and derives payable from the two', async () => {
      const body = dataOf(await readFinalPayment(order.token));
      expect(body.orderStatus).toBe('AWAITING_FINAL_PAYMENT');
      expect(body.finalPaymentStatus).toBe('PENDING');
      expect(body.payable).toBe(true);
      expect(body.orderCode).toBe(order.orderCode);
    });

    it('returns the exact configured merchant account and the RM reference', async () => {
      const body = dataOf(await readFinalPayment(order.token));
      expect(body.bankInstructions).toEqual({
        bankBin: MERCHANT_BANK_TEST_CONFIG.bankBin,
        bankDisplayName: MERCHANT_BANK_TEST_CONFIG.bankDisplayName,
        accountNumber: MERCHANT_BANK_TEST_CONFIG.accountNumber,
        accountName: MERCHANT_BANK_TEST_CONFIG.accountName,
        transferReference: remainingTransferReference(order.orderCode),
      });
      // Distinguishable from the deposit memo on the same order, which is what
      // lets an operator reconcile a statement carrying both.
      expect(body.bankInstructions.transferReference.endsWith('RM')).toBe(true);
      expect(body.bankInstructions.transferReference).not.toBe(
        depositTransferReference(order.orderCode),
      );
    });

    it('exposes nothing about the DEPOSIT obligation and echoes no identifier', async () => {
      const serialized = JSON.stringify((await readFinalPayment(order.token)).body);
      expect(serialized).not.toContain(SEEDED_DEPOSIT_AMOUNT);
      expect(serialized).not.toContain(order.depositObligationId);
      expect(serialized.toLowerCase()).not.toContain('deposit');
      for (const secret of [
        order.token,
        order.grantId,
        order.challengeId,
        order.customerId,
        order.customRequestId,
        order.remainingObligationId,
        order.orderId,
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('writes nothing and does not consume the link', async () => {
      const before = await obligationSnapshot(context.database, order.orderId);
      expect((await readFinalPayment(order.token)).status).toBe(200);
      expect((await readFinalPayment(order.token)).status).toBe(200);
      expect(await obligationSnapshot(context.database, order.orderId)).toEqual(before);

      const { rows } = await context.database.client.db.execute<{ status: string }>(
        sql`select status from secure_access_grants where id = ${order.grantId}`,
      );
      expect(rows[0]?.status).toBe('ACTIVE');
    });

    it('refuses a body carrying anything but the token', async () => {
      const response = await context.http
        .post(FINAL_PAYMENT_ROUTES.read)
        .send({ token: order.token, orderId: order.orderId });
      expect(response.status).toBe(400);
    });
  });

  // ── Case B — QR success ────────────────────────────────────────────────────

  describe('Case B — the QR reuses the delivered merchant authority and encoder', () => {
    let order: SeededDeposit;

    beforeAll(async () => {
      order = await seed();
    });

    it('streams a downloadable PNG with the same secure-payment headers as the deposit', async () => {
      const response = await qr(order.token);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('final-payment-transfer-qr.png');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect((response.body as Buffer).byteLength).toBeGreaterThan(0);
    });

    it('encodes the exact account, the exact REMAINING amount and the RM reference', async () => {
      // Decoded out of the delivered pixels by two packages that know nothing
      // about the encoder. The encoder and payload builder are APP7's, unchanged,
      // so a deterministic payload assertion is the whole proof (§16 Case B).
      const image = PNG.sync.read((await qr(order.token)).body as Buffer);
      const decoded = jsQR(Uint8ClampedArray.from(image.data), image.width, image.height);
      expect(decoded).not.toBeNull();
      const payload = (decoded as { data: string }).data;

      expect(payload).toContain(MERCHANT_BANK_TEST_CONFIG.bankBin);
      expect(payload).toContain(MERCHANT_BANK_TEST_CONFIG.accountNumber);
      // 1 785 000 VND, whole đồng, exactly the REMAINING obligation's amount —
      // and not the deposit's 765 000.
      expect(payload).toContain('54071785000');
      expect(payload).not.toContain('5406765000');
      expect(payload).toContain(remainingTransferReference(order.orderCode));
      expect(payload).not.toContain(depositTransferReference(order.orderCode));
      // Instructions only: no application URL, no token, no attempt, no provider.
      expect(payload.toLowerCase()).not.toContain('http');
      expect(payload).not.toContain(order.token);
      expect(payload).not.toContain(order.grantId);
    });

    it('changes no state, however many times it is downloaded', async () => {
      const before = await obligationSnapshot(context.database, order.orderId);
      for (let call = 0; call < 3; call += 1) {
        expect((await qr(order.token)).status).toBe(200);
      }
      expect(await obligationSnapshot(context.database, order.orderId)).toEqual(before);
    });
  });

  // ── Case C — attempt initiation success ────────────────────────────────────

  describe('Case C — initiation opens one attempt on REMAINING, never on DEPOSIT', () => {
    let order: SeededDeposit;

    beforeAll(async () => {
      order = await seed();
    });

    it('creates one PENDING BANK_TRANSFER attempt for the obligation’s exact amount', async () => {
      const response = await initiate(order.token, newKey());
      expect(response.status).toBe(201);

      const body = (response.body as { data: AttemptBody }).data;
      expect(body.method).toBe('BANK_TRANSFER');
      expect(body.status).toBe('PENDING');
      expect(body.amount).toBe(SEEDED_REMAINING_AMOUNT);
      expect(body.currencyCode).toBe('VND');
      expect(body.transferReference).toBe(remainingTransferReference(order.orderCode));
      expect(body.replayed).toBe(false);

      // Per **kind**: a bare total across the order could not tell an attempt on
      // the balance from one on the deposit, which is the exact defect this case
      // exists to rule out.
      expect(await obligationSnapshot(context.database, order.orderId)).toEqual([
        { kind: 'DEPOSIT', status: 'PENDING', amount: SEEDED_DEPOSIT_AMOUNT, attempts: '0' },
        { kind: 'REMAINING', status: 'PENDING', amount: SEEDED_REMAINING_AMOUNT, attempts: '1' },
      ]);

      const rows = await attemptsOf(context.database, order.remainingObligationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(SEEDED_REMAINING_AMOUNT);
      // No provider exists in this flow; neither column is fabricated.
      expect(rows[0]?.provider_key).toBeNull();
      expect(rows[0]?.provider_ref).toBeNull();
      expect(rows[0]?.grant_id).toBe(order.grantId);
      expect(rows[0]?.step_up_challenge_id).toBe(order.challengeId);
    });

    it('satisfies nothing and moves no order — this is not a payment', async () => {
      const { rows } = await context.database.client.db.execute<{ status: string }>(
        sql`select status from orders where id = ${order.orderId}`,
      );
      expect(rows[0]?.status).toBe('AWAITING_FINAL_PAYMENT');

      const counts = await context.database.client.db.execute<{ reconciliations: string }>(
        sql`select count(*)::text as reconciliations from payment_reconciliations`,
      );
      expect(counts.rows[0]?.reconciliations).toBe('0');
    });

    it('replays the same attempt for the same key and opens a second for a new one', async () => {
      const replayOrder = await seed();
      const key = newKey();

      const first = await initiate(replayOrder.token, key);
      const replay = await initiate(replayOrder.token, key);
      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);

      const firstBody = (first.body as { data: AttemptBody }).data;
      const replayBody = (replay.body as { data: AttemptBody }).data;
      expect(replayBody.attemptId).toBe(firstBody.attemptId);
      expect(replayBody.replayed).toBe(true);
      expect(await attemptsOf(context.database, replayOrder.remainingObligationId)).toHaveLength(1);

      // A deliberate retry sends a new key, and gets a second attempt. That is
      // APP7's accepted semantics, not B01's deterministic-409 replay model.
      const second = await initiate(replayOrder.token, newKey());
      expect(second.status).toBe(201);
      expect((second.body as { data: AttemptBody }).data.replayed).toBe(false);
      expect(await attemptsOf(context.database, replayOrder.remainingObligationId)).toHaveLength(2);
    });

    it('scopes idempotency to the obligation, so a key spent on the deposit is free here', async () => {
      const shared = await seed();
      const key = newKey();

      const deposit = await context.http
        .post(DEPOSIT_ROUTES.attempts)
        .set('Idempotency-Key', key)
        .send({ token: shared.token });
      expect(deposit.status).toBe(201);

      const balance = await initiate(shared.token, key);
      expect(balance.status).toBe(201);
      expect((balance.body as { data: AttemptBody }).data.replayed).toBe(false);

      // One attempt each, on two different obligations, from one caller key.
      expect(await obligationSnapshot(context.database, shared.orderId)).toEqual([
        { kind: 'DEPOSIT', status: 'PENDING', amount: SEEDED_DEPOSIT_AMOUNT, attempts: '1' },
        { kind: 'REMAINING', status: 'PENDING', amount: SEEDED_REMAINING_AMOUNT, attempts: '1' },
      ]);
    });

    it('refuses a malformed Idempotency-Key before writing anything', async () => {
      const strict = await seed();
      const response = await context.http
        .post(FINAL_PAYMENT_ROUTES.attempts)
        .set('Idempotency-Key', 'not a valid key!!')
        .send({ token: strict.token });
      expect(response.status).toBe(400);
      expect(await attemptsOf(context.database, strict.remainingObligationId)).toHaveLength(0);
    });
  });

  // ── Case D — not payable ───────────────────────────────────────────────────

  describe('Case D — before TR-LC14-05 the balance exists but cannot be acted on', () => {
    it.each([
      ['AWAITING_DEPOSIT', 'the order has not even paid its deposit'],
      ['PRODUCTION_COMPLETED', 'the work is done but no Admin has opened collection'],
      ['ON_HOLD', 'the order was paused out of the payable state'],
    ] as const)('refuses the QR and initiation in %s (%s)', async (status, _why) => {
      const order = await seed({ status });

      // The read still answers, honestly, with payable false. That is the §6
      // read/act split: a customer may always see what they owe.
      const read = await readFinalPayment(order.token);
      expect(read.status).toBe(200);
      expect(dataOf(read).orderStatus).toBe(status);
      expect(dataOf(read).finalPaymentStatus).toBe('PENDING');
      expect(dataOf(read).payable).toBe(false);
      expect(dataOf(read).finalPaymentAmount).toBe(SEEDED_REMAINING_AMOUNT);

      const image = await qr(order.token);
      expect(image.status).toBe(409);

      const attempt = await initiate(order.token, newKey());
      expect(attempt.status).toBe(409);
      expect(codeOf(attempt)).toBe('FINAL_PAYMENT_NOT_PAYABLE');

      // Nothing was written by either refusal.
      expect(await attemptsOf(context.database, order.remainingObligationId)).toHaveLength(0);
    });
  });

  // ── Case E — superseded / missing REMAINING ────────────────────────────────

  describe('Case E — a non-live balance refuses safely and never falls back to the deposit', () => {
    it('answers a superseded obligation with the same 404 as an unknown token', async () => {
      const order = await seed();
      await supersedeObligation(context.database, order.remainingObligationId);

      const read = await readFinalPayment(order.token);
      const unknown = await readFinalPayment(mintToken());

      expect(read.status).toBe(404);
      expect(read.status).toBe(unknown.status);
      expect(codeOf(read)).toBe('SECURE_LINK_UNAVAILABLE');
      expect(codeOf(read)).toBe(codeOf(unknown));
      expect((read.body as { message: string }).message).toBe(
        (unknown.body as { message: string }).message,
      );

      // The live DEPOSIT obligation is still right there, and is never
      // substituted: the surface refuses rather than showing the wrong money.
      const serialized = JSON.stringify(read.body);
      expect(serialized).not.toContain(SEEDED_DEPOSIT_AMOUNT);
      expect(serialized).not.toContain(order.depositObligationId);

      expect((await qr(order.token)).status).toBe(404);
      const attempt = await initiate(order.token, newKey());
      expect(attempt.status).toBe(404);
      expect(await attemptsOf(context.database, order.remainingObligationId)).toHaveLength(0);
    });

    it('answers a request with no order with that same 404', async () => {
      const pending = await seedGrantWithoutOrder(context.database);
      const missing = await readFinalPayment(pending.token);
      const unknown = await readFinalPayment(mintToken());

      expect(missing.status).toBe(unknown.status);
      expect(codeOf(missing)).toBe(codeOf(unknown));
      expect((missing.body as { message: string }).message).toBe(
        (unknown.body as { message: string }).message,
      );
    });
  });

  // ── Case F — access isolation ──────────────────────────────────────────────

  describe('Case F — one grant reaches exactly one order’s balance', () => {
    it('gives each of two live links only its own order, with no id to substitute', async () => {
      const mine = await seed();
      const theirs = await seed();

      const first = dataOf(await readFinalPayment(mine.token));
      const second = dataOf(await readFinalPayment(theirs.token));

      expect(first.orderCode).toBe(mine.orderCode);
      expect(second.orderCode).toBe(theirs.orderCode);
      expect(first.orderCode).not.toBe(second.orderCode);
      expect(first.bankInstructions.transferReference).not.toBe(
        second.bankInstructions.transferReference,
      );

      // There is no order id, obligation id or attempt id anywhere in the
      // contract, so "substitute the other order's identifier" is not a request
      // this surface can express — and adding one to the body is a 400.
      const smuggled = await context.http
        .post(FINAL_PAYMENT_ROUTES.read)
        .send({ token: mine.token, orderId: theirs.orderId });
      expect(smuggled.status).toBe(400);

      // An attempt opened on one link lands on that link's obligation only.
      expect((await initiate(mine.token, newKey())).status).toBe(201);
      expect(await attemptsOf(context.database, mine.remainingObligationId)).toHaveLength(1);
      expect(await attemptsOf(context.database, theirs.remainingObligationId)).toHaveLength(0);
    });
  });

  // ── Case G — satisfied obligation ──────────────────────────────────────────

  describe('Case G — a settled balance is readable but cannot be reopened', () => {
    it('keeps the read available after verification and refuses both acting operations', async () => {
      const order = await seed();
      // The customer's own attempt, then the state an Admin verification leaves
      // behind, then TR-LC14-06's move — all through canonical writers.
      const paid = ((await initiate(order.token, newKey())).body as { data: AttemptBody }).data;
      await satisfyThroughVerification(context.app, order.remainingObligationId, paid.attemptId);
      await transitionOrderTo(context.app, order.orderId, 'READY_FOR_DELIVERY');

      const read = await readFinalPayment(order.token);
      expect(read.status).toBe(200);
      expect(dataOf(read).orderStatus).toBe('READY_FOR_DELIVERY');
      expect(dataOf(read).finalPaymentStatus).toBe('SATISFIED');
      expect(dataOf(read).payable).toBe(false);
      // Committed truth, still the obligation's own amount.
      expect(dataOf(read).finalPaymentAmount).toBe(SEEDED_REMAINING_AMOUNT);
      // And no carrier or tracking fact leaks onto a customer surface.
      expect(JSON.stringify(read.body).toLowerCase()).not.toMatch(/carrier|tracking|shipping/);

      expect((await qr(order.token)).status).toBe(409);
      const attempt = await initiate(order.token, newKey());
      expect(attempt.status).toBe(409);
      expect(codeOf(attempt)).toBe('FINAL_PAYMENT_NOT_PAYABLE');
      // Still the one attempt that paid it. Payment is not reopened: no second
      // attempt exists, and the obligation is untouched by either refusal.
      expect(await attemptsOf(context.database, order.remainingObligationId)).toHaveLength(1);
      expect(await obligationSnapshot(context.database, order.orderId)).toEqual([
        { kind: 'DEPOSIT', status: 'PENDING', amount: SEEDED_DEPOSIT_AMOUNT, attempts: '0' },
        { kind: 'REMAINING', status: 'SATISFIED', amount: SEEDED_REMAINING_AMOUNT, attempts: '1' },
      ]);
    });
  });

  // ── Case H — the reused evidence lane ──────────────────────────────────────

  describe('Case H — the attempt-scoped evidence lane reaches a REMAINING attempt', () => {
    /**
     * `APP9-B02` narrowly generalised `EvidenceAttemptAuthorizer`: it now
     * contains the attempt against the request's **order** and accepts either
     * `CST-039` kind, where before it required the attempt's obligation to be
     * the live `DEPOSIT` one. This case proves the three things that change had
     * to preserve, through the delivered `deposit/evidence/status` operation —
     * which is a real evidence operation and needs no new endpoint.
     */
    const EVIDENCE_STATUS = `${DEPOSIT_ROUTES.attempts.replace('/attempts', '')}/evidence/status`;

    function evidenceStatus(accessToken: string, attemptId: string) {
      return context.http.post(EVIDENCE_STATUS).send({ accessToken, attemptId });
    }

    it('resolves a REMAINING attempt, still resolves a DEPOSIT one, and refuses a foreign one', async () => {
      const mine = await seed();
      const theirs = await seed();

      const balance = ((await initiate(mine.token, newKey())).body as { data: AttemptBody }).data;
      const deposit = (
        (
          await context.http
            .post(DEPOSIT_ROUTES.attempts)
            .set('Idempotency-Key', newKey())
            .send({ token: mine.token })
        ).body as { data: AttemptBody }
      ).data;

      // The REMAINING attempt now resolves — before B02 this was a 404, which is
      // what made the lane unusable for the balance.
      const remainingStatus = await evidenceStatus(mine.token, balance.attemptId);
      expect(remainingStatus.status).toBe(200);

      // APP7's deposit evidence still works, unchanged.
      const depositStatus = await evidenceStatus(mine.token, deposit.attemptId);
      expect(depositStatus.status).toBe(200);

      // Isolation is intact, and it is the *order* comparison that holds it: the
      // other customer's link cannot resolve this order's attempt, of either
      // kind, and the refusal is the same indistinguishable 404.
      for (const attemptId of [balance.attemptId, deposit.attemptId]) {
        const foreign = await evidenceStatus(theirs.token, attemptId);
        expect(foreign.status).toBe(404);
        expect(codeOf(foreign)).toBe('SECURE_LINK_UNAVAILABLE');
      }
    });
  });
});

/** A fresh suffix per chain: `seedOrderChain` keys unique columns off it. */
function newSuffix(): string {
  return randomBytes(4).toString('hex');
}

/** A caller-chosen idempotency key in the delivered accepted alphabet. */
function newKey(): string {
  return `app9-b02-${randomBytes(8).toString('hex')}`;
}
