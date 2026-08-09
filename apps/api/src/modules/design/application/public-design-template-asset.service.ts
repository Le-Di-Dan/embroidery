/**
 * Published Template asset delivery (`APP3-B05A` §3, §11).
 *
 * Orchestration only: decide what may be served, then open the private object.
 * The **order** is the security property. No object-storage call happens until
 * every term of the authorization has already succeeded, so a caller probing slugs,
 * Versions or Asset ids never reaches the provider and cannot use response timing
 * or provider load as an existence oracle.
 *
 * The six terms, in the order they are cheapest to disprove:
 *
 * 1. the Template is currently `PUBLISHED`;
 * 2. the addressed Version is the one the public read exposes **right now**;
 * 3. the durable `design_template_assets` association exists;
 * 4. the Asset is an accepted Template original with an eligible `READY`,
 *    unwatermarked, completely described `NORMALIZED` derivative;
 * 5. that exact Version's canonical document places the Asset through an image
 *    element;
 * 6. the Product/Side/Area chain is *still* publicly designable.
 *
 * The first four are one SQL statement against one snapshot; the last two are
 * decided by the authorities that own them — P01 for the document, Catalog for
 * the placement — against what that statement returned. Every failure produces
 * the same silent not-found, and nothing records or returns which one it was.
 *
 * A stream is returned rather than bytes: buffering the object would put a whole
 * Template asset in the heap per concurrent request and destroy the backpressure
 * the transport depends on.
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
  PRODUCT_PLACEMENT_REPOSITORY,
  type ProductPlacementRepository,
} from '../../catalog/domain/repositories/product-placement.repository';
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../catalog/domain/repositories/placement-hierarchy.port';
import { PUBLIC_TEMPLATE_ASSET_BUCKET } from '../domain/public-design-template-asset.policy';
import {
  publicDesignTemplateAssetError,
  publicDesignTemplateAssetNotFound,
} from '../domain/public-design-template-asset.errors';
import { publishedDocumentPlacesAsset } from '../domain/published-template-asset-membership';
import {
  PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY,
  type PublicDesignTemplateAssetRepository,
  type PublicTemplateAssetCandidate,
  type PublicTemplateAssetLookup,
} from '../domain/repositories/public-design-template-asset.repository';

/**
 * The safe transport facts. Deliberately no storage key, bucket, checksum,
 * provider ETag, derivative id or last-modified date — the object's identity
 * stays on the server.
 */
export interface PublicTemplateAssetStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLengthBytes: number;
}

@Injectable()
export class PublicDesignTemplateAssetService {
  constructor(
    @Inject(PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY)
    private readonly candidates: PublicDesignTemplateAssetRepository,
    @Inject(PRODUCT_PLACEMENT_REPOSITORY)
    private readonly placement: ProductPlacementRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Resolves and opens one published Template asset.
   *
   * `signal` is the client's connection: when the browser goes away the caller
   * aborts it, and the provider request — or the open body — is torn down with it
   * rather than streaming a response nobody is reading.
   */
  async open(
    lookup: PublicTemplateAssetLookup,
    signal: AbortSignal,
  ): Promise<PublicTemplateAssetStream> {
    const candidate = await this.candidates.findDeliverableCandidate(lookup);
    if (candidate === undefined) {
      // Template, Version, association, lane and derivative misses all arrive
      // here identically.
      throw publicDesignTemplateAssetNotFound();
    }

    // The document of the exact Version addressed — not of the Template, and not
    // of whichever Version happens to be newest.
    if (!publishedDocumentPlacesAsset(candidate.document, lookup.assetId)) {
      throw publicDesignTemplateAssetNotFound();
    }

    if (!(await this.stillPubliclyDesignable(candidate))) {
      throw publicDesignTemplateAssetNotFound();
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
   * Catalog's answer to "is this exact chain publicly designable right now".
   *
   * Design asks; Catalog defines. `GRD-T01` proved the chain active at the moment
   * of publication and nothing keeps it true afterwards: the Product can be
   * unpublished or moved out of a public category, the Side or Area can be
   * retired, and `IMP-D041` PO-07 retires without deleting so existing references
   * still resolve. Re-deriving those predicates here would be a second definition
   * of public visibility that drifts the first time publication rules change.
   *
   * The answer is never written back. A read that "repaired" the Template would
   * mutate store data from an anonymous request — and it would be wrong the moment
   * the Product was republished.
   */
  private async stillPubliclyDesignable(candidate: PublicTemplateAssetCandidate): Promise<boolean> {
    const scope = await this.placement.findPublicPlacementScope({
      productId: candidate.productId as ProductId,
      productSideId: candidate.productSideId as ProductSideId,
      embroideryAreaId: candidate.embroideryAreaId as EmbroideryAreaId,
    });
    return scope !== undefined;
  }

  /**
   * Opens the private object, translating every provider failure into the safe
   * public vocabulary.
   *
   * A missing object is reported as *unavailable*, not as not-found: the whole
   * authorization already succeeded, so the Template is public and the database
   * says the derivative is `READY` with a durable key. An object that is
   * nevertheless gone is a storage-side contradiction, and a 404 would tell an
   * honest caller to stop asking for something that should exist.
   */
  private async openObject(storageKey: string, signal: AbortSignal): Promise<ObjectStreamResult> {
    try {
      return await this.storage.getObjectStream(
        { bucket: PUBLIC_TEMPLATE_ASSET_BUCKET, key: storageKey },
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
      throw publicDesignTemplateAssetError('PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE');
    }
  }

  /**
   * Requires the object about to be streamed to be the object the row describes.
   *
   * Two independent authorities describe the same bytes — the provider's count
   * and `asset_derivatives.byte_size` — and where they disagree the honest answer
   * is to send neither. Streaming at the provider's length would contradict the
   * intrinsic dimensions the Studio already read from the document; streaming at
   * the persisted length would truncate or hang the response.
   *
   * The stream is destroyed before the refusal, so a contradicted object never
   * leaves a provider connection draining into an abandoned request.
   */
  private reconcileLength(
    candidate: PublicTemplateAssetCandidate,
    result: ObjectStreamResult,
  ): number {
    const providerSize = result.sizeBytes;
    if (
      !Number.isFinite(providerSize) ||
      providerSize <= 0 ||
      providerSize !== candidate.byteSize
    ) {
      result.body.destroy();
      throw publicDesignTemplateAssetError('PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE');
    }
    return candidate.byteSize;
  }
}
