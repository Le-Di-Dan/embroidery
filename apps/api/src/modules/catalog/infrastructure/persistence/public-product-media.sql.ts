/**
 * The SQL that decides **which** Product image a public surface shows, and in
 * what order (`APP2-B04`, `APP12-H05-C1`, `APP12-M01-B1`).
 *
 * ## Why this is its own module
 *
 * `drizzle-public-product.repository.ts` owns three statements — the list, the
 * detail and the linked summary. Every one of them has to answer the same two
 * questions first: *is this image deliverable at all*, and *which of them is the
 * primary*. `APP12-M01-B1` gave the second question a fourth ordering key and a
 * correlated `EXISTS`, which pushed that file past the 400-line limit; splitting
 * on the seam the questions already form keeps the repository about queries and
 * puts the media predicate somewhere one edit changes it for all three.
 *
 * ## Eligibility is the delivery route's own predicate
 *
 * Every condition below is one `drizzle-public-product-media.repository.ts`
 * applies when it actually streams bytes, reusing the same constants. If the two
 * drifted, the catalogue would advertise addresses that 404 — the one media
 * defect a JSON contract can create on its own.
 */
import { eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { schema } from '@embroidery/database';
import type { SQL } from 'drizzle-orm';

import {
  PRODUCT_MEDIA_ASSET_CLASSIFICATION,
  PRODUCT_MEDIA_ASSET_KIND,
  PRODUCT_MEDIA_ASSET_STATUS,
  PRODUCT_PUBLICATION_DERIVATIVE_STATE,
  PUBLIC_DETAIL_RENDITION,
  PUBLIC_LIST_RENDITION,
} from '../../domain/public-product-catalog.policy';
import { DERIVATIVE_KIND_BY_RENDITION } from '../../domain/public-product-media.policy';

const { products, productMedia, assets, assetDerivatives } = schema;

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
export const MEDIA_ID_SELECTION = sql`${sql.identifier('product_media')}.${sql.identifier('id')}`;
export const DERIVATIVE_WIDTH_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('width_px')}`;
export const DERIVATIVE_HEIGHT_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('height_px')}`;

/**
 * The `THUMBNAIL` derivative of the same asset, joined a second time
 * (`APP12-M01-B1` §5).
 *
 * The detail statement already INNER JOINs the `CATALOG_PREVIEW` derivative the
 * main address points at. The strip needs the *small* rendition of the very same
 * association, so the row has to carry both — and a second alias of
 * `asset_derivatives` is the only way to have two rows of one table in one
 * result without a second round trip per image.
 */
export const thumbnailDerivative = alias(assetDerivatives, 'thumbnail_derivative');

/** The asset lane a public catalogue image must belong to. */
export function assetEligibility() {
  return [
    eq(assets.kind, PRODUCT_MEDIA_ASSET_KIND),
    eq(assets.classification, PRODUCT_MEDIA_ASSET_CLASSIFICATION),
    eq(assets.status, PRODUCT_MEDIA_ASSET_STATUS),
    isNull(assets.deletedAt),
  ];
}

/** What makes a derivative servable: ready, unwatermarked, actually stored. */
export function derivativeEligibility() {
  return [
    eq(assetDerivatives.status, PRODUCT_PUBLICATION_DERIVATIVE_STATE),
    eq(assetDerivatives.isWatermarked, false),
    isNotNull(assetDerivatives.storageKey),
  ];
}

/**
 * The join condition that attaches the small rendition of the same asset.
 *
 * A LEFT JOIN, deliberately, and every eligibility term lives here in the `ON`
 * rather than in the `WHERE`: on an outer join they are the *match* condition,
 * and moving any of them to the `WHERE` would silently turn the join back into
 * an inner one and drop an image whose preview is perfectly serveable.
 */
export function thumbnailDerivativeJoin() {
  return [
    eq(thumbnailDerivative.assetId, assets.id),
    eq(thumbnailDerivative.kind, DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION]),
    eq(thumbnailDerivative.status, PRODUCT_PUBLICATION_DERIVATIVE_STATE),
    eq(thumbnailDerivative.isWatermarked, false),
    isNotNull(thumbnailDerivative.storageKey),
  ];
}

/**
 * `PUBLIC_EFFECTIVE_PRIMARY_ORDER` key 1 — is the *other* rendition serveable
 * too?
 *
 * The statement this appears in has already joined one rendition; this asks
 * whether the counterpart exists under the same delivery conditions, so an image
 * that only half survived sorts behind every complete one.
 *
 * Without it the card and the detail page can name different images. The card
 * renders `thumbnail` and the page renders `catalog-preview`, so an image whose
 * preview failed is still perfectly serveable to a card — which would then
 * advertise a picture the product page it links to cannot show. "Both renditions
 * ready" is not a new standard invented here: it is already what
 * `PRODUCT_PUBLICATION_DERIVATIVE_KINDS` requires before a Product may be
 * published at all.
 */
export function bothRenditionsDeliverable(): SQL {
  const counterpart = sql.identifier('counterpart');
  return sql`exists (
    select 1 from ${assetDerivatives} as ${counterpart}
    where ${counterpart}.${sql.identifier('asset_id')} = ${assets.id}
      and ${counterpart}.${sql.identifier('kind')} <> ${assetDerivatives.kind}
      and ${counterpart}.${sql.identifier('kind')} in (
        ${DERIVATIVE_KIND_BY_RENDITION[PUBLIC_LIST_RENDITION]},
        ${DERIVATIVE_KIND_BY_RENDITION[PUBLIC_DETAIL_RENDITION]}
      )
      and ${counterpart}.${sql.identifier('status')} = ${PRODUCT_PUBLICATION_DERIVATIVE_STATE}
      and ${counterpart}.${sql.identifier('is_watermarked')} = false
      and ${counterpart}.${sql.identifier('storage_key')} is not null
  )`;
}

/**
 * Correlated scalar subquery for one column of a card's **effective primary**
 * row.
 *
 * `limit 1` under an explicit total order makes the choice deterministic:
 * relying on "there can only be one `THUMBNAIL`" would make the result depend on
 * a rule enforced somewhere else, and `APP12-M01.A` proved the schema does not
 * enforce it.
 *
 * `APP12-H05-C1` parameterised the selection so the association id and the
 * intrinsic dimensions of the derivative behind it come from **the same subquery
 * text** — identical predicate, identical total order, identical `limit 1` —
 * differing only in the column projected. That is what makes "the URL and the
 * dimensions describe the same derivative" a property of the SQL rather than an
 * argument about it.
 *
 * `APP12-M01-B1` removed the `role = 'THUMBNAIL'` **filter** and replaced it
 * with the role as an ordering **key**. The healthy case is byte-identical — the
 * stored `THUMBNAIL` still wins, on a key instead of a predicate. What changed is
 * the degraded case: a card whose stored primary had become undeliverable used to
 * resolve to nothing and render a Product with no picture at all, while the
 * detail page beside it happily showed the next image.
 */
export function deliverableMediaColumn<T>(
  derivativeKind: string,
  role: string,
  selection: SQL,
): SQL<T | null> {
  return sql<T | null>`(
    select ${selection}
    from ${productMedia}
    join ${assets} on ${assets.id} = ${productMedia.assetId}
    join ${assetDerivatives} on ${assetDerivatives.assetId} = ${assets.id}
    where ${productMedia.productId} = ${products.id}
      and ${assets.kind} = ${PRODUCT_MEDIA_ASSET_KIND}
      and ${assets.classification} = ${PRODUCT_MEDIA_ASSET_CLASSIFICATION}
      and ${assets.status} = ${PRODUCT_MEDIA_ASSET_STATUS}
      and ${assets.deletedAt} is null
      and ${assetDerivatives.kind} = ${derivativeKind}
      and ${assetDerivatives.status} = ${PRODUCT_PUBLICATION_DERIVATIVE_STATE}
      and ${assetDerivatives.isWatermarked} = false
      and ${assetDerivatives.storageKey} is not null
    order by ${bothRenditionsDeliverable()} desc,
             (${productMedia.role} = ${role}) desc,
             ${productMedia.displayOrder} asc,
             ${productMedia.id} asc
    limit 1
  )`;
}

/**
 * The detail statement's ordering, which must agree with the subquery above.
 *
 * Key 1 is already in hand there: the statement LEFT JOINs the counterpart
 * rendition under exactly the delivery conditions, so a matched row *is* "both
 * renditions serveable" and needs no second `EXISTS`.
 */
export function effectivePrimaryDetailOrder(primaryRole: string): SQL[] {
  return [
    sql`(${thumbnailDerivative.id} is not null) desc`,
    sql`(${productMedia.role} = ${primaryRole}) desc`,
    sql`${productMedia.displayOrder} asc`,
    sql`${productMedia.id} asc`,
  ];
}
