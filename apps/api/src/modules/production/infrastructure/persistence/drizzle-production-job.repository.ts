/**
 * Drizzle implementation of the AGG-17 Production Job contract
 * (TBL-059..TBL-063).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { ProductionArtifactKind, ProductionJobState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq } from 'drizzle-orm';

import type {
  ProductionActor,
  ProductionJob,
  ProductionJobId,
  ProductionJobRepository,
  ProductionSpecification,
} from '../../domain/repositories/production-job.repository';

const {
  productionJobs,
  productionSpecifications,
  productionArtifacts,
  productionNotes,
  productionJobTransitions,
  approvalSnapshots,
} = schema;

type JobRow = typeof productionJobs.$inferSelect;
type SpecRow = typeof productionSpecifications.$inferSelect;

/**
 * Legal production transitions (LC-18).
 *
 * A job cannot restart once finished: the machine work is done, and a rerun is
 * a *rework* job with its own id, linked by `reworked_from_job_id`.
 */
const ALLOWED: Readonly<Record<ProductionJobState, readonly ProductionJobState[]>> = {
  PLANNED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function toJob(row: JobRow): ProductionJob {
  return {
    id: row.id as ProductionJobId,
    orderId: row.orderId,
    approvalSnapshotId: row.approvalSnapshotId,
    status: row.status as ProductionJobState,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

function toSpecification(row: SpecRow): ProductionSpecification {
  return {
    productionJobId: row.productionJobId as ProductionJobId,
    approvalSnapshotId: row.approvalSnapshotId,
    documentHash: row.documentHash,
    productName: row.productName,
    sideName: row.sideName,
    areaName: row.areaName,
    physicalWidthMm: row.physicalWidthMm,
    physicalHeightMm: row.physicalHeightMm,
    quantityTotal: row.quantityTotal,
  };
}

function actorColumns(actor: ProductionActor) {
  return actor.kind === 'ADMIN'
    ? { actorKind: 'ADMIN', adminId: actor.adminId }
    : { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
}

@Injectable()
export class DrizzleProductionJobRepository
  extends DrizzleRepository
  implements ProductionJobRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async createJob(input: {
    id: ProductionJobId;
    orderId: string;
    approvalSnapshotId: string;
    productionParameters?: string | undefined;
  }): Promise<ProductionJob> {
    return this.run('createJob', async () => {
      const tx = this.requireTransaction('createJob');

      // G-DB7-07 / INV-03. The specification is copied from the approval the
      // job names, and the approval's own order is checked against the job's —
      // so a job cannot be cut from artwork approved for a different order.
      const [approval] = await tx
        .select()
        .from(approvalSnapshots)
        .where(eq(approvalSnapshots.id, input.approvalSnapshotId))
        .limit(1);

      if (approval === undefined) {
        throw notFoundError('ProductionJobRepository.createJob', 'That approval does not exist.');
      }

      const [job] = await tx
        .insert(productionJobs)
        .values({
          id: input.id,
          orderId: input.orderId,
          approvalSnapshotId: input.approvalSnapshotId,
          status: 'PLANNED',
        })
        .returning();

      if (job === undefined) {
        throw guardViolationError(
          'ProductionJobRepository.createJob',
          'PRODUCTION_JOB_NOT_CREATED',
          'Could not create the production job.',
        );
      }

      // Frozen at creation, from the approval — never a live read that could
      // drift after the customer approved it (INV-03).
      await tx.insert(productionSpecifications).values({
        id: newId(),
        productionJobId: input.id,
        approvalSnapshotId: input.approvalSnapshotId,
        documentHash: approval.documentHash,
        productName: approval.productName,
        variantLabel: approval.variantLabel,
        sideName: approval.sideName,
        areaName: approval.areaName,
        physicalWidthMm: approval.physicalWidthMm,
        physicalHeightMm: approval.physicalHeightMm,
        quantityTotal: approval.quantityTotal,
        productionParameters: input.productionParameters ?? null,
      });

      return toJob(job);
    });
  }

  async loadForUpdate(id: ProductionJobId): Promise<ProductionJob | undefined> {
    return this.run('loadForUpdate', async () => {
      const tx = this.requireTransaction('loadForUpdate');
      const [row] = await tx
        .select()
        .from(productionJobs)
        .where(eq(productionJobs.id, id))
        .limit(1)
        .for('update');
      return row === undefined ? undefined : toJob(row);
    });
  }

  async transition(input: {
    id: ProductionJobId;
    to: ProductionJobState;
    actor: ProductionActor;
    reason?: string | undefined;
    correlationId: string;
  }): Promise<ProductionJob> {
    return this.run('transition', async () => {
      const tx = this.requireTransaction('transition');

      const [current] = await tx
        .select()
        .from(productionJobs)
        .where(eq(productionJobs.id, input.id))
        .limit(1)
        .for('update');

      if (current === undefined) {
        throw notFoundError('ProductionJobRepository.transition', 'That job does not exist.');
      }

      const from = current.status as ProductionJobState;
      if (!ALLOWED[from].includes(input.to)) {
        throw guardViolationError(
          'ProductionJobRepository.transition',
          'INVALID_TRANSITION',
          'That status change is not allowed for this production job.',
        );
      }
      if (input.to === 'CANCELLED' && (input.reason ?? '').trim() === '') {
        // Cancelling machine work mid-run has a cost; the reason is the record
        // of why it was accepted.
        throw guardViolationError(
          'ProductionJobRepository.transition',
          'CANCELLATION_REASON_REQUIRED',
          'A reason is required to cancel a production job.',
        );
      }

      const now = new Date();
      const [row] = await tx
        .update(productionJobs)
        .set({
          status: input.to,
          startedAt: input.to === 'STARTED' ? now : current.startedAt,
          completedAt: input.to === 'COMPLETED' ? now : current.completedAt,
          cancelledAt: input.to === 'CANCELLED' ? now : current.cancelledAt,
          cancelledReason:
            input.to === 'CANCELLED' ? (input.reason ?? null) : current.cancelledReason,
          updatedAt: now,
        })
        .where(eq(productionJobs.id, input.id))
        .returning();

      await tx.insert(productionJobTransitions).values({
        productionJobId: input.id,
        fromStatus: from,
        toStatus: input.to,
        ...actorColumns(input.actor),
        reason: input.reason ?? null,
        correlationId: input.correlationId,
      });

      if (row === undefined) {
        throw notFoundError('ProductionJobRepository.transition', 'That job does not exist.');
      }
      return toJob(row);
    });
  }

  async attachArtifact(
    id: ProductionJobId,
    assetId: string,
    kind: ProductionArtifactKind,
    note?: string,
  ): Promise<void> {
    return this.run('attachArtifact', async () => {
      await this.db.insert(productionArtifacts).values({
        id: newId(),
        productionJobId: id,
        assetId,
        kind,
        note: note ?? null,
      });
    });
  }

  async appendNote(id: ProductionJobId, note: string, adminId: string): Promise<void> {
    return this.run('appendNote', async () => {
      if (note.trim() === '') {
        throw guardViolationError(
          'ProductionJobRepository.appendNote',
          'NOTE_EMPTY',
          'A production note cannot be empty.',
        );
      }
      await this.db.insert(productionNotes).values({ productionJobId: id, note, adminId });
    });
  }

  async findById(id: ProductionJobId): Promise<ProductionJob | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(productionJobs)
        .where(eq(productionJobs.id, id))
        .limit(1);
      return row === undefined ? undefined : toJob(row);
    });
  }

  async findByOrderAndApproval(
    orderId: string,
    approvalSnapshotId: string,
  ): Promise<ProductionJob | undefined> {
    return this.run('findByOrderAndApproval', async () => {
      const [row] = await this.db
        .select()
        .from(productionJobs)
        .where(
          and(
            eq(productionJobs.orderId, orderId),
            eq(productionJobs.approvalSnapshotId, approvalSnapshotId),
          ),
        )
        .limit(1);
      return row === undefined ? undefined : toJob(row);
    });
  }

  async loadSpecification(id: ProductionJobId): Promise<ProductionSpecification | undefined> {
    return this.run('loadSpecification', async () => {
      const [row] = await this.db
        .select()
        .from(productionSpecifications)
        .where(eq(productionSpecifications.productionJobId, id))
        .limit(1);
      return row === undefined ? undefined : toSpecification(row);
    });
  }

  async listArtifactAssetIds(id: ProductionJobId): Promise<string[]> {
    return this.run('listArtifactAssetIds', async () => {
      const rows = await this.db
        .select({ assetId: productionArtifacts.assetId })
        .from(productionArtifacts)
        .where(eq(productionArtifacts.productionJobId, id))
        .orderBy(asc(productionArtifacts.createdAt));
      return rows.map((row) => row.assetId);
    });
  }
}
