/**
 * Public Side-background delivery (`APP3-B02` §4/§5).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The order is the security property — **no object-storage call happens until
 * the contextual query has already succeeded**, so a caller probing random slugs
 * or side codes never reaches the provider and cannot use response timing or
 * provider load as an oracle.
 *
 * The service returns an open stream rather than bytes. Buffering the object to
 * hand back a `Buffer` would put a whole editor background in the heap per
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
import { PUBLIC_SIDE_BACKGROUND_BUCKET } from '../domain/public-side-background.policy';
import {
  publicSideBackgroundError,
  publicSideBackgroundNotFound,
} from '../domain/public-side-background.errors';
import {
  PUBLIC_SIDE_BACKGROUND_REPOSITORY,
  type PublicSideBackgroundDescriptor,
  type PublicSideBackgroundRepository,
} from '../domain/repositories/public-side-background.repository';

export interface PublicSideBackgroundRequest {
  readonly slug: string;
  readonly sideCode: string;
}

/**
 * The safe transport facts. Deliberately no key, bucket, checksum, provider
 * ETag or last-modified date — the object's identity stays on the server.
 */
export interface PublicSideBackgroundStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLengthBytes: number;
}

@Injectable()
export class PublicSideBackgroundService {
  constructor(
    @Inject(PUBLIC_SIDE_BACKGROUND_REPOSITORY)
    private readonly backgrounds: PublicSideBackgroundRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one Side background.
   *
   * `signal` is the client's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with
   * it instead of streaming a response nobody is reading.
   */
  async open(
    request: PublicSideBackgroundRequest,
    signal: AbortSignal,
  ): Promise<PublicSideBackgroundStream> {
    const descriptor = await this.backgrounds.findDeliverable({
      slug: request.slug,
      sideCode: request.sideCode,
    });

    if (descriptor === undefined) {
      // Every visibility and eligibility miss arrives here identically, and
      // nothing about which one it was is recorded or returned.
      throw publicSideBackgroundNotFound();
    }

    const result = await this.openObject(descriptor.storageKey, signal);

    return {
      body: result.body,
      // The derivative's **persisted** type, which the worker measured from the
      // bytes it actually wrote — never the parent Asset's `mime_type`, which
      // describes the uploaded original.
      contentType: descriptor.mediaType,
      contentLengthBytes: this.reconcileLength(descriptor, result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * public vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the
   * descriptor resolved, so the Product is public and the database says the
   * derivative is READY with a durable key. An object that is nevertheless gone
   * is a storage-side contradiction, and answering 404 would tell an honest
   * caller to stop asking for something that should exist.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: PUBLIC_SIDE_BACKGROUND_BUCKET, key: storageKey },
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
      throw publicSideBackgroundError('PUBLIC_SIDE_BACKGROUND_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * `APP2-T01` could only ever trust the provider, because `asset_derivatives`
   * carried no size column then. `APP3-DB01` added the quartet, so there are now
   * two independent statements about the same object — and where two
   * authorities disagree, the honest answer is to send neither. Streaming with
   * the provider's length would contradict the manifest a Studio already read;
   * streaming with the persisted length would truncate or hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into a request that was abandoned.
   */
  private reconcileLength(
    descriptor: PublicSideBackgroundDescriptor,
    result: ObjectStreamResult,
  ): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== descriptor.byteSize
    ) {
      result.body.destroy();
      throw publicSideBackgroundError('PUBLIC_SIDE_BACKGROUND_UNAVAILABLE');
    }
    return descriptor.byteSize;
  }
}
