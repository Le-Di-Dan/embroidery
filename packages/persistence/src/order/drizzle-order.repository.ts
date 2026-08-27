/**
 * Drizzle implementation of the AGG-15 Order contract (TBL-043..TBL-049).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { OutboxEventStore } from '../platform/outbox-event-store';
import { asc, eq } from 'drizzle-orm';

import { isLegalOrderTransition } from './order-transitions';
import type { CustomRequestId, RequestActor } from './ordering-identity';
import type {
  AcknowledgeShippingFeeInput,
  FindShippingFeeAcknowledgementInput,
  CreateOrderInput,
  Order,
  OrderId,
  OrderItem,
  OrderRepository,
  OrderTransition,
  SaveShippingDetailInput,
  ShippingDetail,
  ShippingFeeAcknowledgement,
  ShippingFeeBaseline,
  TransitionOrderInput,
} from './order.repository';
import { DrizzleOrderShippingRepository } from './drizzle-order-shipping.repository';
import { OrderChainGuard } from './order-chain.guard';
import { toItem, toOrder } from './order-row.mapper';

const { orders, orderItems, orderTransitions } = schema;

const CURRENCY = 'VND';

function actorColumns(actor: RequestActor) {
  switch (actor.kind) {
    case 'ADMIN':
      return { actorKind: 'ADMIN', adminId: actor.adminId };
    case 'CUSTOMER':
      return { actorKind: 'CUSTOMER', customerId: actor.customerId, grantId: actor.grantId };
    case 'SYSTEM':
      return { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
  }
}

@Injectable()
export class DrizzleOrderRepository extends DrizzleRepository implements OrderRepository {
  constructor(
    executor: DatabaseExecutor,
    private readonly chain: OrderChainGuard,
    private readonly shipping: DrizzleOrderShippingRepository,
    private readonly outbox: OutboxEventStore,
  ) {
    super(executor);
  }

  // Fulfilment is a separate responsibility, implemented in
  // `DrizzleOrderShippingRepository` and delegated to here so the aggregate
  // still presents one `OrderRepository` contract — no table gains a
  // repository of its own (DB7 §10.1).

  saveShippingDetails(input: SaveShippingDetailInput): Promise<ShippingDetail> {
    return this.shipping.saveShippingDetails(input);
  }

  dispatch(orderId: OrderId, dispatchedAt: Date, correlationId: string): Promise<Order> {
    return this.shipping.dispatch(orderId, dispatchedAt, correlationId);
  }

  lockShippingFeeBaseline(orderId: OrderId): Promise<ShippingFeeBaseline | undefined> {
    return this.shipping.lockShippingFeeBaseline(orderId);
  }

  acknowledgeShippingFee(input: AcknowledgeShippingFeeInput): Promise<ShippingFeeAcknowledgement> {
    return this.shipping.acknowledgeShippingFee(input);
  }

  findShippingFeeAcknowledgement(
    input: FindShippingFeeAcknowledgementInput,
  ): Promise<ShippingFeeAcknowledgement | undefined> {
    return this.shipping.findShippingFeeAcknowledgement(input);
  }

  openCancellationRequest(input: {
    id: string;
    orderId: OrderId;
    stage: string;
    initiator: string;
    reason: string;
    grantId?: string | undefined;
    stepUpChallengeId?: string | undefined;
  }): Promise<void> {
    return this.shipping.openCancellationRequest(input);
  }

  resolveCancellationRequest(id: string, approved: boolean, adminId: string): Promise<void> {
    return this.shipping.resolveCancellationRequest(id, approved, adminId);
  }

  loadShippingDetail(id: OrderId): Promise<ShippingDetail | undefined> {
    return this.shipping.loadShippingDetail(id);
  }

  async createFromAcceptedQuotation(input: CreateOrderInput): Promise<Order> {
    return this.run('createFromAcceptedQuotation', async () => {
      const tx = this.requireTransaction('createFromAcceptedQuotation');

      // G-DB7-05 / G-DB7-21. The customer and total come back from the verified
      // chain rather than from the caller, so they cannot disagree with it.
      const chain = await this.chain.assertOrderChain(
        input.customRequestId,
        input.acceptedQuotationVersionId,
        input.approvalSnapshotId,
      );

      const [row] = await tx
        .insert(orders)
        .values({
          id: input.id,
          code: input.code,
          customRequestId: input.customRequestId,
          customerId: chain.customerId,
          acceptedQuotationVersionId: input.acceptedQuotationVersionId,
          currentApprovalSnapshotId: input.approvalSnapshotId,
          status: 'AWAITING_DEPOSIT',
          totalAmount: chain.totalAmount,
          currencyCode: chain.currencyCode,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'OrderRepository.createFromAcceptedQuotation',
          'ORDER_NOT_CREATED',
          'Could not create the order.',
        );
      }

      // `ck_order_items__exactly_one_subject` requires a SKU *or* a
      // customer-owned product, never both and never neither. Checked here so
      // the caller gets a message naming the actual problem rather than a
      // generic "values not valid" from the constraint.
      for (const item of input.items) {
        const hasSku = item.skuId !== undefined;
        const hasCop = item.customerOwnedProductId !== undefined;
        if (hasSku === hasCop) {
          throw guardViolationError(
            'OrderRepository.createFromAcceptedQuotation',
            'ORDER_ITEM_SUBJECT_INVALID',
            'Each order line must reference exactly one of a SKU or a customer-supplied product.',
          );
        }
      }

      // Items are frozen commercial evidence (INV-12) and carry the approval
      // that authorised them, so each line can be traced to what was approved.
      if (input.items.length > 0) {
        await tx.insert(orderItems).values(
          input.items.map((item) => ({
            id: newId(),
            orderId: input.id,
            position: item.position,
            skuId: item.skuId ?? null,
            customerOwnedProductId: item.customerOwnedProductId ?? null,
            productName: item.productName,
            variantLabel: item.variantLabel ?? null,
            sizeLabel: item.sizeLabel ?? null,
            quantity: item.quantity,
            unitPriceAmount: item.unitPriceAmount,
            lineTotalAmount: item.lineTotalAmount,
            currencyCode: CURRENCY,
            approvalSnapshotId: input.approvalSnapshotId,
          })),
        );
      }

      // SE-006 (DB3 side-effect catalog) / G-DB7-54: the notification the
      // customer eventually gets rides this event, so it must commit with the
      // order or not at all — same transaction, same `tx`. The payload holds
      // only canonical references (ids, code), never amounts, contact details
      // or a copy of the frozen items: a consumer resolves those itself from
      // the ids, so the outbox row cannot go stale or leak what it does not
      // carry. `uq_orders__request` is what makes this at-most-once: a second
      // creation attempt for the same request fails on the `orders` insert
      // above, before this line ever runs.
      await this.outbox.append({
        eventType: 'order.created',
        aggregateKind: 'ORDER',
        aggregateId: input.id,
        payload: { orderId: input.id, code: input.code, customRequestId: input.customRequestId },
        payloadSchemaVersion: 1,
      });

      return toOrder(row);
    });
  }

  async loadForUpdate(id: OrderId): Promise<Order | undefined> {
    return this.run('loadForUpdate', async () => {
      const tx = this.requireTransaction('loadForUpdate');
      const [row] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update');
      return row === undefined ? undefined : toOrder(row);
    });
  }

  async transition(input: TransitionOrderInput): Promise<Order> {
    return this.run('transition', async () => {
      const tx = this.requireTransaction('transition');

      const [current] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, input.id))
        .limit(1)
        .for('update');

      if (current === undefined) {
        throw notFoundError('OrderRepository.transition', 'That order does not exist.');
      }

      const from = current.status as OrderState;
      if (!isLegalOrderTransition(from, input.to)) {
        throw guardViolationError(
          'OrderRepository.transition',
          'INVALID_TRANSITION',
          'That status change is not allowed for this order.',
        );
      }

      // `ck_orders__cancelled_reason_required` and
      // `ck_orders__hold_reason_required` make a reason mandatory for these two
      // moves. Checked here so the caller is told what is missing rather than
      // getting a generic constraint failure — an order cancelled or held with
      // no recorded reason is a customer conversation with no evidence behind
      // it. The blank case is the application's: the CHECKs test NOT NULL.
      const reasonRequired = input.to === 'CANCELLED' || input.to === 'ON_HOLD';
      if (reasonRequired && (input.reason ?? '').trim() === '') {
        throw guardViolationError(
          'OrderRepository.transition',
          'TRANSITION_REASON_REQUIRED',
          'A reason is required for that status change.',
        );
      }

      const now = new Date();
      const [row] = await tx
        .update(orders)
        .set({
          status: input.to,
          cancelledReason:
            input.to === 'CANCELLED' ? (input.reason ?? null) : current.cancelledReason,
          // Cleared when the order resumes, so the column cannot describe a
          // hold that has already been lifted.
          holdReason: input.to === 'ON_HOLD' ? (input.reason ?? null) : null,
          // Stamped with the move that causes them, so the columns cannot
          // claim a delivery or completion that no transition explains.
          deliveredAt: input.to === 'DELIVERED' ? now : current.deliveredAt,
          completedAt: input.to === 'COMPLETED' ? now : current.completedAt,
          updatedAt: now,
        })
        .where(eq(orders.id, input.id))
        .returning();

      await tx.insert(orderTransitions).values({
        orderId: input.id,
        fromStatus: from,
        toStatus: input.to,
        eventKind: input.eventKind ?? 'STATE_CHANGE',
        ...actorColumns(input.actor),
        reason: input.reason ?? null,
        correlationId: input.correlationId,
      });

      if (row === undefined) {
        throw notFoundError('OrderRepository.transition', 'That order does not exist.');
      }
      return toOrder(row);
    });
  }

  async findById(id: OrderId): Promise<Order | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
      return row === undefined ? undefined : toOrder(row);
    });
  }

  async findByCode(code: string): Promise<Order | undefined> {
    return this.run('findByCode', async () => {
      const [row] = await this.db.select().from(orders).where(eq(orders.code, code)).limit(1);
      return row === undefined ? undefined : toOrder(row);
    });
  }

  async findByRequest(customRequestId: CustomRequestId): Promise<Order | undefined> {
    return this.run('findByRequest', async () => {
      const [row] = await this.db
        .select()
        .from(orders)
        .where(eq(orders.customRequestId, customRequestId))
        .limit(1);
      return row === undefined ? undefined : toOrder(row);
    });
  }

  async loadItems(id: OrderId): Promise<OrderItem[]> {
    return this.run('loadItems', async () => {
      const rows = await this.db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, id))
        .orderBy(asc(orderItems.position));
      return rows.map(toItem);
    });
  }

  async listTransitions(id: OrderId): Promise<OrderTransition[]> {
    return this.run('listTransitions', async () => {
      const rows = await this.db
        .select()
        .from(orderTransitions)
        .where(eq(orderTransitions.orderId, id))
        .orderBy(asc(orderTransitions.id));

      return rows.map((row) => ({
        fromStatus: row.fromStatus as OrderState,
        toStatus: row.toStatus as OrderState,
        eventKind: row.eventKind,
        actorKind: row.actorKind,
        correlationId: row.correlationId,
      }));
    });
  }
}
