/**
 * The fifth production job handler, and APP8's only runtime deliverable
 * (`APP8-W01` §15).
 *
 * `APP7-B04` has been appending `payment.verified` since it shipped and nothing
 * has ever claimed it: an unclaimed event type is abandoned with a warning, so
 * every verified deposit so far has left a `PENDING` outbox row. This handler is
 * the consumer, and the backlog is ordinary work for it — the effect key is the
 * order, so a hundred waiting rows for a hundred orders reserve once each, and
 * two rows for one order reserve once.
 *
 * Thin, exactly as its four predecessors are, and on the **same** runtime: same
 * registry, same claim through `WorkerJobQueueRepository`, same lease, same
 * `background_job_attempts` ledger, same `DISPATCHED`/`DEAD_LETTER` completion.
 * `APP8-W01` adds no queue, no scheduler, no poller, no claim framework, no
 * second idempotency mechanism and no HTTP route.
 *
 * No `retryPlan`: the global `worker.runtime` schedule is the right one here.
 * Nothing in `APP8-G01` names a schedule for inventory reservation, and
 * inventing one would be a policy this checkpoint does not own.
 *
 * `APP9-W01` extended it, and extended nothing else: `payment.verified` still
 * has exactly one owner in the registry. The event now carries the obligation's
 * real kind, so this handler branches on it — a DEPOSIT reserves exactly as it
 * always did, a REMAINING is consumed successfully and reserves nothing
 * (`FU-APP8-W01-01`). No second handler, no second event type, no second
 * idempotency namespace and no table for "remaining payments we have seen".
 *
 * `APP12-H03-C1` extended it once more, on the same terms and for the same
 * class of defect: `APP12-B05` made `FULL` verifiable and every verified
 * Ready-Made payment since has dead-lettered here as `JOB_PAYLOAD_INVALID`. It
 * joins REMAINING on the successful-no-op branch, because a Ready-Made
 * reservation is already `CONSUMED` by the transaction that appended this row.
 *
 * The job kind is `INVENTORY_RESERVATION`, not the transport kind
 * `OUTBOX_DISPATCH` — the precedent is `ORDER_CREATION` and, before it,
 * `ASSET_PROCESSING` (IMP-D030): filing domain work under the transport kind
 * hides it from an operator's dead-letter query, and a reservation that
 * dead-letters is precisely what `TR-LC17-04` wants an operator to see.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';

import type {
  JobExecutionContext,
  JobHandler,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import { ReserveOrderInventoryUseCase } from './application/reserve-order-inventory.usecase';
import {
  classifyReservationFailure,
  reservationRefusal,
} from './domain/inventory-reservation.errors';
import {
  deriveReservationEffectKey,
  parsePaymentVerifiedPayload,
  PAYMENT_ATTEMPT_AGGREGATE_KIND,
  PAYMENT_VERIFIED_EVENT_TYPE,
  PAYMENT_VERIFIED_PAYLOAD_VERSION,
  type PaymentVerifiedLookup,
} from './domain/payment-verified.payload';
import { requiresInventoryReservation } from './domain/reservation-trigger.policy';

/** The DB7 job kind this capability files its attempt evidence under. */
const INVENTORY_RESERVATION: BackgroundJobKind = 'INVENTORY_RESERVATION';

@Injectable()
export class InventoryReservationHandler implements JobHandler<PaymentVerifiedLookup> {
  readonly eventType = PAYMENT_VERIFIED_EVENT_TYPE;
  readonly jobKind = INVENTORY_RESERVATION;
  readonly payloadSchemaVersion = PAYMENT_VERIFIED_PAYLOAD_VERSION;

  constructor(private readonly useCase: ReserveOrderInventoryUseCase) {}

  validatePayload(payload: unknown): PayloadValidationResult<PaymentVerifiedLookup> {
    return parsePaymentVerifiedPayload(payload);
  }

  deriveEffectKey(payload: PaymentVerifiedLookup): string {
    return deriveReservationEffectKey(payload);
  }

  async execute(payload: PaymentVerifiedLookup, context: JobExecutionContext): Promise<void> {
    if (
      context.aggregateKind !== PAYMENT_ATTEMPT_AGGREGATE_KIND ||
      context.aggregateId !== payload.paymentAttemptId
    ) {
      // The claim filter is by event type, so a row of the right type with the
      // wrong linkage is possible and is a producer defect. Terminal: no number
      // of retries will change what the columns say. Both halves are one check
      // because both mean the same thing — this row does not describe the
      // verification its payload claims.
      throw reservationRefusal(
        'EVENT_LINKAGE_MISMATCH',
        'The event linkage and payload name different payment attempts.',
      );
    }

    if (!requiresInventoryReservation(payload.obligationKind)) {
      // A verified REMAINING payment (`APP9-B03`) or a verified FULL one
      // (`APP12-H03-C1`) is a legitimate delivery of this event that inventory
      // owes nothing for. REMAINING: the order's stock was committed when its
      // deposit was verified, and `TR-LC17-04` gates the official reservation on
      // that deposit alone. FULL: `APP12-B05` consumed the Ready-Made
      // reservation inside the verifying transaction, so the units were sold
      // before this row became claimable. Returning here is the
      // handler's success — the runtime records `SUCCEEDED` and completes the
      // outbox row through the same path a reservation takes. Nothing is
      // written: no reservation, no ledger entry, no stock effect and no
      // stand-in "consumed" row invented to make the attempt look busy.
      //
      // Placed *after* the linkage check on purpose. The whole canonical event
      // is validated first — shape by the parser, linkage above — and only then
      // does the kind decide the action, so a REMAINING row with a producer
      // defect is still refused rather than waved through by its kind.
      return;
    }

    try {
      await this.useCase.reserve(payload);
    } catch (error: unknown) {
      // A refusal is already classified — terminal for a fact the frozen order
      // will state the same way on every attempt, transient for a claim another
      // attempt is holding or for an inventory condition an operator can change.
      // Anything else stays unclassified rather than being guessed at from a
      // message.
      throw classifyReservationFailure(error);
    }
  }
}
