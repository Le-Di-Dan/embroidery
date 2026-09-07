/**
 * Drizzle implementation of the two public catalog reads (`APP2-B04`).
 *
 * ## Visibility is in the SQL, not above it
 *
 * `status = 'PUBLISHED'` and the public-category join are part of every
 * statement here. A caller cannot forget them, and there is no code path that
 * returns a draft row for a service to filter out later — the row never
 * arrives.
 *
 * ## Media eligibility is the delivery route's own predicate
 *
 * A media reference is only projected when the bytes behind it would actually
 * be served. The eligibility conditions below are exactly those
 * `drizzle-public-product-media.repository.ts` applies on delivery — same asset
 * lane, same derivative kind, same READY/unwatermarked/storage-key checks —
 * reusing the same constants. If they drifted, the catalogue would advertise
 * addresses that 404, which is the one media defect a JSON contract can create
 * on its own.
 *
 * ## No N+1
 *
 * The list resolves each card's thumbnail association with a correlated
 * subquery inside the single list statement, so a page of twenty products is
 * one round trip. The detail is two statements — the product graph and its
 * ordered media — which is constant, not per-item.
 *
 * The repository opens no transaction (DEC-DB7-006): these are ordinary reads,
 * and each one is already a single consistent snapshot.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';

import type {
  PublicIndexableProductRow,
  PublicLinkedProductRow,
  PublicProductDetail,
  PublicProductDetailMediaRow,
  PublicProductListQuery,
  PublicProductListRow,
  PublicProductRepository,
} from '../../domain/repositories/public-product.repository';
import {
  APP2_CATEGORY_STATUS,
  PUBLIC_DETAIL_RENDITION,
  PUBLIC_LIST_MEDIA_ROLE,
  PUBLIC_LIST_RENDITION,
  PUBLIC_PRODUCT_VISIBLE_STATE,
} from '../../domain/public-product-catalog.policy';
import { DERIVATIVE_KIND_BY_RENDITION } from '../../domain/public-product-media.policy';
import { toIntrinsicSize } from '../../domain/public-media-dimensions';
import {
  assetEligibility,
  DERIVATIVE_HEIGHT_SELECTION,
  DERIVATIVE_WIDTH_SELECTION,
  deliverableMediaColumn,
  derivativeEligibility,
  effectivePrimaryDetailOrder,
  MEDIA_ID_SELECTION,
  thumbnailDerivative,
  thumbnailDerivativeJoin,
} from './public-product-media.sql';

const { products, categories, productMedia, assets, assetDerivatives } = schema;

@Injectable()
export class DrizzlePublicProductRepository
  extends DrizzleRepository
  implements PublicProductRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listPublished(query: PublicProductListQuery): Promise<readonly PublicProductListRow[]> {
    const conditions = [
      eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
      eq(categories.status, APP2_CATEGORY_STATUS),
      isNull(categories.archivedAt),
    ];
    if (query.categorySlug !== undefined) {
      conditions.push(eq(categories.slug, query.categorySlug));
    }
    // Keyset, not OFFSET: strict lexicographic "after" on the exact ordering
    // tuple. Expressed as (sort > s) OR (sort = s AND id > i) so it matches the
    // IDX-065 key order rather than forcing a row-value comparison.
    if (query.after !== undefined) {
      const { displayOrder, id } = query.after;
      conditions.push(
        or(
          gt(products.displayOrder, displayOrder),
          and(eq(products.displayOrder, displayOrder), gt(products.id, id)),
        )!,
      );
    }

    const rows = await this.db
      .select({
        id: products.id,
        displayOrder: products.displayOrder,
        slug: products.slug,
        name: products.name,
        basePriceAmount: products.basePriceAmount,
        currencyCode: products.currencyCode,
        isDisplayOutOfStock: products.isDisplayOutOfStock,
        categorySlug: categories.slug,
        categoryName: categories.name,
        thumbnailProductMediaId: deliverableMediaColumn<string>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          MEDIA_ID_SELECTION,
        ),
        thumbnailWidth: deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_WIDTH_SELECTION,
        ),
        thumbnailHeight: deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_HEIGHT_SELECTION,
        ),
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(...conditions))
      .orderBy(asc(products.displayOrder), asc(products.id))
      .limit(query.limit);

    return rows.map(({ thumbnailWidth, thumbnailHeight, ...row }) => ({
      ...row,
      thumbnailProductMediaId: row.thumbnailProductMediaId ?? undefined,
      thumbnailSize: toIntrinsicSize(thumbnailWidth, thumbnailHeight),
    }));
  }

  async findPublishedBySlug(slug: string): Promise<PublicProductDetail | undefined> {
    const [product] = await this.db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        description: products.description,
        basePriceAmount: products.basePriceAmount,
        currencyCode: products.currencyCode,
        isDisplayOutOfStock: products.isDisplayOutOfStock,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
        isIndexable: products.isIndexable,
        categorySlug: categories.slug,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.slug, slug),
          eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
          eq(categories.status, APP2_CATEGORY_STATUS),
          isNull(categories.archivedAt),
        ),
      )
      .limit(1);

    if (product === undefined) {
      return undefined;
    }

    const media = await this.deliverableMedia(product.id);

    return {
      product: {
        slug: product.slug,
        name: product.name,
        description: product.description ?? undefined,
        basePriceAmount: product.basePriceAmount,
        currencyCode: product.currencyCode,
        isDisplayOutOfStock: product.isDisplayOutOfStock,
        seoTitle: product.seoTitle ?? undefined,
        seoDescription: product.seoDescription ?? undefined,
        isIndexable: product.isIndexable,
        categorySlug: product.categorySlug,
        categoryName: product.categoryName,
      },
      media,
    };
  }

  async findPublishedSummaryById(productId: string): Promise<PublicLinkedProductRow | undefined> {
    const [row] = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        thumbnailProductMediaId: deliverableMediaColumn<string>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          MEDIA_ID_SELECTION,
        ),
        thumbnailWidth: deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_WIDTH_SELECTION,
        ),
        thumbnailHeight: deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_HEIGHT_SELECTION,
        ),
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.id, productId),
          // The same three terms the other two reads apply, from the same
          // constants. A linking surface must not become a second, laxer
          // definition of what "publicly visible" means.
          eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
          eq(categories.status, APP2_CATEGORY_STATUS),
          isNull(categories.archivedAt),
        ),
      )
      .limit(1);

    if (row === undefined) {
      return undefined;
    }
    const { thumbnailWidth, thumbnailHeight, ...summary } = row;
    return {
      ...summary,
      thumbnailProductMediaId: summary.thumbnailProductMediaId ?? undefined,
      thumbnailSize: toIntrinsicSize(thumbnailWidth, thumbnailHeight),
    };
  }

  /**
   * The three visibility terms of the reads above, from the same constants —
   * a laxer rule would advertise addresses the detail route refuses — plus the
   * only indexability filter in this repository (`APP11-B04`). `uq_products__slug`
   * (IDX-011) makes `slug` a total order, so no tie-breaker is owed.
   */
  async listIndexable(limit: number): Promise<readonly PublicIndexableProductRow[]> {
    return this.db
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.status, PUBLIC_PRODUCT_VISIBLE_STATE),
          eq(categories.status, APP2_CATEGORY_STATUS),
          isNull(categories.archivedAt),
          eq(products.isIndexable, true),
        ),
      )
      .orderBy(asc(products.slug))
      .limit(limit);
  }

  /**
   * The product's images, in persisted `display_order`, restricted to those
   * whose catalog-preview derivative would really stream. `id` breaks ties so
   * the order is total even if two rows shared a position.
   */
  private async deliverableMedia(
    productId: string,
  ): Promise<readonly PublicProductDetailMediaRow[]> {
    return (
      this.db
        .select({
          productMediaId: productMedia.id,
          role: productMedia.role,
          displayOrder: productMedia.displayOrder,
          // Direct columns, not a subquery: this statement already INNER JOINs the
          // exact derivative the detail URL addresses, so the dimensions cannot
          // describe a different one.
          width: assetDerivatives.widthPx,
          height: assetDerivatives.heightPx,
          // The same association's small rendition, from the second alias. Its id
          // is the presence flag: dimensions are legitimately absent on historical
          // derivatives (`APP12-H05-C1`), so "has no size" must not be read as
          // "has no thumbnail".
          thumbnailDerivativeId: thumbnailDerivative.id,
          thumbnailWidth: thumbnailDerivative.widthPx,
          thumbnailHeight: thumbnailDerivative.heightPx,
        })
        .from(productMedia)
        .innerJoin(assets, eq(assets.id, productMedia.assetId))
        .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
        .leftJoin(thumbnailDerivative, and(...thumbnailDerivativeJoin()))
        .where(
          and(
            eq(productMedia.productId, productId),
            ...assetEligibility(),
            eq(assetDerivatives.kind, DERIVATIVE_KIND_BY_RENDITION[PUBLIC_DETAIL_RENDITION]),
            ...derivativeEligibility(),
          ),
        )
        // `PUBLIC_EFFECTIVE_PRIMARY_ORDER` — the same four keys the card's
        // correlated subquery uses, so `media[0]` here and the card's thumbnail
        // there are the same association by construction rather than by
        // coincidence.
        .orderBy(...effectivePrimaryDetailOrder(PUBLIC_LIST_MEDIA_ROLE))
        .then((rows) =>
          rows.map(
            ({
              width,
              height,
              thumbnailDerivativeId,
              thumbnailWidth,
              thumbnailHeight,
              ...media
            }) => ({
              ...media,
              size: toIntrinsicSize(width, height),
              thumbnailAvailable: thumbnailDerivativeId !== null,
              thumbnailSize: toIntrinsicSize(thumbnailWidth, thumbnailHeight),
            }),
          ),
        )
    );
  }
}
