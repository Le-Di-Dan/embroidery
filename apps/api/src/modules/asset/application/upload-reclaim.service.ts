/**
 * Expired-allocation reclaim and its cleanup ordering (`ADR-APP2-001` §4.2f-4).
 *
 * An allocation whose 15-minute lease elapsed may be taken over, but taking it
 * over is not the same as starting fresh: the asset id and the object key are
 * preserved, so at most one identity ever exists for one idempotency key. Only
 * the `claimToken` rotates, which is what makes the previous owner harmless
 * rather than merely late.
 *
 * The ordering below is the whole point of `STORAGE-BLK-03`. Cleanup runs to
 * completion **before** any replacement byte is streamed, and never after — a
 * delete issued after a replacement upload started would delete the
 * replacement. Cleanup failure is not "carry on anyway": nothing is accepted,
 * and the renewed allocation is left to expire for another attempt.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdempotencyAllocationStore, TransactionManager } from '@embroidery/persistence';
import type { IdempotencyKey } from '@embroidery/persistence';
import { buildAssetPrefix, type ObjectStoragePort } from '@embroidery/object-storage';

import { assetIntakeError } from '../domain/asset-intake.errors';
import { ALLOCATION_TTL_MS } from '../domain/asset-intake.policy';
import { decodeAllocation, type AssetUploadAllocation } from '../domain/upload-result.codec';

@Injectable()
export class UploadReclaimService {
  private readonly logger = new Logger(UploadReclaimService.name);

  constructor(
    private readonly transactions: TransactionManager,
    private readonly allocations: IdempotencyAllocationStore,
  ) {}

  /**
   * Rotates the claim token on an expired allocation, or reports that another
   * reclaimer won.
   *
   * The row lock is taken first and the rotation is additionally predicated on
   * the token that was read under it, so the loser of the race updates nothing
   * even if it somehow reached the write.
   */
  async reclaimExpired(
    key: IdempotencyKey,
    storedResult: unknown,
  ): Promise<AssetUploadAllocation | 'lost'> {
    const previous = decodeAllocation(storedResult);
    const renewed: AssetUploadAllocation = { ...previous, claimToken: randomUUID() };

    const won = await this.transactions.runInTransaction(async () => {
      const locked = await this.allocations.lockForUpdate(key);
      if (locked === undefined || locked.status !== 'IN_PROGRESS' || !locked.expired) {
        return false;
      }
      if (locked.fingerprint !== key.fingerprint) {
        throw assetIntakeError('IDEMPOTENCY_CONFLICT');
      }
      // Re-decoded under the lock: the value read before the lock may already
      // belong to a reclaimer that committed in between.
      const current = decodeAllocation(locked.result);
      if (current.claimToken !== previous.claimToken) {
        return false;
      }
      return this.allocations.renewExpiredClaim({
        key,
        previousClaimToken: previous.claimToken,
        result: renewed,
        ttlMs: ALLOCATION_TTL_MS,
      });
    });

    return won ? renewed : 'lost';
  }

  /**
   * Removes everything the abandoned attempt may have left behind, and proves
   * it is gone, before the caller is allowed to stream a replacement.
   *
   * Only ever called when the durable asset row is **absent**. An existing
   * asset is never cleaned up — its original and derivatives are live data.
   */
  async cleanupAbandonedObjects(input: {
    readonly storage: ObjectStoragePort;
    readonly environment: string;
    readonly allocation: AssetUploadAllocation;
    readonly signal: AbortSignal;
  }): Promise<void> {
    const { storage, environment, allocation, signal } = input;
    const assetId = allocation.assetId;

    const originalsPrefix = buildAssetPrefix({
      environment: environment as 'development' | 'test' | 'production',
      scope: 'originals',
      assetId,
    });
    const derivativesPrefix = buildAssetPrefix({
      environment: environment as 'development' | 'test' | 'production',
      scope: 'derivatives',
      assetId,
    });

    try {
      // `deleteObject` is idempotent by port contract, so a retried cleanup
      // never fails on its own earlier progress.
      await storage.deleteObject({ bucket: 'ORIGINALS', key: allocation.objectKey }, signal);

      // Only this asset's derivative prefix — never a broader sweep. APP2 has
      // no derivative writer yet, but a reclaim must not depend on that.
      const derivatives = await storage.listObjectsByPrefix({
        bucket: 'DERIVATIVES',
        prefix: derivativesPrefix,
        signal,
      });
      for (const object of derivatives) {
        await storage.deleteObject({ bucket: 'DERIVATIVES', key: object.key }, signal);
      }

      const [remainingOriginals, remainingDerivatives] = await Promise.all([
        storage.listObjectsByPrefix({ bucket: 'ORIGINALS', prefix: originalsPrefix, signal }),
        storage.listObjectsByPrefix({ bucket: 'DERIVATIVES', prefix: derivativesPrefix, signal }),
      ]);
      if (remainingOriginals.length > 0 || remainingDerivatives.length > 0) {
        // Asserted, not assumed: proceeding with a half-cleaned prefix is how a
        // replacement ends up alongside the object it was meant to replace.
        throw assetIntakeError('ASSET_STORAGE_UNAVAILABLE');
      }
    } catch (error: unknown) {
      // The asset id is a non-secret surrogate key; no bucket, endpoint,
      // credential or provider message is recorded.
      this.logger.warn(`Reclaim cleanup failed for asset ${assetId}; no replacement accepted.`);
      throw error instanceof Error && 'code' in error
        ? error
        : assetIntakeError('ASSET_STORAGE_UNAVAILABLE');
    }
  }

  /**
   * Confirms this attempt still owns the allocation after cleanup finished.
   *
   * Cleanup involves several network round-trips, which is exactly the window
   * in which a second reclaim could have taken over. Streaming without this
   * re-check would write a replacement into an allocation someone else owns.
   */
  async assertStillOwned(key: IdempotencyKey, allocation: AssetUploadAllocation): Promise<void> {
    const locked = await this.transactions.runInTransaction(() =>
      this.allocations.lockForUpdate(key),
    );
    if (locked === undefined || locked.status !== 'IN_PROGRESS') {
      throw assetIntakeError('STALE_UPLOAD_CLAIM');
    }
    const current = (locked.result as { claimToken?: unknown } | null)?.claimToken;
    if (current !== allocation.claimToken) {
      throw assetIntakeError('STALE_UPLOAD_CLAIM');
    }
  }
}
