/**
 * The published receipt of one Admin production transition (`APP8-B04` §3).
 *
 * A receipt of what the transaction committed, not a projection of the job: the
 * operator's next read is `GET /api/admin/production-jobs/{jobId}`, which owns
 * the frozen specification, the transition history and the display reservation
 * summary. Repeating those here would publish the same facts from two places
 * and let them drift.
 *
 * What it does carry is exactly what a caller cannot see from its own request:
 * which state the job moved **from**, where the order ended up, and which
 * reservations this command terminalized. That last one is the answer to *"did
 * my start consume anything?"* — and for a customer-owned-product order the
 * truthful answer is an empty list rather than a missing field
 * (`PO-APP8-001` §1.3).
 *
 * No specification, no customer, no money, no artifact, no operator identity —
 * for the reasons `admin-production-job.response.ts` states in full.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { OrderState, ProductionJobState } from '@embroidery/database';

import { PUBLISHED_PRODUCTION_STATES } from './admin-production-job.response';

const JOB_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6091';
const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const RESERVATION_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

/**
 * The order states a B04 transition can leave behind.
 *
 * Three, and no more: `IN_PRODUCTION` after a start, `PRODUCTION_COMPLETED`
 * after a completion, and — after a production-job cancellation — whatever the
 * order already was, because APP8 does not move an order's commercial state when
 * a job is cancelled (`PO-APP8-005`, `APP8-G01` §5.2). It is published as the
 * whole LC-14 vocabulary rather than a curated subset for exactly that reason: a
 * cancellation reports the order untouched.
 */
export const PUBLISHED_ORDER_STATES = [
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'IN_PRODUCTION',
  'PRODUCTION_COMPLETED',
  'AWAITING_FINAL_PAYMENT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLING',
  'CANCELLED',
] as const satisfies readonly OrderState[];

/** Compile-time proof the published list omits no canonical order state. */
export type PublishedOrderStatesAreComplete =
  Exclude<OrderState, (typeof PUBLISHED_ORDER_STATES)[number]> extends never ? true : never;

export class AdminProductionTransitionResultResponse {
  @ApiProperty({ format: 'uuid', example: JOB_ID_EXAMPLE })
  jobId!: string;

  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    enum: PUBLISHED_PRODUCTION_STATES,
    example: 'PLANNED',
    description: 'The LC-18 state the job held when the transaction began.',
  })
  fromStatus!: ProductionJobState;

  @ApiProperty({
    enum: PUBLISHED_PRODUCTION_STATES,
    example: 'STARTED',
    description: 'The LC-18 state the job now holds.',
  })
  status!: ProductionJobState;

  @ApiProperty({
    enum: PUBLISHED_ORDER_STATES,
    example: 'IN_PRODUCTION',
    description:
      'The order state after the same transaction. A start moves it to IN_PRODUCTION and a ' +
      'completion to PRODUCTION_COMPLETED; a production-job cancellation leaves it exactly ' +
      'as it was, because APP8 does not execute the order cancellation workflow.',
  })
  orderStatus!: OrderState;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    example: [RESERVATION_ID_EXAMPLE],
    description:
      'The inventory reservations this transition terminalized — consumed by a start, ' +
      'released by a cancellation. Empty when the order has no Catalog line to reserve for, ' +
      'and empty when a cancellation found nothing still reserved because production had ' +
      'already consumed it. Nothing is fabricated to make the list non-empty.',
  })
  reservationIds!: string[];
}

export interface AdminProductionTransitionResultPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly fromStatus: ProductionJobState;
  readonly status: ProductionJobState;
  readonly orderStatus: OrderState;
  readonly reservationIds: readonly string[];
}
