/**
 * The two Admin product read operations (`APP2-B02` §8.1/§8.2).
 *
 * Keyset paging only: DB5 chose it for every launch-critical list, and an
 * offset page would drift under a concurrent create — the operator would see a
 * row twice or miss one entirely while paging.
 *
 * A malformed cursor is a client error and must never be treated as "start from
 * the beginning": a caller paging through the catalog would silently restart
 * and process every product a second time.
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildPage, decodeCursor, resolveLimit } from '@embroidery/persistence';
import type { ProductState } from '@embroidery/database';

import { productDraftError } from '../domain/product-draft.errors';
import {
  PRODUCT_DRAFT_REPOSITORY,
  type ProductDraft,
  type ProductDraftId,
  type ProductDraftRepository,
} from '../domain/repositories/product-draft.repository';
import { CategoryResolver } from './category-resolver.service';
import {
  toDetailView,
  toSummaryView,
  type ProductDetailView,
  type ProductListView,
} from './product-projection';

export interface ListProductsInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: ProductState | undefined;
  readonly categorySlug?: string | undefined;
}

@Injectable()
export class ProductDraftQuery {
  constructor(
    @Inject(PRODUCT_DRAFT_REPOSITORY) private readonly products: ProductDraftRepository,
    private readonly categories: CategoryResolver,
  ) {}

  async detail(productId: string): Promise<ProductDetailView> {
    const product = await this.products.findById(productId as ProductDraftId);
    if (product === undefined) {
      throw productDraftError('PRODUCT_NOT_FOUND');
    }
    const media = await this.products.findMedia(product.id);
    return toDetailView(product, media);
  }

  /**
   * One keyset page.
   *
   * The default carries **no status filter**: A02 needs to see drafts and
   * archived products together and choose, so silently hiding archived rows
   * would make the archive filter untestable and the list a lie about the
   * catalog. Ordering is `created_at DESC, id DESC` — newest first, with the
   * tie-breaker DB5 requires because `created_at` is not unique.
   */
  async list(input: ListProductsInput): Promise<ProductListView> {
    const limit = resolveLimit(input.limit);
    const after = decodePosition(input.cursor);

    const categoryId =
      input.categorySlug === undefined
        ? undefined
        : (await this.categories.requireBySlug(input.categorySlug)).id;

    const rows = await this.products.list({
      filter: { status: input.status, categoryId },
      after,
      limit,
    });

    const page = buildPage(rows, limit, (product: ProductDraft) => ({
      sortValue: product.createdAt.toISOString(),
      tieBreaker: product.id,
    }));

    // Media for the whole page in one round trip, never one query per product.
    const media = await this.products.findMediaFor(page.items.map((product) => product.id));

    return {
      items: page.items.map((product) => toSummaryView(product, media.get(product.id) ?? [])),
      nextCursor: page.nextCursor,
      hasNext: page.nextCursor !== undefined,
    };
  }
}

function decodePosition(
  cursor: string | undefined,
): { readonly createdAt: Date; readonly id: string } | undefined {
  if (cursor === undefined || cursor === '') {
    return undefined;
  }
  try {
    const decoded = decodeCursor(cursor);
    const createdAt = new Date(decoded.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw productDraftError('PRODUCT_CURSOR_INVALID');
    }
    return { createdAt, id: decoded.tieBreaker };
  } catch {
    throw productDraftError('PRODUCT_CURSOR_INVALID');
  }
}
