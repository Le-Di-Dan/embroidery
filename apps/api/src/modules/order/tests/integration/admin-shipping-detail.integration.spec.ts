/**
 * `APP9-B04` — the Admin shipping-detail read and pre-freeze write, end to end
 * against a real database through the real HTTP surface.
 *
 * Eight cases: the read, an unchanged fee, a decrease, an increase refused for
 * want of a customer decision, an increase authorised by one, a mismatched and a
 * stale acknowledgement, a frozen refusal, and a fee change against a settled
 * remaining. Every one asserts the **absences** as well as the writes — no
 * snapshot, no LC-14 move, no second acknowledgement, no orphaned successor —
 * because the failure modes this checkpoint can actually produce are all partial
 * writes.
 *
 * `APP9-B04-C1` changed what the increase cases prove. The Admin write no longer
 * resolves a grant and a step-up and appends the evidence itself; it requires a
 * matching acknowledgement the **customer** already created, so those cases
 * drive the real public command first and then assert that exactly one
 * acknowledgement exists afterwards.
 *
 * The guards are real: `AuthenticatedAdminGuard` is not overridden, and the
 * customer command runs the production `ReauthorizeSecureGrant` and
 * `StepUpEvidenceResolver` against committed fixture evidence (`§20`). The
 * secure-link token is synthetic, minted per test, never asserted on and never
 * printed; no OTP, digest or pepper is constructed or read here.
 */
import request from 'supertest';

import {
  ACKNOWLEDGEMENT_ROUTE,
  createShippingDetailContext,
  dataOf,
  errorCodeOf,
  shippingBody,
  QUOTED_FEE,
  REMAINING_AMOUNT,
  SHIPPING_ROUTE,
  type ShippingDetailTestContext,
} from './shipping-detail-context';

interface SavedPayload {
  readonly detail: {
    readonly status: string;
    readonly feeAmount: string | null;
    readonly ward: string | null;
    readonly countryCode: string;
    readonly frozenAt: string | null;
  };
  readonly fee: {
    readonly changed: boolean;
    readonly previousFeeAmount: string;
    readonly acknowledged: boolean;
    readonly supersededObligationId: string | null;
    readonly remainingObligationId: string | null;
    readonly remainingAmount: string | null;
  };
}

describe('APP9-B04 — Admin shipping detail', () => {
  let context: ShippingDetailTestContext;

  beforeAll(async () => {
    context = await createShippingDetailContext('app9-b04-shipping');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  /** Case 1 — the read returns the order's own record, and refuses politely. */
  it('reads the authoritative order-owned shipping detail', async () => {
    const { orderId } = await context.seedOrder();

    // Before anything is saved the order genuinely has no detail, and that is a
    // distinct answer from "no such order".
    const missing = await request(context.server())
      .get(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie());
    expect(missing.status).toBe(404);
    expect(errorCodeOf(missing)).toBe('SHIPPING_DETAIL_NOT_FOUND');

    await context.saveDetail(orderId, QUOTED_FEE);

    const response = await request(context.server())
      .get(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie());
    expect(response.status).toBe(200);

    const detail = dataOf<SavedPayload['detail'] & { readonly addressLine: string }>(response);
    expect(detail.addressLine).toBe('1 Seed Street');
    expect(detail.feeAmount).toBe(QUOTED_FEE);
    expect(detail.status).toBe('EDITABLE');
    expect(detail.countryCode).toBe('VN');
    expect(detail.frozenAt).toBeNull();

    // The read is behind the real guard.
    const unauthenticated = await request(context.server()).get(SHIPPING_ROUTE(orderId));
    expect(unauthenticated.status).toBe(401);
  });

  /** Case 2 — the fee did not move, so no money record is touched at all. */
  it('creates and updates the detail without touching REMAINING when the fee is unchanged', async () => {
    const { orderId } = await context.seedOrder();

    const created = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody());
    expect(created.status).toBe(200);

    // The first write matches the accepted quotation's frozen fee, so it is not
    // a change even though no detail existed before it.
    const payload = dataOf<SavedPayload>(created);
    expect(payload.fee.changed).toBe(false);
    expect(payload.fee.previousFeeAmount).toBe(QUOTED_FEE);
    expect(payload.fee.supersededObligationId).toBeNull();
    expect(payload.detail.status).toBe('EDITABLE');
    expect(payload.detail.ward).toBe('Phường Bến Nghé');

    // A second write changing only the address, still at the same fee.
    const updated = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ addressLine: '99 Lê Lợi', carrierName: 'Giao Hàng Nhanh' }));
    expect(updated.status).toBe(200);
    expect(dataOf<SavedPayload>(updated).fee.changed).toBe(false);

    const stored = await context.shippingOf(orderId);
    expect(stored?.addressLine).toBe('99 Lê Lợi');
    expect(stored?.carrierName).toBe('Giao Hàng Nhanh');
    expect(stored?.status).toBe('EDITABLE');
    expect(stored?.frozenAt).toBeNull();

    // Nothing in the money record moved, and the order did not.
    const obligations = await context.obligationsOf(orderId);
    expect(obligations.map((one) => [one.kind, one.status, one.amount])).toEqual([
      ['DEPOSIT', 'PENDING', '765000.00'],
      ['REMAINING', 'PENDING', REMAINING_AMOUNT],
    ]);
    expect(await context.acknowledgementsOf(orderId)).toEqual([]);
    expect(await context.reconciliationsOf()).toEqual([]);
    expect(await context.countRows('payment_attempts')).toBe(0);
    expect(await context.countRows('shipping_snapshots')).toBe(0);
    expect(await context.orderStatus(orderId)).toBe('PRODUCTION_COMPLETED');
    // Exactly one detail row: the update was an update, not a second insert.
    expect(await context.countRows('shipping_details')).toBe(1);
  });

  /** Case 3 — a decrease recalculates, and records no acknowledgement. */
  it('supersedes REMAINING with one successor on a fee decrease, with no acknowledgement', async () => {
    const { orderId } = await context.seedOrder();

    const response = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '30000.00' }));
    expect(response.status).toBe(200);

    const payload = dataOf<SavedPayload>(response);
    expect(payload.fee.changed).toBe(true);
    expect(payload.fee.acknowledged).toBe(false);
    expect(payload.fee.previousFeeAmount).toBe(QUOTED_FEE);
    // 1785000.00 + (30000.00 - 50000.00) — the delta rule, exactly.
    expect(payload.fee.remainingAmount).toBe('1765000.00');

    const obligations = await context.obligationsOf(orderId);
    const remaining = obligations.filter((one) => one.kind === 'REMAINING');
    expect(remaining).toHaveLength(2);

    const [predecessor, successor] = remaining;
    const superseded = remaining.find((one) => one.status === 'SUPERSEDED');
    const live = remaining.find((one) => one.status === 'PENDING');
    expect(superseded).toBeDefined();
    expect(live).toBeDefined();
    void predecessor;
    void successor;

    // The old amount was **not** edited in place; the chain is the history.
    expect(superseded?.amount).toBe(REMAINING_AMOUNT);
    expect(superseded?.supersededByObligationId).toBe(live?.id);
    expect(live?.amount).toBe('1765000.00');
    expect(live?.supersededByObligationId).toBeNull();
    // Provenance travelled with the chain rather than being re-derived.
    expect(live?.sourceQuotationVersionId).toBe(superseded?.sourceQuotationVersionId);
    expect(payload.fee.supersededObligationId).toBe(superseded?.id);
    expect(payload.fee.remainingObligationId).toBe(live?.id);

    // The deposit is untouched, and a decrease needs no customer evidence.
    expect(obligations.filter((one) => one.kind === 'DEPOSIT')).toEqual([
      expect.objectContaining({ status: 'PENDING', amount: '765000.00' }),
    ]);
    expect(await context.acknowledgementsOf(orderId)).toEqual([]);

    // TR-LC15-04's recorded evidence, using the vocabulary that already exists.
    const reconciliations = await context.reconciliationsOf();
    expect(reconciliations).toHaveLength(1);
    expect(reconciliations[0]?.action).toBe('OBLIGATION_RECALC');
    expect(reconciliations[0]?.paymentObligationId).toBe(live?.id);
    expect(reconciliations[0]?.amount).toBe('1765000.00');

    // Still editable, still not dispatched.
    expect((await context.shippingOf(orderId))?.status).toBe('EDITABLE');
    expect(await context.countRows('shipping_snapshots')).toBe(0);
    expect(await context.orderStatus(orderId)).toBe('PRODUCTION_COMPLETED');
  });

  /**
   * Case 4 (`C1-2`, the core regression) — an increase with no customer
   * decision is refused, atomically, and **nothing mints one**.
   *
   * The fixture grant is live and its step-up is fresh, which is exactly the
   * state the first B04 attempt treated as consent. It is not consent, and the
   * assertion that no acknowledgement row appears is the whole correction.
   */
  it('refuses a fee increase with no pre-existing customer acknowledgement, writing nothing', async () => {
    const { orderId } = await context.seedOrder();
    // Save a detail first, so the refusal has an existing row it could have
    // corrupted rather than merely failing to create one.
    await context.saveDetail(orderId, QUOTED_FEE);

    const response = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '80000.00', addressLine: 'Should not be written' }));
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED');

    // No partial write survived: not the shipping edit that travelled with it,
    // not a successor obligation, not a reconciliation — and above all not an
    // acknowledgement the operator manufactured on the customer's behalf.
    expect(await context.acknowledgementsOf(orderId)).toEqual([]);
    expect(await context.countRows('shipping_fee_acknowledgements')).toBe(0);

    const stored = await context.shippingOf(orderId);
    expect(stored?.addressLine).toBe('1 Seed Street');
    expect(stored?.feeAmount).toBe(QUOTED_FEE);

    const remaining = (await context.obligationsOf(orderId)).filter(
      (one) => one.kind === 'REMAINING',
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.status).toBe('PENDING');
    expect(remaining[0]?.amount).toBe(REMAINING_AMOUNT);
    expect(await context.reconciliationsOf()).toEqual([]);
  });

  /**
   * Case 5 (`C1-3`) — the customer decides, then the operator applies exactly
   * that decision.
   */
  it('applies a fee increase authorised by a matching customer acknowledgement', async () => {
    const { orderId, fixture } = await context.seedOrder();
    const token = await context.linkToken(fixture.customRequestId);

    const decision = await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: '80000.00' });
    expect(decision.status).toBe(201);
    // The decision on its own moved no money and created no shipping row.
    expect(await context.shippingOf(orderId)).toBeUndefined();
    expect(
      (await context.obligationsOf(orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(1);

    const response = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '80000.00' }));
    expect(response.status).toBe(200);

    const payload = dataOf<SavedPayload>(response);
    expect(payload.fee.changed).toBe(true);
    expect(payload.fee.acknowledged).toBe(true);
    // 1785000.00 + (80000.00 - 50000.00)
    expect(payload.fee.remainingAmount).toBe('1815000.00');

    // Still exactly one acknowledgement — the customer's. The Admin write read
    // it and created none, which is what `APP9-B04-C1` exists to guarantee.
    const acknowledgements = await context.acknowledgementsOf(orderId);
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0]?.previousFeeAmount).toBe(QUOTED_FEE);
    expect(acknowledgements[0]?.newFeeAmount).toBe('80000.00');
    expect(acknowledgements[0]?.currencyCode).toBe('VND');
    // The evidence references the production validators resolved from the
    // order's own chain, never from any request body.
    expect(acknowledgements[0]?.grantId).toBe(fixture.grantId);
    expect(acknowledgements[0]?.stepUpChallengeId).toBe(fixture.challengeId);

    const remaining = (await context.obligationsOf(orderId)).filter(
      (one) => one.kind === 'REMAINING',
    );
    expect(remaining).toHaveLength(2);
    const superseded = remaining.find((one) => one.status === 'SUPERSEDED');
    const live = remaining.find((one) => one.status === 'PENDING');
    expect(superseded?.amount).toBe(REMAINING_AMOUNT);
    expect(superseded?.supersededByObligationId).toBe(live?.id);
    expect(live?.amount).toBe('1815000.00');
    expect(await context.reconciliationsOf()).toHaveLength(1);

    expect((await context.shippingOf(orderId))?.feeAmount).toBe('80000.00');
    expect(await context.countRows('shipping_snapshots')).toBe(0);

    // Replay: the identical Admin request again. The fee it asks for is now the
    // stored one, so there is no change, no second successor and no second
    // acknowledgement — and the decision that authorised the first call no
    // longer names the current baseline, so it cannot authorise anything twice.
    const replay = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '80000.00' }));
    expect(replay.status).toBe(200);
    expect(dataOf<SavedPayload>(replay).fee.changed).toBe(false);
    expect(await context.acknowledgementsOf(orderId)).toHaveLength(1);
    expect(
      (await context.obligationsOf(orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(2);
    expect(await context.reconciliationsOf()).toHaveLength(1);
  });

  /**
   * Case 6 (`C1-4`, `C1-5`) — an acknowledgement authorises **one** movement.
   *
   * Two stale-evidence readings in one case because they share a setup and each
   * is a single request: a decision to accept 80k does not authorise 90k, and
   * once the fee has legitimately moved, that same decision no longer names the
   * current baseline either.
   */
  it('refuses a fee increase the standing acknowledgement does not exactly match', async () => {
    const { orderId, fixture } = await context.seedOrder();
    const token = await context.linkToken(fixture.customRequestId);
    await request(context.server())
      .post(ACKNOWLEDGEMENT_ROUTE)
      .send({ token, newFeeAmount: '80000.00' });
    expect(await context.acknowledgementsOf(orderId)).toHaveLength(1);

    // C1-4 — same baseline, a different destination.
    const mismatched = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '90000.00' }));
    expect(mismatched.status).toBe(409);
    expect(errorCodeOf(mismatched)).toBe('SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED');
    expect(await context.shippingOf(orderId)).toBeUndefined();
    expect(
      (await context.obligationsOf(orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(1);
    expect(await context.reconciliationsOf()).toEqual([]);
    expect(await context.acknowledgementsOf(orderId)).toHaveLength(1);

    // C1-5 — the baseline moves legitimately, by a decrease that needs no
    // decision. The 50k -> 80k acknowledgement is now stale: it does not name
    // 30k as its previous fee, so it cannot authorise 30k -> 80k.
    const decrease = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '30000.00' }));
    expect(decrease.status).toBe(200);

    const stale = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '80000.00' }));
    expect(stale.status).toBe(409);
    expect(errorCodeOf(stale)).toBe('SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED');

    // The decrease stands; the stale attempt added nothing on top of it.
    expect((await context.shippingOf(orderId))?.feeAmount).toBe('30000.00');
    const remaining = (await context.obligationsOf(orderId)).filter(
      (one) => one.kind === 'REMAINING',
    );
    expect(remaining).toHaveLength(2);
    expect(remaining.filter((one) => one.status === 'PENDING')[0]?.amount).toBe('1765000.00');
    expect(await context.reconciliationsOf()).toHaveLength(1);
    expect(await context.acknowledgementsOf(orderId)).toHaveLength(1);
  });

  /** Case 7 — a frozen detail refuses every write, through repository authority. */
  it('refuses any write once dispatch has frozen the detail', async () => {
    const { orderId } = await context.seedOrder({ status: 'READY_FOR_DELIVERY' });
    await context.saveDetail(orderId, QUOTED_FEE);
    // The one delivered freeze writer — not B05's HTTP surface, which does not
    // exist yet.
    await context.freeze(orderId);
    expect((await context.shippingOf(orderId))?.status).toBe('FROZEN');

    const response = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ addressLine: 'Too late', feeAmount: '30000.00' }));
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('SHIPPING_FROZEN');

    // Nothing was thawed, edited, superseded or recalculated by the attempt.
    const stored = await context.shippingOf(orderId);
    expect(stored?.status).toBe('FROZEN');
    expect(stored?.addressLine).toBe('1 Seed Street');
    expect(stored?.feeAmount).toBe(QUOTED_FEE);
    expect(
      (await context.obligationsOf(orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(1);
    expect(await context.reconciliationsOf()).toEqual([]);

    // The read still works after the freeze, and reports it.
    const read = await request(context.server())
      .get(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie());
    expect(read.status).toBe(200);
    const detail = dataOf<SavedPayload['detail']>(read);
    expect(detail.status).toBe('FROZEN');
    expect(detail.frozenAt).not.toBeNull();
  });

  /** Case 8 — §12: no canonical reopen exists, so the fee change is refused. */
  it('refuses a fee change once REMAINING is SATISFIED, but still allows a non-fee edit', async () => {
    const { orderId } = await context.seedOrder({
      status: 'READY_FOR_DELIVERY',
      satisfyRemaining: true,
    });
    await context.saveDetail(orderId, QUOTED_FEE);

    const refused = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: '90000.00', addressLine: 'Should not be written' }));
    expect(refused.status).toBe(409);
    expect(errorCodeOf(refused)).toBe('SHIPPING_FEE_CHANGE_NOT_AVAILABLE');

    // Zero writes. In particular no new PENDING REMAINING the customer could
    // never legally pay, and no backward LC-14 move to make one payable.
    const remaining = (await context.obligationsOf(orderId)).filter(
      (one) => one.kind === 'REMAINING',
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.status).toBe('SATISFIED');
    expect(remaining[0]?.amount).toBe(REMAINING_AMOUNT);
    expect(await context.acknowledgementsOf(orderId)).toEqual([]);
    expect(await context.reconciliationsOf()).toEqual([]);
    expect((await context.shippingOf(orderId))?.addressLine).toBe('1 Seed Street');
    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');

    // The address may still be corrected until dispatch freezes it: the refusal
    // is about the fee, not about the order being late in its life.
    const allowed = await request(context.server())
      .put(SHIPPING_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send(shippingBody({ feeAmount: QUOTED_FEE, addressLine: '5 Corrected Street' }));
    expect(allowed.status).toBe(200);
    expect(dataOf<SavedPayload>(allowed).fee.changed).toBe(false);
    expect((await context.shippingOf(orderId))?.addressLine).toBe('5 Corrected Street');
    expect(
      (await context.obligationsOf(orderId)).filter((one) => one.kind === 'REMAINING'),
    ).toHaveLength(1);
  });
});
