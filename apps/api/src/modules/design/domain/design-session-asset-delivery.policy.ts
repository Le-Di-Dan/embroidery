/**
 * The locked policy for anonymous Design Session asset delivery (`APP3-B06C`).
 *
 * One place decides *what bytes the holder of a Session credential may be served
 * for an Asset that Session uploaded*. This is `IMP-D044` PO-06 delivery class 3
 * — the third and last — and it is bound by PO-06 exactly as classes 1 and 2 are:
 * no generic `GET /assets/{assetId}`, no storage key or private-original URL in
 * any response, no presign, no browser storage credential, and no delivery of one
 * Asset authorising another derivative of the same Asset.
 *
 * Nothing here is a fresh literal where an approved one exists. `NORMALIZED`,
 * `READY`, `CUSTOMER_UPLOAD` and `CUSTOMER_PRIVATE` are re-exported from the
 * authorities that already own them — a second copy is precisely how a delivery
 * path drifts away from the intake path that authorized it.
 *
 * ## The address is not the authorization
 *
 * `assetId` is an opaque subordinate identity that grants nothing alone. It is
 * routable only *inside* the Session that owns it, which is why the route carries
 * both segments and why the Session half is proved from a credential rather than
 * from the path string.
 *
 * ## Five terms, all conjunctive
 *
 * A byte leaves this system only when the caller proved ownership of an `ACTIVE`,
 * unexpired Session, the `design_session_assets` association binds that exact
 * Session to that exact Asset, the Asset is still in the accepted customer-private
 * upload lane, it survived inspection, and it carries a `READY`, unwatermarked,
 * completely described `NORMALIZED` derivative. Any single failure is the same
 * silent refusal.
 */
import {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
} from '../../catalog/domain/product-placement.policy';
import {
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
} from './session-asset-intake.policy';

export {
  EDITOR_SAFE_DERIVATIVE_KIND,
  EDITOR_SAFE_DERIVATIVE_STATE,
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
};

/**
 * The status a Session upload must hold to be delivered at all.
 *
 * `ACCEPTED` is the one post-inspection state, and requiring it is what makes
 * `INSPECTING` and `REJECTED` refusals rather than special cases. `APP3-W01C`
 * converges a pending inspection later, so an `INSPECTING` Asset is *not yet*
 * deliverable rather than permanently undeliverable — and a derivative can exist
 * while the parent is still `INSPECTING`, which is exactly why the parent's
 * verdict is asserted independently of the derivative's.
 */
export const SESSION_ASSET_DELIVERABLE_STATUS = 'ACCEPTED' as const;

/**
 * The media types a Session upload may actually be delivered as.
 *
 * Exactly one. `APP3-B06B` *accepts* JPEG, PNG and WebP, but those describe the
 * uploaded original nobody may see; `APP3-W01A` writes a single normalized output
 * and `NORMALIZED_OUTPUT_POLICY.mediaType` is `image/webp`. The accepted
 * delivery allowlist is therefore narrower than the intake allowlist, and this is
 * the narrower one — checked against the derivative's *persisted* `media_type`,
 * never against `assets.mime_type`.
 *
 * `image/svg+xml` is absent and its absence is load-bearing. `IMP-D044` PO-04
 * authorizes SVG for Template artwork, which is why `APP3-B05A` lists it; nothing
 * authorizes SVG for a Session upload, and `APP3-B06B` refuses it at intake. A
 * value that cannot be produced still cannot be delivered.
 */
export const SESSION_ASSET_MEDIA_TYPES = ['image/webp'] as const;

export type SessionAssetMediaType = (typeof SESSION_ASSET_MEDIA_TYPES)[number];

export function isDeliverableSessionAssetMediaType(value: string): value is SessionAssetMediaType {
  return (SESSION_ASSET_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * `no-store`, and it is not negotiable.
 *
 * The bytes of a normalized derivative never change, so an immutable cache would
 * look safe — and would be wrong. What expires here is the *authorization*: the
 * Session can expire, be submitted, or have its secret rotated out from under a
 * stale credential, and none of those events touches the object. A stored copy
 * would keep serving a customer's private photograph to a browser that can no
 * longer prove it owns the Session. There is also no cache-invalidation consumer
 * in this system to correct one.
 */
export const SESSION_ASSET_CACHE_CONTROL = 'no-store' as const;

/**
 * `inline`, with no filename.
 *
 * The original upload name is never persisted (`APP2-B01`), so a filename could
 * only be invented — and an invented one describes the object falsely while
 * putting attacker-influenced text into a response header.
 */
export const SESSION_ASSET_CONTENT_DISPOSITION = 'inline' as const;

/** Sent with every binary so a browser cannot re-interpret the payload. */
export const SESSION_ASSET_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/** Editor-safe derivatives live here. Private originals are never served. */
export const SESSION_ASSET_BUCKET = 'DERIVATIVES' as const;
