/**
 * Admin gallery-asset preview (`APP11-B03A` §11).
 *
 * The authenticated counterpart of `public-gallery-media.service.ts`, and
 * deliberately its twin: the same rendition vocabulary, the same derivative
 * resolver, the same transport constants, the same storage port, the same
 * "decide first, open second" ordering. What differs is only the question being
 * answered — the public route asks whether a *published entry* still shows this
 * image, this one asks whether the asset is in the gallery lane at all.
 *
 * That difference is why an operator can preview an image **before** attaching
 * it to anything. It is not a widening of the public rule: this route is behind
 * `AuthenticatedAdminGuard`, it serves only the `GALLERY_MEDIA` / `PUBLIC`
 * lane, and it serves exactly the two renditions the public route would serve —
 * nothing here can open a private original, a customer upload or a catalog
 * asset's objects.
 *
 * No second delivery implementation: the resolution reuses the Asset ports and
 * the streaming reuses `ObjectStoragePort`, so there is one way bytes leave
 * this application.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ObjectStorageError,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import type { Readable } from 'node:stream';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { OBJECT_STORAGE } from '../../asset/infrastructure/storage/object-storage.provider';
import { galleryAssetPreparationError } from '../domain/gallery-asset-preparation.errors';
import {
  PREPARED_DERIVATIVE_STATE,
  PREPARED_DERIVATIVE_WATERMARKED,
  PREPARED_GALLERY_LANE,
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CONTENT_TYPE,
} from '../domain/gallery-asset-preparation.policy';
import {
  resolveDerivativeKind,
  type PublicGalleryMediaRendition,
} from '../domain/public-gallery-media.policy';

export interface AdminGalleryAssetPreviewRequest {
  readonly assetId: string;
  readonly rendition: PublicGalleryMediaRendition;
}

/**
 * The safe transport facts. Deliberately no key, bucket, checksum, provider
 * ETag or last-modified date — the object identity stays on the server even for
 * an authenticated operator, because the Admin client has no use for it and
 * publishing it would put a storage address in a browser.
 */
export interface AdminGalleryAssetPreviewStream {
  readonly body: Readable;
  readonly contentType: string;
  /** Omitted when the provider did not report a usable length. */
  readonly contentLengthBytes: number | undefined;
}

@Injectable()
export class AdminGalleryAssetPreviewService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async open(
    request: AdminGalleryAssetPreviewRequest,
    signal: AbortSignal,
  ): Promise<AdminGalleryAssetPreviewStream> {
    const assetId = request.assetId as AssetId;
    // Scoped to the gallery lane in SQL. An id naming a catalog asset, a
    // customer upload or nothing at all is absent identically, so this route
    // cannot be used to discover that any of them exists.
    const asset = await this.assets.findScoped(assetId, PREPARED_GALLERY_LANE);
    if (asset === undefined || asset.deletedAt !== undefined) {
      throw galleryAssetPreparationError('GALLERY_ASSET_NOT_FOUND');
    }

    const kind = resolveDerivativeKind(request.rendition);
    const derivative = (await this.assets.listDerivatives(assetId)).find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.status === PREPARED_DERIVATIVE_STATE &&
        candidate.isWatermarked === PREPARED_DERIVATIVE_WATERMARKED &&
        candidate.storageKey !== undefined,
    );
    if (derivative?.storageKey === undefined) {
      throw galleryAssetPreparationError('GALLERY_ASSET_NOT_FOUND');
    }

    const result = await this.openObject(derivative.storageKey, signal);
    return {
      body: result.body,
      // The derivative's own type, from the shared public-media policy — never
      // the parent asset's `mimeType`, which describes the uploaded original.
      contentType: PUBLIC_MEDIA_CONTENT_TYPE,
      contentLengthBytes: usableLength(result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the row
   * resolved, so the database says the derivative is `READY` with a durable
   * key. An object that is nevertheless gone is a storage-side contradiction,
   * and answering 404 would tell an honest operator to stop asking for
   * something that should exist.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: PUBLIC_MEDIA_BUCKET, key: storageKey },
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
      throw galleryAssetPreparationError('GALLERY_ASSET_PREPARATION_STORAGE_UNAVAILABLE');
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
