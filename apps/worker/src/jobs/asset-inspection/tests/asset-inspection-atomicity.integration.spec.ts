/**
 * Terminal atomicity, closed contradictions and disposable residue
 * (APP2-W01 §21).
 *
 * The terminal transactions are the point of no return: after them an asset is
 * publishable or permanently refused. These cases prove they are all-or-nothing
 * against a real PostgreSQL — a partial one would leave a READY derivative with
 * no inspection, or an inspection with no derivative, and either is a state no
 * later attempt could interpret.
 */
import { sql } from '@embroidery/database';

import type {
  AssetInspectionRepository,
  FinalizeAcceptedInput,
  FinalizeRejectedInput,
} from '../domain/repositories/asset-inspection.repository';
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import { containerExists } from '../../../../test/support/disposable-minio';
import {
  startAssetInspectionContext,
  type AssetInspectionContext,
} from './asset-inspection-context';
import { garbage, pngWithAlpha } from './image-fixtures';

interface DerivativeRow extends Record<string, unknown> {
  kind: string;
  status: string;
  storage_key: string | null;
}

/**
 * Does the real terminal write, then loses the connection.
 *
 * The throw lands inside the use case's `runInTransaction` callback — the
 * boundary is opened there, not in the repository — so PostgreSQL rolls the
 * whole thing back. That is precisely the crash this checkpoint has to survive.
 */
function dyingAfterWrite(
  repository: AssetInspectionRepository,
  step: 'accepted' | 'rejected',
): AssetInspectionRepository {
  return {
    prepareOrRecover: repository.prepareOrRecover.bind(repository),
    loadProcessingSnapshot: repository.loadProcessingSnapshot.bind(repository),
    loadTerminalEffect: repository.loadTerminalEffect.bind(repository),
    finalizeAccepted: async (input: FinalizeAcceptedInput): Promise<void> => {
      await repository.finalizeAccepted(input);
      if (step === 'accepted') {
        throw new WorkerJobError('JOB_TRANSIENT_FAILURE', 'Connection lost mid-commit.');
      }
    },
    finalizeRejected: async (input: FinalizeRejectedInput): Promise<void> => {
      await repository.finalizeRejected(input);
      if (step === 'rejected') {
        throw new WorkerJobError('JOB_TRANSIENT_FAILURE', 'Connection lost mid-commit.');
      }
    },
  };
}

describe('asset inspection — terminal atomicity (live PostgreSQL + MinIO)', () => {
  let context: AssetInspectionContext;
  let closed = false;

  beforeAll(async () => {
    context = await startAssetInspectionContext('w01-atomicity');
  }, 600_000);

  afterAll(async () => {
    if (!closed) {
      await context?.close();
    }
  }, 300_000);

  function derivatives(assetId: string): Promise<DerivativeRow[]> {
    return context.query<DerivativeRow>(sql`
      select kind, status, storage_key from asset_derivatives where asset_id = ${assetId} order by kind
    `);
  }

  function status(assetId: string): Promise<{ status: string }[]> {
    return context.query<{ status: string }>(sql`select status from assets where id = ${assetId}`);
  }

  function inspections(assetId: string): Promise<{ outcome: string }[]> {
    return context.query<{ outcome: string }>(
      sql`select outcome from asset_inspections where asset_id = ${assetId}`,
    );
  }

  it('rolls the accepted finalization back as one unit', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(600, 500));
    const useCase = context.buildUseCase({
      repository: dyingAfterWrite(context.repository, 'accepted'),
    });

    await expect(
      useCase.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    // Not one row promoted, not one inspection appended, asset unchanged.
    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect(await inspections(seeded.assetId)).toEqual([]);
    expect((await derivatives(seeded.assetId)).map((row) => row.status)).toEqual([
      'PROCESSING',
      'PROCESSING',
    ]);
    expect((await derivatives(seeded.assetId)).every((row) => row.storage_key === null)).toBe(true);
  });

  it('converges to ACCEPTED after that rollback', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(600, 500));
    const dying = context.buildUseCase({
      repository: dyingAfterWrite(context.repository, 'accepted'),
    });
    await expect(
      dying.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    await context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 2 },
      new AbortController().signal,
    );

    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    expect((await derivatives(seeded.assetId)).every((row) => row.status === 'READY')).toBe(true);
  });

  it('rolls the rejected finalization back as one unit', async () => {
    const seeded = await context.seedAsset(garbage());
    const useCase = context.buildUseCase({
      repository: dyingAfterWrite(context.repository, 'rejected'),
    });

    await expect(
      useCase.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    expect(await status(seeded.assetId)).toEqual([{ status: 'INSPECTING' }]);
    expect(await inspections(seeded.assetId)).toEqual([]);
    expect((await derivatives(seeded.assetId)).every((row) => row.status === 'PROCESSING')).toBe(
      true,
    );
  });

  it('converges to REJECTED after that rollback', async () => {
    const seeded = await context.seedAsset(garbage());
    const dying = context.buildUseCase({
      repository: dyingAfterWrite(context.repository, 'rejected'),
    });
    await expect(
      dying.inspect({ assetId: seeded.assetId, attemptNo: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkerJobError);

    await context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 2 },
      new AbortController().signal,
    );

    expect(await status(seeded.assetId)).toEqual([{ status: 'REJECTED' }]);
    expect(await inspections(seeded.assetId)).toHaveLength(1);
    expect((await derivatives(seeded.assetId)).every((row) => row.status === 'FAILED')).toBe(true);
  });

  it('fails closed on a terminal asset with no inspection', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300), { status: 'ACCEPTED' });

    await expect(
      context.useCase.inspect(
        { assetId: seeded.assetId, attemptNo: 1 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });

    // No repair, no overwrite, no cleanup: the evidence has to survive long
    // enough for a human to read it.
    expect(await status(seeded.assetId)).toEqual([{ status: 'ACCEPTED' }]);
    expect(await derivatives(seeded.assetId)).toEqual([]);
    expect(await inspections(seeded.assetId)).toEqual([]);
  });

  it('fails closed on an accepted asset whose derivatives are missing', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300));
    await context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 1 },
      new AbortController().signal,
    );
    await context.query(
      sql`delete from asset_derivatives where asset_id = ${seeded.assetId} and kind = 'THUMBNAIL'`,
    );

    await expect(
      context.useCase.inspect(
        { assetId: seeded.assetId, attemptNo: 2 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
  });

  it('fails closed on a rejected asset that still exposes a READY derivative', async () => {
    const seeded = await context.seedAsset(await pngWithAlpha(300, 300));
    await context.useCase.inspect(
      { assetId: seeded.assetId, attemptNo: 1 },
      new AbortController().signal,
    );
    // Force the contradictory pair directly; the state machine cannot produce
    // it, which is exactly why the guard has to be tested against it.
    await context.query(sql`update assets set status = 'REJECTED' where id = ${seeded.assetId}`);

    await expect(
      context.useCase.inspect(
        { assetId: seeded.assetId, attemptNo: 2 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
  });

  it('leaves no disposable database and no container behind', async () => {
    const { containerName } = context.minio;
    const databaseName = new URL(context.disposable.url).pathname.slice(1);

    // Closed here rather than in `afterAll` so the result can actually be
    // asserted; `afterAll` only guards against this test never running.
    await context.close();
    closed = true;

    expect(await containerExists(containerName)).toBe(false);
    expect(databaseName).toMatch(/^embroidery_/);
  }, 300_000);
});
