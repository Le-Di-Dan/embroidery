/**
 * One sweep pass: mark what is due, then remove what was marked
 * (`APP5-B02` §7).
 *
 * ### Why two phases and not one delete
 *
 * `deleted_at` on TBL-022 means "the binary is confirmed deleted" (ADR-DB1-011).
 * A single step that removed the object and the row together would have to pick
 * an order, and both orders lose on a crash: object-first leaves a row claiming
 * a binary that is gone, row-first leaves an object nothing references — which
 * is the orphan this job exists to prevent, produced by the job itself.
 * `DELETION_PENDING` is the durable intent between the two, and IDX-133 is the
 * index that finds it again after a crash.
 *
 * ### Why each object deletion is its own transaction
 *
 * The object store call sits **between** two database transactions, never
 * inside one. A provider stall inside a transaction pins a connection for the
 * length of a remote round trip; at batch size 100 that is how a slow bucket
 * becomes a database incident. The cost is that a crash between the call and
 * the write leaves a `DELETION_PENDING` row whose object is already gone — and
 * that is harmless, because `deleteObject` is idempotent and the next pass
 * simply repeats it.
 *
 * ### What this job does not claim
 *
 * It is not SE-014/SE-015. It sweeps exactly one lane — expired, unbound
 * `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` assets carrying an `intake_expires_at` —
 * because that is the lane `APP5-B02` created and is therefore responsible for.
 * Session assets, catalog media, production files and every other retention
 * obligation remain unimplemented.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import { WORKER_CLOCK, type WorkerClock } from '../../../runtime/clock/worker-clock';
import { INTAKE_CLEANUP_BATCH_SIZE } from '../domain/intake-cleanup.policy';
import {
  INTAKE_CLEANUP_REPOSITORY,
  type IntakeCleanupRepository,
} from '../domain/repositories/intake-cleanup.repository';

export interface IntakeCleanupOutcome {
  /** Rows moved to `DELETION_PENDING` this pass. */
  readonly marked: number;
  /** Rows whose binary was removed and which are now `DELETED`. */
  readonly removed: number;
  /** Rows whose object deletion failed and which stay pending for a later pass. */
  readonly deferred: number;
}

@Injectable()
export class IntakeCleanupUseCase {
  private readonly logger = new Logger(IntakeCleanupUseCase.name);

  constructor(
    private readonly transactions: TransactionManager,
    @Inject(INTAKE_CLEANUP_REPOSITORY) private readonly assets: IntakeCleanupRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(WORKER_CLOCK) private readonly clock: WorkerClock,
  ) {}

  async run(batchSize = INTAKE_CLEANUP_BATCH_SIZE): Promise<IntakeCleanupOutcome> {
    const marked = await this.transactions.runInTransaction(() =>
      this.assets.markExpiredForDeletion(new Date(this.clock.now()), batchSize),
    );

    // Read after marking, and not restricted to what this pass marked: a row
    // left pending by an earlier crash is exactly as due as one marked a
    // moment ago, and skipping it would strand its binary forever.
    const pending = await this.assets.listPendingDeletion(batchSize);

    let removed = 0;
    let deferred = 0;
    for (const asset of pending) {
      try {
        await this.storage.deleteObject({ bucket: 'ORIGINALS', key: asset.storageKey });
      } catch {
        // Deliberately not logged with the key: it is the internal storage
        // reference, and an operator log is not a place to publish one. The
        // row stays `DELETION_PENDING` and the next pass retries it.
        deferred += 1;
        continue;
      }
      await this.transactions.runInTransaction(() =>
        this.assets.markBinaryDeleted(asset.assetId, new Date(this.clock.now())),
      );
      removed += 1;
    }

    if (marked > 0 || removed > 0 || deferred > 0) {
      this.logger.log(
        `APP5 intake cleanup: marked ${String(marked)}, removed ${String(removed)}, ` +
          `deferred ${String(deferred)}.`,
      );
    }
    return { marked, removed, deferred };
  }
}
