/**
 * Lifecycle orchestration, with a recording repository and a real image
 * pipeline over an in-memory store.
 *
 * The repository is a double because the durable rules are proven against a
 * real PostgreSQL in the integration suite; what is under test here is which
 * ending the use case chooses, and in which order it does the external work.
 */
import type { TransactionManager } from '@embroidery/persistence';

import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import type { WorkerPolicyService } from '../../../runtime/policy/worker-policy.service';
import type { WorkerRuntimePolicy } from '../../../runtime/policy/worker-runtime-policy';
import { CATALOG_INSPECTION_LANE } from '../domain/asset-inspection-lane';
import { contradiction } from '../domain/inspection-contradiction';
import { decodeInspectionDetail } from '../domain/inspection-detail.codec';
import type {
  AssetInspectionRepository,
  AssetSourceFacts,
  FinalizeAcceptedInput,
  FinalizeRejectedInput,
  PrepareInput,
  PreparedWork,
  ProcessingSnapshot,
  TerminalEffect,
} from '../domain/repositories/asset-inspection.repository';
import { InMemoryObjectStorage } from '../tests/in-memory-object-storage';
import { pngWithAlpha, garbage, type SyntheticImage } from '../tests/image-fixtures';
import { AssetInspectionUseCase } from './asset-inspection.usecase';
import { DerivativeCleanupService } from './derivative-cleanup.service';
import { DerivativeGenerationService } from './derivative-generation.service';
import { SourceVerificationService } from './source-verification.service';

const ASSET_ID = '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84';
const ORIGINAL_KEY = `test/originals/${ASSET_ID}/original.png`;
const THUMBNAIL_KEY = `test/derivatives/${ASSET_ID}/THUMBNAIL.webp`;
const PREVIEW_KEY = `test/derivatives/${ASSET_ID}/CATALOG_PREVIEW.webp`;

const POLICY: WorkerRuntimePolicy = {
  concurrency: 1,
  batchSize: 1,
  pollIntervalMs: 25,
  leaseDurationMs: 5_000,
  handlerTimeoutMs: 300,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 100,
  maxAttempts: 3,
  backoffBaseMs: 10,
  backoffMaxMs: 100,
};

class RecordingRepository implements AssetInspectionRepository {
  prepared: PreparedWork = {
    kind: 'PROCESS',
    source: sourceFacts(0n, ''),
    lane: CATALOG_INSPECTION_LANE,
    requiresCleanup: false,
  };
  snapshot: ProcessingSnapshot = {
    source: sourceFacts(0n, ''),
    status: 'INSPECTING',
    derivatives: [],
    terminalInspectionCount: 0,
  };
  accepted: FinalizeAcceptedInput[] = [];
  rejected: FinalizeRejectedInput[] = [];
  prepareError: Error | undefined;
  finalizeAcceptedError: Error | undefined;

  prepareOrRecover(_input: PrepareInput): Promise<PreparedWork> {
    if (this.prepareError !== undefined) {
      return Promise.reject(this.prepareError);
    }
    return Promise.resolve(this.prepared);
  }

  loadProcessingSnapshot(_assetId: string): Promise<ProcessingSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  finalizeAccepted(input: FinalizeAcceptedInput): Promise<void> {
    if (this.finalizeAcceptedError !== undefined) {
      return Promise.reject(this.finalizeAcceptedError);
    }
    this.accepted.push(input);
    return Promise.resolve();
  }

  finalizeRejected(input: FinalizeRejectedInput): Promise<void> {
    this.rejected.push(input);
    return Promise.resolve();
  }

  loadTerminalEffect(_assetId: string): Promise<TerminalEffect | undefined> {
    return Promise.resolve(undefined);
  }
}

function sourceFacts(byteSize: bigint, checksum: string): AssetSourceFacts {
  return {
    assetId: ASSET_ID,
    storageKey: ORIGINAL_KEY,
    mediaType: 'image/png',
    byteSize,
    checksum,
  };
}

const passthroughTransactions = {
  runInTransaction: <T>(work: () => T | Promise<T>): Promise<T> => Promise.resolve(work()),
} as unknown as TransactionManager;

// No default parameter anywhere below: `policyService(undefined)` would silently
// fall back to `POLICY`, and the "no policy loaded" case would then have been
// asserting the opposite of what it claims.
function policyService(policy: WorkerRuntimePolicy | undefined): WorkerPolicyService {
  return { current: (): WorkerRuntimePolicy | undefined => policy } as WorkerPolicyService;
}

describe('AssetInspectionUseCase', () => {
  let storage: InMemoryObjectStorage;
  let repository: RecordingRepository;
  let generation: DerivativeGenerationService;
  let cleanup: DerivativeCleanupService;
  let useCase: AssetInspectionUseCase;
  let controller: AbortController;

  function wire(policy: WorkerRuntimePolicy | undefined): void {
    generation = new DerivativeGenerationService(storage, 'test');
    cleanup = new DerivativeCleanupService(storage, generation);
    useCase = new AssetInspectionUseCase(
      passthroughTransactions,
      repository,
      new SourceVerificationService(storage),
      generation,
      cleanup,
      policyService(policy),
      storage,
    );
  }

  function seed(image: SyntheticImage): void {
    storage.put('ORIGINALS', ORIGINAL_KEY, image.bytes, image.mediaType);
    repository.prepared = {
      kind: 'PROCESS',
      source: sourceFacts(BigInt(image.byteSize), image.checksum),
      lane: CATALOG_INSPECTION_LANE,
      requiresCleanup: false,
    };
    repository.snapshot = {
      source: sourceFacts(BigInt(image.byteSize), image.checksum),
      status: 'INSPECTING',
      derivatives: [],
      terminalInspectionCount: 0,
    };
  }

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    repository = new RecordingRepository();
    controller = new AbortController();
    wire(POLICY);
  });

  describe('accepted path', () => {
    it('writes both private derivatives and one accepted record', async () => {
      seed(await pngWithAlpha(1200, 800));

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);

      expect(repository.rejected).toHaveLength(0);
      expect(repository.accepted).toHaveLength(1);
      expect(storage.keys('DERIVATIVES')).toEqual([PREVIEW_KEY, THUMBNAIL_KEY]);
    });

    it('records the measurements of both outputs', async () => {
      seed(await pngWithAlpha(1200, 800));

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);
      const detail = decodeInspectionDetail(repository.accepted[0]?.detail ?? null);

      expect(detail?.result).toBe('ACCEPTED');
      expect(
        detail?.result === 'ACCEPTED' && detail.derivatives.map((entry) => entry.kind),
      ).toEqual(['THUMBNAIL', 'CATALOG_PREVIEW']);
      expect(detail?.result === 'ACCEPTED' && detail.source.orientedWidth).toBe(1200);
    });

    it('hands the deterministic keys to the terminal transaction', async () => {
      seed(await pngWithAlpha(400, 400));

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);

      expect(repository.accepted[0]?.derivatives.map((entry) => entry.storageKey)).toEqual([
        THUMBNAIL_KEY,
        PREVIEW_KEY,
      ]);
    });

    it('uploads both objects before the terminal transaction runs', async () => {
      seed(await pngWithAlpha(400, 400));
      repository.finalizeAcceptedError = contradiction('injected');

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal),
      ).rejects.toBeInstanceOf(WorkerJobError);
      // Both objects exist even though the transaction failed — which is why a
      // recovered attempt has to clean the prefix before rewriting it.
      expect(storage.keys('DERIVATIVES')).toHaveLength(2);
    });
  });

  describe('deterministic rejection', () => {
    it('records a rejection instead of failing the job', async () => {
      seed(garbage());

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);

      expect(repository.accepted).toHaveLength(0);
      expect(repository.rejected).toHaveLength(1);
      expect(repository.rejected[0]?.rejectionCode).toBe('DECODE_FAILED');
    });

    it('keeps the original and writes no derivative', async () => {
      seed(garbage());

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);

      expect(storage.has('ORIGINALS', ORIGINAL_KEY)).toBe(true);
      expect(storage.keys('DERIVATIVES')).toEqual([]);
    });

    it('records cleanup as complete when the prefix could be emptied', async () => {
      seed(garbage());

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);
      const detail = decodeInspectionDetail(repository.rejected[0]?.detail ?? null);

      expect(detail?.result === 'REJECTED' && detail.cleanupPending).toBe(false);
    });

    it('records cleanupPending when the store cannot be reached', async () => {
      seed(garbage());
      storage.failWith('list', 'PROVIDER_UNAVAILABLE');

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal);
      const detail = decodeInspectionDetail(repository.rejected[0]?.detail ?? null);

      // The verdict about the file is already decided; holding it hostage to a
      // storage outage would leave the asset stuck in INSPECTING forever.
      expect(detail?.result === 'REJECTED' && detail.cleanupPending).toBe(true);
    });
  });

  describe('retryable failure', () => {
    it('throws before the final attempt so the runtime can retry', async () => {
      seed(await pngWithAlpha(300, 300));
      storage.failWith('get', 'PROVIDER_UNAVAILABLE');

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_DEPENDENCY_UNAVAILABLE' });
      expect(repository.rejected).toHaveLength(0);
      expect(repository.accepted).toHaveLength(0);
    });

    it('rejects with PROCESSING_RETRY_EXHAUSTED on the final attempt', async () => {
      seed(await pngWithAlpha(300, 300));
      storage.failWith('get', 'PROVIDER_UNAVAILABLE');

      await useCase.inspect(
        { assetId: ASSET_ID, attemptNo: POLICY.maxAttempts },
        controller.signal,
      );

      expect(repository.rejected[0]?.rejectionCode).toBe('PROCESSING_RETRY_EXHAUSTED');
    });

    it('reads maxAttempts from the runtime policy, not from a second copy', async () => {
      seed(await pngWithAlpha(300, 300));
      storage.failWith('get', 'PROVIDER_UNAVAILABLE');
      wire({ ...POLICY, maxAttempts: 9 });

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 3 }, controller.signal),
      ).rejects.toBeInstanceOf(WorkerJobError);
      expect(repository.rejected).toHaveLength(0);
    });

    it('retries rather than rejecting when no policy is loaded', async () => {
      seed(await pngWithAlpha(300, 300));
      storage.failWith('get', 'PROVIDER_UNAVAILABLE');
      wire(undefined);

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 99 }, controller.signal),
      ).rejects.toBeInstanceOf(WorkerJobError);
      expect(repository.rejected).toHaveLength(0);
    });

    it('does not finalize an attempt whose deadline already fired', async () => {
      seed(await pngWithAlpha(300, 300));
      storage.failWith('get', 'PROVIDER_UNAVAILABLE');
      controller.abort();

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: POLICY.maxAttempts }, controller.signal),
      ).rejects.toBeInstanceOf(WorkerJobError);
      expect(repository.rejected).toHaveLength(0);
    });
  });

  describe('recovered work', () => {
    it('purges the derivative prefix before rewriting it', async () => {
      seed(await pngWithAlpha(500, 400));
      storage.put('DERIVATIVES', THUMBNAIL_KEY, Buffer.from('stale bytes'));
      repository.prepared = { ...repository.prepared, requiresCleanup: true } as PreparedWork;

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 2 }, controller.signal);

      expect(storage.read('DERIVATIVES', THUMBNAIL_KEY)?.toString()).not.toContain('stale');
      expect(storage.keys('DERIVATIVES')).toEqual([PREVIEW_KEY, THUMBNAIL_KEY]);
    });

    it('never deletes the original', async () => {
      seed(await pngWithAlpha(500, 400));
      repository.prepared = { ...repository.prepared, requiresCleanup: true } as PreparedWork;

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 2 }, controller.signal);

      expect(storage.has('ORIGINALS', ORIGINAL_KEY)).toBe(true);
    });

    it('stops rather than deleting a READY derivative', async () => {
      seed(await pngWithAlpha(200, 200));
      repository.prepared = { ...repository.prepared, requiresCleanup: true } as PreparedWork;
      repository.snapshot = {
        ...repository.snapshot,
        derivatives: [
          {
            kind: 'THUMBNAIL',
            status: 'READY',
            storageKey: THUMBNAIL_KEY,
            checksum: null,
            isWatermarked: false,
          },
        ],
      };

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 2 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    });

    it('stops rather than cleaning up after a terminal inspection', async () => {
      seed(await pngWithAlpha(200, 200));
      repository.prepared = { ...repository.prepared, requiresCleanup: true } as PreparedWork;
      repository.snapshot = { ...repository.snapshot, terminalInspectionCount: 1 };

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 2 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    });
  });

  describe('terminal replay', () => {
    it('writes nothing when the accepted effect is complete', async () => {
      storage.put('DERIVATIVES', THUMBNAIL_KEY, Buffer.from('thumb'));
      storage.put('DERIVATIVES', PREVIEW_KEY, Buffer.from('preview'));
      repository.prepared = {
        kind: 'REPLAY_ACCEPTED',
        derivativeKeys: [THUMBNAIL_KEY, PREVIEW_KEY],
      };

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 4 }, controller.signal);

      expect(repository.accepted).toHaveLength(0);
      expect(repository.rejected).toHaveLength(0);
      expect(storage.calls.filter((call) => call.operation === 'put')).toHaveLength(0);
      expect(storage.calls.filter((call) => call.operation === 'delete')).toHaveLength(0);
    });

    it('writes nothing when the rejected effect is complete', async () => {
      repository.prepared = { kind: 'REPLAY_REJECTED' };

      await useCase.inspect({ assetId: ASSET_ID, attemptNo: 4 }, controller.signal);

      expect(storage.calls).toHaveLength(0);
      expect(repository.rejected).toHaveLength(0);
    });

    it('stops when an accepted row points at an object that is gone', async () => {
      repository.prepared = {
        kind: 'REPLAY_ACCEPTED',
        derivativeKeys: [THUMBNAIL_KEY, PREVIEW_KEY],
      };

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 4 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    });

    it('retries rather than stopping when the store cannot answer', async () => {
      storage.put('DERIVATIVES', THUMBNAIL_KEY, Buffer.from('thumb'));
      storage.put('DERIVATIVES', PREVIEW_KEY, Buffer.from('preview'));
      repository.prepared = {
        kind: 'REPLAY_ACCEPTED',
        derivativeKeys: [THUMBNAIL_KEY, PREVIEW_KEY],
      };
      storage.failWith('head', 'PROVIDER_UNAVAILABLE');

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 4 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_DEPENDENCY_UNAVAILABLE' });
    });
  });

  describe('contradictions', () => {
    it('turns a preparation contradiction into a terminal invariant violation', async () => {
      repository.prepareError = contradiction('asset is not private catalog media');

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
    });

    it('never records an inspection for a contradiction', async () => {
      seed(await pngWithAlpha(200, 200));
      repository.finalizeAcceptedError = contradiction('asset left INSPECTING');

      await expect(
        useCase.inspect({ assetId: ASSET_ID, attemptNo: 1 }, controller.signal),
      ).rejects.toMatchObject({ errorClass: 'JOB_INVARIANT_VIOLATION' });
      expect(repository.rejected).toHaveLength(0);
    });
  });
});
