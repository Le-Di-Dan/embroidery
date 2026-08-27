/**
 * `APP9-B04-C1` — the customer shipping-fee acknowledgement, end to end against
 * a real database through the real public HTTP surface.
 *
 * Three cases, and they are the ones the correction turns on: a valid decision
 * writes exactly one immutable row and moves nothing else; an ineligible caller
 * writes none; and a repeat of the same decision writes no second one.
 *
 * Nothing is stubbed. `ReauthorizeSecureGrant` digests the token against the
 * production pepper and locks the grant row, and `StepUpEvidenceResolver`
 * resolves the challenge through the customer's own verified contacts against
 * the published `secure_grant` window — GRD-002 and GRD-003 execute for real, as
 * `APP9-B04` §20 requires. The token is synthetic, minted per test, never
 * asserted on and never printed; no OTP, digest or pepper appears here.
 *
 * The Admin-side halves of the correction — a refused increase, an authorised
 * one, and stale evidence — live in `admin-shipping-detail.integration.spec.ts`,
 * where the write they are about already is.
 */
import request from 'supertest';

import {
  ACKNOWLEDGEMENT_ROUTE,
  createShippingDetailContext,
  dataOf,
  errorCodeOf,
  QUOTED_FEE,
  REMAINING_AMOUNT,
  type ShippingDetailTestContext,
} from './shipping-detail-context';

interface AcknowledgedPayload {
  readonly orderCode: string;
  readonly previousFeeAmount: string;
  readonly newFeeAmount: string;
  readonly currencyCode: string;
  readonly acknowledgedAt: string;
  readonly replayed: boolean;
}

const ACCEPTED_FEE = '80000.00';

describe('APP9-B04-C1 — customer shipping-fee acknowledgement', () => {
  let context: ShippingDetailTestContext;

  beforeAll(async () => {
    context = await createShippingDetailContext('app9-b04-c1-ack');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    // Publishes the two policies the public surface reads fail-closed.
    await context.seedAdminSession();
  });

  /** C1-1 — one decision, one immutable row, and nothing else touched. */
  it('records exactly one acknowledgement and changes nothing else', async () => {
    const { orderId, code, fixture } = await context.seedOrder();
    const token = await context.linkToken(fixture.customRequestId);

    const response = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: ACCEPTED_FEE });
    expect(response.status).toBe(201);

    const payload = dataOf<AcknowledgedPayload>(response);
    expect(payload.orderCode).toBe(code);
    // Server authority: the body never carried a previous fee, and the order has
    // no shipping detail yet, so this is the accepted quotation's frozen figure.
    expect(payload.previousFeeAmount).toBe(QUOTED_FEE);
    expect(payload.newFeeAmount).toBe(ACCEPTED_FEE);
    expect(payload.currencyCode).toBe('VND');
    expect(payload.replayed).toBe(false);

    const acknowledgements = await context.acknowledgementsOf(orderId);
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0]?.previousFeeAmount).toBe(QUOTED_FEE);
    expect(acknowledgements[0]?.newFeeAmount).toBe(ACCEPTED_FEE);
    expect(acknowledgements[0]?.currencyCode).toBe('VND');
    // Resolved from the order's own chain by the production validators, never
    // from the request body — which has no field that could carry either.
    expect(acknowledgements[0]?.grantId).toBe(fixture.grantId);
    expect(acknowledgements[0]?.stepUpChallengeId).toBe(fixture.challengeId);

    // The decision is not the change. No shipping detail was created, the live
    // REMAINING is untouched, no obligation was superseded, no reconciliation
    // and no payment attempt was written, and the order did not move.
    expect(await context.shippingOf(orderId)).toBeUndefined();
    expect(await context.countRows('shipping_details')).toBe(0);
    expect(await context.countRows('shipping_snapshots')).toBe(0);
    const obligations = await context.obligationsOf(orderId);
    expect(obligations.map((one) => [one.kind, one.status, one.amount])).toEqual([
      ['DEPOSIT', 'PENDING', '765000.00'],
      ['REMAINING', 'PENDING', REMAINING_AMOUNT],
    ]);
    expect(await context.reconciliationsOf()).toEqual([]);
    expect(await context.countRows('payment_attempts')).toBe(0);
    expect(await context.orderStatus(orderId)).toBe('PRODUCTION_COMPLETED');
  });

  /**
   * C1-6 — ineligible callers write nothing.
   *
   * Three readings of "this is not a decision this customer may make right now":
   * a revoked grant, a lapsed step-up, and a fee that is not an increase. The
   * first two are the changed authorization path; the third is the binding rule
   * the endpoint exists for. Two orders, because revoking a grant is not
   * reversible through any delivered writer and a fixture must not invent one.
   */
  it('refuses an ineligible or non-increasing decision, writing no acknowledgement', async () => {
    const revoked = await context.seedOrder();
    const live = await context.seedOrder();

    // A grant that is no longer usable. The refusal is the single public answer
    // to every unusable token, and it discloses nothing about the order.
    const deadToken = await context.linkToken(revoked.fixture.customRequestId);
    await context.revokeGrants(revoked.fixture.customRequestId);
    const refused = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token: deadToken, newFeeAmount: ACCEPTED_FEE });
    expect(refused.status).toBe(404);
    expect(errorCodeOf(refused)).toBe('SECURE_LINK_UNAVAILABLE');
    expect(await context.acknowledgementsOf(revoked.orderId)).toEqual([]);

    // A live link, but the re-verification has aged past the published step-up
    // window. The challenge row is still VERIFIED and still this customer's, so
    // what is proved is the window and not a missing row.
    const token = await context.linkToken(live.fixture.customRequestId);
    await context.expireStepUp();
    const unverified = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: ACCEPTED_FEE });
    expect(unverified.status).toBe(403);
    expect(errorCodeOf(unverified)).toBe('REVERIFICATION_REQUIRED');
    expect(await context.acknowledgementsOf(live.orderId)).toEqual([]);

    // And a decrease is not something to acknowledge at all: it is in the
    // customer's favour and DB3 §1.2 asks for no evidence, so this endpoint
    // refuses rather than manufacturing a row for symmetry. It is refused
    // before the step-up is even consulted, which is why the aged challenge
    // above does not change this answer.
    const decrease = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: '30000.00' });
    expect(decrease.status).toBe(409);
    expect(errorCodeOf(decrease)).toBe('SHIPPING_FEE_NOT_INCREASED');

    expect(await context.countRows('shipping_fee_acknowledgements')).toBe(0);
    expect(await context.countRows('shipping_details')).toBe(0);
    expect(
      (await context.obligationsOf(live.orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(1);
  });

  /** C1-7 — the same decision, twice, is one piece of evidence. */
  it('replays an identical decision without appending a second acknowledgement', async () => {
    const { orderId, fixture } = await context.seedOrder();
    const token = await context.linkToken(fixture.customRequestId);

    const first = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: ACCEPTED_FEE });
    expect(first.status).toBe(201);
    expect(dataOf<AcknowledgedPayload>(first).replayed).toBe(false);

    const second = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: ACCEPTED_FEE });
    expect(second.status).toBe(201);

    const replay = dataOf<AcknowledgedPayload>(second);
    expect(replay.replayed).toBe(true);
    // The committed row, re-read — not the second call's own view of it.
    expect(replay.acknowledgedAt).toBe(dataOf<AcknowledgedPayload>(first).acknowledgedAt);
    expect(replay.previousFeeAmount).toBe(QUOTED_FEE);
    expect(replay.newFeeAmount).toBe(ACCEPTED_FEE);

    expect(await context.acknowledgementsOf(orderId)).toHaveLength(1);
    expect(await context.countRows('shipping_fee_acknowledgements')).toBe(1);

    // A *different* decision is a different tuple, so it is a new row rather
    // than a replay — the evidence is per movement, never per order.
    const other = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: '95000.00' });
    expect(other.status).toBe(201);
    expect(dataOf<AcknowledgedPayload>(other).replayed).toBe(false);
    expect(await context.acknowledgementsOf(orderId)).toHaveLength(2);
  });
});
