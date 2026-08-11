/**
 * Design Session asset delivery (`APP3-B06C`, `IMP-D044` PO-06 class 3).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The **order** is the security property. No object-storage call happens until
 * every term of the authorization has already succeeded, so a caller probing
 * Asset ids never reaches the provider and cannot use response timing or provider
 * load as an existence oracle. Object storage is not an authorization system and
 * is never asked to behave like one.
 *
 * By the time this service runs, the Session half is already proved: the read
 * guard verified the id+secret pair and attached the authorized context. What is
 * left is the contextual half — that this exact Session owns this exact Asset,
 * through the durable `DESIGN_SESSION_ASSET` association, and that the Asset
 * carries a deliverable editor-safe derivative. One statement decides all of it.
 *
 * A stream is returned rather than bytes: buffering the object would put a whole
 * customer upload in the heap per concurrent request and destroy the backpressure
 * the transport depends on.
 *
 * ## What this service deliberately does not require
 *
 * It does **not** require the Session's current Design Document to reference the
 * Asset. `APP3-S06` must upload an image and then preview it *before* it can
 * place it, so a document-membership rule would make the upload → preview → place
 * workflow circular. `APP3-B05A` does carry such a rule, and correctly: a
 * published Template Version is frozen, so its document *is* the grant. A Session
 * document is a live draft, so it is not.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ObjectStorageError,
  type ObjectStoragePort,
  type ObjectStreamResult,
} from '@embroidery/object-storage';
import type { Readable } from 'node:stream';

import { OBJECT_STORAGE } from '../../asset/infrastructure/storage/object-storage.provider';
import { SESSION_ASSET_BUCKET } from '../domain/design-session-asset-delivery.policy';
import {
  designSessionAssetError,
  designSessionAssetNotFound,
} from '../domain/design-session-asset-delivery.errors';
import {
  DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY,
  type DesignSessionAssetDeliveryRepository,
  type SessionAssetCandidate,
  type SessionAssetLookup,
} from '../domain/repositories/design-session-asset-delivery.repository';

/**
 * The safe transport facts. Deliberately no storage key, bucket, checksum,
 * provider ETag, derivative id, dimensions or parent-Asset metadata — the
 * object's identity stays on the server.
 */
export interface SessionAssetStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLengthBytes: number;
}

@Injectable()
export class DesignSessionAssetDeliveryService {
  constructor(
    @Inject(DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY)
    private readonly candidates: DesignSessionAssetDeliveryRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one Session-owned editor preview.
   *
   * `signal` is the client's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with it
   * rather than streaming a response nobody is reading.
   */
  async open(lookup: SessionAssetLookup, signal: AbortSignal): Promise<SessionAssetStream> {
    const candidate = await this.candidates.findDeliverableCandidate(lookup);
    if (candidate === undefined) {
      // Association, ownership, lane, inspection verdict, tombstone, derivative
      // readiness, watermark and quartet misses all arrive here identically.
      throw designSessionAssetNotFound();
    }

    const result = await this.openObject(candidate.storageKey, signal);

    return {
      body: result.body,
      // The derivative's **persisted** type, which a worker measured from the
      // bytes it actually wrote — never the parent Asset's `mime_type`, which
      // describes the uploaded original nobody may see.
      contentType: candidate.mediaType,
      contentLengthBytes: this.reconcileLength(candidate, result),
    };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the whole
   * authorization already succeeded, so the association exists and the database
   * says the derivative is `READY` with a durable key. An object that is
   * nevertheless gone is a storage-side contradiction, and a 404 would tell a
   * customer their own upload no longer exists.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: SESSION_ASSET_BUCKET, key: storageKey },
        signal,
      );
    } catch (error: unknown) {
      if (error instanceof ObjectStorageError && error.code === 'REQUEST_ABORTED') {
        // The client hung up while the object was being opened. There is nobody
        // left to answer, so this propagates as the abort it is rather than being
        // dressed up as a server fault.
        throw error;
      }
      // The provider error carries the raw SDK failure as `cause`; it is
      // deliberately not attached, logged or serialised here.
      throw designSessionAssetError('DESIGN_SESSION_ASSET_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * Two independent authorities describe the same bytes — the provider's count
   * and `asset_derivatives.byte_size` — and where they disagree the honest answer
   * is to send neither. Streaming at the provider's length would contradict the
   * canonical metadata `APP3-P01` validated the document against; streaming at
   * the persisted length would truncate or hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into an abandoned request. The
   * persisted value is never repaired from provider state: a read that corrected
   * the database would let storage rewrite canonical metadata.
   */
  private reconcileLength(candidate: SessionAssetCandidate, result: ObjectStreamResult): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== candidate.byteSize
    ) {
      result.body.destroy();
      throw designSessionAssetError('DESIGN_SESSION_ASSET_UNAVAILABLE');
    }
    return candidate.byteSize;
  }
}
