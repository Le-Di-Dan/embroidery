/**
 * Drizzle implementation of the placement contract (`APP3-B01`).
 *
 * ## Visibility and eligibility are in the SQL
 *
 * `findPublicPlacement` carries `status = 'PUBLISHED'`, the public-category
 * join and `retired_at IS NULL` in the statement itself, exactly as
 * `drizzle-public-product.repository.ts` does for the catalogue. A retired side
 * or a draft product never arrives for a service to filter out later.
 *
 * ## Eligibility is one predicate, applied where the row is read
 *
 * The editor-safe background test is a correlated `EXISTS` inside the side
 * query, so a Product with six sides is still one round trip. It asserts the
 * whole canonical quartet even though `ck_asset_derivatives__ready_normalized_
 * metadata` already guarantees it for a READY NORMALIZED row: the CHECK is the
 * reason the values are there, and this is the reason they are *required*. If
 * that CHECK were ever relaxed, this predicate would still refuse to advertise a
 * background whose size the Studio would have to guess.
 *
 * Inspection outcome is read as `assets.status = 'ACCEPTED'` rather than by
 * joining `asset_inspections`: IMP-D044 PO-12 rules that inspection detail is
 * append-only evidence and never runtime state authority, and LC-06 makes
 * `ACCEPTED` the state a CLEAN inspection produces.
 *
 * ## Nothing here deletes
 *
 * There is no `delete` in this file. IMP-D041 PO-07 makes retirement the removal
 * path, and the `tg_*__protected_guard` triggers would reject the delete anyway
 * — but the absence is deliberate, not merely unreachable.
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../../domain/repositories/placement-hierarchy.port';
import type {
  CreateAreaInput,
  CreateSideInput,
  PlacementAreaRow,
  PlacementLockResult,
  PlacementScopeReference,
  PlacementSideRow,
  PlacementSnapshot,
  ProductPlacementRepository,
  PublicPlacement,
  PublicPlacementSideRow,
  UpdateAreaFields,
  UpdateSideFields,
} from '../../domain/repositories/product-placement.repository';
import {
  APP2_CATEGORY_STATUS,
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  PRODUCT_PUBLISHED_STATE,
  SIDE_BACKGROUND_ASSET_CLASSIFICATION,
  SIDE_BACKGROUND_ASSET_KIND,
  SIDE_BACKGROUND_ASSET_STATUS,
} from '../../domain/product-placement.policy';
import { toArea, toSide } from './product-placement-row.mapper';
import {
  mediaTypeArrayLiteral,
  toPublicBackground,
  type EligibleBackgroundJson,
} from './public-background-metadata.mapper';

const { products, categories, productSides, embroideryAreas } = schema;

@Injectable()
export class DrizzleProductPlacementRepository
  extends DrizzleRepository
  implements ProductPlacementRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findPlacement(productId: ProductId): Promise<PlacementSnapshot | undefined> {
    return this.run('findPlacement', async () => {
      const [product] = await this.db
        .select({
          id: products.id,
          slug: products.slug,
          status: products.status,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (product === undefined) {
        return undefined;
      }
      const { sides, areas } = await this.loadPlacement(productId);
      return { product: { ...product, id: product.id as ProductId }, sides, areas };
    });
  }

  /**
   * Every side and area of the Product, retired rows included.
   *
   * Two statements, never one per side: the areas are fetched once for the whole
   * set of side ids (DB7 §21, no N+1). Ordering is the canonical
   * `display_order, code, id` tuple, so two sides sharing a position still come
   * back in the same sequence on every read.
   */
  async loadPlacement(productId: ProductId): Promise<Omit<PlacementSnapshot, 'product'>> {
    const sideRows = await this.db
      .select()
      .from(productSides)
      .where(eq(productSides.productId, productId))
      .orderBy(asc(productSides.displayOrder), asc(productSides.code), asc(productSides.id));

    const sideIds = sideRows.map((row) => row.id);
    const areaRows =
      sideIds.length === 0
        ? []
        : await this.db
            .select()
            .from(embroideryAreas)
            .where(inArray(embroideryAreas.productSideId, sideIds))
            .orderBy(
              asc(embroideryAreas.displayOrder),
              asc(embroideryAreas.code),
              asc(embroideryAreas.id),
            );

    return { sides: sideRows.map(toSide), areas: areaRows.map(toArea) };
  }

  /**
   * The guarded product touch that opens a replace.
   *
   * One statement does three jobs: it proves the caller's `updated_at` is still
   * current, it takes the row lock that serialises a second replace of the same
   * Product, and it advances the token so a stale write arriving afterwards is
   * refused. Splitting it into a read and a write would leave a window in which
   * both replaces believed they held the current version.
   */
  async lockProductForReplace(
    productId: ProductId,
    expectedUpdatedAt: Date,
  ): Promise<PlacementLockResult> {
    return this.run('lockProductForReplace', async () => {
      this.requireTransaction('lockProductForReplace');

      const [row] = await this.db
        .update(products)
        .set({ updatedAt: new Date() })
        .where(and(eq(products.id, productId), eq(products.updatedAt, expectedUpdatedAt)))
        .returning({
          id: products.id,
          slug: products.slug,
          status: products.status,
          updatedAt: products.updatedAt,
        });

      if (row !== undefined) {
        return { ok: true, product: { ...row, id: row.id as ProductId } };
      }

      // No row matched: either the product is gone or the token is stale. The
      // difference matters to the operator, so it costs one extra read.
      const [existing] = await this.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      return { ok: false, reason: existing === undefined ? 'NOT_FOUND' : 'VERSION' };
    });
  }

  async createSide(input: CreateSideInput): Promise<PlacementSideRow> {
    return this.run('createSide', async () => {
      this.requireTransaction('createSide');
      const [row] = await this.db.insert(productSides).values(input).returning();
      return toSide(expectWritten(row, 'createSide'));
    });
  }

  async createArea(input: CreateAreaInput): Promise<PlacementAreaRow> {
    return this.run('createArea', async () => {
      this.requireTransaction('createArea');
      const [row] = await this.db
        .insert(embroideryAreas)
        .values({
          ...input,
          maxWidthMm: input.maxWidthMm ?? null,
          maxHeightMm: input.maxHeightMm ?? null,
        })
        .returning();
      return toArea(expectWritten(row, 'createArea'));
    });
  }

  /**
   * Applies only the columns the caller named.
   *
   * The set is built from the supplied fields rather than from the whole row, so
   * a display-only edit of a **referenced** side writes only `name` and
   * `display_order` — and therefore passes `tg_product_sides__protected_guard`,
   * which compares the protected columns old-versus-new. Writing every column
   * back with unchanged values would also pass, but only by accident: a rounded
   * `numeric` round-trip would look like a geometry change and be rejected.
   */
  async updateSide(id: ProductSideId, fields: UpdateSideFields): Promise<void> {
    return this.run('updateSide', async () => {
      this.requireTransaction('updateSide');
      if (Object.keys(fields).length === 0) return;
      await this.db
        .update(productSides)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(productSides.id, id));
    });
  }

  async updateArea(id: EmbroideryAreaId, fields: UpdateAreaFields): Promise<void> {
    return this.run('updateArea', async () => {
      this.requireTransaction('updateArea');
      if (Object.keys(fields).length === 0) return;
      await this.db
        .update(embroideryAreas)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(embroideryAreas.id, id));
    });
  }

  async retireSide(id: ProductSideId, at: Date, supersededById?: ProductSideId): Promise<void> {
    return this.run('retireSide', async () => {
      this.requireTransaction('retireSide');
      await this.db
        .update(productSides)
        .set({ retiredAt: at, supersededById: supersededById ?? null, updatedAt: new Date() })
        .where(eq(productSides.id, id));
    });
  }

  async retireArea(
    id: EmbroideryAreaId,
    at: Date,
    supersededById?: EmbroideryAreaId,
  ): Promise<void> {
    return this.run('retireArea', async () => {
      this.requireTransaction('retireArea');
      await this.db
        .update(embroideryAreas)
        .set({ retiredAt: at, supersededById: supersededById ?? null, updatedAt: new Date() })
        .where(eq(embroideryAreas.id, id));
    });
  }

  async findPublicPlacement(slug: string): Promise<PublicPlacement | undefined> {
    return this.run('findPublicPlacement', async () => {
      const [product] = await this.db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(products.slug, slug),
            eq(products.status, PRODUCT_PUBLISHED_STATE),
            eq(categories.status, APP2_CATEGORY_STATUS),
            isNull(categories.archivedAt),
          ),
        )
        .limit(1);

      if (product === undefined) {
        return undefined;
      }

      const sideRows = await this.db
        .select({
          id: productSides.id,
          code: productSides.code,
          name: productSides.name,
          displayOrder: productSides.displayOrder,
          imageWidthPx: productSides.imageWidthPx,
          imageHeightPx: productSides.imageHeightPx,
          physicalWidthMm: productSides.physicalWidthMm,
          physicalHeightMm: productSides.physicalHeightMm,
          pxPerMm: productSides.pxPerMm,
          background: this.editorSafeBackgroundMetadata(),
        })
        .from(productSides)
        .where(and(eq(productSides.productId, product.id), isNull(productSides.retiredAt)))
        .orderBy(asc(productSides.displayOrder), asc(productSides.code), asc(productSides.id));

      const sideIds = sideRows.map((row) => row.id);
      const areaRows =
        sideIds.length === 0
          ? []
          : await this.db
              .select()
              .from(embroideryAreas)
              .where(
                and(
                  inArray(embroideryAreas.productSideId, sideIds),
                  isNull(embroideryAreas.retiredAt),
                ),
              )
              .orderBy(
                asc(embroideryAreas.displayOrder),
                asc(embroideryAreas.code),
                asc(embroideryAreas.id),
              );

      return {
        productId: product.id as ProductId,
        slug: product.slug,
        sides: sideRows.map((row): PublicPlacementSideRow => ({
          ...row,
          id: row.id as ProductSideId,
          background: toPublicBackground(row.background),
        })),
        areas: areaRows.map(toArea),
      };
    });
  }

  /**
   * The one-statement public-eligibility test for an exact triple (`APP3-B05`).
   *
   * Every condition is in the same `WHERE`, joined through the chain itself:
   * the Side's `product_id` must be the addressed Product and the Area's
   * `product_side_id` must be the addressed Side, so a Side of another Product
   * and an Area of another Side of the *same* Product both fail on the join
   * rather than on a comparison a caller could forget to write. The Product's
   * publication and its category's are the same two predicates
   * `findPublicPlacement` carries; retirement is `retired_at IS NULL` on both
   * rows. Nothing arrives for a service to filter afterwards.
   *
   * One row or none. There is no ordering and no page: the triple is unique by
   * construction (`products.id`, `product_sides.id`, `embroidery_areas.id` are
   * all primary keys), so `limit 1` is a guard rather than a selection.
   */
  async findPublicPlacementScope(
    reference: PlacementScopeReference,
  ): Promise<PlacementScopeReference | undefined> {
    return this.run('findPublicPlacementScope', async () => {
      const [row] = await this.db
        .select({
          productId: products.id,
          productSideId: productSides.id,
          embroideryAreaId: embroideryAreas.id,
        })
        .from(embroideryAreas)
        .innerJoin(productSides, eq(productSides.id, embroideryAreas.productSideId))
        .innerJoin(products, eq(products.id, productSides.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(embroideryAreas.id, reference.embroideryAreaId),
            eq(productSides.id, reference.productSideId),
            eq(products.id, reference.productId),
            isNull(embroideryAreas.retiredAt),
            isNull(productSides.retiredAt),
            eq(products.status, PRODUCT_PUBLISHED_STATE),
            eq(categories.status, APP2_CATEGORY_STATUS),
            isNull(categories.archivedAt),
          ),
        )
        .limit(1);

      return row === undefined
        ? undefined
        : {
            productId: row.productId as ProductId,
            productSideId: row.productSideId as ProductSideId,
            embroideryAreaId: row.embroideryAreaId as EmbroideryAreaId,
          };
    });
  }

  /**
   * This side's editor-safe background metadata, or SQL `NULL`.
   *
   * The quartet and nothing else (IMP-D044 PO-07). The asset id, its storage key
   * and the derivative's key and id are all private (PO-06); selecting one here
   * so the projection could "decide later" would already have put it in a public
   * read path's result set. `APP3-B01` returned a bare boolean because there was
   * no delivery route to describe; `APP3-B02` needs the intrinsic dimensions a
   * Studio canvas is sized from, so the same predicate now yields the four
   * values rather than a yes.
   *
   * **One** subquery, not four: the predicate is the eligibility rule, and
   * evaluating it once per side keeps the four values provably from the same row.
   * Four correlated scalar subqueries could in principle disagree.
   *
   * The inner tables are **aliased by hand**. In a `select` field position
   * Drizzle renders a column reference unqualified, so `assets.id`,
   * `asset_derivatives.id` and the outer `product_sides.id` all collapse to
   * `"id"` and PostgreSQL rejects the statement as ambiguous — which it caught
   * on the first integration run. Explicit aliases make each reference say which
   * table it means, and the only interpolated column is the outer
   * `background_asset_id`, whose name no inner table shares.
   *
   * `byte_size` crosses as text: it is a `bigint` column, and letting it become
   * a JSON number would lose precision silently above 2^53. The projection
   * converts it once, with a guard.
   */
  private editorSafeBackgroundMetadata() {
    return sql<EligibleBackgroundJson | null>`(
      select json_build_object(
        'widthPx', bg_derivative.width_px,
        'heightPx', bg_derivative.height_px,
        'mediaType', bg_derivative.media_type,
        'byteSize', bg_derivative.byte_size::text
      )
      from assets bg_asset
      join asset_derivatives bg_derivative on bg_derivative.asset_id = bg_asset.id
      where bg_asset.id = ${productSides.backgroundAssetId}
        and bg_asset.kind = ${SIDE_BACKGROUND_ASSET_KIND}
        and bg_asset.classification = ${SIDE_BACKGROUND_ASSET_CLASSIFICATION}
        and bg_asset.status = ${SIDE_BACKGROUND_ASSET_STATUS}
        and bg_asset.deleted_at is null
        and bg_derivative.kind = ${EDITOR_SAFE_DERIVATIVE_KIND}
        and bg_derivative.status = ${EDITOR_SAFE_DERIVATIVE_STATE}
        and bg_derivative.is_watermarked = false
        and bg_derivative.storage_key is not null
        and bg_derivative.width_px is not null
        and bg_derivative.height_px is not null
        and bg_derivative.media_type is not null
        and bg_derivative.media_type = any(${sql.raw(mediaTypeArrayLiteral())})
        and bg_derivative.byte_size is not null
      limit 1
    )`;
  }
}

/** An insert that returned nothing means the write silently did not happen. */
function expectWritten<T>(row: T | undefined, operation: string): T {
  if (row === undefined) {
    throw new Error(`ProductPlacementRepository.${operation} wrote no row.`);
  }
  return row;
}
