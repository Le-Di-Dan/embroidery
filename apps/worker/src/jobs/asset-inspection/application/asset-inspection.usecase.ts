/**
 * The asset-inspection lifecycle, end to end (APP2-W01 §11-§18).
 *
 * The shape of this file is the recovery model. Durable preparation commits
 * first, external work happens outside every transaction, and one terminal
 * transaction closes the lifecycle — so a crash at any point leaves a state the
 * next attempt can recognise and continue from, rather than a half-written
 * effect nobody can classify.
 *
 * Three endings, and only three. The image was fine (ACCEPTED, both derivatives
 * READY); the image was not (REJECTED, both derivatives FAILED, original kept);
 * or the infrastructure failed and the attempt throws for the runtime to retry.
 * A rejected image is never a dead letter: no operator can fix a corrupt PNG,
 * and paging one for it is how a queue fills with noise.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ObjectStoragePort } from '@embroidery/object-storage';
import { TransactionManager } from '@embroidery/persistence';

import { jobCorrelation } from '../../../runtime/context/job-correlation';
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import { WorkerPolicyService } from '../../../runtime/policy/worker-policy.service';
import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import {
  DERIVATIVE_OUTPUT_POLICIES,
  type CatalogDerivativeKind,
} from '../domain/asset-processing-policy';
import { isContradiction } from '../domain/inspection-contradiction';
import {
  buildAcceptedDetail,
  buildRejectedDetail,
  encodeInspectionDetail,
  type InspectedSource,
} from '../domain/inspection-detail';
import { isAssetRejectedError, type AssetRejectionCode } from '../domain/processing-rejection';
import {
  ASSET_INSPECTION_REPOSITORY,
  type AssetInspectionRepository,
  type AssetSourceFacts,
} from '../domain/repositories/asset-inspection.repository';
import {
  DerivativeGenerationService,
  type GeneratedDerivative,
} from './derivative-generation.service';
import { DerivativeCleanupService } from './derivative-cleanup.service';
import { SourceVerificationService } from './source-verification.service';
import { abortFailure, isAbort, toRetryableFailure } from './storage-failure';

export interface InspectionAttemptContext {
  readonly assetId: string;
  readonly attemptNo: number;
}

@Injectable()
export class AssetInspectionUseCase {
  private readonly logger = new Logger('AssetInspection');

  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ASSET_INSPECTION_REPOSITORY) private readonly repository: AssetInspectionRepository,
    private readonly verification: SourceVerificationService,
    private readonly generation: DerivativeGenerationService,
    private readonly cleanup: DerivativeCleanupService,
    private readonly policies: WorkerPolicyService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * The attempt boundary.
   *
   * Every contradiction is converted here, not just the ones raised inside the
   * processing block. An earlier version only caught those, so a contradiction
   * from the preparation transaction or from the cleanup preconditions escaped
   * unclassified — and the runtime's default for an unclassified failure is
   * `JOB_UNKNOWN_FAILURE`, which is *retryable*. An asset in an irreconcilable
   * state would then have been retried to the cap before anyone was told.
   */
  async inspect(context: InspectionAttemptContext, signal: AbortSignal): Promise<void> {
    try {
      await this.run(context, signal);
    } catch (error: unknown) {
      if (isContradiction(error)) {
        this.logger.error(`Asset inspection stopped: ${error.reason}.`);
        throw new WorkerJobError('JOB_INVARIANT_VIOLATION', error.message);
      }
      throw error;
    }
  }

  private async run(context: InspectionAttemptContext, signal: AbortSignal): Promise<void> {
    const { assetId } = context;
    const expectedKeys = this.expectedKeys(assetId);

    const prepared = await this.transactions.runInTransaction(() =>
      this.repository.prepareOrRecover({ assetId, at: new Date(), expectedKeys }),
    );

    if (prepared.kind === 'REPLAY_REJECTED') {
      return;
    }
    if (prepared.kind === 'REPLAY_ACCEPTED') {
      await this.assertObjectsExist(prepared.derivativeKeys, signal);
      return;
    }

    try {
      // Inside the same guarded block as the processing itself. A cleanup that
      // cannot reach the store is an ordinary retryable failure — and on the
      // final attempt it has to become `PROCESSING_RETRY_EXHAUSTED` like any
      // other, or an asset would sit in `INSPECTING` forever because the step
      // that failed happened to be the one before the work.
      if (prepared.requiresCleanup) {
        await this.purgeRecoveredOutput(assetId, signal);
      }
      await this.process(prepared.source, signal);
    } catch (error: unknown) {
      await this.handleFailure(context, error, signal);
    }
  }

  /** The successful path: verify, generate both outputs, finalize atomically. */
  private async process(source: AssetSourceFacts, signal: AbortSignal): Promise<void> {
    const inspected = await this.verification.verify(source, signal);
    const derivatives = await this.generateAll(source, inspected, signal);

    const detail = encodeInspectionDetail(
      buildAcceptedDetail({ source: inspected, derivatives: derivatives.map(stripKey) }),
    );
    await this.transactions.runInTransaction(() =>
      this.repository.finalizeAccepted({
        assetId: source.assetId,
        source,
        detail,
        derivatives,
        at: new Date(),
      }),
    );
  }

  /**
   * Sequential, never concurrent.
   *
   * Two libvips pipelines over one original double peak native memory, and a
   * worker sized for many small jobs pays that on every attempt for a saving
   * measured in milliseconds.
   */
  private async generateAll(
    source: AssetSourceFacts,
    inspected: InspectedSource,
    signal: AbortSignal,
  ): Promise<GeneratedDerivative[]> {
    const generated: GeneratedDerivative[] = [];
    for (const policy of DERIVATIVE_OUTPUT_POLICIES) {
      generated.push(await this.generation.generate({ source, inspected, policy, signal }));
    }
    return generated;
  }

  /**
   * Turns whatever escaped `process` into one of the three endings.
   *
   * Order matters: a deterministic rejection is a verdict and is written; a
   * contradiction is a stop and is never written over; anything else is
   * infrastructure, and is retried until the final attempt turns it into
   * `PROCESSING_RETRY_EXHAUSTED` — because an asset cannot sit in `INSPECTING`
   * forever waiting for a store that is not coming back.
   */
  private async handleFailure(
    context: InspectionAttemptContext,
    error: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    if (isAssetRejectedError(error)) {
      await this.reject(context.assetId, error.rejectionCode, signal);
      return;
    }
    if (isContradiction(error)) {
      // Re-thrown untouched for `inspect` to classify — the important part is
      // that it is never mistaken for infrastructure and rejected on the final
      // attempt, which would write a verdict over an unexplained state.
      throw error;
    }
    if (this.isFinalAttempt(context.attemptNo) && !signal.aborted) {
      // The last attempt. Recording the outcome is the point: an aborted
      // attempt is excluded because the runtime has already decided this
      // attempt is over, and finalizing under a fired deadline would race the
      // lease.
      await this.reject(context.assetId, 'PROCESSING_RETRY_EXHAUSTED', signal);
      return;
    }
    throw toRetryableFailure('asset inspection', error);
  }

  private async reject(
    assetId: string,
    rejectionCode: AssetRejectionCode,
    signal: AbortSignal,
  ): Promise<void> {
    const cleanupPending = await this.cleanup.purgeForRejection(assetId, signal);
    const detail = encodeInspectionDetail(buildRejectedDetail({ rejectionCode, cleanupPending }));

    try {
      await this.transactions.runInTransaction(() =>
        this.repository.finalizeRejected({ assetId, rejectionCode, detail, at: new Date() }),
      );
    } catch (error: unknown) {
      if (isContradiction(error)) {
        throw error;
      }
      throw toRetryableFailure('asset rejection', error);
    }

    // The code is a closed-vocabulary value and the correlation fields are the
    // I02 allow-list; no key, filename, checksum or native message is present.
    const correlation = jobCorrelation.current();
    this.logger.log(
      JSON.stringify({
        event: 'asset.inspection.rejected',
        rejectionCode,
        cleanupPending,
        correlationId: correlation?.correlationId ?? 'unbound',
        attemptNo: correlation?.attemptNo ?? 0,
      }),
    );
  }

  /** Removes bytes an earlier attempt may have written, before rewriting them. */
  private async purgeRecoveredOutput(assetId: string, signal: AbortSignal): Promise<void> {
    const snapshot = await this.transactions.runInTransaction(
      () => this.repository.loadProcessingSnapshot(assetId),
      { readOnly: true },
    );
    this.cleanup.assertSafeToPurge(snapshot);
    await this.cleanup.purge(assetId, signal);
  }

  private async assertObjectsExist(keys: readonly string[], signal: AbortSignal): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.headObject({ bucket: 'DERIVATIVES', key }, signal);
      } catch (error: unknown) {
        if (isAbort(signal, error)) {
          throw abortFailure('replay verification');
        }
        const missing = isMissingObject(error);
        if (missing) {
          throw new WorkerJobError(
            'JOB_INVARIANT_VIOLATION',
            'An accepted derivative row points at an object that does not exist.',
          );
        }
        throw toRetryableFailure('replay verification', error);
      }
    }
  }

  private expectedKeys(assetId: string): Readonly<Record<CatalogDerivativeKind, string>> {
    return {
      THUMBNAIL: this.generation.derivativeKey(assetId, 'THUMBNAIL'),
      CATALOG_PREVIEW: this.generation.derivativeKey(assetId, 'CATALOG_PREVIEW'),
    };
  }

  /**
   * The last attempt this job will get, read from the validated `worker.runtime`
   * snapshot — never from a second copy of `maxAttempts`.
   */
  private isFinalAttempt(attemptNo: number): boolean {
    const policy = this.policies.current();
    if (policy === undefined) {
      // Unreachable: the poll loop will not claim without a policy. "Not final"
      // is the safe answer anyway — it retries rather than rejecting an asset
      // against a limit nobody configured.
      return false;
    }
    return attemptNo >= policy.maxAttempts;
  }
}

function stripKey(derivative: GeneratedDerivative): Omit<GeneratedDerivative, 'storageKey'> {
  const { storageKey: _storageKey, ...rest } = derivative;
  return rest;
}

function isMissingObject(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'OBJECT_NOT_FOUND'
  );
}
