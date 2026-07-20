/**
 * Shipping and cancellation persistence for AGG-15 (TBL-046..TBL-049).
 *
 * Split from `DrizzleOrderRepository` by responsibility: the order's own
 * lifecycle is one concern, and fulfilment — address, freeze, dispatch
 * snapshot, fee acknowledgement, cancellation review — is another. Both still
 * serve the single `OrderRepository` contract, so the aggregate keeps one
 * public API and no table gains a repository of its own (DB7 §10.1).
 *
 * Carries **G-DB7-24** (GRD-017, shipping frozen at dispatch) and the
 * dispatch half of **G-DB7-37** (GRD-016).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import { DISPATCHABLE_FROM } from '../../domain/lifecycle/order-transitions';
import type {
  AcknowledgeShippingFeeInput,
  Order,
  OrderId,
  SaveShippingDetailInput,
  ShippingDetail,
} from '../../domain/repositories/order.repository';
import { toOrder, toShippingDetail } from './order-row.mapper';

const {
  orders,
  orderTransitions,
  shippingDetails,
  shippingSnapshots,
  shippingFeeAcknowledgements,
  orderCancellationRequests,
} = schema;

const CURRENCY = 'VND';

@Injectable()
export class DrizzleOrderShippingRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async saveShippingDetails(input: SaveShippingDetailInput): Promise<ShippingDetail> {
    return this.run('saveShippingDetails', async () => {
      const tx = this.requireTransaction('saveShippingDetails');

      const [existing] = await tx
        .select({ id: shippingDetails.id, status: shippingDetails.status })
        .from(shippingDetails)
        .where(eq(shippingDetails.orderId, input.orderId))
        .limit(1)
        .for('update');

      if (existing?.status === 'FROZEN') {
        // GRD-017: once dispatched, the address that was shipped to is
        // evidence. Editing it would make the snapshot a lie.
        throw guardViolationError(
          'OrderRepository.saveShippingDetails',
          'SHIPPING_FROZEN',
          'Shipping details can no longer be changed for this order.',
        );
      }

      const values = {
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        addressLine: input.addressLine,
        ward: input.ward ?? null,
        district: input.district ?? null,
        province: input.province,
        feeAmount: input.feeAmount ?? null,
        currencyCode: CURRENCY,
        carrierName: input.carrierName ?? null,
        trackingCode: input.trackingCode ?? null,
      };

      const [row] = await tx
        .insert(shippingDetails)
        .values({ id: newId(), orderId: input.orderId, status: 'EDITABLE', ...values })
        .onConflictDoUpdate({
          target: shippingDetails.orderId,
          set: { ...values, updatedAt: new Date() },
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'OrderRepository.saveShippingDetails',
          'SHIPPING_NOT_SAVED',
          'Could not save the shipping details.',
        );
      }
      return toShippingDetail(row);
    });
  }

  async dispatch(orderId: OrderId, dispatchedAt: Date, correlationId: string): Promise<Order> {
    return this.run('dispatch', async () => {
      const tx = this.requireTransaction('dispatch');

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1)
        .for('update');

      if (order === undefined) {
        throw notFoundError('OrderRepository.dispatch', 'That order does not exist.');
      }

      // G-DB7-37 / GRD-016 is expressed through the lifecycle: an order only
      // reaches READY_FOR_DELIVERY once its remaining obligation is satisfied.
      if (order.status !== DISPATCHABLE_FROM) {
        throw guardViolationError(
          'OrderRepository.dispatch',
          'ORDER_NOT_READY_FOR_DELIVERY',
          'That order is not ready for delivery.',
        );
      }

      const [detail] = await tx
        .select()
        .from(shippingDetails)
        .where(eq(shippingDetails.orderId, orderId))
        .limit(1)
        .for('update');

      if (detail === undefined) {
        throw guardViolationError(
          'OrderRepository.dispatch',
          'SHIPPING_NOT_READY',
          'That order has no shipping details.',
        );
      }
      if (detail.feeAmount === null) {
        // GRD-017 requires a *complete* detail: a dispatch with no fee would
        // snapshot an amount nobody agreed to.
        throw guardViolationError(
          'OrderRepository.dispatch',
          'SHIPPING_NOT_READY',
          'The shipping fee has not been set for this order.',
        );
      }

      // Freeze, snapshot and transition in one transaction, so no window
      // exists where the order is dispatched but its address is still editable.
      await tx
        .update(shippingDetails)
        .set({ status: 'FROZEN', frozenAt: dispatchedAt, updatedAt: dispatchedAt })
        .where(eq(shippingDetails.id, detail.id));

      await tx.insert(shippingSnapshots).values({
        id: newId(),
        orderId,
        shippingDetailId: detail.id,
        recipientName: detail.recipientName,
        recipientPhone: detail.recipientPhone,
        addressLine: detail.addressLine,
        ward: detail.ward,
        district: detail.district,
        province: detail.province,
        countryCode: detail.countryCode,
        feeAmount: detail.feeAmount,
        currencyCode: detail.currencyCode,
        carrierName: detail.carrierName,
        trackingCode: detail.trackingCode,
        dispatchedAt,
      });

      const [row] = await tx
        .update(orders)
        .set({ status: 'DELIVERED', deliveredAt: dispatchedAt, updatedAt: dispatchedAt })
        .where(eq(orders.id, orderId))
        .returning();

      await tx.insert(orderTransitions).values({
        orderId,
        fromStatus: DISPATCHABLE_FROM,
        toStatus: 'DELIVERED',
        eventKind: 'SHIPPING_FREEZE',
        actorKind: 'SYSTEM',
        systemJobKey: 'order.dispatch',
        correlationId,
      });

      if (row === undefined) {
        throw notFoundError('OrderRepository.dispatch', 'That order does not exist.');
      }
      return toOrder(row);
    });
  }

  async acknowledgeShippingFee(input: AcknowledgeShippingFeeInput): Promise<void> {
    return this.run('acknowledgeShippingFee', async () => {
      await this.db.insert(shippingFeeAcknowledgements).values({
        orderId: input.orderId,
        previousFeeAmount: input.previousFeeAmount,
        newFeeAmount: input.newFeeAmount,
        currencyCode: CURRENCY,
        grantId: input.grantId,
        stepUpChallengeId: input.stepUpChallengeId,
        acknowledgedAt: input.acknowledgedAt,
      });
    });
  }

  async openCancellationRequest(input: {
    id: string;
    orderId: OrderId;
    stage: string;
    initiator: string;
    reason: string;
    grantId?: string | undefined;
    stepUpChallengeId?: string | undefined;
  }): Promise<void> {
    return this.run('openCancellationRequest', async () => {
      await this.db.insert(orderCancellationRequests).values({
        id: input.id,
        orderId: input.orderId,
        stage: input.stage,
        initiator: input.initiator,
        status: 'PENDING',
        reason: input.reason,
        grantId: input.grantId ?? null,
        stepUpChallengeId: input.stepUpChallengeId ?? null,
      });
    });
  }

  async resolveCancellationRequest(id: string, approved: boolean, adminId: string): Promise<void> {
    return this.run('resolveCancellationRequest', async () => {
      const now = new Date();
      const rows = await this.db
        .update(orderCancellationRequests)
        .set({
          status: approved ? 'APPROVED' : 'DENIED',
          decidedByAdminId: adminId,
          decidedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(orderCancellationRequests.id, id),
            // Only a pending request may be decided: re-deciding would
            // overwrite the record of what was actually decided.
            eq(orderCancellationRequests.status, 'PENDING'),
          ),
        )
        .returning({ id: orderCancellationRequests.id });

      if (rows.length === 0) {
        throw notFoundError(
          'OrderRepository.resolveCancellationRequest',
          'That cancellation request is not pending.',
        );
      }
    });
  }

  async loadShippingDetail(id: OrderId): Promise<ShippingDetail | undefined> {
    return this.run('loadShippingDetail', async () => {
      const [row] = await this.db
        .select()
        .from(shippingDetails)
        .where(eq(shippingDetails.orderId, id))
        .limit(1);
      return row === undefined ? undefined : toShippingDetail(row);
    });
  }
}
