/**
 * Admin Side-background delivery (`APP3-B02A` §4/§9).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The order is the security property — **no object-storage call happens until
 * the contextual query has already succeeded** — and it matters even for an
 * authenticated caller: an operator probing ids must not be able to use provider
 * load or response timing to learn which Sides exist under another Product.
 *
 * The service returns an open stream rather than bytes. Buffering the object to
 * hand back a `Buffer` would put a whole editor background in the heap per
 * concurrent request and destroy the backpressure the transport depends on.
 *
 * ## Relationship to `PublicSideBackgroundService`
 *
 * The two are deliberately separate classes with the same invariants:
 * resolve-then-open, the provider count must equal the persisted `byte_size`,
 * a contradiction destroys the stream before refusing, and the `Content-Type` is
 * the derivative's persisted `media_type` and never the parent Asset's.
 *
 * They are not merged into a shared helper because the `APP3-B02` gate asserts
 * those invariants against the *body* of its own service, and extracting them
 * would move the code out from under an accepted checkpoint's gate. Parity is
 * kept structurally instead: every media-resolution constant comes from one
 * shared policy, and the `APP3-B02A` gate asserts the same four invariants here.
 * What legitimately differs — publication predicates and the error vocabulary —
 * is exactly what would have had to be parameterised anyway.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ObjectStorageError,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import type { Readable } from 'node:stream';

import { OBJECT_STORAGE } from '../../asset/infrastructure/storage/object-storage.provider';
import { ADMIN_SIDE_BACKGROUND_BUCKET } from '../domain/admin-side-background.policy';
import {
  adminSideBackgroundError,
  adminSideBackgroundNotFound,
} from '../domain/admin-side-background.errors';
import {
  ADMIN_SIDE_BACKGROUND_REPOSITORY,
  type AdminSideBackgroundDescriptor,
  type AdminSideBackgroundRepository,
} from '../domain/repositories/admin-side-background.repository';

export interface AdminSideBackgroundRequest {
  readonly productId: string;
  readonly sideId: string;
}

/**
 * The safe transport facts. Deliberately no key, bucket, checksum, provider
 * ETag or last-modified date — the object's identity stays on the server.
 */
export interface AdminSideBackgroundStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLengthBytes: number;
}

@Injectable()
export class AdminSideBackgroundService {
  constructor(
    @Inject(ADMIN_SIDE_BACKGROUND_REPOSITORY)
    private readonly backgrounds: AdminSideBackgroundRepository,
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
    request: AdminSideBackgroundRequest,
    signal: AbortSignal,
  ): Promise<AdminSideBackgroundStream> {
    const descriptor = await this.backgrounds.findDeliverable({
      productId: request.productId,
      sideId: request.sideId,
    });

    if (descriptor === undefined) {
      // Unknown Product, unknown Side, a Side of another Product, no background
      // association, a withdrawn Asset and an unready derivative all arrive here
      // identically, and nothing about which one it was is recorded or returned.
      throw adminSideBackgroundNotFound();
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
   * vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the
   * descriptor resolved, so the database says the derivative is READY with a
   * durable key. An object that is nevertheless gone is a storage-side
   * contradiction, and answering 404 would tell the operator their placement is
   * misconfigured when it is not.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: ADMIN_SIDE_BACKGROUND_BUCKET, key: storageKey },
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
      throw adminSideBackgroundError('ADMIN_SIDE_BACKGROUND_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * Two independent statements exist about the same object since `APP3-DB01`
   * added the quartet, and where two authorities disagree the honest answer is
   * to send neither: the provider's length would contradict the dimensions the
   * placement model already reported, and the persisted length would truncate or
   * hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into a request that was abandoned.
   */
  private reconcileLength(
    descriptor: AdminSideBackgroundDescriptor,
    result: ObjectStreamResult,
  ): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== descriptor.byteSize
    ) {
      result.body.destroy();
      throw adminSideBackgroundError('ADMIN_SIDE_BACKGROUND_UNAVAILABLE');
    }
    return descriptor.byteSize;
  }
}
