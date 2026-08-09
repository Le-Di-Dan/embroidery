/**
 * The locked policy for published Design Template asset delivery (`APP3-B05A`).
 *
 * One place decides *what bytes an anonymous caller may be served for an Asset a
 * published Template places*. Nothing here is a fresh literal where an approved
 * one already exists: a second copy of `'NORMALIZED'`, `'READY'` or
 * `'TEMPLATE_SOURCE'` is exactly how a delivery path drifts away from the
 * authoring path that authorized it.
 *
 * ## The address is not the authorization
 *
 * `assetId` is an opaque subordinate identity. On its own it grants nothing, and
 * it is deliberately never routable on its own — there is no
 * `/api/public/assets/{assetId}`, and adding one would replace six conjunctive
 * proofs with a single existence check. The address exists only *inside* the
 * Template and Version that authorize it, which is why the route carries all
 * three segments.
 *
 * ## Six terms, all of them conjunctive
 *
 * A byte leaves this system only when the Template is currently published, the
 * requested Version is the one the public read exposes **right now**, that exact
 * Version's canonical document references the Asset, the durable
 * `design_template_assets` association exists, the Product/Side/Area chain is
 * still publicly designable, and the Asset carries an eligible editor-safe
 * derivative. Any single failure is the same silent refusal.
 */
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
} from '../../catalog/domain/product-placement.policy';
import {
  TEMPLATE_ARTWORK_ASSET_CLASSIFICATION,
  TEMPLATE_ARTWORK_ASSET_KIND,
} from '../application/template-document-media.authority';

export {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  TEMPLATE_ARTWORK_ASSET_CLASSIFICATION,
  TEMPLATE_ARTWORK_ASSET_KIND,
};

/**
 * The status a Template artwork Asset must hold to be delivered at all.
 *
 * `ACCEPTED` is the one post-inspection state; a `PENDING`, `REJECTED` or
 * tombstoned Asset is re-checked here rather than trusted from the association
 * that once named it, because an image can be withdrawn long after an Admin
 * placed it.
 */
export const TEMPLATE_ARTWORK_ASSET_STATUS = 'ACCEPTED' as const;

/**
 * The media types a published Template Asset may actually be delivered as.
 *
 * Exactly two, and both are outputs of an accepted normalization lane:
 * `image/webp` is what `APP3-W01A` writes for raster, and `image/svg+xml` is
 * what `APP3-W01B` writes for a **sanitized** Template SVG
 * (`TEMPLATE_SVG_OUTPUT_POLICY`). The check is on the derivative's *persisted*
 * `media_type`, never on the parent Asset's `mime_type`, which describes the
 * uploaded original nobody may see.
 *
 * That `image/svg+xml` appears here and is absent from the Side-background list
 * is the whole difference between the two routes: `IMP-D044` PO-04 authorizes SVG
 * for Template artwork and PO-03 forbids it for a background. Delivering SVG is
 * therefore safe **only** because it is the already-sanitized `NORMALIZED`
 * derivative — the original is never a candidate, and nothing on this path
 * re-sanitizes, re-parses or otherwise re-decides what `APP3-W01B` already ruled.
 */
export const PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES = ['image/webp', 'image/svg+xml'] as const;

export type PublicTemplateAssetMediaType = (typeof PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES)[number];

export function isDeliverableTemplateAssetMediaType(
  value: string,
): value is PublicTemplateAssetMediaType {
  return (PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * `no-store`, and it is not negotiable.
 *
 * A Template Version is immutable; the *authorization context* around it is not.
 * Unpublishing (`TR-LC24-03`), archiving (`TR-LC24-04`), publishing a newer
 * Version, a Product leaving the public catalogue, and a retired Side or Area
 * each revoke this address without the Version changing by one byte. There is no
 * cache-invalidation consumer in this system, so any stored copy would keep
 * serving artwork the store has already withdrawn.
 */
export const PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL = 'no-store' as const;

/**
 * `inline`, with no filename.
 *
 * The original upload name is never persisted (`APP2-B01`), so a filename could
 * only be invented — and an invented one describes the object falsely while
 * putting attacker-influenced text into a response header.
 */
export const PUBLIC_TEMPLATE_ASSET_CONTENT_DISPOSITION = 'inline' as const;

/** Sent with every binary so a browser cannot re-interpret the payload. */
export const PUBLIC_TEMPLATE_ASSET_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/** Editor-safe derivatives live here. Private originals are never served. */
export const PUBLIC_TEMPLATE_ASSET_BUCKET = 'DERIVATIVES' as const;

/**
 * The largest Version number the route will accept.
 *
 * Bounded so a malformed address is refused at the boundary rather than becoming
 * a predicate that matches nothing — and so no arbitrarily long digit string ever
 * reaches an integer column.
 */
export const PUBLIC_TEMPLATE_ASSET_MAX_VERSION = 1_000_000;
