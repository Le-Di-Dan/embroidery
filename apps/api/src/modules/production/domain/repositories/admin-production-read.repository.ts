/**
 * The Admin production read model (`APP8-B03` §7, §8).
 *
 * A **query** contract, deliberately separate from `ProductionJobRepository`.
 * That one is AGG-17's writer — `createJob` freezes the specification,
 * `transition` enforces LC-18 legality and appends its audit row,
 * `attachArtifact` and `appendNote` write evidence. Folding a queue projection
 * into it would put an Admin list shape inside the aggregate every write path
 * resolves, and would hand two read routes a `transition()` they must never
 * call. It is the same second-seam split `APP7-B02` established with
 * `AdminOrderReadRepository`, and for the same reason.
 *
 * So this reads. It has no create, no transition, no artifact, no note, and it
 * never opens a transaction.
 *
 * ### Frozen facts only
 *
 * Every column below belongs to `production_jobs`,
 * `production_specifications` or `production_job_transitions`. No live
 * `products`, `product_variants`, `product_sides`, `embroidery_areas`,
 * `quotation_versions`, `design_versions` or `design_sessions` row supplies a
 * name, a label or a dimension: the specification is the copy `createJob` froze
 * from the exact approval (INV-03, G-DB7-07), and reconstructing any part of it
 * from a mutable source would be this read overruling what the customer
 * approved.
 *
 * Physical dimensions travel as the strings the driver returns for `numeric`,
 * exactly as `ProductionSpecification` already carries them. Nothing here
 * rounds, converts or re-derives a millimetre.
 */
import type { ProductionJobState } from '@embroidery/database';

import type { ProductionJobId } from './production-job.repository';

/** The keyset position of the last row of the previous page. */
export interface ProductionQueuePosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ProductionQueueFilter {
  /** Absent means "every state", not a default subset — B03 invents no triage set. */
  readonly statuses: readonly ProductionJobState[] | undefined;
  /** Absent means "every order". Present narrows the queue to one order's jobs. */
  readonly orderId: string | undefined;
}

export interface ProductionQueueQuery {
  readonly filter: ProductionQueueFilter;
  readonly after: ProductionQueuePosition | undefined;
  /** Already clamped by `resolveLimit`; the adapter over-fetches by one. */
  readonly limit: number;
}

/**
 * The smallest job-owned set that identifies and triages one production job.
 *
 * No priority, no SLA, no operator, no machine, no attempt and no claim state:
 * `APP8-G01` §7.2 creates none of those columns and `APP8-B03` §7.1 forbids
 * inventing them in a projection. What triages this queue is the LC-18 status
 * and the age of the row, which is exactly what is here.
 */
export interface ProductionQueueRow {
  readonly id: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: ProductionJobState;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;
  readonly cancelledAt: Date | undefined;
}

/**
 * The job root, plus the LC-18 evidence a queue row omits.
 *
 * `cancelledReason` is `[R]` on `CANCELLED`
 * (`ck_production_jobs__cancelled_reason_required`) and absent otherwise.
 * `reworkedFromJobId` is REL-092's lineage pointer, reported as stored — B03
 * creates no rework job and follows the chain no further than one hop.
 */
export interface ProductionJobDetailRow extends ProductionQueueRow {
  readonly cancelledReason: string | undefined;
  readonly reworkedFromJobId: string | undefined;
  readonly updatedAt: Date;
}

/**
 * The immutable specification (TBL-060), reported in full.
 *
 * A superset of `ProductionSpecification`: that interface is the writer's
 * return shape and omits `variantLabel` and `productionParameters`, both of
 * which `createJob` already freezes and an operator preparing the machine
 * genuinely needs. Reporting them is a read of a stored column, not a new fact.
 */
export interface ProductionSpecificationRow {
  readonly approvalSnapshotId: string;
  readonly documentHash: string;
  readonly productName: string;
  readonly variantLabel: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly productionParameters: string | undefined;
}

/**
 * One append-only LC-18 transition (TBL-063).
 *
 * `actorKind` plus the id the kind implies, never both: an `ADMIN` row carries
 * `adminId` and a `SYSTEM` row carries `systemJobKey`, which is how the table
 * stores it and how a reader must present it. No customer ever appears here.
 */
export interface ProductionTransitionRow {
  readonly fromStatus: ProductionJobState;
  readonly toStatus: ProductionJobState;
  readonly actorKind: string;
  readonly adminId: string | undefined;
  readonly systemJobKey: string | undefined;
  readonly reason: string | undefined;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export const ADMIN_PRODUCTION_READ_REPOSITORY = Symbol('ADMIN_PRODUCTION_READ_REPOSITORY');

export interface AdminProductionReadRepository {
  /** One keyset page, newest first, over-fetched by one. */
  listQueue(query: ProductionQueueQuery): Promise<ProductionQueueRow[]>;
  findDetail(jobId: ProductionJobId): Promise<ProductionJobDetailRow | undefined>;
  /** The frozen specification, or nothing for a job that somehow has none. */
  loadSpecification(jobId: ProductionJobId): Promise<ProductionSpecificationRow | undefined>;
  /** The job's timeline in insert order (IDX-102). Empty for a `PLANNED` job. */
  listTransitions(jobId: ProductionJobId): Promise<ProductionTransitionRow[]>;
}
