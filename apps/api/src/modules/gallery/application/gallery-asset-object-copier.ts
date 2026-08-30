/**
 * Object preparation for a derived Gallery asset (`APP11-B03A` §6, §7).
 *
 * Split out of the use case because it is the half that cannot be rolled back
 * by the database, and a reviewer needs to read the ordering on its own: every
 * object exists **before** a single row is written, and the compensation that
 * removes them is the only thing standing between a failed request and a
 * public asset pointing at nothing.
 *
 * Three properties are the whole design:
 *
 * - **Independent keys.** Every key is built from the *derived* asset's freshly
 *   allocated UUIDv7, so the two assets share no object. `uq_assets__storage_key`
 *   says two rows must never claim one binary, and tombstoning either asset must
 *   not be able to delete bytes the other still serves.
 * - **Provider-side copy.** `copyObject` never brings the bytes into this
 *   process, so the destination is byte-identical by construction — which is
 *   what makes it honest to carry the source's checksum onto the copy and to
 *   record the copy as already inspected.
 * - **Delete-everything compensation.** `discard` deletes every *planned* key,
 *   not the subset a caller believes was written. `deleteObject` is idempotent
 *   by port contract, so removing a key that was never created is a success —
 *   and a compensation that had to track partial progress is a compensation
 *   that can be wrong about it.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildDerivativeObjectKey,
  buildOriginalObjectKey,
  type ObjectReference,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';
import type { AssetDerivativeKind } from '@embroidery/database';

import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../asset/infrastructure/storage/object-storage.provider';
import { galleryAssetPreparationError } from '../domain/gallery-asset-preparation.errors';
import {
  PREPARATION_ORIGINALS_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CONTENT_TYPE,
} from '../domain/gallery-asset-preparation.policy';

/** One object to copy: where it is, where it goes, and what it will declare. */
export interface PlannedObjectCopy {
  readonly source: ObjectReference;
  readonly destination: ObjectReference;
  readonly contentType: string;
}

export interface PlannedDerivativeCopy extends PlannedObjectCopy {
  readonly kind: AssetDerivativeKind;
}

export interface GalleryAssetCopyPlan {
  readonly derivedAssetId: string;
  readonly original: PlannedObjectCopy;
  readonly derivatives: readonly PlannedDerivativeCopy[];
}

/** What the caller knows about one source derivative before any copy happens. */
export interface SourceDerivativeObject {
  readonly kind: AssetDerivativeKind;
  readonly storageKey: string;
}

@Injectable()
export class GalleryAssetObjectCopier {
  private readonly logger = new Logger(GalleryAssetObjectCopier.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /**
   * Builds every destination key up front, before anything is copied.
   *
   * Planning first is what lets compensation be exhaustive: the plan is the
   * complete set of objects this request could possibly have created, so
   * discarding it cannot miss one.
   */
  plan(input: {
    readonly derivedAssetId: string;
    readonly sourceOriginalKey: string;
    readonly sourceMimeType: string;
    readonly sourceDerivatives: readonly SourceDerivativeObject[];
  }): GalleryAssetCopyPlan {
    const environment = this.environment as ObjectStorageEnvironment;
    return {
      derivedAssetId: input.derivedAssetId,
      original: {
        source: { bucket: PREPARATION_ORIGINALS_BUCKET, key: input.sourceOriginalKey },
        destination: {
          bucket: PREPARATION_ORIGINALS_BUCKET,
          // The original's extension follows the *asset's* declared type, which
          // is the uploaded format — not the WebP the derivatives carry.
          key: buildOriginalObjectKey({
            environment,
            assetId: input.derivedAssetId,
            contentType: input.sourceMimeType,
          }),
        },
        contentType: input.sourceMimeType,
      },
      derivatives: input.sourceDerivatives.map((derivative) => ({
        kind: derivative.kind,
        source: { bucket: PUBLIC_MEDIA_BUCKET, key: derivative.storageKey },
        destination: {
          bucket: PUBLIC_MEDIA_BUCKET,
          key: buildDerivativeObjectKey({
            environment,
            assetId: input.derivedAssetId,
            contentType: PUBLIC_MEDIA_CONTENT_TYPE,
            derivativeKind: derivative.kind,
          }),
        },
        contentType: PUBLIC_MEDIA_CONTENT_TYPE,
      })),
    };
  }

  /**
   * Copies every planned object, sequentially.
   *
   * Sequential rather than concurrent on purpose: three provider round trips
   * cost less than the failure mode a `Promise.all` invites, where one
   * rejection leaves the others in flight and the caller compensates against
   * objects that are still being written.
   *
   * Any provider failure surfaces as the single storage code. The caller
   * compensates; nothing here decides that, because a copier that cleaned up
   * after itself would also clean up after a caller that had already succeeded.
   */
  async copy(plan: GalleryAssetCopyPlan, signal?: AbortSignal): Promise<void> {
    for (const object of [plan.original, ...plan.derivatives]) {
      try {
        await this.storage.copyObject({
          source: object.source,
          destination: object.destination,
          contentType: object.contentType,
          ...(signal === undefined ? {} : { signal }),
        });
      } catch {
        // The provider error carries the raw SDK failure as `cause`; it is
        // deliberately not attached, logged or serialised.
        throw galleryAssetPreparationError('GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE');
      }
    }
  }

  /**
   * Removes every object the plan could have created.
   *
   * Never throws. It runs on a path that is already failing, and the caller's
   * original error is the one worth reporting — replacing it with a cleanup
   * failure would tell the operator that storage is unavailable when the real
   * refusal was a stale version. A cleanup that could not finish is logged with
   * the derived asset id alone: a surrogate key, never a bucket, a storage key
   * or a provider message.
   */
  async discard(plan: GalleryAssetCopyPlan): Promise<void> {
    for (const object of [plan.original, ...plan.derivatives]) {
      try {
        await this.storage.deleteObject(object.destination);
      } catch {
        this.logger.warn(
          `Could not remove a prepared object for gallery asset ${plan.derivedAssetId}; ` +
            'no gallery asset row was written for it.',
        );
      }
    }
  }
}
