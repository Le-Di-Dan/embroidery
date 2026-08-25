/**
 * The published Admin production contract (`APP8-B03` §7.1, §8).
 *
 * These classes exist for OpenAPI: the generated client's types come from them.
 * The runtime views live beside the queries that build them
 * (`production-job.view.ts`), so a property cannot be added to one and
 * forgotten in the other.
 *
 * ### What a production response does not carry, and why
 *
 * **No artifact payload or storage reference.** `production_artifacts` points
 * at internal, unwatermarked files (INV-21/22) and `PO-APP8-004` puts artifact
 * management out of APP8 entirely. No key, no URL, no asset id.
 *
 * **No customer fact.** No name, email, phone, contact snapshot or secure-grant
 * reference — the approval snapshot carries a frozen `[PII]` contact copy and
 * none of it is republished here. A job is identified by its order.
 *
 * **No money.** No total, deposit, remaining, unit price or currency. The
 * deposit is a *gate* on creation; its amounts are `APP7-B04`'s surface.
 *
 * **No priority, SLA, operator, machine, attempt or claim.** No such column
 * exists (`APP8-G01` §7.2), and a projection is not where one gets invented.
 *
 * **No production note.** `production_notes` is delivered and untouched: §8.5
 * puts note management outside B03.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { InventoryReservationState, ProductionJobState } from '@embroidery/database';

import { PRODUCTION_STATUS_FILTERS } from './admin-production-job.request';

const JOB_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6091';
const ORDER_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const APPROVAL_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6031';
const SKU_ID_EXAMPLE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6021';

/** The published LC-18 vocabulary, from the one tuple the filter also uses. */
export const PUBLISHED_PRODUCTION_STATES = PRODUCTION_STATUS_FILTERS;

/** Compile-time proof the published list omits no canonical state. */
export type PublishedProductionStatesAreComplete =
  Exclude<ProductionJobState, (typeof PUBLISHED_PRODUCTION_STATES)[number]> extends never
    ? true
    : never;

/** The reservation vocabulary (LC-17, reservation side), published as read. */
export const PUBLISHED_RESERVATION_STATES = [
  'RESERVED',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
] as const satisfies readonly InventoryReservationState[];

export class AdminProductionJobQueueItemResponse {
  @ApiProperty({ format: 'uuid', example: JOB_ID_EXAMPLE })
  jobId!: string;

  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    format: 'uuid',
    example: APPROVAL_ID_EXAMPLE,
    description:
      'The exact approval snapshot this job was frozen from. One job per ' +
      '(order, approval snapshot) — `uq_production_jobs__order_approval_snapshot`.',
  })
  approvalSnapshotId!: string;

  @ApiProperty({
    enum: PUBLISHED_PRODUCTION_STATES,
    example: 'PLANNED',
    description: 'The current LC-18 state, reported as stored.',
  })
  status!: ProductionJobState;

  @ApiProperty({ format: 'date-time', example: '2026-08-25T09:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When production started. Absent while the job is still PLANNED.',
  })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'When production completed.' })
  completedAt?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'When the job was cancelled.' })
  cancelledAt?: string;
}

export class AdminProductionJobQueueResponse {
  @ApiProperty({ type: [AdminProductionJobQueueItemResponse] })
  items!: AdminProductionJobQueueItemResponse[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page. Absent on the last page.',
  })
  nextCursor?: string;

  @ApiProperty({ description: 'True when a further page exists.' })
  hasNext!: boolean;
}

export class AdminProductionSpecificationResponse {
  @ApiProperty({ format: 'uuid', example: APPROVAL_ID_EXAMPLE })
  approvalSnapshotId!: string;

  @ApiProperty({
    example: 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
    description:
      'The approval hash, copied at creation (D7-07). Provenance of the machine file — ' +
      'never recomputed here.',
  })
  documentHash!: string;

  @ApiProperty({
    example: 'Tee',
    description: 'Frozen display copy (Class F, INV-12). Never re-read from the live catalog.',
  })
  productName!: string;

  @ApiPropertyOptional({
    example: 'Black / M',
    description: 'Frozen variant label. Always absent for a customer-owned product (INV-13).',
  })
  variantLabel?: string;

  @ApiProperty({ example: 'Front' })
  sideName!: string;

  @ApiProperty({ example: 'Chest' })
  areaName!: string;

  @ApiProperty({
    example: '120.00',
    description: 'Transported exactly as `numeric` stores it — never rounded or converted.',
  })
  physicalWidthMm!: string;

  @ApiProperty({ example: '80.00' })
  physicalHeightMm!: string;

  @ApiProperty({ example: 25, description: 'The approved quantity, frozen at creation.' })
  quantityTotal!: number;

  @ApiPropertyOptional({
    description: 'Free-text machine parameters recorded when the job was created.',
  })
  productionParameters?: string;
}

export class AdminProductionTransitionResponse {
  @ApiProperty({ enum: PUBLISHED_PRODUCTION_STATES, example: 'PLANNED' })
  fromStatus!: ProductionJobState;

  @ApiProperty({ enum: PUBLISHED_PRODUCTION_STATES, example: 'STARTED' })
  toStatus!: ProductionJobState;

  @ApiProperty({
    example: 'ADMIN',
    description:
      'Who moved the job. `production_job_transitions.actor_kind` carries no dictionary set ' +
      'and none is invented here; a customer never appears.',
  })
  actorKind!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Present on an ADMIN transition.' })
  adminId?: string;

  @ApiPropertyOptional({ description: 'Present on a SYSTEM transition.' })
  systemJobKey?: string;

  @ApiPropertyOptional({ description: 'Mandatory on a cancellation, absent otherwise.' })
  reason?: string;

  @ApiProperty({ description: 'The request correlation this move was recorded under.' })
  correlationId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-08-25T10:00:00.000Z' })
  occurredAt!: string;
}

export class AdminProductionReservationResponse {
  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ format: 'uuid' })
  skuStockId!: string;

  @ApiProperty({ format: 'uuid', example: SKU_ID_EXAMPLE })
  skuId!: string;

  @ApiProperty({ example: 25 })
  quantity!: number;

  @ApiProperty({ enum: PUBLISHED_RESERVATION_STATES, example: 'RESERVED' })
  status!: InventoryReservationState;
}

export class AdminProductionReservationSummaryResponse {
  @ApiProperty({
    description:
      'True when the order has at least one Catalog line. False means the order is ' +
      'customer-owned only, where the absence of a reservation is expected by design ' +
      '(PO-APP8-001) and never an error. **Display context only** — production start is ' +
      'decided under the stock row lock, not from this read.',
  })
  required!: boolean;

  @ApiProperty({ example: 1, description: 'Order lines naming a Catalog SKU.' })
  catalogItemCount!: number;

  @ApiProperty({ example: 0, description: 'Order lines naming a customer-owned product.' })
  customerOwnedItemCount!: number;

  @ApiProperty({
    type: [AdminProductionReservationResponse],
    description:
      'Every reservation ever placed against the order, terminal ones included, so a ' +
      'released reservation is distinguishable from one that never existed.',
  })
  reservations!: AdminProductionReservationResponse[];
}

export class AdminProductionJobDetailResponse {
  @ApiProperty({ format: 'uuid', example: JOB_ID_EXAMPLE })
  jobId!: string;

  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description: 'The human order code. Display and search only — it never authorizes anything.',
  })
  orderCode!: string;

  @ApiProperty({ format: 'uuid', example: APPROVAL_ID_EXAMPLE })
  approvalSnapshotId!: string;

  @ApiProperty({ enum: PUBLISHED_PRODUCTION_STATES, example: 'PLANNED' })
  status!: ProductionJobState;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  completedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  cancelledAt?: string;

  @ApiPropertyOptional({ description: 'Mandatory evidence on a cancelled job.' })
  cancelledReason?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'REL-092 rework lineage. A redo is a new job, never a mutated one.',
  })
  reworkedFromJobId?: string;

  @ApiPropertyOptional({
    type: AdminProductionSpecificationResponse,
    description: 'The immutable specification frozen from the exact approval at creation.',
  })
  specification?: AdminProductionSpecificationResponse;

  @ApiProperty({
    type: [AdminProductionTransitionResponse],
    description: 'The append-only LC-18 timeline in insert order. Empty for a PLANNED job.',
  })
  transitions!: AdminProductionTransitionResponse[];

  @ApiPropertyOptional({
    type: AdminProductionReservationSummaryResponse,
    description: 'Read-only inventory context. Never the basis of a production-start decision.',
  })
  reservationSummary?: AdminProductionReservationSummaryResponse;
}

/** The receipt a creation returns: the job root, and nothing more. */
export class AdminProductionJobCreatedResponse {
  @ApiProperty({ format: 'uuid', example: JOB_ID_EXAMPLE })
  jobId!: string;

  @ApiProperty({ format: 'uuid', example: ORDER_ID_EXAMPLE })
  orderId!: string;

  @ApiProperty({
    format: 'uuid',
    example: APPROVAL_ID_EXAMPLE,
    description: 'Resolved from the order, never from the request body.',
  })
  approvalSnapshotId!: string;

  @ApiProperty({ enum: PUBLISHED_PRODUCTION_STATES, example: 'PLANNED' })
  status!: ProductionJobState;
}

/** The serialized projections. The only place these instants become strings. */
export interface AdminProductionJobQueuePayload {
  readonly items: readonly {
    readonly jobId: string;
    readonly orderId: string;
    readonly approvalSnapshotId: string;
    readonly status: ProductionJobState;
    readonly createdAt: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly cancelledAt?: string;
  }[];
  readonly nextCursor: string | undefined;
  readonly hasNext: boolean;
}

export interface AdminProductionSpecificationPayload {
  readonly approvalSnapshotId: string;
  readonly documentHash: string;
  readonly productName: string;
  readonly variantLabel?: string;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly productionParameters?: string;
}

export interface AdminProductionTransitionPayload {
  readonly fromStatus: ProductionJobState;
  readonly toStatus: ProductionJobState;
  readonly actorKind: string;
  readonly adminId?: string;
  readonly systemJobKey?: string;
  readonly reason?: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface AdminProductionReservationSummaryPayload {
  readonly required: boolean;
  readonly catalogItemCount: number;
  readonly customerOwnedItemCount: number;
  readonly reservations: readonly {
    readonly reservationId: string;
    readonly skuStockId: string;
    readonly skuId: string;
    readonly quantity: number;
    readonly status: InventoryReservationState;
  }[];
}

export interface AdminProductionJobDetailPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cancelledAt?: string;
  readonly cancelledReason?: string;
  readonly reworkedFromJobId?: string;
  readonly specification?: AdminProductionSpecificationPayload;
  readonly transitions: readonly AdminProductionTransitionPayload[];
  readonly reservationSummary?: AdminProductionReservationSummaryPayload;
}

export interface AdminProductionJobCreatedPayload {
  readonly jobId: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
}
