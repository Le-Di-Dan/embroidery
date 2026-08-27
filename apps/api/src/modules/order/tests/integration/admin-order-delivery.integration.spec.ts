/**
 * `APP9-B05` — the two Admin delivery commands, against a real database.
 *
 * Every assertion about what happened reads **committed persistence**, not the
 * response body (§24): the order row, the shipping detail, `shipping_snapshots`
 * and `order_transitions`. A receipt that claimed a freeze the database did not
 * perform would pass a body-only test and fail this one.
 *
 * The refusal cases assert the *absence* of every write as well as the code:
 * an order that did not move, a detail still `EDITABLE`, no snapshot, and no new
 * transition row. `FROZEN`-mutation rejection itself is not re-proved here —
 * `APP9-B04` already owns that case (§23).
 */
import request from 'supertest';

import {
  COMPLETION_ROUTE,
  DISPATCH_ROUTE,
  SEEDED_SHIPPING,
  SHIPPING_FEE,
  createOrderDeliveryContext,
  dataOf,
  errorCodeOf,
  type OrderDeliveryTestContext,
} from './order-delivery-context';

interface DispatchPayload {
  readonly orderId: string;
  readonly fromStatus: string;
  readonly status: string;
  readonly dispatchedAt: string;
  readonly shippingStatus: string;
  readonly frozenAt: string;
}

interface CompletionPayload {
  readonly fromStatus: string;
  readonly status: string;
}

describe('APP9-B05 — Admin dispatch and completion', () => {
  let context: OrderDeliveryTestContext;

  beforeAll(async () => {
    context = await createOrderDeliveryContext('app9-b05-delivery');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const dispatch = (orderId: string) =>
    request(context.server())
      .post(DISPATCH_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send();

  const complete = (orderId: string) =>
    request(context.server())
      .post(COMPLETION_ROUTE(orderId))
      .set('Cookie', context.adminCookie())
      .send();

  it('case 1 — dispatches, freezing shipping and snapshotting it exactly once', async () => {
    const { orderId } = await context.seedOrder();

    const response = await dispatch(orderId);
    expect(response.status).toBe(200);

    const payload = dataOf<DispatchPayload>(response);
    expect(payload.fromStatus).toBe('READY_FOR_DELIVERY');
    expect(payload.status).toBe('DELIVERED');
    expect(payload.shippingStatus).toBe('FROZEN');

    // Committed truth, read back from the database.
    expect(await context.orderStatus(orderId)).toBe('DELIVERED');
    expect((await context.orderStamps(orderId)).deliveredAt).not.toBeNull();

    const shipping = await context.shippingOf(orderId);
    expect(shipping?.status).toBe('FROZEN');
    expect(shipping?.frozenAt).not.toBeNull();

    const snapshots = await context.snapshotsOf(orderId);
    expect(snapshots).toHaveLength(1);

    // The snapshot is the authoritative pre-freeze detail, field for field —
    // including the two static internal notes, which are copied, never demanded.
    const snapshot = snapshots[0];
    expect(snapshot?.shippingDetailId).toBe(shipping?.id);
    expect(snapshot?.recipientName).toBe(SEEDED_SHIPPING.recipientName);
    expect(snapshot?.recipientPhone).toBe(SEEDED_SHIPPING.recipientPhone);
    expect(snapshot?.addressLine).toBe(SEEDED_SHIPPING.addressLine);
    expect(snapshot?.ward).toBe(SEEDED_SHIPPING.ward);
    expect(snapshot?.district).toBe(SEEDED_SHIPPING.district);
    expect(snapshot?.province).toBe(SEEDED_SHIPPING.province);
    expect(snapshot?.countryCode).toBe(shipping?.countryCode);
    expect(snapshot?.feeAmount).toBe(SHIPPING_FEE);
    expect(snapshot?.currencyCode).toBe('VND');
    expect(snapshot?.carrierName).toBe(SEEDED_SHIPPING.carrierName);
    expect(snapshot?.trackingCode).toBe(SEEDED_SHIPPING.trackingCode);

    // Exactly one TR-LC14-07 row, attributed to the bound operator.
    const dispatched = (await context.transitionsOf(orderId)).filter(
      (row) => row.toStatus === 'DELIVERED',
    );
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.fromStatus).toBe('READY_FOR_DELIVERY');
    expect(dispatched[0]?.eventKind).toBe('SHIPPING_FREEZE');
    expect(dispatched[0]?.actorKind).toBe('ADMIN');
    expect(dispatched[0]?.adminId).toBe(context.adminId());
  }, 60_000);

  it('case 2 — refuses a dispatch before the order is ready, writing nothing', async () => {
    const { orderId } = await context.seedOrder({
      status: 'AWAITING_FINAL_PAYMENT',
      satisfyRemaining: false,
    });
    const before = await context.transitionsOf(orderId);

    const response = await dispatch(orderId);
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('ORDER_INVALID_TRANSITION');

    expect(await context.orderStatus(orderId)).toBe('AWAITING_FINAL_PAYMENT');
    expect((await context.shippingOf(orderId))?.status).toBe('EDITABLE');
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
    expect(await context.transitionsOf(orderId)).toHaveLength(before.length);
  }, 60_000);

  it('case 3 — refuses a dispatch with no shipping detail (GRD-017), writing nothing', async () => {
    const { orderId } = await context.seedOrder({ shipping: false });
    const before = await context.transitionsOf(orderId);

    const response = await dispatch(orderId);
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('ORDER_SHIPPING_NOT_READY');

    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');
    expect(await context.shippingOf(orderId)).toBeUndefined();
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
    expect(await context.transitionsOf(orderId)).toHaveLength(before.length);
  }, 60_000);

  it('case 3b — refuses a dispatch whose detail carries no fee, writing nothing', async () => {
    // The smallest GRD-017 failure that is not an absent row: every NOT NULL
    // fact present, and the one nullable column the snapshot requires empty.
    // Carrier and tracking are present in both directions and prove nothing —
    // they are never the reason a dispatch is refused.
    const { orderId } = await context.seedOrder({ shipping: 'noFee' });

    const response = await dispatch(orderId);
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('ORDER_SHIPPING_NOT_READY');

    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');
    const shipping = await context.shippingOf(orderId);
    expect(shipping?.status).toBe('EDITABLE');
    expect(shipping?.frozenAt).toBeNull();
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
  }, 60_000);

  it('case 3c — refuses a dispatch whose balance is unsatisfied (GRD-016)', async () => {
    // The lifecycle says ready; the obligation says otherwise. This is the state
    // an `APP9-B04` fee increase leaves behind — a superseded SATISFIED balance
    // replaced by a new PENDING one, with the order never moving — and the
    // source state alone would not catch it.
    const { orderId } = await context.seedOrder({ satisfyRemaining: false });

    const response = await dispatch(orderId);
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('ORDER_REMAINING_PAYMENT_UNSATISFIED');

    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');
    expect((await context.shippingOf(orderId))?.status).toBe('EDITABLE');
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
  }, 60_000);

  it('case 4 — a replayed dispatch creates no second snapshot or transition', async () => {
    const { orderId } = await context.seedOrder();
    expect((await dispatch(orderId)).status).toBe(200);

    const frozenAt = (await context.shippingOf(orderId))?.frozenAt;
    const snapshotId = (await context.snapshotsOf(orderId))[0]?.id;

    const replay = await dispatch(orderId);
    expect(replay.status).toBe(409);
    expect(errorCodeOf(replay)).toBe('ORDER_INVALID_TRANSITION');

    expect(await context.snapshotsOf(orderId)).toHaveLength(1);
    expect((await context.snapshotsOf(orderId))[0]?.id).toBe(snapshotId);
    expect(
      (await context.transitionsOf(orderId)).filter((row) => row.toStatus === 'DELIVERED'),
    ).toHaveLength(1);

    const shipping = await context.shippingOf(orderId);
    expect(shipping?.status).toBe('FROZEN');
    expect(shipping?.frozenAt).toBe(frozenAt);
  }, 60_000);

  it('case 5 — completes a delivered order, leaving the freeze untouched', async () => {
    const { orderId } = await context.seedOrder();
    expect((await dispatch(orderId)).status).toBe(200);
    const snapshotBefore = (await context.snapshotsOf(orderId))[0];
    const shippingBefore = await context.shippingOf(orderId);

    const response = await complete(orderId);
    expect(response.status).toBe(200);
    const payload = dataOf<CompletionPayload>(response);
    expect(payload.fromStatus).toBe('DELIVERED');
    expect(payload.status).toBe('COMPLETED');

    expect(await context.orderStatus(orderId)).toBe('COMPLETED');
    expect((await context.orderStamps(orderId)).completedAt).not.toBeNull();

    const completed = (await context.transitionsOf(orderId)).filter(
      (row) => row.toStatus === 'COMPLETED',
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]?.fromStatus).toBe('DELIVERED');
    expect(completed[0]?.actorKind).toBe('ADMIN');
    expect(completed[0]?.adminId).toBe(context.adminId());

    // No second freeze, no second snapshot, no edit to either.
    expect(await context.shippingOf(orderId)).toEqual(shippingBefore);
    expect(await context.snapshotsOf(orderId)).toEqual([snapshotBefore]);
  }, 60_000);

  it('case 6 — refuses a completion before dispatch (GRD-018), writing nothing', async () => {
    const { orderId } = await context.seedOrder();
    const before = await context.transitionsOf(orderId);

    const response = await complete(orderId);
    expect(response.status).toBe(409);
    expect(errorCodeOf(response)).toBe('ORDER_INVALID_TRANSITION');

    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');
    expect((await context.orderStamps(orderId)).completedAt).toBeNull();
    expect(await context.transitionsOf(orderId)).toHaveLength(before.length);
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
  }, 60_000);

  it('case 7 — a replayed completion creates no second transition', async () => {
    const { orderId } = await context.seedOrder();
    expect((await dispatch(orderId)).status).toBe(200);
    expect((await complete(orderId)).status).toBe(200);
    const after = await context.transitionsOf(orderId);

    const replay = await complete(orderId);
    expect(replay.status).toBe(409);
    expect(errorCodeOf(replay)).toBe('ORDER_INVALID_TRANSITION');

    expect(await context.orderStatus(orderId)).toBe('COMPLETED');
    expect(await context.transitionsOf(orderId)).toEqual(after);
    expect(await context.snapshotsOf(orderId)).toHaveLength(1);
  }, 60_000);

  it('refuses both commands with no Admin session, through the real guard', async () => {
    const { orderId } = await context.seedOrder();

    expect((await request(context.server()).post(DISPATCH_ROUTE(orderId)).send()).status).toBe(401);
    expect((await request(context.server()).post(COMPLETION_ROUTE(orderId)).send()).status).toBe(
      401,
    );

    expect(await context.orderStatus(orderId)).toBe('READY_FOR_DELIVERY');
    expect(await context.snapshotsOf(orderId)).toHaveLength(0);
  }, 60_000);
});
