/**
 * Drizzle implementation of the Admin production read model (`APP8-B03` §7, §8).
 *
 * Every statement names its columns, over three tables and no others:
 * `production_jobs`, `production_specifications` and
 * `production_job_transitions`. There is no `products`, `product_variants`,
 * `product_sides`, `embroidery_areas`, `approval_snapshots`, `design_versions`,
 * `quotation_versions`, `orders` or `order_items` table anywhere in this file,
 * which is what makes "the frozen specification is never reconstructed from
 * live state" (§8.2) checkable by reading it.
 *
 * ### The queue's access path
 *
 * `ix_production_jobs__created_id__active` is `(created_at, id)` partial on the
 * two active states — IDX-082, created by DB5 for the active-job queue. The
 * query orders on `(created_at DESC, id DESC)` and pages on the same pair, so a
 * status filter over the active states rides that index as a backward scan. An
 * unfiltered queue scans `production_jobs` in the same total order; the table
 * holds one row per (order, approval), so it is bounded by order volume rather
 * than by anything that grows per interaction. **No index and no migration is
 * added** (`APP8-B03` §7.3, §14).
 *
 * ### No aggregation, no arithmetic, no lock
 *
 * There is no `count()` over the table — the second query keyset pagination
 * exists to avoid — no `sum()`, and no `FOR UPDATE`. Reading a job changes
 * nothing, and a lock taken by a queue refresh is a lock the reservation worker
 * would wait on.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { ProductionJobState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';

import type { ProductionJobId } from '../../domain/repositories/production-job.repository';
import type {
  AdminProductionReadRepository,
  ProductionJobDetailRow,
  ProductionQueueQuery,
  ProductionQueueRow,
  ProductionSpecificationRow,
  ProductionTransitionRow,
} from '../../domain/repositories/admin-production-read.repository';

const { productionJobs, productionSpecifications, productionJobTransitions } = schema;

/** The job-root columns the queue reports. Reused by the detail read. */
const JOB_ROOT_COLUMNS = {
  id: productionJobs.id,
  orderId: productionJobs.orderId,
  approvalSnapshotId: productionJobs.approvalSnapshotId,
  status: productionJobs.status,
  createdAt: productionJobs.createdAt,
  startedAt: productionJobs.startedAt,
  completedAt: productionJobs.completedAt,
  cancelledAt: productionJobs.cancelledAt,
} as const;

interface JobRootSelection {
  readonly id: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
}

function toQueueRow(row: JobRootSelection): ProductionQueueRow {
  return {
    id: row.id,
    orderId: row.orderId,
    approvalSnapshotId: row.approvalSnapshotId,
    status: row.status as ProductionJobState,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    cancelledAt: row.cancelledAt ?? undefined,
  };
}

@Injectable()
export class DrizzleAdminProductionReadRepository
  extends DrizzleRepository
  implements AdminProductionReadRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listQueue(query: ProductionQueueQuery): Promise<ProductionQueueRow[]> {
    return this.run('listQueue', async () => {
      const { filter, after } = query;
      const conditions: SQL[] = [];

      if (filter.statuses !== undefined) {
        conditions.push(inArray(productionJobs.status, [...filter.statuses]));
      }
      if (filter.orderId !== undefined) {
        conditions.push(eq(productionJobs.orderId, filter.orderId));
      }
      if (after !== undefined) {
        // Written out rather than as a row comparison so it stays readable:
        // strictly older, or the same instant with a smaller id. `created_at`
        // is not unique — two jobs created in the same millisecond are
        // possible — so the id is what makes the page boundary total and stops
        // a row being repeated or skipped.
        const keyset = or(
          lt(productionJobs.createdAt, after.createdAt),
          and(eq(productionJobs.createdAt, after.createdAt), lt(productionJobs.id, after.id)),
        );
        if (keyset !== undefined) {
          conditions.push(keyset);
        }
      }

      const rows = await this.db
        .select(JOB_ROOT_COLUMNS)
        .from(productionJobs)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(desc(productionJobs.createdAt), desc(productionJobs.id))
        .limit(query.limit + 1);

      return rows.map(toQueueRow);
    });
  }

  async findDetail(jobId: ProductionJobId): Promise<ProductionJobDetailRow | undefined> {
    return this.run('findDetail', async () => {
      const [row] = await this.db
        .select({
          ...JOB_ROOT_COLUMNS,
          cancelledReason: productionJobs.cancelledReason,
          reworkedFromJobId: productionJobs.reworkedFromJobId,
          updatedAt: productionJobs.updatedAt,
        })
        .from(productionJobs)
        .where(eq(productionJobs.id, jobId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        ...toQueueRow(row),
        cancelledReason: row.cancelledReason ?? undefined,
        reworkedFromJobId: row.reworkedFromJobId ?? undefined,
        updatedAt: row.updatedAt,
      };
    });
  }

  async loadSpecification(jobId: ProductionJobId): Promise<ProductionSpecificationRow | undefined> {
    return this.run('loadSpecification', async () => {
      const [row] = await this.db
        .select({
          approvalSnapshotId: productionSpecifications.approvalSnapshotId,
          documentHash: productionSpecifications.documentHash,
          productName: productionSpecifications.productName,
          variantLabel: productionSpecifications.variantLabel,
          sideName: productionSpecifications.sideName,
          areaName: productionSpecifications.areaName,
          physicalWidthMm: productionSpecifications.physicalWidthMm,
          physicalHeightMm: productionSpecifications.physicalHeightMm,
          quantityTotal: productionSpecifications.quantityTotal,
          productionParameters: productionSpecifications.productionParameters,
        })
        .from(productionSpecifications)
        .where(eq(productionSpecifications.productionJobId, jobId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return {
        approvalSnapshotId: row.approvalSnapshotId,
        documentHash: row.documentHash,
        productName: row.productName,
        variantLabel: row.variantLabel ?? undefined,
        sideName: row.sideName,
        areaName: row.areaName,
        physicalWidthMm: row.physicalWidthMm,
        physicalHeightMm: row.physicalHeightMm,
        quantityTotal: row.quantityTotal,
        productionParameters: row.productionParameters ?? undefined,
      };
    });
  }

  async listTransitions(jobId: ProductionJobId): Promise<ProductionTransitionRow[]> {
    return this.run('listTransitions', async () => {
      // `(production_job_id, id)` is IDX-102 exactly, and the sequence id is
      // the insert order — the only correct replay order for an append-only
      // history, and stable where `created_at` alone would not be.
      const rows = await this.db
        .select({
          fromStatus: productionJobTransitions.fromStatus,
          toStatus: productionJobTransitions.toStatus,
          actorKind: productionJobTransitions.actorKind,
          adminId: productionJobTransitions.adminId,
          systemJobKey: productionJobTransitions.systemJobKey,
          reason: productionJobTransitions.reason,
          correlationId: productionJobTransitions.correlationId,
          occurredAt: productionJobTransitions.createdAt,
        })
        .from(productionJobTransitions)
        .where(eq(productionJobTransitions.productionJobId, jobId))
        .orderBy(asc(productionJobTransitions.id));

      return rows.map((row) => ({
        fromStatus: row.fromStatus as ProductionJobState,
        toStatus: row.toStatus as ProductionJobState,
        actorKind: row.actorKind,
        adminId: row.adminId ?? undefined,
        systemJobKey: row.systemJobKey ?? undefined,
        reason: row.reason ?? undefined,
        correlationId: row.correlationId,
        occurredAt: row.occurredAt,
      }));
    });
  }
}
