/**
 * The object half of an evidence upload: allocate an identity, stream the bytes,
 * remove an object nothing will ever point at (`APP7-B05` §7, §9, §25).
 *
 * Split from {@link UploadTransferEvidenceService} by responsibility rather than
 * by line count: that service owns the *order* of a request — parse, authorize,
 * claim, stream, commit — and this owns everything that touches object storage.
 * The separation is what lets the orchestration read as the sequence it is, and
 * it puts every storage call this checkpoint makes in one small file.
 *
 * ### Storage identity is server-owned, without exception
 *
 * The asset id is a fresh UUIDv7, the object key is derived from that id and the
 * **validated** media type, and the association id is allocated here too so a
 * crash-retry that recovers the allocation writes the same association row
 * instead of a second one. Nothing in either is derived from the caller's
 * filename, and the contract has no field for a key, a bucket or a URL.
 *
 * ### No presign, and one bucket
 *
 * `ObjectStoragePort` offers no presign operation to reach for. The bytes go
 * browser → API → private bucket in one pass, and there is no second call for a
 * client to "complete" an upload with (`IMP-D048` PO-01).
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import { newId } from '@embroidery/database';
import {
  buildOriginalObjectKey,
  type ObjectStorageEnvironment,
  type ObjectStoragePort,
} from '@embroidery/object-storage';

import { assetIntakeError, isAssetIntakeError } from '../../../asset/domain/asset-intake.errors';
import type { AcceptedMediaType } from '../../../asset/domain/asset-intake.policy';
import { buildContentFingerprint } from '../../../asset/domain/intake-fingerprints';
import { consumeValidatedFile } from '../../../asset/infrastructure/http/validated-file.reader';
import {
  OBJECT_STORAGE,
  OBJECT_STORAGE_ENVIRONMENT,
} from '../../../asset/infrastructure/storage/object-storage.provider';
import {
  decodeTransferEvidenceAllocation,
  TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION,
  type TransferEvidenceAllocation,
} from '../../domain/evidence/transfer-evidence-result.codec';
import { PAYMENT_EVIDENCE_INTAKE_LANE } from '../../domain/evidence/transfer-evidence.policy';
import type { TransferEvidenceFacts } from './transfer-evidence-transactions.service';

@Injectable()
export class TransferEvidenceObjectWriter {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(OBJECT_STORAGE_ENVIRONMENT) private readonly environment: string,
  ) {}

  /** A fresh, application-owned identity: two UUIDv7 ids, a derived key, a token. */
  allocate(declared: AcceptedMediaType): TransferEvidenceAllocation {
    const assetId = newId();
    return decodeTransferEvidenceAllocation({
      schemaVersion: TRANSFER_EVIDENCE_RESULT_SCHEMA_VERSION,
      kind: 'PAYMENT_TRANSFER_EVIDENCE_ALLOCATION',
      assetId,
      evidenceId: newId(),
      bucketAlias: 'ORIGINALS',
      objectKey: buildOriginalObjectKey({
        environment: this.environment as ObjectStorageEnvironment,
        assetId,
        contentType: declared,
      }),
      claimToken: randomUUID(),
    });
  }

  /**
   * Streams the validated body into object storage in one pass.
   *
   * The `PassThrough` is the seam between parser and uploader: bytes are written
   * into it as they are counted, hashed and signature-checked, so no complete
   * copy of the file exists anywhere — not on disk, not in memory. The ceiling is
   * enforced incrementally by the reader, so an oversize stream is cut off rather
   * than measured after arrival.
   */
  async write(input: {
    readonly source: Readable;
    readonly declared: AcceptedMediaType;
    readonly allocation: TransferEvidenceAllocation;
    readonly signal: AbortSignal;
  }): Promise<TransferEvidenceFacts> {
    const body = new PassThrough();
    const upload = this.storage.putObjectStream({
      bucket: 'ORIGINALS',
      key: input.allocation.objectKey,
      body,
      contentType: input.declared,
      signal: input.signal,
    });
    // Attached immediately: if the reader fails first it destroys `body`, and an
    // unobserved rejection here would crash the process rather than surface as
    // the reader's error.
    const settled = upload.then(
      () => undefined,
      (error: unknown) => error,
    );

    let facts: TransferEvidenceFacts;
    try {
      const consumed = await consumeValidatedFile({
        source: input.source,
        declaredMediaType: input.declared,
        sink: body,
        signal: input.signal,
        maxBytes: PAYMENT_EVIDENCE_INTAKE_LANE.maxUploadBytes,
      });
      facts = { ...consumed, contentFingerprint: buildContentFingerprint(consumed) };
    } catch (error: unknown) {
      await settled;
      throw error;
    }

    const uploadError = await settled;
    if (uploadError !== undefined) {
      throw isAssetIntakeError(uploadError)
        ? uploadError
        : assetIntakeError('ASSET_STORAGE_UNAVAILABLE');
    }
    return facts;
  }

  /**
   * Re-reads the body with no sink at all, for a replay.
   *
   * Content-complete without a single object write: the resent bytes are hashed
   * and compared against the stored fingerprint, so a replay proves it is the
   * same file without writing a second one.
   */
  async fingerprintOnly(input: {
    readonly source: Readable;
    readonly declared: AcceptedMediaType;
    readonly signal: AbortSignal;
  }): Promise<string> {
    const consumed = await consumeValidatedFile({
      source: input.source,
      declaredMediaType: input.declared,
      signal: input.signal,
      maxBytes: PAYMENT_EVIDENCE_INTAKE_LANE.maxUploadBytes,
    });
    return buildContentFingerprint(consumed);
  }

  /**
   * Removes an object no row will ever point at.
   *
   * Called only when **Tx A** failed, which is the one case where nothing was
   * committed: no asset row exists, so no sweep can find the object through one.
   * Bounded to the key this request allocated moments ago, and `deleteObject` is
   * idempotent. A Tx B failure is deliberately *not* routed here — the asset row
   * is committed by then, and deleting its binary would be deleting a live
   * asset's content. That case is the delivered orphan authority's.
   */
  async removeOrphan(allocation: TransferEvidenceAllocation): Promise<void> {
    await this.storage
      .deleteObject({ bucket: allocation.bucketAlias, key: allocation.objectKey })
      .catch(() => undefined);
  }
}
