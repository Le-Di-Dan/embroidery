/**
 * Admin delivery of one submitted request attachment (`APP5-B06`).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The **order** is the security property. No object-storage call happens until
 * every term of the authorization has already succeeded, so a caller probing
 * asset ids never reaches the provider and cannot use response timing or
 * provider load as an existence oracle. Object storage is not an authorization
 * system and is never asked to behave like one.
 *
 * By the time this runs, the Admin half is already proved: `AuthenticatedAdminGuard`
 * verified the session cookie against a live `admin_sessions` row. What is left
 * is the contextual half — that this exact request has a claim on this exact
 * asset, and that the asset is inspection-approved private evidence in a
 * deliverable format. Two reads decide it, and neither may be skipped.
 *
 * ## Why two reads rather than one join
 *
 * The association is Ordering's (TBL-040) and the asset is Asset's (TBL-022).
 * `APP5-B04` §12 already refused to join them, and the reason holds harder here:
 * the second read returns a **storage key**, and a statement that produced one
 * from an Ordering repository would make the module owning request evidence a
 * second authority on where a customer's private file lives. The cost is one
 * extra round trip on the success path; the benefit is that neither context can
 * answer the other's question alone.
 *
 * The two reads are sequential and deliberately not parallel. Running them
 * together would issue the asset lookup for a request that has no claim on it —
 * harmless against the database, but it would make the *asset* read happen for
 * ids the caller was never entitled to name, which is exactly the shape of probe
 * this route refuses. Association first, always.
 *
 * ## Zero write
 *
 * Nothing here writes. No status moves, no transition is appended, no note is
 * recorded, no asset state changes, no access timestamp is stamped, no retention
 * is extended and no outbox row is written. The ports it holds cannot express
 * any of those (`RequestAssetDeliveryRepository` has one read method, and the
 * asset side is reached through the non-locking `findScopedByIds`), so this is a
 * structural guarantee rather than a convention.
 *
 * A stream is returned rather than bytes: buffering the object would put a whole
 * 10 MiB customer photograph in the heap per concurrent request and destroy the
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
  BINDABLE_ASSET_CLASSIFICATION,
  BINDABLE_ASSET_KIND,
  BINDABLE_ASSET_STATE,
  isDeliverableRequestAssetMediaType,
  REQUEST_ASSET_BUCKET,
  type App5RequestAssetRole,
  type RequestAssetMediaType,
} from '../../domain/delivery/request-asset-delivery.policy';
import {
  requestAssetDeliveryError,
  requestAssetNotFound,
} from '../../domain/delivery/request-asset-delivery.errors';
import {
  REQUEST_ASSET_DELIVERY_REPOSITORY,
  type RequestAssetDeliveryRepository,
  type RequestAssetLookup,
} from '../../domain/repositories/request-asset-delivery.repository';

/**
 * The scope every APP5 customer upload sits in (`APP5-G01` §6).
 *
 * The same pair `APP5-B01`'s binder locks on and `APP5-B04`'s detail reports
 * through, so an asset outside it is *absent* from the read rather than found
 * and then rejected — the read itself cannot be used to discover that a private
 * asset in another lane exists.
 */
const BINDABLE_SCOPE = {
  kind: BINDABLE_ASSET_KIND,
  classification: BINDABLE_ASSET_CLASSIFICATION,
} as const;

/**
 * The safe transport facts. Deliberately no storage key, bucket, checksum,
 * provider ETag, customer id, challenge id, upload filename or inspection
 * detail — the object's identity stays on the server.
 */
export interface RequestAssetStream {
  readonly body: Readable;
  readonly role: App5RequestAssetRole;
  readonly contentType: RequestAssetMediaType;
  readonly contentLengthBytes: number;
}

/** The internal descriptor. Storage identity exists only inside this module. */
interface RequestAssetDescriptor {
  readonly role: App5RequestAssetRole;
  readonly mediaType: RequestAssetMediaType;
  readonly byteSize: number;
  readonly objectKey: string;
}

@Injectable()
export class DeliverRequestAsset {
  constructor(
    @Inject(REQUEST_ASSET_DELIVERY_REPOSITORY)
    private readonly associations: RequestAssetDeliveryRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one request-bound attachment.
   *
   * `signal` is the operator's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with
   * it rather than streaming a response nobody is reading.
   */
  async open(lookup: RequestAssetLookup, signal: AbortSignal): Promise<RequestAssetStream> {
    const descriptor = await this.describe(lookup);
    const result = await this.openObject(descriptor.objectKey, signal);

    return {
      body: result.body,
      role: descriptor.role,
      // The asset's **persisted** `mime_type`, which `APP5-B02` derived from the
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
   * Every refusal below is the same `REQUEST_ASSET_NOT_FOUND`. The branches are
   * separate statements rather than one boolean because each states a different
   * invariant and a merged condition would make the next reader guess which one
   * a failing test broke — but they are indistinguishable from outside, which is
   * the property §9 requires.
   */
  private async describe(lookup: RequestAssetLookup): Promise<RequestAssetDescriptor> {
    // 1. The association. An asset id alone authorizes nothing, so this runs
    //    first and a miss ends the request before the asset table is touched.
    const role = await this.associations.findDeliverableRole(lookup);
    if (role === undefined) {
      throw requestAssetNotFound();
    }

    // 2. The asset, scoped to the customer-private upload lane.
    const [asset] = await this.assets.findScopedByIds([lookup.assetId as AssetId], BINDABLE_SCOPE);
    if (asset === undefined) {
      throw requestAssetNotFound();
    }

    return { role, ...this.describeSource(asset) };
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
  private describeSource(asset: Asset): Omit<RequestAssetDescriptor, 'role'> {
    if (asset.status !== BINDABLE_ASSET_STATE || asset.deletedAt !== undefined) {
      throw requestAssetNotFound();
    }
    if (!isDeliverableRequestAssetMediaType(asset.mimeType)) {
      throw requestAssetNotFound();
    }
    if (asset.storageKey === '') {
      throw requestAssetNotFound();
    }

    // `size_bytes` is `bigint`, and the column's CHECK keeps it positive. The
    // narrowing is still asserted: `Content-Length` is a JS number, and a value
    // past 2^53 would be silently rounded into a header that contradicts the
    // body. A 10 MiB intake ceiling makes that unreachable, which is why it is a
    // refusal rather than a special case.
    const byteSize = Number(asset.sizeBytes);
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
      throw requestAssetNotFound();
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
   * operator the customer's evidence was never submitted.
   */
  private async openObject(objectKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: REQUEST_ASSET_BUCKET, key: objectKey },
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
      throw requestAssetDeliveryError('REQUEST_ASSET_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * Two independent authorities describe the same bytes — the provider's count
   * and `assets.size_bytes` — and where they disagree the honest answer is to
   * send neither. Streaming at the provider's length would contradict the
   * canonical metadata the submission was validated against; streaming at the
   * persisted length would truncate or hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into an abandoned request. The
   * persisted value is never repaired from provider state: a read that corrected
   * the database would let storage rewrite canonical evidence metadata.
   */
  private reconcileLength(descriptor: RequestAssetDescriptor, result: ObjectStreamResult): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== descriptor.byteSize
    ) {
      result.body.destroy();
      throw requestAssetDeliveryError('REQUEST_ASSET_UNAVAILABLE');
    }
    return descriptor.byteSize;
  }
}
