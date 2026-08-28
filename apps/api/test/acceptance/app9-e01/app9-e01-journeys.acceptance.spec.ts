/**
 * `APP9-E01` — the APP9 cross-boundary journeys, API side, on one order.
 *
 * ### What this file is, and what it is not
 *
 * It is **not** a rerun of `B01`–`B05`. Each of those suites booted the modules
 * it owned and proved its own row-level behaviour — the guards, the refusals,
 * the races, the payload shapes. None of that is re-proved here, and no failing
 * case is driven except the two replays the checkpoint asks for by name.
 *
 * What `E01` asks instead is whether the delivered slices **compose**: whether
 * the balance an Admin opens is the same one the customer's secure link reads,
 * the same one the QR encodes, the same one the customer's attempt belongs to,
 * the same one Admin verification satisfies, and the same one dispatch checks
 * before it freezes. So the journeys run against **one order**, in order, each
 * continuing from the state the previous one committed — which is why the
 * actions live in `beforeAll` and the `it` blocks read committed rows back.
 *
 * ### The one journey that cannot live in this file
 *
 * Journey 2B — the worker consuming the `payment.verified(REMAINING)` this file
 * produces — is in `apps/worker/test/acceptance/app9-e01`, because `apps/api`
 * may not import `apps/worker`. The two halves meet in the database and at the
 * outbox row's shape, which is why case `E01-06` asserts that row **column by
 * column** rather than merely counting it.
 *
 * ### No real transfer
 *
 * The QR is decoded out of the delivered pixels and asserted. Nothing is scanned
 * by a banking application, no payment provider is contacted, no bank is called,
 * and every credential is synthetic and minted per run.
 */
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

import { remainingTransferReference } from '../../../src/modules/payment/domain/final-payment/final-payment-reference';
import { MERCHANT_BANK_TEST_CONFIG } from '../../support/api-integration-context';
import {
  ADMIN_ORIGIN,
  ADMIN_PAYMENT_ROUTES,
  BASELINE_SHIPPING_FEE,
  E01_ROUTES,
  FINAL_PAYMENT_ROUTES,
  SEEDED_DEPOSIT_AMOUNT,
  SEEDED_ORDER_TOTAL,
  SEEDED_REMAINING_AMOUNT,
  codeOf,
  createApp9AcceptanceContext,
  dataOf,
  mintToken,
  newIdempotencyKey,
  seedGrantWithoutOrder,
  type App9AcceptanceContext,
  type ObligationRow,
  type SeededDeposit,
  type ShippingDetailRow,
  type SnapshotRow,
  type TransitionRow,
} from './app9-e01-context';

jest.setTimeout(300_000);

/**
 * The two fields every assertion in this file reads off a response.
 *
 * Declared rather than inferred from Supertest's `Test`, which is a thenable
 * builder: `Awaited<ReturnType<…>>` on it resolves to the builder, not to the
 * response, and would type every `status` as `any`.
 */
interface HttpOutcome {
  readonly status: number;
  readonly body: unknown;
}

interface FinalPaymentBody {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly finalPaymentStatus: string;
  readonly finalPaymentAmount: string;
  readonly currencyCode: string;
  readonly payable: boolean;
}

interface AttemptBody {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}

interface VerificationBody {
  readonly attemptStatus: string;
  readonly depositObligationId: string;
  readonly depositStatus: string;
  readonly orderStatus: string;
  readonly replayed: boolean;
}

interface DispatchBody {
  readonly status: string;
  readonly fromStatus: string;
  readonly shippingStatus: string;
  readonly frozenAt: string;
}

interface CompletionBody {
  readonly status: string;
  readonly fromStatus: string;
}

/**
 * `adminOrderShipping_read`'s payload.
 *
 * The detail *is* the envelope's `data` on the read; only the save wraps it in
 * `{ orderId, detail, fee }`. Stated as its own interface so the difference is
 * visible rather than discovered.
 */
interface ShippingReadBody {
  readonly recipientName: string;
  readonly feeAmount: string | null;
  readonly carrierName: string | null;
  readonly trackingCode: string | null;
  readonly status: string;
  readonly frozenAt: string | null;
}

/** The shipping detail Journey 3 saves. Both notes are set, and neither is a gate. */
const SHIPPING_COMMAND = {
  recipientName: 'Nguyễn Thị Mai',
  recipientPhone: '0901234567',
  addressLine: '12 Nguyễn Huệ',
  ward: 'Phường Bến Nghé',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  feeAmount: BASELINE_SHIPPING_FEE,
  carrierName: 'Giao Hàng Nhanh',
  trackingCode: 'GHN123456789',
} as const;

describe('APP9-E01 — remaining payment, fulfillment and completion', () => {
  let context: App9AcceptanceContext;
  /** The one order every journey runs against. */
  let order: SeededDeposit;
  /** A second, unrelated chain. Its live link is the isolation counter-example. */
  let other: SeededDeposit;
  /**
   * The one `REMAINING` attempt Journey 1's customer opens.
   *
   * Held in the outer scope because Journey 2 verifies **that** attempt rather
   * than one it manufactured for itself. Threading it through is what makes the
   * journeys one chain instead of independently seeded stories.
   */
  let remainingAttemptId: string;

  beforeAll(async () => {
    context = await createApp9AcceptanceContext('app9_e01');
    order = await context.seedProductionCompletedOrder('e01a');
    other = await context.seedProductionCompletedOrder('e01b');
  });

  afterAll(async () => {
    await context?.close();
  });

  const asAdmin = (path: string) =>
    context.admin.ctx.http
      .post(path)
      .set('Cookie', context.admin.cookie())
      .set('Origin', ADMIN_ORIGIN);

  const readAsAdmin = (path: string) =>
    context.admin.ctx.http
      .get(path)
      .set('Cookie', context.admin.cookie())
      .set('Origin', ADMIN_ORIGIN);

  const putAsAdmin = (path: string) =>
    context.admin.ctx.http
      .put(path)
      .set('Cookie', context.admin.cookie())
      .set('Origin', ADMIN_ORIGIN);

  const readFinalPayment = (token: string) =>
    context.admin.ctx.http.post(FINAL_PAYMENT_ROUTES.read).send({ token });

  const evidenceStatus = (accessToken: string, attemptId: string) =>
    context.admin.ctx.http.post(E01_ROUTES.evidenceStatus).send({ accessToken, attemptId });

  const remainingOf = (rows: readonly ObligationRow[]): ObligationRow | undefined =>
    rows.find((row) => row.kind === 'REMAINING');

  const depositOf = (rows: readonly ObligationRow[]): ObligationRow | undefined =>
    rows.find((row) => row.kind === 'DEPOSIT');

  const movesTo = async (to: string): Promise<TransitionRow[]> =>
    (await context.transitionsOf(order.orderId)).filter((row) => row.to_status === to);

  // ===========================================================================
  // Journey 1 — Admin opens final payment, and the customer can pay it.
  // ===========================================================================

  describe('Journey 1 — opening the final payment and the customer surface', () => {
    let entry: HttpOutcome;
    let obligationsAfterEntry: readonly ObligationRow[];
    let attempt: AttemptBody;

    beforeAll(async () => {
      entry = await asAdmin(E01_ROUTES.transition(order.orderId)).send({
        to: 'AWAITING_FINAL_PAYMENT',
      });
      obligationsAfterEntry = await context.obligationsOf(order.orderId);

      attempt = dataOf<AttemptBody>(
        await context.admin.ctx.http
          .post(FINAL_PAYMENT_ROUTES.attempts)
          .set('Idempotency-Key', newIdempotencyKey())
          .send({ token: order.token }),
      );
      remainingAttemptId = attempt.attemptId;
    });

    // ── 1A — TR-LC14-05 ─────────────────────────────────────────────────────

    it('E01-01 — opens final payment without disturbing the balance it exposes', async () => {
      expect(entry.status).toBe(200);
      expect(await context.orderStatus(order.orderId)).toBe('AWAITING_FINAL_PAYMENT');

      // The existing REMAINING row stays the authority: same id, same amount,
      // still PENDING, still the only one. A defect that "prepared" the balance
      // by writing a fresh obligation would pass a status-only assertion.
      expect(obligationsAfterEntry).toHaveLength(2);
      const remaining = remainingOf(obligationsAfterEntry);
      expect(remaining?.id).toBe(order.remainingObligationId);
      expect(remaining?.status).toBe('PENDING');
      expect(remaining?.amount).toBe(SEEDED_REMAINING_AMOUNT);
      expect(remaining?.superseded_by_obligation_id).toBeNull();

      // Exactly one LC-14 move, and it is TR-LC14-05 out of the state the
      // acceptance baseline names.
      const added = await movesTo('AWAITING_FINAL_PAYMENT');
      expect(added).toHaveLength(1);
      expect(added[0]?.from_status).toBe('PRODUCTION_COMPLETED');
      expect(added[0]?.actor_kind).toBe('ADMIN');
    });

    // ── 1B — the customer read, and secure-link isolation ───────────────────

    it('E01-02 — publishes the live REMAINING balance to that order’s own link alone', async () => {
      const body = dataOf<FinalPaymentBody>(await readFinalPayment(order.token));

      expect(body.orderCode).toBe(order.orderCode);
      expect(body.finalPaymentAmount).toBe(SEEDED_REMAINING_AMOUNT);
      expect(body.finalPaymentStatus).toBe('PENDING');
      expect(body.orderStatus).toBe('AWAITING_FINAL_PAYMENT');
      expect(body.payable).toBe(true);
      expect(body.currencyCode).toBe('VND');
      // The two figures a substitution defect would produce instead: the
      // deposit, and the order total a `total − deposit` derivation starts from.
      expect(body.finalPaymentAmount).not.toBe(SEEDED_DEPOSIT_AMOUNT);
      expect(body.finalPaymentAmount).not.toBe(SEEDED_ORDER_TOTAL);

      // The other customer's live link opens *their* order, never this one.
      const foreign = dataOf<FinalPaymentBody>(await readFinalPayment(other.token));
      expect(foreign.orderCode).toBe(other.orderCode);
      expect(foreign.orderCode).not.toBe(order.orderCode);

      // A live REQUEST_ACCESS grant on a request with no order yet, and a
      // well-formed token that opens no grant at all, answer with the one
      // identical 404. Both are minted by the canonical `mintToken` rather than
      // typed as a short literal: a malformed token is refused by the body
      // schema as a 400 before secure-link resolution ever runs, which would
      // prove nothing about isolation.
      const unconverted = await seedGrantWithoutOrder(context.database);
      for (const token of [unconverted.token, mintToken()]) {
        const refused = await readFinalPayment(token);
        expect(refused.status).toBe(404);
        expect(codeOf(refused)).toBe('SECURE_LINK_UNAVAILABLE');
      }
    });

    // ── 1C — QR and the attempt ─────────────────────────────────────────────

    it('E01-03 — carries the exact authoritative amount into the QR and the attempt', async () => {
      const response = await context.admin.ctx.http
        .post(FINAL_PAYMENT_ROUTES.qr)
        .send({ token: order.token })
        .responseType('blob');
      expect(response.status).toBe(200);

      // Decoded out of the delivered pixels by two packages that know nothing
      // about the encoder — so this is the amount a banking application would
      // pre-fill, not the one the response body claims.
      const image = PNG.sync.read(response.body as Buffer);
      const decoded = jsQR(Uint8ClampedArray.from(image.data), image.width, image.height);
      expect(decoded).not.toBeNull();
      const payload = (decoded as { data: string }).data;
      expect(payload).toContain(MERCHANT_BANK_TEST_CONFIG.accountNumber);
      expect(payload).toContain(remainingTransferReference(order.orderCode));
      // Whole dong in the EMVCo payload; `numeric(14,2)` on the wire.
      expect(payload).toContain(SEEDED_REMAINING_AMOUNT.replace('.00', ''));
      expect(payload).not.toContain(SEEDED_DEPOSIT_AMOUNT.replace('.00', ''));

      // The attempt the customer opened carries the same figure and the RM memo.
      expect(attempt.status).toBe('PENDING');
      expect(attempt.method).toBe('BANK_TRANSFER');
      expect(attempt.amount).toBe(SEEDED_REMAINING_AMOUNT);
      expect(attempt.transferReference).toBe(remainingTransferReference(order.orderCode));
      expect(attempt.replayed).toBe(false);

      // Per kind, deliberately: a total attempt count across the order cannot
      // tell "one was opened on the balance" from "one was opened on the
      // deposit", which is the exact confusion this case rules out.
      const rows = await context.obligationsOf(order.orderId);
      expect(remainingOf(rows)?.attempts).toBe('1');
      expect(depositOf(rows)?.attempts).toBe('0');
    });

    // ── 1D — the reused evidence lane ───────────────────────────────────────

    it('E01-04 — binds the evidence lane to the REMAINING attempt and refuses a foreign link', async () => {
      // APP7-B05's delivered attempt-scoped operation, which `APP9-B02`
      // generalised to either CST-039 kind. No evidence endpoint is added here
      // and no upload is performed: what E01 checks is the *binding*.
      const mine = await evidenceStatus(order.token, remainingAttemptId);
      expect(mine.status).toBe(200);

      // The other customer's live link cannot resolve this order's REMAINING
      // attempt, and the refusal is the same indistinguishable 404.
      const foreign = await evidenceStatus(other.token, remainingAttemptId);
      expect(foreign.status).toBe(404);
      expect(codeOf(foreign)).toBe('SECURE_LINK_UNAVAILABLE');
    });
  });

  // ===========================================================================
  // Journey 2 — Admin verifies the balance, and announces it exactly once.
  // ===========================================================================

  describe('Journey 2 — Admin verification of the REMAINING balance', () => {
    let verification: VerificationBody;

    beforeAll(async () => {
      // The attempt the *customer* opened in Journey 1 — not one this journey
      // manufactured for itself. That is the cross-boundary claim.
      const response = await asAdmin(ADMIN_PAYMENT_ROUTES.verify(remainingAttemptId)).send({
        observedAmount: SEEDED_REMAINING_AMOUNT,
        observedTransferReference: remainingTransferReference(order.orderCode),
        note: 'Matched against the bank statement line for the balance.',
      });
      expect(response.status).toBe(200);
      verification = dataOf<VerificationBody>(response);
    });

    it('E01-05 — settles the attempt, satisfies REMAINING and reaches READY_FOR_DELIVERY', async () => {
      expect(verification.attemptStatus).toBe('SUCCEEDED');
      expect(verification.depositObligationId).toBe(order.remainingObligationId);
      expect(verification.depositStatus).toBe('SATISFIED');
      expect(verification.orderStatus).toBe('READY_FOR_DELIVERY');
      expect(verification.replayed).toBe(false);

      const rows = await context.obligationsOf(order.orderId);
      expect(remainingOf(rows)?.status).toBe('SATISFIED');
      expect(remainingOf(rows)?.satisfied_by_attempt_id).toBe(remainingAttemptId);
      // The deposit is a row a defect could plausibly have moved. It did not.
      expect(depositOf(rows)?.status).toBe('PENDING');
      expect(depositOf(rows)?.satisfied_by_attempt_id).toBeNull();

      // One TR-LC14-06, out of the one state it is legal from.
      const moves = await movesTo('READY_FOR_DELIVERY');
      expect(moves).toHaveLength(1);
      expect(moves[0]?.from_status).toBe('AWAITING_FINAL_PAYMENT');
      expect(moves[0]?.actor_kind).toBe('ADMIN');
    });

    it('E01-06 — emits exactly one payment.verified, carrying REMAINING', async () => {
      const events = await context.outboxFor(remainingAttemptId);

      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.event_type).toBe('payment.verified');
      expect(event?.aggregate_kind).toBe('PAYMENT_ATTEMPT');
      expect(event?.aggregate_id).toBe(remainingAttemptId);
      expect(event?.payload_schema_version).toBe(1);
      // Column by column, because this is the row `apps/worker`'s half of E01
      // consumes. `obligationKind: 'DEPOSIT'` here would pass every count-only
      // assertion while telling the reservation consumer to reserve a second time.
      expect(event?.payload).toEqual({
        paymentAttemptId: remainingAttemptId,
        paymentObligationId: order.remainingObligationId,
        obligationKind: 'REMAINING',
        orderId: order.orderId,
      });
    });
  });

  // ===========================================================================
  // Journey 3 — shipping detail, then the dispatch freeze.
  // ===========================================================================

  describe('Journey 3 — shipping detail and the dispatch freeze', () => {
    let saved: { readonly fee: { readonly changed: boolean; readonly previousFeeAmount: string } };
    /** The delivered read, taken **before** the dispatch that freezes the detail. */
    let readBeforeDispatch: ShippingReadBody;
    let readBack: ShippingDetailRow | undefined;
    let dispatch: DispatchBody;
    let replay: HttpOutcome;

    beforeAll(async () => {
      const saveResponse = await putAsAdmin(E01_ROUTES.shipping(order.orderId)).send(
        SHIPPING_COMMAND,
      );
      expect(saveResponse.status).toBe(200);
      saved = dataOf(saveResponse);

      // Ordered deliberately: `adminOrderShipping_read` is exercised here, while
      // the detail is still editable, because "the save leaves it EDITABLE" is
      // the claim — and the very next call freezes it.
      readBeforeDispatch = dataOf<ShippingReadBody>(
        await readAsAdmin(E01_ROUTES.shipping(order.orderId)),
      );

      const dispatchResponse = await asAdmin(E01_ROUTES.dispatch(order.orderId)).send();
      expect(dispatchResponse.status).toBe(200);
      dispatch = dataOf<DispatchBody>(dispatchResponse);

      replay = await asAdmin(E01_ROUTES.dispatch(order.orderId)).send();
      readBack = await context.shippingDetailOf(order.orderId);
    });

    it('E01-07 — saves and reads back the detail with no fee recalculation', async () => {
      // The saved fee equals the accepted quotation version's frozen baseline,
      // so this is a genuine no-change save rather than one that happened not to
      // trip the recalculation. `APP9-B04-C1` refuses a fee *change* against a
      // SATISFIED balance, which is why E01's happy path must not attempt one.
      expect(saved.fee.changed).toBe(false);
      expect(saved.fee.previousFeeAmount).toBe(BASELINE_SHIPPING_FEE);

      // Read back through the delivered operation, which publishes the detail as
      // the envelope's `data` directly — there is no second wrapper on the read,
      // unlike the save's `{ orderId, detail, fee }`.
      expect(readBeforeDispatch.status).toBe('EDITABLE');
      expect(readBeforeDispatch.frozenAt).toBeNull();
      expect(readBeforeDispatch.feeAmount).toBe(BASELINE_SHIPPING_FEE);
      expect(readBeforeDispatch.recipientName).toBe(SHIPPING_COMMAND.recipientName);
      expect(readBeforeDispatch.carrierName).toBe(SHIPPING_COMMAND.carrierName);
      expect(readBeforeDispatch.trackingCode).toBe(SHIPPING_COMMAND.trackingCode);

      // No obligation was superseded, and no acknowledgement was minted. An
      // Admin write may never produce the customer's evidence (`APP9-B04-C1`).
      const rows = await context.obligationsOf(order.orderId);
      expect(rows).toHaveLength(2);
      expect(remainingOf(rows)?.id).toBe(order.remainingObligationId);
      expect(remainingOf(rows)?.status).toBe('SATISFIED');
      expect(await context.countRows('shipping_fee_acknowledgements')).toBe(0);
    });

    it('E01-08 — dispatches atomically: DELIVERED, FROZEN, and one faithful snapshot', async () => {
      expect(dispatch.status).toBe('DELIVERED');
      expect(dispatch.fromStatus).toBe('READY_FOR_DELIVERY');
      expect(dispatch.shippingStatus).toBe('FROZEN');
      expect(dispatch.frozenAt).toEqual(expect.any(String));

      expect(await context.orderStatus(order.orderId)).toBe('DELIVERED');
      expect(readBack?.status).toBe('FROZEN');
      expect(readBack?.frozen_at).not.toBeNull();

      const snapshots = await context.snapshotsOf(order.orderId);
      expect(snapshots).toHaveLength(1);
      // The snapshot is the authoritative shipping detail *copied*, not a
      // summary of it — compared field by field against the row it froze.
      const snapshot = snapshots[0] as SnapshotRow;
      expect(snapshot.shipping_detail_id).toBe(readBack?.id);
      expect({
        recipient_name: snapshot.recipient_name,
        recipient_phone: snapshot.recipient_phone,
        address_line: snapshot.address_line,
        province: snapshot.province,
        country_code: snapshot.country_code,
        fee_amount: snapshot.fee_amount,
        currency_code: snapshot.currency_code,
        carrier_name: snapshot.carrier_name,
        tracking_code: snapshot.tracking_code,
      }).toEqual({
        recipient_name: readBack?.recipient_name,
        recipient_phone: readBack?.recipient_phone,
        address_line: readBack?.address_line,
        province: readBack?.province,
        country_code: readBack?.country_code,
        fee_amount: readBack?.fee_amount,
        currency_code: readBack?.currency_code,
        carrier_name: readBack?.carrier_name,
        tracking_code: readBack?.tracking_code,
      });

      const moves = await movesTo('DELIVERED');
      expect(moves).toHaveLength(1);
      expect(moves[0]?.from_status).toBe('READY_FOR_DELIVERY');
      expect(moves[0]?.event_kind).toBe('SHIPPING_FREEZE');
      expect(moves[0]?.actor_kind).toBe('ADMIN');

      // Fulfillment moved no money.
      const rows = await context.obligationsOf(order.orderId);
      expect(remainingOf(rows)?.status).toBe('SATISFIED');
      expect(depositOf(rows)?.status).toBe('PENDING');
    });

    it('E01-09 — refuses a replayed dispatch and creates no second snapshot', async () => {
      // A deterministic refusal, not a second receipt: `TR-LC14-07` is legal
      // from one state only, and the order has left it.
      expect(replay.status).toBe(409);
      expect(codeOf(replay)).toBe('ORDER_INVALID_TRANSITION');

      expect(await context.snapshotsOf(order.orderId)).toHaveLength(1);
      expect(await movesTo('DELIVERED')).toHaveLength(1);
      expect(await context.orderStatus(order.orderId)).toBe('DELIVERED');
    });
  });

  // ===========================================================================
  // Journey 4 — completion.
  // ===========================================================================

  describe('Journey 4 — order completion', () => {
    let completion: CompletionBody;
    let replay: HttpOutcome;
    let snapshotsBefore: readonly SnapshotRow[];

    beforeAll(async () => {
      snapshotsBefore = await context.snapshotsOf(order.orderId);
      const response = await asAdmin(E01_ROUTES.completion(order.orderId)).send();
      expect(response.status).toBe(200);
      completion = dataOf<CompletionBody>(response);
      replay = await asAdmin(E01_ROUTES.completion(order.orderId)).send();
    });

    it('E01-10 — completes once, refuses the replay, and touches nothing else', async () => {
      expect(completion.status).toBe('COMPLETED');
      expect(completion.fromStatus).toBe('DELIVERED');
      expect(await context.orderStatus(order.orderId)).toBe('COMPLETED');

      // One TR-LC14-08, and the replay is the same guard answering about a later
      // instant rather than a second receipt.
      expect(replay.status).toBe(409);
      expect(codeOf(replay)).toBe('ORDER_INVALID_TRANSITION');
      const moves = await movesTo('COMPLETED');
      expect(moves).toHaveLength(1);
      expect(moves[0]?.from_status).toBe('DELIVERED');
      expect(moves[0]?.actor_kind).toBe('ADMIN');

      // The shipping side stays frozen and the snapshot is unchanged, through
      // both the completion and its replay.
      const detail = await context.shippingDetailOf(order.orderId);
      expect(detail?.status).toBe('FROZEN');
      expect(await context.snapshotsOf(order.orderId)).toEqual(snapshotsBefore);

      const rows = await context.obligationsOf(order.orderId);
      expect(remainingOf(rows)?.status).toBe('SATISFIED');
      expect(depositOf(rows)?.status).toBe('PENDING');
    });
  });
});
