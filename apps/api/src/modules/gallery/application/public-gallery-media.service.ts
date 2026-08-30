/**
 * Public gallery-media delivery (`APP11-B03` §9).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The order is the security property — **no object-storage call happens until
 * the visibility query has already succeeded**, so a caller probing random
 * slugs or asset ids never reaches the provider and cannot use response timing
 * or provider load as an oracle.
 *
 * The service returns an open stream rather than bytes. Buffering the object to
 * hand back a `Buffer` would put a whole preview in the heap per concurrent
 * request and destroy the backpressure the transport depends on.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ObjectStorageError,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import type { Readable } from 'node:stream';

import { OBJECT_STORAGE } from '../../asset/infrastructure/storage/object-storage.provider';
import {
  PUBLIC_MEDIA_BUCKET,
  PUBLIC_MEDIA_CONTENT_TYPE,
  resolveDerivativeKind,
  type PublicGalleryMediaRendition,
} from '../domain/public-gallery-media.policy';
import {
  publicGalleryMediaError,
  publicGalleryMediaNotFound,
} from '../domain/public-gallery-media.errors';
import {
  PUBLIC_GALLERY_MEDIA_REPOSITORY,
  type PublicGalleryMediaRepository,
} from '../domain/repositories/public-gallery-media.repository';

export interface PublicGalleryMediaRequest {
  readonly slug: string;
  readonly assetId: string;
  readonly rendition: PublicGalleryMediaRendition;
}

/**
 * The safe transport facts. Deliberately no key, bucket, checksum, provider
 * ETag or last-modified date — the object identity stays on the server.
 */
export interface PublicGalleryMediaStream {
  readonly body: Readable;
  readonly contentType: string;
  /** Omitted when the provider did not report a usable length. */
  readonly contentLengthBytes: number | undefined;
}

@Injectable()
export class PublicGalleryMediaService {
  constructor(
    @Inject(PUBLIC_GALLERY_MEDIA_REPOSITORY)
    private readonly media: PublicGalleryMediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one public rendition.
   *
   * `signal` is the client connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with
   * it instead of streaming a response nobody is reading.
   */
  async open(
    request: PublicGalleryMediaRequest,
    signal: AbortSignal,
  ): Promise<PublicGalleryMediaStream> {
    const descriptor = await this.media.findDeliverable({
      slug: request.slug,
      assetId: request.assetId,
      derivativeKind: resolveDerivativeKind(request.rendition),
    });

    if (descriptor === undefined) {
      // Every visibility and eligibility miss arrives here identically, and
      // nothing about which one it was is recorded or returned.
      throw publicGalleryMediaNotFound();
    }

    const result = await this.openObject(descriptor.storageKey, signal);

    return {
      body: result.body,
      // The derivative own type, from the shared public-media policy — never
      // the parent asset `mime_type`, which describes the uploaded original.
      contentType: PUBLIC_MEDIA_CONTENT_TYPE,
      contentLengthBytes: usableLength(result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * public vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the
   * descriptor resolved, so the entry is published and the database says the
   * derivative is READY with a durable key. An object that is nevertheless gone
   * is a storage-side contradiction, and answering 404 would tell an honest
   * caller to stop asking for something that should exist.
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
      throw publicGalleryMediaError('PUBLIC_GALLERY_MEDIA_UNAVAILABLE');
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
