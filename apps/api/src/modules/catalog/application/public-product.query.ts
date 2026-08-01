/**
 * The two public catalog queries (`APP2-B04`).
 *
 * Orchestration only: resolve the page window, ask the repository, project.
 * There is no transaction, no lock, no cache and no write — the invariant that
 * unpublish takes effect on the next read is satisfied by there being nothing
 * between the caller and the row.
 *
 * The service never learns *why* a detail lookup failed. The repository returns
 * a row or it does not; unknown slug, draft, archived and a product whose
 * category is not public all collapse to the same absence here, and therefore
 * to the same 404 at the boundary.
 */
import { Inject, Injectable } from '@nestjs/common';
import { resolveLimit } from '@embroidery/persistence';

import {
  publicProductNotFound,
  publicProductQueryInvalid,
} from '../domain/public-product-catalog.errors';
import {
  decodePublicProductCursor,
  encodePublicProductCursor,
} from '../domain/public-product-cursor';
import {
  PUBLIC_PRODUCT_REPOSITORY,
  type PublicProductListRow,
  type PublicProductRepository,
} from '../domain/repositories/public-product.repository';
import {
  toPublicProductDetail,
  toPublicProductSummary,
  type PublicProductDetailView,
  type PublicProductSummary,
} from './public-product.projection';

export interface PublicProductListInput {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly categorySlug?: string | undefined;
}

export interface PublicProductListView {
  readonly items: readonly PublicProductSummary[];
  readonly hasNext: boolean;
  readonly nextCursor: string | null;
}

@Injectable()
export class PublicProductQuery {
  constructor(
    @Inject(PUBLIC_PRODUCT_REPOSITORY) private readonly products: PublicProductRepository,
  ) {}

  async list(input: PublicProductListInput): Promise<PublicProductListView> {
    const limit = this.resolvePageSize(input.limit);
    const after =
      input.cursor === undefined || input.cursor === ''
        ? undefined
        : decodePublicProductCursor(input.cursor, input.categorySlug);

    // Over-fetch by one: that extra row answers "is there a next page" without
    // a second COUNT, and is discarded rather than returned.
    const rows = await this.products.listPublished({
      limit: limit + 1,
      categorySlug: input.categorySlug,
      after,
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: page.map(toPublicProductSummary),
      hasNext,
      nextCursor: hasNext ? this.cursorAfter(page, input.categorySlug) : null,
    };
  }

  async detail(slug: string): Promise<PublicProductDetailView> {
    const found = await this.products.findPublishedBySlug(slug);
    if (found === undefined) {
      throw publicProductNotFound();
    }
    return toPublicProductDetail(found);
  }

  /**
   * `resolveLimit` clamps a large page size and rejects a nonsensical one. The
   * `RangeError` it throws is a transport-free contract failure, so it is
   * translated here rather than escaping as a 500.
   */
  private resolvePageSize(limit: number | undefined): number {
    try {
      return resolveLimit(limit);
    } catch {
      throw publicProductQueryInvalid();
    }
  }

  /** The position of the last row actually returned, bound to this filter. */
  private cursorAfter(
    page: readonly PublicProductListRow[],
    categorySlug: string | undefined,
  ): string | null {
    const last = page[page.length - 1];
    if (last === undefined) {
      return null;
    }
    return encodePublicProductCursor({
      displayOrder: last.displayOrder,
      id: last.id,
      categorySlug,
    });
  }
}
