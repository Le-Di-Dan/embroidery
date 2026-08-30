/**
 * The two Admin asset lanes, and the vocabulary a caller uses to name one
 * (`APP11-B03A` §10.1).
 *
 * Every Admin asset read is confined to one `(kind, classification)` pair. That
 * pair is not a convenience filter — it is what keeps the endpoint from being a
 * general asset browser that could surface a customer's private upload — so the
 * lanes are declared here, closed, rather than assembled at a call site.
 *
 * `CATALOG` is the lane `APP2-B01` has always served and stays the **default**:
 * a request that names no scope behaves exactly as it did before this module
 * existed, which is the whole reason the parameter is optional. `GALLERY` is
 * the public showcase lane `APP11-B03A` prepares into, and it is reachable only
 * by asking for it. The two never mix: a scope selects one pair, and no query
 * ever unions them.
 *
 * The `GALLERY` pair is spelled out here rather than imported from the Gallery
 * module. The dependency has to run one way — Gallery reads Asset ports, not
 * the reverse — and `admin-asset-scope.policy.spec.ts` pins these two values
 * against `GALLERY_ENTRY_ASSET_CLASSIFICATION` and the persisted `AssetKind`
 * union, so the pair is held together by a test rather than by an import it
 * must not have (the same device `PUBLIC_PRODUCT_MEDIA_RENDITIONS` uses).
 */
import type { AssetClassification, AssetKind } from '@embroidery/database';

import { INTAKE_ASSET_KIND, INTAKE_CLASSIFICATION } from './asset-intake.policy';

/** The `(kind, classification)` pair one scope resolves to. */
export interface AdminAssetLane {
  readonly kind: AssetKind;
  readonly classification: AssetClassification;
}

export const ADMIN_ASSET_SCOPES = ['CATALOG', 'GALLERY'] as const;

export type AdminAssetScope = (typeof ADMIN_ASSET_SCOPES)[number];

/**
 * The scope an omitted parameter means.
 *
 * `CATALOG`, and it must stay `CATALOG`: every delivered Admin consumer — the
 * product media picker above all — was built against a list that returns
 * catalog media, and changing what "no scope" means would silently put public
 * showcase images into a picker that must only offer production-sensitive ones.
 */
export const DEFAULT_ADMIN_ASSET_SCOPE = 'CATALOG' satisfies AdminAssetScope;

/** The `GALLERY_MEDIA` kind gallery preparation mints (`ASSET_KINDS`, DB4). */
export const GALLERY_ASSET_KIND = 'GALLERY_MEDIA' satisfies AssetKind;

/**
 * `PUBLIC` — the classification INV-09 says intake may never choose and a
 * preparation flow alone may reach. It is also exactly the classification
 * `APP11-B02` requires before an image may be attached to a gallery entry.
 */
export const GALLERY_ASSET_CLASSIFICATION = 'PUBLIC' satisfies AssetClassification;

const CATALOG_LANE: AdminAssetLane = Object.freeze({
  kind: INTAKE_ASSET_KIND,
  classification: INTAKE_CLASSIFICATION,
});

const GALLERY_LANE: AdminAssetLane = Object.freeze({
  kind: GALLERY_ASSET_KIND,
  classification: GALLERY_ASSET_CLASSIFICATION,
});

/** Total over the scope union: no caller word reaches a query unmapped. */
export const LANE_BY_ADMIN_ASSET_SCOPE: Readonly<Record<AdminAssetScope, AdminAssetLane>> =
  Object.freeze({
    CATALOG: CATALOG_LANE,
    GALLERY: GALLERY_LANE,
  });

export function resolveAdminAssetLane(scope: AdminAssetScope | undefined): AdminAssetLane {
  return LANE_BY_ADMIN_ASSET_SCOPE[scope ?? DEFAULT_ADMIN_ASSET_SCOPE];
}
