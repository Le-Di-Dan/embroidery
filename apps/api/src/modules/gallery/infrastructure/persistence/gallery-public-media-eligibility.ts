/**
 * The one definition of "this gallery image would really stream" (`APP11-B03`
 * §9.2, §10).
 *
 * Stated once and consumed by three call sites — the feed's cover and count,
 * the detail's ordered images, and the binary route's own lookup — because the
 * defect a JSON contract can create on its own is advertising an address that
 * 404s. If the projection and the delivery predicate drifted, the Storefront
 * would render broken images and nothing would fail until a browser tried.
 *
 * Both forms below are the *same* predicate: `conditions()` for Drizzle's query
 * builder, `sqlTerms()` for the correlated subqueries the feed needs to stay a
 * single round trip. They are generated from the same constants rather than
 * written twice.
 */
import { schema } from '@embroidery/database';
import {
  and,
  eq,
  isNotNull,
  isNull,
  notInArray,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';

import {
  GALLERY_ENTRY_ASSET_CLASSIFICATION,
  PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES,
  PUBLIC_GALLERY_DERIVATIVE_STATE,
} from '../../domain/public-gallery-media.policy';

const { assets, assetDerivatives, galleryEntryAssets } = schema;

/**
 * The asset-lane and derivative terms, for the query builder.
 *
 * `classification = PUBLIC` is the boundary `APP11-B02` enforced on the write
 * and this re-proves on the read: publication-time eligibility is not a
 * permanent grant, and an image can be reclassified or withdrawn long after a
 * curator selected it. The withdrawn-state exclusion resolves
 * `DELETION_PENDING` against the repository's existing public authority (see
 * `public-gallery-media.policy.ts`).
 */
export function deliverableAssetConditions(derivativeKind: string): SQL[] {
  return [
    eq(assets.classification, GALLERY_ENTRY_ASSET_CLASSIFICATION),
    notInArray(assets.status, [...PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES]),
    isNull(assets.deletedAt),
    eq(assetDerivatives.kind, derivativeKind),
    eq(assetDerivatives.status, PUBLIC_GALLERY_DERIVATIVE_STATE),
    // INV-22: a watermarked artifact is the customer/design preview, never
    // public showcase media.
    eq(assetDerivatives.isWatermarked, false),
    // READY implies a key by CHECK, but this path reads the value, so it
    // asserts the fact it depends on instead of trusting the constraint.
    isNotNull(assetDerivatives.storageKey),
  ];
}

/**
 * The joins and predicate of a correlated subquery over one entry's currently
 * deliverable associations.
 *
 * `galleryEntryId` is the outer column to correlate on; nothing else varies.
 */
export function deliverableAssetSource(galleryEntryId: SQLWrapper, derivativeKind: string): SQL {
  const withdrawn = sql.join(
    PUBLIC_GALLERY_ASSET_WITHDRAWN_STATES.map((state) => sql`${state}`),
    sql`, `,
  );
  return sql`
    from ${galleryEntryAssets}
    join ${assets} on ${assets.id} = ${galleryEntryAssets.assetId}
    join ${assetDerivatives} on ${assetDerivatives.assetId} = ${assets.id}
    where ${galleryEntryAssets.galleryEntryId} = ${galleryEntryId}
      and ${assets.classification} = ${GALLERY_ENTRY_ASSET_CLASSIFICATION}
      and ${assets.status} not in (${withdrawn})
      and ${assets.deletedAt} is null
      and ${assetDerivatives.kind} = ${derivativeKind}
      and ${assetDerivatives.status} = ${PUBLIC_GALLERY_DERIVATIVE_STATE}
      and ${assetDerivatives.isWatermarked} = false
      and ${assetDerivatives.storageKey} is not null
  `;
}

/**
 * The association's asset id, written as an explicitly qualified reference.
 *
 * Not `galleryEntryAssets.assetId`: Drizzle strips table qualification from a
 * *select-list* position, so inside a correlated subquery that column would be
 * emitted bare and PostgreSQL would refuse it as ambiguous — three joined
 * tables in the subquery each carry an `asset_id`. The order-by positions in
 * the same fragment are qualified automatically, which is why only this one is
 * spelled out.
 */
export const GALLERY_ASSET_ID_SELECTION = sql`${sql.identifier('gallery_entry_assets')}.${sql.identifier('asset_id')}`;

/**
 * The cover derivative's intrinsic dimensions, qualified for the same reason
 * {@link GALLERY_ASSET_ID_SELECTION} is (`APP12-H05-C1`).
 *
 * Only `asset_derivatives` declares these columns, so they are not ambiguous
 * today — they are spelled out anyway so the correlated subquery has one
 * qualification rule rather than two, and a later join cannot quietly make them
 * ambiguous.
 */
export const GALLERY_DERIVATIVE_WIDTH_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('width_px')}`;
export const GALLERY_DERIVATIVE_HEIGHT_SELECTION = sql`${sql.identifier('asset_derivatives')}.${sql.identifier('height_px')}`;

/** The stored gallery order, with the tie-breaker that makes it total. */
export const GALLERY_ASSET_ORDER = sql`order by ${galleryEntryAssets.displayOrder} asc, ${galleryEntryAssets.id} asc`;

/** Conjunction helper so a call site reads as one predicate, not a spread. */
export function allOf(conditions: readonly SQL[]): SQL {
  return and(...conditions) as SQL;
}
