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
import { and, asc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

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
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PUBLIC_DETAIL_RENDITION,
  PUBLIC_LIST_MEDIA_ROLE,
  PUBLIC_LIST_RENDITION,
  PUBLIC_PRODUCT_VISIBLE_STATE,
} from '../../domain/public-product-catalog.policy';
import { DERIVATIVE_KIND_BY_RENDITION } from '../../domain/public-product-media.policy';
import { toIntrinsicSize } from '../../domain/public-media-dimensions';

const { products, categories, productMedia, assets, assetDerivatives } = schema;

/**
 * Explicitly qualified select-list references for the correlated subqueries.
 *
 * Not `productMedia.id` / `assetDerivatives.widthPx`: Drizzle strips table
 * qualification from a *select-list* position, and the subquery joins three
 * tables that each carry an `id`, so an unqualified reference is ambiguous and
 * PostgreSQL refuses it. `APP11-B03` hit exactly this and its gallery twin
 * carries the same note; the dimension columns are spelled out for the same
 * reason even though only one table declares them today.
 */
const MEDIA_ID_SELECTION = sql`${sql.identifier('product_media')}.${sql.identifier('id')}`;
const DERIVATIVE_WIDTH_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('width_px')}`;
const DERIVATIVE_HEIGHT_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('height_px')}`;

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
        thumbnailProductMediaId: this.deliverableMediaColumn<string>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          MEDIA_ID_SELECTION,
        ),
        thumbnailWidth: this.deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_WIDTH_SELECTION,
        ),
        thumbnailHeight: this.deliverableMediaColumn<number>(
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
        thumbnailProductMediaId: this.deliverableMediaColumn<string>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          MEDIA_ID_SELECTION,
        ),
        thumbnailWidth: this.deliverableMediaColumn<number>(
          DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION],
          PUBLIC_LIST_MEDIA_ROLE,
          DERIVATIVE_WIDTH_SELECTION,
        ),
        thumbnailHeight: this.deliverableMediaColumn<number>(
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
    return this.db
      .select({
        productMediaId: productMedia.id,
        role: productMedia.role,
        displayOrder: productMedia.displayOrder,
        // Direct columns, not a subquery: this statement already INNER JOINs the
        // exact derivative the detail URL addresses, so the dimensions cannot
        // describe a different one.
        width: assetDerivatives.widthPx,
        height: assetDerivatives.heightPx,
      })
      .from(productMedia)
      .innerJoin(assets, eq(assets.id, productMedia.assetId))
      .innerJoin(assetDerivatives, eq(assetDerivatives.assetId, assets.id))
      .where(
        and(
          eq(productMedia.productId, productId),
          ...assetEligibility(),
          eq(assetDerivatives.kind, DERIVATIVE_KIND_BY_RENDITION[PUBLIC_DETAIL_RENDITION]),
          ...derivativeEligibility(),
        ),
      )
      .orderBy(asc(productMedia.displayOrder), asc(productMedia.id))
      .then((rows) =>
        rows.map(({ width, height, ...media }) => ({
          ...media,
          size: toIntrinsicSize(width, height),
        })),
      );
  }

  /**
   * Correlated scalar subquery for one column of a card's thumbnail row.
   *
   * `limit 1` with an explicit order makes the choice deterministic even though
   * `APP2-B02` writes exactly one `THUMBNAIL` per product: relying on "there can
   * only be one" would make this query's result depend on a rule enforced
   * somewhere else.
   *
   * `APP12-H05-C1` parameterised the selection so the association id and the
   * intrinsic dimensions of the derivative behind it come from **the same
   * subquery text** — identical predicate, identical total order, identical
   * `limit 1` — differing only in the column projected. That is what makes
   * "the URL and the dimensions describe the same derivative" a property of the
   * SQL rather than an argument about it. `public-media-dimensions.integration`
   * proves it behaviourally against a product whose two associations carry
   * deliberately different sizes.
   */
  private deliverableMediaColumn<T>(derivativeKind: string, role: string, selection: SQL) {
    return sql<T | null>`(
      select ${selection}
      from ${productMedia}
      join ${assets} on ${assets.id} = ${productMedia.assetId}
      join ${assetDerivatives} on ${assetDerivatives.assetId} = ${assets.id}
      where ${productMedia.productId} = ${products.id}
        and ${productMedia.role} = ${role}
        and ${assets.kind} = ${PRODUCT_MEDIA_ASSET_KIND}
        and ${assets.classification} = ${PRODUCT_MEDIA_ASSET_CLASSIFICATION}
        and ${assets.status} = ${PRODUCT_MEDIA_ASSET_STATUS}
        and ${assets.deletedAt} is null
        and ${assetDerivatives.kind} = ${derivativeKind}
        and ${assetDerivatives.status} = ${PRODUCT_PUBLICATION_DERIVATIVE_STATE}
        and ${assetDerivatives.isWatermarked} = false
        and ${assetDerivatives.storageKey} is not null
      order by ${productMedia.displayOrder} asc, ${productMedia.id} asc
      limit 1
    )`;
  }
}

/** The asset lane a public catalogue image must belong to. */
function assetEligibility() {
  return [
    eq(assets.kind, PRODUCT_MEDIA_ASSET_KIND),
    eq(assets.classification, PRODUCT_MEDIA_ASSET_CLASSIFICATION),
    eq(assets.status, PRODUCT_MEDIA_ASSET_STATUS),
    isNull(assets.deletedAt),
  ];
}

/** What makes a derivative servable: ready, unwatermarked, actually stored. */
function derivativeEligibility() {
  return [
    eq(assetDerivatives.status, PRODUCT_PUBLICATION_DERIVATIVE_STATE),
    eq(assetDerivatives.isWatermarked, false),
    isNotNull(assetDerivatives.storageKey),
  ];
}
