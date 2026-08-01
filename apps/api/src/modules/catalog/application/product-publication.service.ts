/**
 * Product publish and unpublish (`APP2-B03` §9/§10, LC-04 / IMP-D035).
 *
 * The rule that shapes everything here: **publish never trusts a previous
 * readiness read.** The readiness GET is a report about a moment that has
 * already passed — a category can be archived, an Asset rejected or a derivative
 * regenerated between that response and this command. So the transaction locks
 * every fact it depends on, recomputes readiness from the locked rows, and only
 * then performs the guarded transition.
 *
 * Nothing in either transaction touches object storage or the network. Every
 * fact is durable PostgreSQL state.
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
  PRODUCT_PUBLISHABLE_STATES,
  PRODUCT_PUBLISHED_STATE,
  PRODUCT_UNPUBLISHABLE_STATES,
  PRODUCT_UNPUBLISHED_STATE,
} from '../domain/product-publication.policy';
import {
  evaluatePublicationReadiness,
  unsatisfiedRequirements,
  type ProductPublicationFacts,
  type ProductPublicationReadiness,
} from '../domain/product-publication.readiness';
import type { ProductDraft, ProductDraftId } from '../domain/repositories/product-draft.repository';
import {
  PRODUCT_PUBLICATION_REPOSITORY,
  type ProductPublicationRepository,
  type ProductPublicationSnapshot,
} from '../domain/repositories/product-publication.repository';
import { ProductPublicationRecorder } from './product-publication.recorder';
import {
  toPublicationView,
  toReadinessView,
  type ProductPublicationView,
  type ProductPublicationReadinessView,
} from './product-publication.projection';

/** The catalog-media lane an attached Asset must belong to. */
const ASSET_SCOPE = {
  kind: PRODUCT_MEDIA_ASSET_KIND,
  classification: PRODUCT_MEDIA_ASSET_CLASSIFICATION,
} as const;

export interface ProductPublicationCommand {
  readonly productId: string;
  readonly expectedUpdatedAt: Date;
}

@Injectable()
export class ProductPublicationService {
  constructor(
    @Inject(PRODUCT_PUBLICATION_REPOSITORY)
    private readonly products: ProductPublicationRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    private readonly recorder: ProductPublicationRecorder,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * The readiness report.
   *
   * Side-effect-free by construction: it opens no transaction, takes no lock,
   * writes no Audit or Outbox row and makes no storage call. It is a read.
   */
  async readiness(productId: string): Promise<ProductPublicationReadinessView> {
    const snapshot = await this.products.readSnapshot(productId as ProductDraftId);
    const product = this.requireProduct(snapshot);
    const readiness = await this.evaluate(product, snapshot, false);
    return toReadinessView(product, readiness);
  }

  /**
   * `TR-LC04-01` — `DRAFT → PUBLISHED`.
   *
   * The full §9 sequence in one transaction: lock the root, compare the token,
   * lock and re-read every dependency, recompute readiness, transition,
   * advance the token, append evidence, commit.
   */
  async publish(command: ProductPublicationCommand): Promise<ProductPublicationView> {
    return this.transactions.runInTransaction(async () => {
      const snapshot = await this.products.lockSnapshot(command.productId as ProductDraftId);
      const product = this.requireProduct(snapshot);

      // Both guards are checked against the locked row before any readiness work
      // is done, so a stale or wrong-state request costs one statement and can
      // never be reported as "not ready".
      this.requireToken(product, command.expectedUpdatedAt);
      if (!(PRODUCT_PUBLISHABLE_STATES as readonly string[]).includes(product.status)) {
        throw productDraftError('PRODUCT_PUBLISH_NOT_ALLOWED');
      }

      // Recomputed from rows locked in *this* transaction — never from the GET.
      const readiness = await this.evaluate(product, snapshot, true);
      if (!readiness.eligible) {
        // Atomic refusal: nothing has been written, so the rollback that follows
        // has nothing to undo and the product is exactly as it was.
        throw productDraftError(
          'PRODUCT_PUBLICATION_NOT_READY',
          unsatisfiedRequirements(readiness),
        );
      }

      return this.transition(product, {
        expectedUpdatedAt: command.expectedUpdatedAt,
        fromStates: PRODUCT_PUBLISHABLE_STATES,
        toState: PRODUCT_PUBLISHED_STATE,
        transition: 'PUBLISHED',
        stateError: 'PRODUCT_PUBLISH_NOT_ALLOWED',
      });
    });
  }

  /**
   * `TR-LC04-05` — `PUBLISHED → DRAFT`.
   *
   * Readiness is deliberately **not** re-run: withdrawing a product from public
   * view must not depend on it still being publishable. A product whose category
   * was archived after publication is exactly the one an operator most needs to
   * be able to unpublish.
   *
   * Deletes nothing. Slug, category, price, media links, Assets, derivatives and
   * stored objects all survive untouched, and `archived_at` is never written.
   */
  async unpublish(command: ProductPublicationCommand): Promise<ProductPublicationView> {
    return this.transactions.runInTransaction(async () => {
      const snapshot = await this.products.lockSnapshot(command.productId as ProductDraftId);
      const product = this.requireProduct(snapshot);

      this.requireToken(product, command.expectedUpdatedAt);
      if (!(PRODUCT_UNPUBLISHABLE_STATES as readonly string[]).includes(product.status)) {
        throw productDraftError('PRODUCT_UNPUBLISH_NOT_ALLOWED');
      }

      return this.transition(product, {
        expectedUpdatedAt: command.expectedUpdatedAt,
        fromStates: PRODUCT_UNPUBLISHABLE_STATES,
        toState: PRODUCT_UNPUBLISHED_STATE,
        transition: 'UNPUBLISHED',
        stateError: 'PRODUCT_UNPUBLISH_NOT_ALLOWED',
      });
    });
  }

  /**
   * The guarded transition plus its durable evidence, shared by both commands.
   *
   * The UPDATE carries the identity, the allowed source states and the exact
   * token in one statement, so the check the pre-flight guards made cannot have
   * gone stale between the check and the write.
   */
  private async transition(
    product: ProductDraft,
    input: {
      readonly expectedUpdatedAt: Date;
      readonly fromStates: readonly ('DRAFT' | 'PUBLISHED')[];
      readonly toState: 'DRAFT' | 'PUBLISHED';
      readonly transition: 'PUBLISHED' | 'UNPUBLISHED';
      readonly stateError: 'PRODUCT_PUBLISH_NOT_ALLOWED' | 'PRODUCT_UNPUBLISH_NOT_ALLOWED';
    },
  ): Promise<ProductPublicationView> {
    const written = await this.products.transitionGuarded({
      id: product.id,
      expectedUpdatedAt: input.expectedUpdatedAt,
      fromStates: input.fromStates,
      toState: input.toState,
    });

    if (written === undefined) {
      const reason = await this.products.explainTransitionMiss(
        product.id,
        input.expectedUpdatedAt,
        input.fromStates,
      );
      if (reason === 'NOT_FOUND') {
        throw productDraftError('PRODUCT_NOT_FOUND');
      }
      throw productDraftError(reason === 'STATE' ? input.stateError : 'PRODUCT_VERSION_CONFLICT');
    }

    // Same transaction as the transition, so the product row, the audit row and
    // the outbox row commit together or not at all.
    await this.recorder.record({
      transition: input.transition,
      productId: written.id,
      slug: written.slug,
      fromStatus: product.status,
      toStatus: written.status,
    });

    return toPublicationView(written);
  }

  /**
   * Gathers Asset and derivative facts and evaluates the closed requirement set.
   *
   * `locked` is the only difference between the readiness read and the publish
   * recheck: the same evaluator runs over the same shape either way, which is
   * what makes "publish re-evaluates exactly what readiness reported" a
   * structural property rather than a promise about two code paths.
   *
   * Both reads are batched. A product with twenty images costs two statements,
   * not forty.
   */
  private async evaluate(
    product: ProductDraft,
    snapshot: ProductPublicationSnapshot,
    locked: boolean,
  ): Promise<ProductPublicationReadiness> {
    const assetIds = [...new Set(snapshot.media.map((link) => link.assetId))] as AssetId[];

    const assets = locked
      ? await this.assets.lockScopedByIds(assetIds, ASSET_SCOPE)
      : await this.assets.findScopedByIds(assetIds, ASSET_SCOPE);

    const derivatives = locked
      ? await this.assets.lockDerivativesFor(assetIds)
      : await this.assets.listDerivativesFor(assetIds);

    const facts: ProductPublicationFacts = {
      product,
      category: snapshot.category,
      media: snapshot.media,
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
    };

    return evaluatePublicationReadiness(facts);
  }

  private requireProduct(snapshot: ProductPublicationSnapshot): ProductDraft {
    if (snapshot.product === undefined) {
      throw productDraftError('PRODUCT_NOT_FOUND');
    }
    return snapshot.product;
  }

  /**
   * The token comparison, made against database truth rather than the request.
   *
   * Compared at millisecond precision because that is the precision the public
   * token is published at; the guarded UPDATE re-checks the same thing, so this
   * is a fast, well-classified refusal, not the safety mechanism.
   */
  private requireToken(product: ProductDraft, expectedUpdatedAt: Date): void {
    if (product.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw productDraftError('PRODUCT_VERSION_CONFLICT');
    }
  }
}
