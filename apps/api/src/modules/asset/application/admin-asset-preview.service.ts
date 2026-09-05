/**
 * Opens one processed derivative of one Admin asset (`APP12-V02-C2` §14).
 *
 * The authenticated sibling of `public-product-media.service` and
 * `admin-gallery-asset-preview.service`, and deliberately built the same way:
 * decide first against the database, open the object second, and let the
 * `ObjectStoragePort` be the only thing that reaches storage. There is no
 * second delivery implementation in this application.
 *
 * What differs from the public route is the question, not the permission. The
 * public route asks whether a *published product* still shows this image; this
 * one asks whether the asset is in the lane the operator named. That is why an
 * operator can see an image they have only just uploaded — before it is
 * attached to anything, which is exactly the moment the Admin library exists
 * for — without any published-state rule being widened.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ObjectStorageError,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import type { Readable } from 'node:stream';

import { assetIntakeError } from '../domain/asset-intake.errors';
import {
  ADMIN_PREVIEW_BUCKET,
  ADMIN_PREVIEW_CONTENT_TYPE,
  ADMIN_PREVIEW_DERIVATIVE_STATE,
  resolveAdminPreviewDerivativeKind,
  type AdminAssetPreviewRendition,
} from '../domain/admin-asset-preview.policy';
import { resolveAdminAssetLane, type AdminAssetScope } from '../domain/admin-asset-scope.policy';
import { OBJECT_STORAGE } from '../infrastructure/storage/object-storage.provider';
import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../domain/repositories/asset.repository';

export interface AdminAssetPreviewRequest {
  readonly assetId: string;
  readonly rendition: AdminAssetPreviewRendition;
  /** Omitted means `CATALOG`, the lane every delivered Admin consumer reads. */
  readonly scope: AdminAssetScope | undefined;
}

/**
 * The safe transport facts. No key, bucket, checksum, provider ETag or
 * last-modified date: the object's address stays on the server even for an
 * authenticated operator, because the Admin client has no use for it and
 * publishing it would put a storage locator into a browser.
 */
export interface AdminAssetPreviewStream {
  readonly body: Readable;
  readonly contentType: string;
  /** Omitted when the provider did not report a usable length. */
  readonly contentLengthBytes: number | undefined;
}

@Injectable()
export class AdminAssetPreviewService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async open(
    request: AdminAssetPreviewRequest,
    signal: AbortSignal,
  ): Promise<AdminAssetPreviewStream> {
    const assetId = request.assetId as AssetId;
    // Scoped in SQL to the named lane. An id belonging to another lane, to a
    // customer's private upload, or to nothing at all is absent identically, so
    // this route cannot be used to discover that any of them exists.
    const asset = await this.assets.findScoped(assetId, resolveAdminAssetLane(request.scope));
    if (asset === undefined || asset.deletedAt !== undefined) {
      throw assetIntakeError('ASSET_NOT_FOUND');
    }

    const kind = resolveAdminPreviewDerivativeKind(request.rendition);
    const derivative = (await this.assets.listDerivatives(assetId)).find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.status === ADMIN_PREVIEW_DERIVATIVE_STATE &&
        candidate.storageKey !== undefined,
    );
    if (derivative?.storageKey === undefined) {
      // Not-found rather than a "still processing" state: an asset mid-flight
      // has no bytes to show, and the list already carries the processing
      // status the operator reads. Two sources for one fact would drift.
      throw assetIntakeError('ASSET_NOT_FOUND');
    }

    const result = await this.openObject(derivative.storageKey, signal);
    return {
      body: result.body,
      // The derivative's own type. Never the parent asset's `mimeType`, which
      // describes the uploaded original and would mislabel these bytes.
      contentType: ADMIN_PREVIEW_CONTENT_TYPE,
      contentLengthBytes: usableLength(result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the row
   * resolved, so the database says this derivative is `READY` with a durable
   * key. An object that is nevertheless gone is a storage-side contradiction,
   * and answering 404 would tell an honest operator to stop asking for
   * something that should exist.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: ADMIN_PREVIEW_BUCKET, key: storageKey },
        signal,
      );
    } catch (error: unknown) {
      if (error instanceof ObjectStorageError && error.code === 'REQUEST_ABORTED') {
        // The client hung up while the object was being opened. There is no one
        // left to answer, so this propagates as the abort it is.
        throw error;
      }
      // The provider error carries the raw SDK failure as `cause`; it is
      // deliberately not attached, logged or serialised here.
      throw assetIntakeError('ASSET_STORAGE_UNAVAILABLE');
    }
  }
}

/**
 * The provider byte count for the exact object being streamed, when it is a
 * usable one. A zero or negative value is treated as absent rather than sent: a
 * wrong `Content-Length` truncates or hangs the response, while omitting it
 * merely falls back to chunked transfer.
 */
function usableLength(result: ObjectStreamResult): number | undefined {
  return Number.isFinite(result.sizeBytes) && result.sizeBytes > 0 ? result.sizeBytes : undefined;
}
