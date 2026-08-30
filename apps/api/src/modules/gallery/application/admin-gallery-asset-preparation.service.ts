/**
 * Admin gallery-asset preparation (`APP11-B03A` §3-§7, §17).
 *
 * One operation, and the order of its five stages *is* the contract:
 *
 *   1. resolve the source in the catalog lane and prove it is promotable;
 *   2. prove both public renditions are `READY` and carry a durable key;
 *   3. copy the three objects, provider-side, under freshly allocated keys;
 *   4. in one transaction, re-prove 1 and 2 under a share lock and write the
 *      derived asset, its inspection evidence and its two `READY` derivatives;
 *   5. on any failure after stage 3, delete every object stage 3 could have
 *      created.
 *
 * Stage 4 repeats stage 1 rather than trusting it, and that is the whole
 * concurrency design. Copying three objects takes several network round trips,
 * which is exactly the window in which the source could be rejected,
 * tombstoned, or have a derivative regenerated. `FOR SHARE` on the source row
 * and its derivatives holds those transitions off until this transaction
 * commits, and the `updatedAt` token plus a key-for-key comparison catch
 * anything that committed *during* the copy — the copied bytes would then be
 * stale, and stale bytes published as a showcase image is precisely the defect
 * a version token exists to prevent.
 *
 * Objects before rows, never the reverse. A row written first would, on a
 * storage failure, leave `APP11-B02` free to attach an image `APP11-B03` cannot
 * serve — a public page rendering a broken address, with nothing failing until
 * a browser tried. A database transaction cannot roll back a provider copy, so
 * the compensation in stage 5 is what closes the other direction.
 *
 * The source is never touched. No statement here updates, locks for update, or
 * tombstones the catalog asset: it keeps its id, its kind, its
 * `PRODUCTION_SENSITIVE` classification, its `ACCEPTED` status, its objects,
 * its derivatives and every Product association that already points at it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { AssetDerivativeKind } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetDerivative,
  type AssetDerivativeId,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { galleryAssetPreparationError } from '../domain/gallery-asset-preparation.errors';
import {
  PREPARATION_SOURCE_LANE,
  PREPARATION_SOURCE_STATUS,
  PREPARED_DERIVATIVE_KINDS,
  PREPARED_DERIVATIVE_STATE,
  PREPARED_DERIVATIVE_WATERMARKED,
  PREPARED_GALLERY_LANE,
  preparedGalleryInspectionDetail,
} from '../domain/gallery-asset-preparation.policy';
import {
  toAdminGalleryAssetView,
  type AdminGalleryAssetView,
} from './admin-gallery-asset.projection';
import {
  GalleryAssetObjectCopier,
  type GalleryAssetCopyPlan,
  type SourceDerivativeObject,
} from './gallery-asset-object-copier';

export interface PrepareGalleryAssetCommand {
  readonly sourceAssetId: string;
  /** The `updatedAt` token the operator last read for the source asset. */
  readonly expectedSourceUpdatedAt: Date;
}

@Injectable()
export class AdminGalleryAssetPreparationService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    private readonly copier: GalleryAssetObjectCopier,
    private readonly transactions: TransactionManager,
  ) {}

  async prepare(command: PrepareGalleryAssetCommand): Promise<AdminGalleryAssetView> {
    const source = await this.assets.findScoped(
      command.sourceAssetId as AssetId,
      PREPARATION_SOURCE_LANE,
    );
    // An id outside the catalog lane is simply absent here — the scoped read
    // cannot see a customer's private upload or an already-public asset — so a
    // caller cannot learn from this refusal that either exists.
    this.requirePromotable(source);
    this.requireToken(source, command.expectedSourceUpdatedAt);

    const sourceObjects = this.requireReadyRenditions(await this.assets.listDerivatives(source.id));

    const plan = this.copier.plan({
      derivedAssetId: newId(),
      sourceOriginalKey: source.storageKey,
      sourceMimeType: source.mimeType,
      sourceDerivatives: sourceObjects,
    });

    await this.copier.copy(plan);

    try {
      return await this.transactions.runInTransaction(() => this.persist(command, plan));
    } catch (error: unknown) {
      // Every failure past the copy lands here: a stale source, a regenerated
      // derivative, a database fault. None of them may leave a public object
      // behind that no row accounts for.
      await this.copier.discard(plan);
      throw error;
    }
  }

  /**
   * Writes the derived asset, its evidence and its derivatives, having first
   * re-proved every fact the copy was based on.
   *
   * Inside a transaction by construction: `lockScopedByIds`,
   * `lockDerivativesFor` and `recordInspection` each assert one.
   */
  private async persist(
    command: PrepareGalleryAssetCommand,
    plan: GalleryAssetCopyPlan,
  ): Promise<AdminGalleryAssetView> {
    const sourceId = command.sourceAssetId as AssetId;
    const [locked] = await this.assets.lockScopedByIds([sourceId], PREPARATION_SOURCE_LANE);
    this.requirePromotable(locked);
    this.requireToken(locked, command.expectedSourceUpdatedAt);
    this.requireUnchangedObjects(await this.assets.lockDerivativesFor([sourceId]), plan);

    const derivedId = plan.derivedAssetId as AssetId;
    await this.assets.register({
      id: derivedId,
      kind: PREPARED_GALLERY_LANE.kind,
      classification: PREPARED_GALLERY_LANE.classification,
      storageKey: plan.original.destination.key,
      // The uploaded original's facts, carried across unchanged. They are true
      // of the copy because the copy is byte-identical; nothing is re-measured,
      // because re-measuring would mean reading the binary back into the API.
      mimeType: locked.mimeType,
      sizeBytes: locked.sizeBytes,
      ...(locked.checksum === undefined ? {} : { checksum: locked.checksum }),
    });

    // `register` lands in `UPLOADED`. The very next statement in the same
    // transaction supplies the evidence and the state it justifies, so no
    // uninspected gallery asset is ever visible to another transaction.
    const prepared = await this.assets.recordInspection(
      derivedId,
      'ACCEPTED',
      preparedGalleryInspectionDetail(command.sourceAssetId),
      new Date(),
    );

    for (const derivative of plan.derivatives) {
      const registered = await this.assets.registerDerivative({
        id: newId() as AssetDerivativeId,
        assetId: derivedId,
        kind: derivative.kind,
        isWatermarked: PREPARED_DERIVATIVE_WATERMARKED,
      });
      // `READY` before the response, never after: `APP11-B02` may attach this
      // asset the moment the operation returns, and `APP11-B03` serves only a
      // `READY` derivative that carries a key.
      //
      // No checksum: `asset_derivatives.checksum` is not projected by the Asset
      // contract, so the source's value is not in hand, and computing one would
      // mean streaming the copied object back through this process. A null
      // checksum is honest; an invented one would not be.
      await this.assets.completeDerivative(registered.id, derivative.destination.key, undefined);
    }

    return toAdminGalleryAssetView(prepared);
  }

  /**
   * The complete source-eligibility rule, applied identically before and after
   * the copy.
   *
   * Narrowing rather than returning a boolean, so a caller cannot forget to act
   * on the answer.
   */
  private requirePromotable(source: Asset | undefined): asserts source is Asset {
    if (
      source === undefined ||
      source.status !== PREPARATION_SOURCE_STATUS ||
      source.deletedAt !== undefined
    ) {
      throw galleryAssetPreparationError('GALLERY_ASSET_SOURCE_NOT_ELIGIBLE');
    }
  }

  /**
   * Compares the caller's token against database truth.
   *
   * By instant, not by string: the client echoes back the ISO spelling the
   * detail response published, and the millisecond-level comparison is the fact
   * that matters rather than the formatting.
   */
  private requireToken(source: Asset, expected: Date): void {
    if (source.updatedAt.getTime() !== expected.getTime()) {
      throw galleryAssetPreparationError('GALLERY_ASSET_SOURCE_VERSION_CONFLICT');
    }
  }

  /**
   * Proves every public rendition exists on the source, is `READY`, is
   * unwatermarked and carries a key — and returns those keys.
   *
   * The watermark check is not redundant with the schema CHECK: that constraint
   * binds only `PREVIEW_WATERMARKED` and `CATALOG_PREVIEW`, so a watermarked
   * `THUMBNAIL` is a row the database would happily hold and INV-22 forbids
   * from ever appearing on a public page.
   */
  private requireReadyRenditions(
    derivatives: readonly AssetDerivative[],
  ): readonly SourceDerivativeObject[] {
    return PREPARED_DERIVATIVE_KINDS.map((kind) => {
      const ready = this.requireReadyDerivative(derivatives, kind);
      // Non-null by the predicate above; the cast states what the filter proved
      // rather than re-testing it.
      return { kind, storageKey: ready.storageKey as string };
    });
  }

  private requireReadyDerivative(
    derivatives: readonly AssetDerivative[],
    kind: AssetDerivativeKind,
  ): AssetDerivative {
    const found = derivatives.find(
      (derivative) =>
        derivative.kind === kind &&
        derivative.status === PREPARED_DERIVATIVE_STATE &&
        derivative.isWatermarked === PREPARED_DERIVATIVE_WATERMARKED &&
        derivative.storageKey !== undefined,
    );
    if (found === undefined) {
      // Reported as the one ineligibility code: which rendition is missing is a
      // fact about an asset the caller may already read, but splitting it would
      // give the refusal a second shape for no operator benefit.
      throw galleryAssetPreparationError('GALLERY_ASSET_SOURCE_NOT_ELIGIBLE');
    }
    return found;
  }

  /**
   * Re-proves, under the share lock, that the objects just copied are still the
   * objects the source advertises.
   *
   * A key-for-key comparison rather than a second readiness check: a derivative
   * regenerated during the copy window is `READY` again under a *new* key, so
   * readiness alone would pass while the bytes in hand were the previous
   * generation's. That is a conflict, not a storage fault.
   */
  private requireUnchangedObjects(
    locked: readonly AssetDerivative[],
    plan: GalleryAssetCopyPlan,
  ): void {
    const current = this.requireReadyRenditions(locked);
    const stale = plan.derivatives.some((planned) => {
      const match = current.find((derivative) => derivative.kind === planned.kind);
      return match === undefined || match.storageKey !== planned.source.key;
    });
    if (stale) {
      throw galleryAssetPreparationError('GALLERY_ASSET_SOURCE_VERSION_CONFLICT');
    }
  }
}
