/**
 * Controlled partial-output cleanup (APP2-W01 §12, §16).
 *
 * A crashed attempt can leave a complete THUMBNAIL and no preview, or a
 * multipart upload the store already completed. Those bytes are not evidence of
 * anything — no row points at them, and the next attempt is about to write the
 * same keys — so they are removed before replacement writes begin.
 *
 * The blast radius is one prefix: `{env}/derivatives/{assetId}/`. It is built
 * by the key helper, so it cannot be widened by a caller, and every listed key
 * is re-checked against it before a delete is issued. The original is never in
 * that prefix and is never touched — a rejected asset keeps its source binary.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { OBJECT_STORAGE } from '../../../storage/object-storage.provider';
import { contradiction } from '../domain/inspection-contradiction';
import type { ProcessingSnapshot } from '../domain/repositories/asset-inspection.repository';
import { DerivativeGenerationService } from './derivative-generation.service';
import { abortFailure, isAbort, toRetryableFailure } from './storage-failure';

@Injectable()
export class DerivativeCleanupService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly keys: DerivativeGenerationService,
  ) {}

  /**
   * Removes this asset's derivative objects and proves the prefix is empty.
   *
   * The emptiness check is not ceremony: `deleteObject` is idempotent and a
   * paginated listing can lag, so "I issued the deletes" is a weaker statement
   * than "nothing is there", and only the second one makes it safe to start
   * writing the same keys again.
   */
  async purge(assetId: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw abortFailure('derivative cleanup');
    }
    const prefix = this.keys.derivativePrefix(assetId);

    try {
      const listed = await this.storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix,
        signal,
      });
      for (const object of listed) {
        if (!object.key.startsWith(prefix)) {
          // A provider that returned a key outside the requested prefix is not
          // one this code will issue a delete against.
          throw contradiction('object listing returned a key outside the asset prefix');
        }
        await this.storage.deleteObject({ bucket: 'DERIVATIVES', key: object.key }, signal);
      }

      const remaining = await this.storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix,
        signal,
      });
      if (remaining.length > 0) {
        throw toRetryableFailure('derivative cleanup verification', undefined);
      }
    } catch (error: unknown) {
      if (isAbort(signal, error)) {
        throw abortFailure('derivative cleanup');
      }
      throw toRetryableFailure('derivative cleanup', error);
    }
  }

  /**
   * The §12 preconditions, read from a snapshot taken after the preparation
   * transaction committed.
   *
   * Both are about *not deleting evidence*: an asset that already has a
   * terminal inspection, or a READY derivative, has an effect somebody may
   * already be resolving.
   */
  assertSafeToPurge(snapshot: ProcessingSnapshot): void {
    if (snapshot.terminalInspectionCount > 0) {
      throw contradiction('cleanup would run against an asset that already has an inspection');
    }
    if (snapshot.derivatives.some((row) => row.status === 'READY')) {
      throw contradiction('cleanup would delete a READY derivative');
    }
  }

  /**
   * Best-effort cleanup for the rejection path.
   *
   * Returns whether cleanup is still outstanding. A rejection must be recorded
   * even when the store is unreachable — the verdict about the file is already
   * decided, and holding it hostage to a storage outage would leave the asset
   * stuck in `INSPECTING` while it retried something that changes nothing.
   * `cleanupPending: true` is how the record says bytes may remain.
   */
  async purgeForRejection(assetId: string, signal: AbortSignal): Promise<boolean> {
    try {
      await this.purge(assetId, signal);
      return false;
    } catch {
      return true;
    }
  }
}
