/**
 * The three Admin product write operations (`APP2-B02` §8.3–§8.5).
 *
 * The service owns orchestration and every lifecycle decision; the repository
 * owns persistence and opens no transaction of its own. Each operation is one
 * transaction, and nothing inside it touches object storage or the network.
 *
 * Two rules shape all three:
 *
 * - **Guarded writes only.** Identity, the allowed source state and the exact
 *   `updated_at` the caller read all travel into the same UPDATE. A read, a
 *   decision and then a write would let a concurrent request commit in between
 *   and the guard would have proved nothing.
 * - **The client never names a derived value.** Slug, status, currency, display
 *   order and media roles are all server-owned (IMP-D032), so a request cannot
 *   put the row into a state publication would later have to repair.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { productDraftError } from '../domain/product-draft.errors';
import {
  PRODUCT_ARCHIVABLE_STATES,
  PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
  PRODUCT_DRAFT_DISPLAY_ORDER,
  PRODUCT_EDITABLE_STATES,
} from '../domain/product-draft.policy';
import { deriveProductSlugBase, deriveProductSlugFallback } from '../domain/product-slug';
import {
  PRODUCT_DRAFT_REPOSITORY,
  type GuardedWriteResult,
  type ProductDraft,
  type ProductDraftId,
  type ProductDraftRepository,
  type UpdateProductDraftFields,
} from '../domain/repositories/product-draft.repository';
import { CategoryResolver } from './category-resolver.service';
import { ProductMediaSelection } from './product-media-selection.service';
import { toDetailView, type ProductDetailView } from './product-projection';

export interface CreateProductDraftCommand {
  readonly categorySlug: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateProductDraftCommand {
  readonly productId: string;
  readonly expectedUpdatedAt: Date;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly basePriceAmount?: string | undefined;
  readonly categorySlug?: string | undefined;
  /** Complete ordered replacement when present; omitted means "leave as is". */
  readonly mediaAssetIds?: readonly string[] | undefined;
}

export interface ArchiveProductDraftCommand {
  readonly productId: string;
  readonly expectedUpdatedAt: Date;
}

@Injectable()
export class ProductDraftService {
  constructor(
    @Inject(PRODUCT_DRAFT_REPOSITORY) private readonly products: ProductDraftRepository,
    private readonly categories: CategoryResolver,
    private readonly mediaSelection: ProductMediaSelection,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Creates the canonical DRAFT.
   *
   * Media is deliberately not accepted here: DB7's create seam takes no media,
   * and PATCH already owns complete ordered replacement, so accepting it in two
   * places would mean two code paths that must agree about ordering forever.
   */
  async create(command: CreateProductDraftCommand): Promise<ProductDetailView> {
    return this.transactions.runInTransaction(async () => {
      const category = await this.categories.requireBySlug(command.categorySlug);
      const id = newId() as ProductDraftId;
      const slug = await this.reserveSlug(command.name, id);

      const product = await this.products.create({
        id,
        categoryId: category.id,
        name: command.name,
        slug,
        description: command.description,
        // Locked sentinels: "no price yet" and "no curated order yet".
        basePriceAmount: PRODUCT_DRAFT_BASE_PRICE_AMOUNT,
        displayOrder: PRODUCT_DRAFT_DISPLAY_ORDER,
      });

      // No media, so no second read: a new draft's selection is empty.
      return toDetailView(product, []);
    });
  }

  async update(command: UpdateProductDraftCommand): Promise<ProductDetailView> {
    return this.transactions.runInTransaction(async () => {
      const fields: UpdateProductDraftFields = {
        ...(command.name === undefined ? {} : { name: command.name }),
        ...(command.description === undefined ? {} : { description: command.description }),
        ...(command.basePriceAmount === undefined
          ? {}
          : { basePriceAmount: command.basePriceAmount }),
        ...(command.categorySlug === undefined
          ? {}
          : { categoryId: (await this.categories.requireBySlug(command.categorySlug)).id }),
      };

      // Media is validated before the guarded write so an invalid Asset costs
      // nothing and leaves the current selection untouched.
      const links =
        command.mediaAssetIds === undefined
          ? undefined
          : await this.mediaSelection.resolve(command.mediaAssetIds);

      // The row is touched even when only media changed: `updated_at` is the
      // concurrency token for the whole product, and a media replacement that
      // left it alone would let a stale field write land afterwards.
      const result = await this.products.updateGuarded({
        id: command.productId as ProductDraftId,
        expectedUpdatedAt: command.expectedUpdatedAt,
        editableStates: PRODUCT_EDITABLE_STATES,
        fields,
      });
      const product = this.requireWritten(result);

      if (links !== undefined) {
        await this.products.replaceMedia(product.id, links);
      }

      const media = await this.products.findMedia(product.id);
      return toDetailView(product, media);
    });
  }

  /**
   * Archives a draft. This is not a delete: the row, its media links, the
   * Assets and their derivatives all survive, and nothing about publication is
   * touched — `APP2-B03` owns that.
   */
  async archive(command: ArchiveProductDraftCommand): Promise<ProductDetailView> {
    return this.transactions.runInTransaction(async () => {
      const result = await this.products.archiveGuarded({
        id: command.productId as ProductDraftId,
        expectedUpdatedAt: command.expectedUpdatedAt,
        archivableStates: PRODUCT_ARCHIVABLE_STATES,
      });
      const product = this.requireWritten(result, 'PRODUCT_ARCHIVE_NOT_ALLOWED');
      const media = await this.products.findMedia(product.id);
      return toDetailView(product, media);
    });
  }

  /**
   * Reserves the slug: the readable base first, then exactly one id-derived
   * fallback.
   *
   * A pre-check rather than catching a unique violation, because the insert
   * happens later in the same transaction and a caught constraint error there
   * would already have aborted it. Two attempts only — a third would be
   * guessing, and `PRODUCT_SLUG_CONFLICT` tells the operator something real.
   */
  private async reserveSlug(name: string, productId: ProductDraftId): Promise<string> {
    const base = deriveProductSlugBase(name);
    if (!(await this.slugTaken(base))) {
      return base;
    }
    const fallback = deriveProductSlugFallback(base, productId);
    if (!(await this.slugTaken(fallback))) {
      return fallback;
    }
    throw productDraftError('PRODUCT_SLUG_CONFLICT');
  }

  private async slugTaken(slug: string): Promise<boolean> {
    return (await this.products.findBySlug(slug)) !== undefined;
  }

  /** Maps a guard miss onto the one error that describes what actually held. */
  private requireWritten(
    result: GuardedWriteResult,
    stateError: 'PRODUCT_NOT_EDITABLE' | 'PRODUCT_ARCHIVE_NOT_ALLOWED' = 'PRODUCT_NOT_EDITABLE',
  ): ProductDraft {
    if (result.ok) {
      return result.product;
    }
    if (result.reason === 'NOT_FOUND') {
      throw productDraftError('PRODUCT_NOT_FOUND');
    }
    if (result.reason === 'STATE') {
      throw productDraftError(stateError);
    }
    throw productDraftError('PRODUCT_VERSION_CONFLICT');
  }
}
