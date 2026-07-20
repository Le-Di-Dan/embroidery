/**
 * AGG-15 Order persistence against a real PostgreSQL instance (DB7-CP4).
 *
 * TBL-043..TBL-049 and guards G-DB7-05 (the order chain), G-DB7-21 (GRD-009,
 * the creation gate), G-DB7-24 (GRD-017, shipping frozen at dispatch),
 * G-DB7-25 (lifecycle) and G-DB7-23 (INV-12, frozen items).
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { OrderState, PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OrderModule } from '../../order.module';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import type {
  CreateOrderInput,
  OrderId,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import type { RequestActor } from '../../domain/repositories/custom-request.repository';
import { seedOrderChain } from './order-fixture';
import type { OrderFixture } from './order-fixture';

describe('order persistence (integration)', () => {
  let context: PersistenceTestContext;
  let orders: OrderRepository;
  let fixture: OrderFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-order', [OrderModule]);
    orders = context.get(ORDER_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  const systemActor = (): RequestActor => ({ kind: 'SYSTEM', systemJobKey: 'test' });

  function orderInput(
    overrides: Partial<CreateOrderInput> = {},
    target = fixture,
  ): CreateOrderInput {
    const id = newId() as OrderId;
    return {
      id,
      code: `ORD-${id}`,
      customRequestId: target.customRequestId,
      acceptedQuotationVersionId: target.quotationVersionId,
      approvalSnapshotId: target.approvalSnapshotId,
      items: [
        {
          position: 1,
          skuId: target.skuId,
          customerOwnedProductId: undefined,
          productName: 'Tee',
          variantLabel: 'Black / M',
          sizeLabel: 'M',
          quantity: 25,
          unitPriceAmount: '100000.00',
          lineTotalAmount: '2500000.00',
        },
      ],
      ...overrides,
    };
  }

  const createOrder = (overrides: Partial<CreateOrderInput> = {}, target = fixture) =>
    context.inTransaction(() => orders.createFromAcceptedQuotation(orderInput(overrides, target)));

  /**
   * Walks an order to a state through legal moves only.
   *
   * CANCELLED and ON_HOLD always carry a reason: their CHECK constraints
   * make one mandatory, and the repository rejects a blank one.
   */
  async function moveTo(id: OrderId, path: readonly OrderState[]): Promise<void> {
    for (const to of path) {
      await context.inTransaction(() =>
        orders.transition({
          id,
          to,
          actor: systemActor(),
          correlationId: newId(),
          ...(to === 'CANCELLED' || to === 'ON_HOLD' ? { reason: 'test reason' } : {}),
        }),
      );
    }
  }

  describe('creation gate (G-DB7-05 / G-DB7-21)', () => {
    it('creates the order with its frozen items', async () => {
      const order = await createOrder();

      expect(order.status).toBe('AWAITING_DEPOSIT');
      // The total comes from the verified chain, not from the caller.
      expect(order.totalAmount).toBe('2550000.00');
      await expect(orders.loadItems(order.id)).resolves.toHaveLength(1);
    });

    it('takes the customer from the approval rather than the caller', async () => {
      const order = await createOrder();

      expect(order.customerId).toBe(fixture.customerId);
    });

    it('allows only one order per request (GRD-009 / INV-19)', async () => {
      await createOrder();

      const error = await failureOf(() => createOrder());

      expect(error.code).toBe('ORDER_ALREADY_EXISTS_FOR_REQUEST');
    });

    it('rejects an approval belonging to another request (G-DB7-05)', async () => {
      const other = await seedOrderChain(context, '2');

      // Both the quotation and the approval are individually valid; they
      // belong to different customers' requests. Every FK would be satisfied.
      const error = await failureOf(() =>
        createOrder({ approvalSnapshotId: other.approvalSnapshotId }),
      );

      expect(error.code).toBe('APPROVAL_BELONGS_TO_ANOTHER_REQUEST');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('rejects a quotation belonging to another request (G-DB7-05)', async () => {
      const other = await seedOrderChain(context, '3');

      const error = await failureOf(() =>
        createOrder({ acceptedQuotationVersionId: other.quotationVersionId }),
      );

      expect(error.code).toBe('QUOTATION_BELONGS_TO_ANOTHER_REQUEST');
    });

    it('rejects a quotation version that was never accepted (GRD-009)', async () => {
      // Put the version back to SENT: valid, current, but not accepted.
      await context.disposable.client.db.execute(
        sql`update quotation_versions set status = 'SENT' where id = ${fixture.quotationVersionId}`,
      );

      const error = await failureOf(() => createOrder());

      expect(error.code).toBe('QUOTE_NOT_ACCEPTED');
    });

    it('reports a quotation version that does not exist', async () => {
      const error = await failureOf(() => createOrder({ acceptedQuotationVersionId: newId() }));

      expect(error.code).toBe('QUOTATION_VERSION_NOT_FOUND');
    });

    it('reports an approval that does not exist', async () => {
      const error = await failureOf(() => createOrder({ approvalSnapshotId: newId() }));

      expect(error.code).toBe('APPROVAL_NOT_FOUND');
    });

    it('refuses to create outside a transaction', async () => {
      await expect(orders.createFromAcceptedQuotation(orderInput())).rejects.toThrow(
        /must run inside a transaction/,
      );
    });

    it('leaves no order behind a rejected chain', async () => {
      const other = await seedOrderChain(context, '4');
      const input = orderInput({ approvalSnapshotId: other.approvalSnapshotId });

      await expect(
        context.inTransaction(() => orders.createFromAcceptedQuotation(input)),
      ).rejects.toBeDefined();

      await expect(orders.findById(input.id)).resolves.toBeUndefined();
    });

    it('rolls the order back when an item is invalid', async () => {
      const input = orderInput({
        items: [
          { ...orderInput().items[0]!, position: 1 },
          { ...orderInput().items[0]!, position: 1 },
        ],
      });

      await expect(
        context.inTransaction(() => orders.createFromAcceptedQuotation(input)),
      ).rejects.toBeDefined();

      // An order with no items is a commitment with no content.
      await expect(orders.findById(input.id)).resolves.toBeUndefined();
    });
  });

  describe('lifecycle (G-DB7-25)', () => {
    it('records the move and its evidence together', async () => {
      const order = await createOrder();

      await moveTo(order.id, ['DEPOSIT_PAID']);

      const transitions = await orders.listTransitions(order.id);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        fromStatus: 'AWAITING_DEPOSIT',
        toStatus: 'DEPOSIT_PAID',
      });
    });

    it('rejects a move that skips the payment and production chain', async () => {
      const order = await createOrder();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          orders.transition({
            id: order.id,
            to: 'DELIVERED',
            actor: systemActor(),
            correlationId: newId(),
          }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
      await expect(orders.findById(order.id)).resolves.toMatchObject({
        status: 'AWAITING_DEPOSIT',
      });
    });

    it('rejects any move out of a terminal state', async () => {
      const order = await createOrder();
      await moveTo(order.id, ['CANCELLING', 'CANCELLED']);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          orders.transition({
            id: order.id,
            to: 'DEPOSIT_PAID',
            actor: systemActor(),
            correlationId: newId(),
          }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
    });

    it('resumes from ON_HOLD to the state it was held from', async () => {
      const order = await createOrder();
      await moveTo(order.id, ['DEPOSIT_PAID', 'ON_HOLD']);

      await expect(moveTo(order.id, ['IN_PRODUCTION'])).resolves.toBeUndefined();
    });

    it('stamps completed_at only on the move that causes it', async () => {
      const order = await createOrder();
      await moveTo(order.id, [
        'DEPOSIT_PAID',
        'IN_PRODUCTION',
        'PRODUCTION_COMPLETED',
        'AWAITING_FINAL_PAYMENT',
        'READY_FOR_DELIVERY',
        'DELIVERED',
        'COMPLETED',
      ]);

      const [row] = (
        await context.disposable.client.db.execute<{ completed_at: string | null }>(
          sql`select completed_at from orders where id = ${order.id}`,
        )
      ).rows;
      expect(row?.completed_at).not.toBeNull();
    });

    it('leaves no transition evidence behind a rejected move', async () => {
      const order = await createOrder();

      await expect(
        context.inTransaction(() =>
          orders.transition({
            id: order.id,
            to: 'COMPLETED',
            actor: systemActor(),
            correlationId: newId(),
          }),
        ),
      ).rejects.toBeDefined();

      await expect(orders.listTransitions(order.id)).resolves.toEqual([]);
    });
  });

  describe('shipping and dispatch (G-DB7-24 / GRD-017)', () => {
    async function readyForDelivery(): Promise<OrderId> {
      const order = await createOrder();
      await moveTo(order.id, [
        'DEPOSIT_PAID',
        'IN_PRODUCTION',
        'PRODUCTION_COMPLETED',
        'AWAITING_FINAL_PAYMENT',
        'READY_FOR_DELIVERY',
      ]);
      return order.id;
    }

    // `feeAmount` is a required parameter, not a defaulted one: passing
    // `undefined` to a defaulted parameter selects the default, which silently
    // made the no-fee dispatch test pass with a fee.
    const shippingInput = (orderId: OrderId, feeAmount: string | undefined) => ({
      orderId,
      recipientName: 'Recipient',
      recipientPhone: '0900000000',
      addressLine: '1 Test Street',
      province: 'Ha Noi',
      feeAmount,
      carrierName: 'Carrier',
    });

    it('saves and then updates shipping details while editable', async () => {
      const orderId = await readyForDelivery();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(orderId, '50000.00')),
      );

      const updated = await context.inTransaction(() =>
        orders.saveShippingDetails({
          ...shippingInput(orderId, '50000.00'),
          recipientName: 'Changed',
        }),
      );

      expect(updated.recipientName).toBe('Changed');
      expect(updated.status).toBe('EDITABLE');
    });

    it('freezes shipping and snapshots it at dispatch', async () => {
      const orderId = await readyForDelivery();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(orderId, '50000.00')),
      );

      const dispatched = await context.inTransaction(() =>
        orders.dispatch(orderId, new Date(), newId()),
      );

      expect(dispatched.status).toBe('DELIVERED');
      await expect(orders.loadShippingDetail(orderId)).resolves.toMatchObject({
        status: 'FROZEN',
      });
      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from shipping_snapshots where order_id = ${orderId}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(1);
    });

    it('refuses to edit shipping once frozen — the snapshot would become a lie', async () => {
      const orderId = await readyForDelivery();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(orderId, '50000.00')),
      );
      await context.inTransaction(() => orders.dispatch(orderId, new Date(), newId()));

      const error = await failureOf(() =>
        context.inTransaction(() =>
          orders.saveShippingDetails({
            ...shippingInput(orderId, '50000.00'),
            addressLine: 'Elsewhere',
          }),
        ),
      );

      expect(error.code).toBe('SHIPPING_FROZEN');
    });

    it('refuses to dispatch an order that is not ready for delivery (GRD-016)', async () => {
      const order = await createOrder();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(order.id, '50000.00')),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => orders.dispatch(order.id, new Date(), newId())),
      );

      expect(error.code).toBe('ORDER_NOT_READY_FOR_DELIVERY');
    });

    it('refuses to dispatch with no shipping details', async () => {
      const orderId = await readyForDelivery();

      const error = await failureOf(() =>
        context.inTransaction(() => orders.dispatch(orderId, new Date(), newId())),
      );

      expect(error.code).toBe('SHIPPING_NOT_READY');
    });

    it('refuses to dispatch with no shipping fee set', async () => {
      const orderId = await readyForDelivery();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(orderId, undefined)),
      );

      // A dispatch with no fee would snapshot an amount nobody agreed to.
      const error = await failureOf(() =>
        context.inTransaction(() => orders.dispatch(orderId, new Date(), newId())),
      );

      expect(error.code).toBe('SHIPPING_NOT_READY');
    });

    it('leaves nothing frozen behind a refused dispatch', async () => {
      const orderId = await readyForDelivery();
      await context.inTransaction(() =>
        orders.saveShippingDetails(shippingInput(orderId, undefined)),
      );

      await expect(
        context.inTransaction(() => orders.dispatch(orderId, new Date(), newId())),
      ).rejects.toBeDefined();

      await expect(orders.loadShippingDetail(orderId)).resolves.toMatchObject({
        status: 'EDITABLE',
      });
      await expect(orders.findById(orderId)).resolves.toMatchObject({
        status: 'READY_FOR_DELIVERY',
      });
    });

    it('records a shipping-fee acknowledgement with its evidence', async () => {
      const order = await createOrder();

      await context.inTransaction(() =>
        orders.acknowledgeShippingFee({
          orderId: order.id,
          previousFeeAmount: '50000.00',
          newFeeAmount: '70000.00',
          grantId: fixture.grantId,
          stepUpChallengeId: fixture.challengeId,
          acknowledgedAt: new Date(),
        }),
      );

      const [row] = (
        await context.disposable.client.db.execute<{ new_fee_amount: string }>(
          sql`select new_fee_amount from shipping_fee_acknowledgements where order_id = ${order.id}`,
        )
      ).rows;
      expect(row?.new_fee_amount).toBe('70000.00');
    });
  });

  describe('cancellation requests', () => {
    it('allows one pending request per order', async () => {
      const order = await createOrder();
      await context.inTransaction(() =>
        orders.openCancellationRequest({
          id: newId(),
          orderId: order.id,
          stage: 'S5',
          initiator: 'CUSTOMER',
          reason: 'Changed mind',
          grantId: fixture.grantId,
          stepUpChallengeId: fixture.challengeId,
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          orders.openCancellationRequest({
            id: newId(),
            orderId: order.id,
            stage: 'S5',
            initiator: 'CUSTOMER',
            reason: 'Again',
          }),
        ),
      );

      expect(error.code).toBe('CANCELLATION_ALREADY_PENDING');
    });

    it('decides a pending request once', async () => {
      const order = await createOrder();
      const requestId = newId();
      await context.inTransaction(() =>
        orders.openCancellationRequest({
          id: requestId,
          orderId: order.id,
          stage: 'S5',
          initiator: 'ADMIN',
          reason: 'Stock issue',
        }),
      );

      await context.inTransaction(() =>
        orders.resolveCancellationRequest(requestId, true, fixture.adminId),
      );

      // Re-deciding would overwrite the record of what was actually decided.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          orders.resolveCancellationRequest(requestId, false, fixture.adminId),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });
  });

  describe('item immutability (G-DB7-23 / INV-12)', () => {
    it('rejects a price mutation on a frozen order item via the S24 trigger', async () => {
      const order = await createOrder();

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperOrderItem', () =>
          context.disposable.client.db.execute(
            sql`update order_items set unit_price_amount = 1.00 where order_id = ${order.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
      expect(error.code).toBe('IMMUTABLE_RECORD');
    });
  });
});
