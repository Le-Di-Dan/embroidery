/**
 * The bounded Product media-curation write (`APP12-M01.B2`).
 *
 * One operation, one intent: **replace the whole ordered media selection**, in
 * `DRAFT` or in `PUBLISHED`, and change nothing else about the Product.
 *
 * Why it exists at all. `APP2-B02`'s patch is locked to `DRAFT`
 * (`PRODUCT_EDITABLE_STATES`), so the only way to correct a live Product's
 * photographs was to unpublish it, edit, and publish again — which takes it off
 * Discover, drops its address out of the catalog and is visible to every
 * customer browsing at that moment. This use case removes that, and removes
 * nothing else: `PRODUCT_EDITABLE_STATES` is untouched, so title, description,
 * category, price, SKUs, inventory, shipping and publication status all remain
 * exactly as locked in `PUBLISHED` as they were.
 *
 * Three properties shape it.
 *
 * - **The ordered array is the entire write model.** `mediaAssetIds[0]` is the
 *   primary; array order is display order; omission is removal. There is no
 *   `isPrimary` flag, no add/remove/reorder/set-primary endpoint, and therefore
 *   no way for a client to describe a selection with two primaries or a gap.
 *   Setting the primary and removing the primary are both just a different
 *   first element.
 * - **One eligibility model, not two.** A `PUBLISHED` selection is validated by
 *   `evaluatePublicationReadiness` — the same pure evaluator the publish
 *   transaction runs — over the *requested* links rather than the stored ones.
 *   The refusal is then filtered to the three media requirement codes
 *   (`PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES`), because name, price and an
 *   archived category are not facts a media write can repair.
 * - **Refusal is atomic and total.** Every check completes before the first row
 *   is touched, inside one transaction over a `FOR UPDATE`-locked Product. A
 *   refused request leaves the old selection, the status and every commercial
 *   field exactly as they were; a `PUBLISHED` Product is never auto-unpublished
 *   and an ineligible Asset is never silently dropped from the set.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import { productDraftError } from '../domain/product-draft.errors';
import {
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_CURATION_STATES,
  PRODUCT_PUBLISHED_STATE,
} from '../domain/product-publication.policy';
import {
  evaluatePublicationReadiness,
  unsatisfiedMediaRequirements,
  type ProductPublicationFacts,
  type PublicationCategoryFacts,
} from '../domain/product-publication.readiness';
import {
  PRODUCT_DRAFT_REPOSITORY,
  type GuardedWriteResult,
  type ProductDraft,
  type ProductDraftId,
  type ProductDraftMediaLink,
  type ProductDraftRepository,
} from '../domain/repositories/product-draft.repository';
import {
  PRODUCT_PUBLICATION_REPOSITORY,
  type ProductPublicationRepository,
} from '../domain/repositories/product-publication.repository';
import { ProductMediaSelection } from './product-media-selection.service';
import { toDetailView, type ProductDetailView } from './product-projection';

/** The catalog-media lane every attached Asset must belong to. */
const ASSET_SCOPE = {
  kind: PRODUCT_MEDIA_ASSET_KIND,
  classification: PRODUCT_MEDIA_ASSET_CLASSIFICATION,
} as const;

export interface ReplaceProductMediaCommand {
  readonly productId: string;
  /** The complete intended selection, in display order. `[]` clears a DRAFT. */
  readonly mediaAssetIds: readonly string[];
  readonly expectedUpdatedAt: Date;
}

@Injectable()
export class ReplaceProductMediaUseCase {
  constructor(
    @Inject(PRODUCT_DRAFT_REPOSITORY) private readonly products: ProductDraftRepository,
    @Inject(PRODUCT_PUBLICATION_REPOSITORY)
    private readonly publication: ProductPublicationRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    private readonly selection: ProductMediaSelection,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * The whole §11 sequence in one transaction: lock the Product, check its
   * state, check the token, resolve and lock the requested Assets, prove the
   * selection viable if the Product is published, advance the version under a
   * guard, replace the rows, read back, commit.
   *
   * The guarded UPDATE is issued *before* the rows are rewritten. Both orders
   * are safe inside one transaction, but this one is stronger: a writer that
   * has already lost the concurrency race never deletes a media row at all,
   * rather than deleting it and relying on the rollback.
   */
  async execute(command: ReplaceProductMediaCommand): Promise<ProductDetailView> {
    return this.transactions.runInTransaction(async () => {
      // `FOR UPDATE` on the Product root, `FOR SHARE` on its category and its
      // current media. Reusing the publication snapshot rather than adding a
      // second locking read: it locks exactly the rows this decision depends on,
      // and it is the same seam the publish transaction takes, so two writers
      // racing over one Product serialise here whichever operation they chose.
      const snapshot = await this.publication.lockSnapshot(command.productId as ProductDraftId);
      const product = snapshot.product;
      if (product === undefined) {
        throw productDraftError('PRODUCT_NOT_FOUND');
      }
      if (!(PRODUCT_MEDIA_CURATION_STATES as readonly string[]).includes(product.status)) {
        // `ARCHIVED`, and anything a future state adds until it is considered
        // here explicitly. A safe conflict, never a partial write.
        throw productDraftError('PRODUCT_NOT_EDITABLE');
      }
      if (product.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()) {
        throw productDraftError('PRODUCT_VERSION_CONFLICT');
      }

      // Count, duplicates, lane, existence and `ACCEPTED` — the same authority
      // the `APP2-B02` patch uses, so DRAFT semantics are unchanged and no
      // second copy of the rules exists. Positions and roles are assigned here
      // from array order; the client never names either.
      const links = await this.selection.resolve(command.mediaAssetIds);

      if (product.status === PRODUCT_PUBLISHED_STATE) {
        await this.requirePublishable(product, snapshot.category, links);
      }

      // Media-only, and provably so: `fields` is empty, so the statement writes
      // `updated_at` and nothing else. The Product row is still touched, because
      // `updated_at` is the concurrency token for the whole Product and a media
      // replacement that left it alone would let a stale field write land after.
      const result = await this.products.updateGuarded({
        id: product.id,
        expectedUpdatedAt: command.expectedUpdatedAt,
        editableStates: PRODUCT_MEDIA_CURATION_STATES,
        fields: {},
      });
      const written = this.requireWritten(result);

      await this.products.replaceMedia(written.id, links);

      const media = await this.products.findMedia(written.id);
      return toDetailView(written, media);
    });
  }

  /**
   * Proves the *requested* selection could stand on a published Product.
   *
   * The facts are assembled from the locked Product and category plus the links
   * about to be written — never the stored selection, which is precisely what
   * this request is replacing. Both Asset reads are batched and locking, so a
   * twenty-image curation costs two statements and an Asset cannot be rejected
   * or a derivative regenerated between the check and the commit.
   *
   * An empty selection short-circuits the reads rather than issuing a query for
   * no ids: `PRODUCT_MEDIA_READY` already fails on it, which is the honest
   * requirement to report for "a published product must keep at least one
   * image".
   */
  private async requirePublishable(
    product: ProductDraft,
    category: PublicationCategoryFacts | undefined,
    links: readonly ProductDraftMediaLink[],
  ): Promise<void> {
    const assetIds = [...new Set(links.map((link) => link.assetId))] as AssetId[];
    // Sequential, not concurrent: both statements run on the one connection the
    // enclosing transaction holds, and issuing them in parallel on it is not
    // something a transaction-scoped executor can honour.
    const assets =
      assetIds.length === 0 ? [] : await this.assets.lockScopedByIds(assetIds, ASSET_SCOPE);
    const derivatives = assetIds.length === 0 ? [] : await this.assets.lockDerivativesFor(assetIds);

    const facts: ProductPublicationFacts = {
      product,
      category,
      media: links.map((link) => ({
        assetId: link.assetId,
        role: link.role,
        displayOrder: link.displayOrder,
      })),
      assets: assets.map((asset) => ({
        assetId: asset.id,
        kind: asset.kind,
        classification: asset.classification,
        status: asset.status,
        deletedAt: asset.deletedAt,
      })),
      derivatives: derivatives.map((derivative) => ({
        assetId: derivative.assetId,
        kind: derivative.kind,
        status: derivative.status,
        isWatermarked: derivative.isWatermarked,
        storageKey: derivative.storageKey,
      })),
      // Empty, and read from nowhere (`APP12-N02.B01`). This write judges the
      // media selection alone: it refuses on the three media requirement codes
      // and on no other, so the sellability requirements cannot change its
      // verdict and reading two more tables to compute a value that is then
      // filtered away would be a cost with no consequence. A published Product
      // that has become structurally unsellable is also exactly the one an
      // operator most needs to be able to fix an image on.
      variants: [],
      skus: [],
    };

    const unsatisfied = unsatisfiedMediaRequirements(evaluatePublicationReadiness(facts));
    if (unsatisfied.length > 0) {
      // Nothing has been written yet, so the rollback that follows has nothing
      // to undo: the Product keeps its status, its old images and every
      // commercial field.
      throw productDraftError('PRODUCT_MEDIA_NOT_PUBLISHABLE', unsatisfied);
    }
  }

  /**
   * Maps a guard miss onto the one error that describes what actually held.
   *
   * The pre-flight checks above already ruled on state and token against the
   * locked row, so reaching a miss here means the guard caught something the
   * lock could not — it is classified rather than collapsed into a 500.
   */
  private requireWritten(result: GuardedWriteResult): ProductDraft {
    if (result.ok) {
      return result.product;
    }
    if (result.reason === 'NOT_FOUND') {
      throw productDraftError('PRODUCT_NOT_FOUND');
    }
    throw productDraftError(
      result.reason === 'STATE' ? 'PRODUCT_NOT_EDITABLE' : 'PRODUCT_VERSION_CONFLICT',
    );
  }
}
