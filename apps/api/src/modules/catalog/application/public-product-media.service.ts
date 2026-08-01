/**
 * Public catalog-media delivery (`APP2-T01`).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The order is the security property — **no object-storage call happens until
 * the visibility query has already succeeded**, so a caller probing random
 * slugs or association ids never reaches the provider and cannot use response
 * timing or provider load as an oracle.
 *
 * The service returns an open stream rather than bytes. Buffering the object to
 * hand back a `Buffer` would put a whole catalog preview in the heap per
 * concurrent request and destroy the backpressure the transport depends on.
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
  resolveRequiredMediaRole,
  type PublicProductMediaRendition,
} from '../domain/public-product-media.policy';
import {
  publicProductMediaError,
  publicProductMediaNotFound,
} from '../domain/public-product-media.errors';
import {
  PUBLIC_PRODUCT_MEDIA_REPOSITORY,
  type PublicProductMediaRepository,
} from '../domain/repositories/public-product-media.repository';

export interface PublicProductMediaRequest {
  readonly slug: string;
  readonly productMediaId: string;
  readonly rendition: PublicProductMediaRendition;
}

/**
 * The safe transport facts. Deliberately no key, bucket, checksum, provider
 * ETag or last-modified date — the object's identity stays on the server.
 */
export interface PublicProductMediaStream {
  readonly body: Readable;
  readonly contentType: string;
  /** Omitted when the provider did not report a usable length. */
  readonly contentLengthBytes: number | undefined;
}

@Injectable()
export class PublicProductMediaService {
  constructor(
    @Inject(PUBLIC_PRODUCT_MEDIA_REPOSITORY)
    private readonly media: PublicProductMediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one public rendition.
   *
   * `signal` is the client's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with
   * it instead of streaming a response nobody is reading.
   */
  async open(
    request: PublicProductMediaRequest,
    signal: AbortSignal,
  ): Promise<PublicProductMediaStream> {
    const descriptor = await this.media.findDeliverable({
      slug: request.slug,
      productMediaId: request.productMediaId,
      derivativeKind: resolveDerivativeKind(request.rendition),
      requiredRole: resolveRequiredMediaRole(request.rendition),
    });

    if (descriptor === undefined) {
      // Every visibility and eligibility miss arrives here identically, and
      // nothing about which one it was is recorded or returned.
      throw publicProductMediaNotFound();
    }

    const result = await this.openObject(descriptor.storageKey, signal);

    return {
      body: result.body,
      // The derivative's own type, from the delivery policy — never the parent
      // asset's `mime_type`, which describes the uploaded original.
      contentType: PUBLIC_MEDIA_CONTENT_TYPE,
      contentLengthBytes: usableLength(result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * public vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the
   * descriptor resolved, so the product is public and the database says the
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
        // left to answer, so this propagates as the abort it is rather than
        // being dressed up as a server fault.
        throw error;
      }
      // The provider error carries the raw SDK failure as `cause`; it is
      // deliberately not attached, logged or serialised here.
      throw publicProductMediaError('PUBLIC_PRODUCT_MEDIA_UNAVAILABLE');
    }
  }
}

/**
 * The provider's byte count for the exact object being streamed, when it is a
 * usable one.
 *
 * `asset_derivatives` carries no size column, so this is the only authoritative
 * length available — and it is authoritative for the transport, being the
 * length of the very bytes about to be written. A zero or negative value is
 * treated as absent rather than sent: a wrong `Content-Length` truncates or
 * hangs the response, while omitting it merely falls back to chunked transfer.
 */
function usableLength(result: ObjectStreamResult): number | undefined {
  return Number.isFinite(result.sizeBytes) && result.sizeBytes > 0 ? result.sizeBytes : undefined;
}
