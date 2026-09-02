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
import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import { and, eq } from 'drizzle-orm';

import { actorColumns } from './order-transition-actor';
import { DISPATCHABLE_FROM } from './order-transitions';
import type { OrderLifecycle } from './order-lifecycle';
import type { RequestActor } from './ordering-identity';
import type {
  AcknowledgeShippingFeeInput,
  FindShippingFeeAcknowledgementInput,
  OrderId,
  SaveShippingDetailInput,
  ShippingDetail,
  ShippingFeeAcknowledgement,
  ShippingFeeBaseline,
} from './order.repository';
import {
  toOrderLifecycle,
  toShippingDetail,
  toShippingFeeAcknowledgement,
} from './order-row.mapper';

const {
  orders,
  orderTransitions,
  quotationVersions,
  shippingDetails,
  shippingSnapshots,
  shippingFeeAcknowledgements,
  orderCancellationRequests,
} = schema;

const CURRENCY = 'VND';

/**
 * The actor a dispatch is attributed to when the caller names none.
 *
 * LC-14 `TR-LC14-07` is an **admin** move, so the Admin command supplies its
 * own bound operator and this default is never what a real dispatch records.
 * It exists for the callers that predate `APP9-B05` — fixtures and benchmarks
 * that reach for the one delivered freeze writer to *manufacture* a FROZEN
 * detail rather than to perform an operator's dispatch — and it keeps recording
 * what those callers actually are: a job, not a person.
 */
const DISPATCH_SEED_ACTOR: RequestActor = { kind: 'SYSTEM', systemJobKey: 'order.dispatch' };

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

  async lockShippingDetail(orderId: OrderId): Promise<ShippingDetail | undefined> {
    return this.run('lockShippingDetail', async () => {
      const tx = this.requireTransaction('lockShippingDetail');

      // Deliberately the same statement `lockShippingFeeBaseline` opens with,
      // minus the quotation join it cannot use. Taking the identical row lock
      // is what keeps the two origin paths serialised against each other: a
      // Ready-Made fee confirmation and a custom fee edit can never both be
      // mid-flight on one order, whatever routing bug led them there.
      const [detail] = await tx
        .select()
        .from(shippingDetails)
        .where(eq(shippingDetails.orderId, orderId))
        .limit(1)
        .for('update');

      return detail === undefined ? undefined : toShippingDetail(detail);
    });
  }

  async lockShippingFeeBaseline(orderId: OrderId): Promise<ShippingFeeBaseline | undefined> {
    return this.run('lockShippingFeeBaseline', async () => {
      const tx = this.requireTransaction('lockShippingFeeBaseline');

      // The detail first, and locked: it is the row every competing pre-freeze
      // write contends on, so taking it here fixes the lock order as
      // `shipping_details` -> `payment_obligations` for the whole recalculation.
      // An order with no detail yet locks nothing — there is no row to lock —
      // and the live-obligation arbiter
      // (`uq_payment_obligations__order_kind__live`) is what serialises two
      // concurrent *first* writes that both change the fee.
      const [detail] = await tx
        .select()
        .from(shippingDetails)
        .where(eq(shippingDetails.orderId, orderId))
        .limit(1)
        .for('update');

      // The quoted fee comes from the order's own accepted-version pointer, not
      // from a caller-supplied id: `orders.accepted_quotation_version_id` is
      // frozen at creation and the join is what makes the baseline this order's.
      const [quoted] = await tx
        .select({ shippingFeeAmount: quotationVersions.shippingFeeAmount })
        .from(orders)
        .innerJoin(quotationVersions, eq(orders.acceptedQuotationVersionId, quotationVersions.id))
        .where(eq(orders.id, orderId))
        .limit(1);

      if (quoted === undefined) {
        return undefined;
      }
      return {
        detail: detail === undefined ? undefined : toShippingDetail(detail),
        quotedFeeAmount: quoted.shippingFeeAmount,
      };
    });
  }

  async dispatch(
    orderId: OrderId,
    dispatchedAt: Date,
    correlationId: string,
    actor: RequestActor = DISPATCH_SEED_ACTOR,
  ): Promise<OrderLifecycle> {
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
        ...actorColumns(actor),
        correlationId,
      });

      if (row === undefined) {
        throw notFoundError('OrderRepository.dispatch', 'That order does not exist.');
      }
      // Origin-neutral — `toOrder` refuses a Ready-Made row (`APP12-B05`).
      return toOrderLifecycle(row);
    });
  }

  async acknowledgeShippingFee(
    input: AcknowledgeShippingFeeInput,
  ): Promise<ShippingFeeAcknowledgement> {
    return this.run('acknowledgeShippingFee', async () => {
      const [row] = await this.db
        .insert(shippingFeeAcknowledgements)
        .values({
          orderId: input.orderId,
          previousFeeAmount: input.previousFeeAmount,
          newFeeAmount: input.newFeeAmount,
          currencyCode: CURRENCY,
          grantId: input.grantId,
          stepUpChallengeId: input.stepUpChallengeId,
          acknowledgedAt: input.acknowledgedAt,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'OrderRepository.acknowledgeShippingFee',
          'ACKNOWLEDGEMENT_NOT_CREATED',
          'Could not record the shipping-fee acknowledgement.',
        );
      }
      return toShippingFeeAcknowledgement(row);
    });
  }

  async findShippingFeeAcknowledgement(
    input: FindShippingFeeAcknowledgementInput,
  ): Promise<ShippingFeeAcknowledgement | undefined> {
    return this.run('findShippingFeeAcknowledgement', async () => {
      // All three predicates, always. The fee columns are `numeric(14,2)`, so
      // the comparison happens in Postgres at the column's own scale — a stored
      // `50000.00` and a supplied `50000.00` are one value, and no JS number
      // is involved on either side.
      const [row] = await this.db
        .select()
        .from(shippingFeeAcknowledgements)
        .where(
          and(
            eq(shippingFeeAcknowledgements.orderId, input.orderId),
            eq(shippingFeeAcknowledgements.previousFeeAmount, input.previousFeeAmount),
            eq(shippingFeeAcknowledgements.newFeeAmount, input.newFeeAmount),
            eq(shippingFeeAcknowledgements.currencyCode, CURRENCY),
          ),
        )
        .orderBy(shippingFeeAcknowledgements.id)
        .limit(1);

      return row === undefined ? undefined : toShippingFeeAcknowledgement(row);
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
