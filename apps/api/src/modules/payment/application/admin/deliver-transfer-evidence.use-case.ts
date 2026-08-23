/**
 * Admin delivery of one transfer-evidence image (`APP7-B06`).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The **order** is the security property. No object-storage call happens until
 * every term of the authorization has already succeeded, so a caller probing ids
 * never reaches the provider and cannot use response timing or provider load as
 * an existence oracle. Object storage is not an authorization system and is
 * never asked to behave like one.
 *
 * By the time this runs, the Admin half is already proved:
 * `AuthenticatedAdminGuard` verified the session cookie against a live
 * `admin_sessions` row. What is left is the contextual half — that this exact
 * association exists and names a payment attempt, and that the asset behind it
 * is inspection-approved customer-private evidence in a deliverable format. Two
 * reads decide it, and neither may be skipped.
 *
 * ## Why two reads rather than one join
 *
 * The association is CTX-PAY's (TBL-079) and the asset is Asset's (TBL-022).
 * `APP7-B04` §7 already refused to join them, and the reason holds harder here:
 * the second read returns a **storage key**, and a statement that produced one
 * from a Payment repository would make the module owning deposit evidence a
 * second authority on where a customer's private file lives.
 *
 * The two reads are sequential and deliberately not parallel. Running them
 * together would issue an asset lookup for an association that does not exist —
 * harmless against the database, but it would make the *asset* read happen for
 * ids the caller was never entitled to name, which is exactly the shape of probe
 * this route refuses. Association first, always.
 *
 * ## Zero write, and it is structural
 *
 * Nothing here writes. No attempt status moves, no obligation is satisfied, no
 * order transitions, no asset state changes, no association is touched, no
 * reconciliation is appended, no audit or outbox row is written and no access
 * timestamp is stamped. The ports it holds cannot express any of those —
 * `AdminPaymentReadRepository` is four `select`s with no transaction, and the
 * asset side is reached through the non-locking `findScopedByIds` — so this is a
 * structural guarantee rather than a convention. Opening evidence changes no
 * payment truth: `APP7-B04` remains the only verification authority in the
 * phase, and none of its services is reachable from this injector.
 *
 * A stream is returned rather than bytes: buffering the object would put a whole
 * 10 MiB screenshot in the heap per concurrent request and destroy the
 * backpressure the transport depends on.
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
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import { OBJECT_STORAGE } from '../../../asset/infrastructure/storage/object-storage.provider';
import {
  DELIVERABLE_EVIDENCE_ASSET_STATE,
  EVIDENCE_BUCKET,
  isDeliverableEvidenceMediaType,
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
  type EvidenceMediaType,
} from '../../domain/evidence/evidence-delivery.policy';
import {
  paymentEvidenceDeliveryError,
  paymentEvidenceNotFound,
} from '../../domain/evidence/evidence-delivery.errors';
import {
  ADMIN_PAYMENT_READ_REPOSITORY,
  type AdminPaymentReadRepository,
} from '../../domain/repositories/admin-payment-read.repository';

/**
 * The scope every APP7 evidence upload sits in (`APP7-G01` §7).
 *
 * The same pair `PAYMENT_EVIDENCE_INTAKE_LANE` writes and `APP7-B04`'s metadata
 * read filters on, so an asset outside it is *absent* from the read rather than
 * found and then rejected — the read itself cannot be used to discover that a
 * private asset in another lane exists.
 */
const EVIDENCE_SCOPE = {
  kind: TRANSFER_EVIDENCE_ASSET_KIND,
  classification: TRANSFER_EVIDENCE_CLASSIFICATION,
} as const;

/**
 * The safe transport facts. Deliberately no storage key, bucket, checksum,
 * provider ETag, asset id, attempt id, customer id, order id or upload filename
 * — the object's identity stays on the server.
 */
export interface TransferEvidenceStream {
  readonly body: Readable;
  readonly contentType: EvidenceMediaType;
  readonly contentLengthBytes: number;
}

/** The internal descriptor. Storage identity exists only inside this module. */
interface EvidenceDeliveryDescriptor {
  readonly evidenceId: string;
  readonly mediaType: EvidenceMediaType;
  readonly byteSize: number;
  readonly objectKey: string;
}

@Injectable()
export class DeliverTransferEvidence {
  constructor(
    @Inject(ADMIN_PAYMENT_READ_REPOSITORY)
    private readonly associations: AdminPaymentReadRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one attempt-bound evidence image.
   *
   * `signal` is the operator's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with
   * it rather than streaming a response nobody is reading.
   */
  async open(evidenceId: string, signal: AbortSignal): Promise<TransferEvidenceStream> {
    const descriptor = await this.describe(evidenceId);
    const result = await this.openObject(descriptor.objectKey, signal);

    return {
      body: result.body,
      // The asset's **persisted** `mime_type`, which `APP7-B05` derived from the
      // signature bytes it actually read — never the provider's `contentType`,
      // which is whatever was set on the object at upload time and is not an
      // authority this route recognises.
      contentType: descriptor.mediaType,
      contentLengthBytes: this.reconcileLength(descriptor, result),
    };
  }

  /**
   * The whole authorization, in order, before a single storage call.
   *
   * Every refusal below is the same `PAYMENT_EVIDENCE_NOT_FOUND`. The branches
   * are separate statements rather than one boolean because each states a
   * different invariant and a merged condition would make the next reader guess
   * which one a failing test broke — but they are indistinguishable from
   * outside, which is the property §10 requires.
   */
  private async describe(evidenceId: string): Promise<EvidenceDeliveryDescriptor> {
    // 1. The association, addressed by its own id and resolved together with the
    //    attempt it names. An asset id authorizes nothing and is never accepted;
    //    a miss ends the request before the asset table is touched.
    const association = await this.associations.findEvidenceForDelivery(evidenceId);
    if (association === undefined) {
      throw paymentEvidenceNotFound();
    }

    // 2. The asset, scoped to the customer-private upload lane.
    const [asset] = await this.assets.findScopedByIds(
      [association.assetId as AssetId],
      EVIDENCE_SCOPE,
    );
    if (asset === undefined) {
      throw paymentEvidenceNotFound();
    }

    return { evidenceId: association.id, ...this.describeSource(asset) };
  }

  /**
   * The eligibility of the asset itself: verdict, liveness and a complete,
   * deliverable source descriptor.
   *
   * `status === 'ACCEPTED'` already excludes `DELETION_PENDING` and `DELETED`,
   * and the tombstone check is kept beside it anyway. The two are written by
   * different flows — `recordInspection` and `tombstone` — and a delivery route
   * that inferred one from the other would depend on those two never diverging.
   */
  private describeSource(asset: Asset): Omit<EvidenceDeliveryDescriptor, 'evidenceId'> {
    if (asset.status !== DELIVERABLE_EVIDENCE_ASSET_STATE || asset.deletedAt !== undefined) {
      throw paymentEvidenceNotFound();
    }
    if (!isDeliverableEvidenceMediaType(asset.mimeType)) {
      throw paymentEvidenceNotFound();
    }
    if (asset.storageKey === '') {
      throw paymentEvidenceNotFound();
    }

    // `size_bytes` is `bigint`, and the column's CHECK keeps it positive. The
    // narrowing is still asserted: `Content-Length` is a JS number, and a value
    // past 2^53 would be silently rounded into a header that contradicts the
    // body. A 10 MiB lane ceiling makes that unreachable, which is why it is a
    // refusal rather than a special case.
    const byteSize = Number(asset.sizeBytes);
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
      throw paymentEvidenceNotFound();
    }

    return { mediaType: asset.mimeType, byteSize, objectKey: asset.storageKey };
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the whole
   * authorization already succeeded, so the association exists and the database
   * says the asset is `ACCEPTED` with a durable key. An object that is
   * nevertheless gone is a storage-side contradiction, and a 404 would tell an
   * operator the customer never submitted their transfer screenshot.
   */
  private async openObject(objectKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: EVIDENCE_BUCKET, key: objectKey },
        signal,
      );
    } catch (error: unknown) {
      if (error instanceof ObjectStorageError && error.code === 'REQUEST_ABORTED') {
        // The operator hung up while the object was being opened. There is
        // nobody left to answer, so this propagates as the abort it is rather
        // than being dressed up as a server fault.
        throw error;
      }
      // The provider error carries the raw SDK failure as `cause`; it is
      // deliberately not attached, logged or serialised here.
      throw paymentEvidenceDeliveryError('PAYMENT_EVIDENCE_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * Two independent authorities describe the same bytes — the provider's count
   * and `assets.size_bytes` — and where they disagree the honest answer is to
   * send neither. Streaming at the provider's length would contradict the
   * canonical metadata the upload was validated against; streaming at the
   * persisted length would truncate or hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into an abandoned request. The
   * persisted value is never repaired from provider state: a read that corrected
   * the database would let storage rewrite canonical evidence metadata.
   */
  private reconcileLength(
    descriptor: EvidenceDeliveryDescriptor,
    result: ObjectStreamResult,
  ): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== descriptor.byteSize
    ) {
      result.body.destroy();
      throw paymentEvidenceDeliveryError('PAYMENT_EVIDENCE_UNAVAILABLE');
    }
    return descriptor.byteSize;
  }
}
