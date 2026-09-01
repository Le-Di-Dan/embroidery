/**
 * AGG-17 Production Job persistence against a real PostgreSQL instance
 * (DB7-CP4).
 *
 * TBL-059..TBL-063 and guards G-DB7-07 (the specification is frozen from the
 * job's own approval) and G-DB7-25 (lifecycle legality).
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError, ProductionJobState } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { seedOrderChain } from '../../../order/tests/integration/order-fixture';
import type { OrderFixture } from '../../../order/tests/integration/order-fixture';
import { ProductionModule } from '../../production.module';
import { PRODUCTION_JOB_REPOSITORY } from '../../domain/repositories/production-job.repository';
import type {
  ProductionActor,
  ProductionJobId,
  ProductionJobRepository,
} from '../../domain/repositories/production-job.repository';

describe('production persistence (integration)', () => {
  let context: PersistenceTestContext;
  let jobs: ProductionJobRepository;
  let fixture: OrderFixture;
  let orderId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-production', [ProductionModule]);
    jobs = context.get(PRODUCTION_JOB_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedOrderChain(context);
    orderId = await seedOrder(fixture);
  });

  async function seedOrder(target: OrderFixture): Promise<string> {
    const id = newId();
    await context.disposable.client.db.execute(sql`
      insert into orders
        (id, code, origin, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (${id}, ${`ORD-${id}`}, 'CUSTOM', ${target.customRequestId}, ${target.customerId},
              ${target.quotationVersionId}, ${target.approvalSnapshotId},
              'DEPOSIT_PAID', 2550000.00, 'VND')
    `);
    return id;
  }

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

  const actor: ProductionActor = { kind: 'SYSTEM', systemJobKey: 'test' };

  const createJob = (approvalSnapshotId = fixture.approvalSnapshotId, order = orderId) => {
    const id = newId() as ProductionJobId;
    return context.inTransaction(() => jobs.createJob({ id, orderId: order, approvalSnapshotId }));
  };

  async function moveTo(id: ProductionJobId, path: readonly ProductionJobState[]): Promise<void> {
    for (const to of path) {
      await context.inTransaction(() =>
        jobs.transition({
          id,
          to,
          actor,
          correlationId: newId(),
          ...(to === 'CANCELLED' ? { reason: 'test cancellation' } : {}),
        }),
      );
    }
  }

  describe('job creation and specification freeze (G-DB7-07)', () => {
    it('creates the job and freezes its specification from the approval', async () => {
      const job = await createJob();

      const spec = await jobs.loadSpecification(job.id);
      expect(job.status).toBe('PLANNED');
      // Copied from the approval, so the machine file's provenance is the
      // artwork the customer actually approved (INV-03).
      expect(spec?.approvalSnapshotId).toBe(fixture.approvalSnapshotId);
      expect(spec?.quantityTotal).toBe(25);
      expect(spec?.documentHash).toMatch(/^sha256:/);
    });

    it('keeps the frozen specification when the approval labels change downstream', async () => {
      const job = await createJob();

      await context.disposable.client.db.execute(
        sql`update products set name = 'Renamed' where id = ${fixture.productId}`,
      );

      // The specification is a copy, not a live read — it cannot drift.
      await expect(jobs.loadSpecification(job.id)).resolves.toMatchObject({ productName: 'Tee' });
    });

    it('allows only one job per order and approval', async () => {
      await createJob();

      const error = await failureOf(() => createJob());

      expect(error.code).toBe('PRODUCTION_JOB_ALREADY_EXISTS');
    });

    it('reports an approval that does not exist', async () => {
      const error = await failureOf(() => createJob(newId()));

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('refuses to create outside a transaction', async () => {
      await expect(
        jobs.createJob({
          id: newId() as ProductionJobId,
          orderId,
          approvalSnapshotId: fixture.approvalSnapshotId,
        }),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('leaves no job behind when the specification insert fails', async () => {
      const other = await seedOrderChain(context, '2');
      const id = newId() as ProductionJobId;

      // The approval belongs to another request, so its FK to *this* order's
      // chain is satisfied but the job is orphaned commercially. The DB rejects
      // on the job/approval pair only once both exist, so this asserts the
      // rollback boundary rather than the chain guard.
      await expect(
        context.inTransaction(async () => {
          await jobs.createJob({ id, orderId, approvalSnapshotId: other.approvalSnapshotId });
          throw new Error('later step failed');
        }),
      ).rejects.toBeDefined();

      await expect(jobs.findById(id)).resolves.toBeUndefined();
      await expect(jobs.loadSpecification(id)).resolves.toBeUndefined();
    });
  });

  describe('lifecycle (G-DB7-25)', () => {
    it('records the move and its evidence together', async () => {
      const job = await createJob();

      await moveTo(job.id, ['STARTED']);

      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from production_job_transitions where production_job_id = ${job.id}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(1);
      await expect(jobs.findById(job.id)).resolves.toMatchObject({ status: 'STARTED' });
    });

    it('stamps started_at and completed_at with the moves that cause them', async () => {
      const job = await createJob();

      await moveTo(job.id, ['STARTED', 'COMPLETED']);

      const loaded = await jobs.findById(job.id);
      expect(loaded?.startedAt).toBeInstanceOf(Date);
      expect(loaded?.completedAt).toBeInstanceOf(Date);
    });

    it('rejects a move that skips starting the work', async () => {
      const job = await createJob();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          jobs.transition({ id: job.id, to: 'COMPLETED', actor, correlationId: newId() }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
    });

    it('refuses to restart a completed job — a rerun is a rework job', async () => {
      const job = await createJob();
      await moveTo(job.id, ['STARTED', 'COMPLETED']);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          jobs.transition({ id: job.id, to: 'STARTED', actor, correlationId: newId() }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
    });

    it('requires a reason to cancel machine work', async () => {
      const job = await createJob();
      await moveTo(job.id, ['STARTED']);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          jobs.transition({
            id: job.id,
            to: 'CANCELLED',
            actor,
            reason: '   ',
            correlationId: newId(),
          }),
        ),
      );

      expect(error.code).toBe('CANCELLATION_REASON_REQUIRED');
    });

    it('leaves no transition evidence behind a rejected move', async () => {
      const job = await createJob();

      await expect(
        context.inTransaction(() =>
          jobs.transition({ id: job.id, to: 'COMPLETED', actor, correlationId: newId() }),
        ),
      ).rejects.toBeDefined();

      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from production_job_transitions where production_job_id = ${job.id}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(0);
    });
  });

  describe('artifacts and notes', () => {
    it('attaches an internal artifact', async () => {
      const job = await createJob();

      await context.inTransaction(() =>
        jobs.attachArtifact(job.id, fixture.assetId, 'MACHINE_FILE', 'DST export'),
      );

      await expect(jobs.listArtifactAssetIds(job.id)).resolves.toHaveLength(1);
    });

    it('rejects the same asset attached twice', async () => {
      const job = await createJob();
      await context.inTransaction(() =>
        jobs.attachArtifact(job.id, fixture.assetId, 'MACHINE_FILE'),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => jobs.attachArtifact(job.id, fixture.assetId, 'PHOTO')),
      );

      expect(error.kind).toBe('CONFLICT');
    });

    it('appends a note and rejects an empty one', async () => {
      const job = await createJob();

      await context.inTransaction(() =>
        jobs.appendNote(job.id, 'Thread tension adjusted', fixture.adminId),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => jobs.appendNote(job.id, '  ', fixture.adminId)),
      );
      expect(error.code).toBe('NOTE_EMPTY');
    });
  });

  describe('immutability', () => {
    it('rejects a mutation of the frozen specification via the S24 trigger', async () => {
      const job = await createJob();

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperSpecification', () =>
          context.disposable.client.db.execute(
            sql`update production_specifications set quantity_total = 999 where production_job_id = ${job.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });
});
