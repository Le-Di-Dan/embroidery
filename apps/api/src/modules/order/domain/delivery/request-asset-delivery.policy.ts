/**
 * The locked policy for Admin delivery of submitted request evidence
 * (`APP5-B06`, closing `FU-APP5-B04-COP-ASSET-DELIVERY-01`).
 *
 * One place decides *which bytes an authenticated operator may be served for an
 * asset a submitted request is bound to*. It is the fourth private-binary
 * delivery surface in the repository and it obeys the same two bounds the three
 * before it do: no generic `GET /assets/{assetId}`, and no storage key, bucket,
 * provider URL or presigned credential in any response.
 *
 * ## Why the *source* object, and not a derivative
 *
 * `APP3-B05A` and `APP3-B06C` both serve a `NORMALIZED` derivative, because both
 * feed the Studio and the Studio needs editor-safe media. This surface is not
 * that. `APP5-B02` deliberately emits **no** normalization event — a request
 * photograph is evidence an operator judges, not media an editor composes — so
 * there is no derivative to serve and generating one here would invent a lane no
 * authority asked for.
 *
 * Serving the source is safe precisely because of what `APP5-B02` already did to
 * it before `APP5-B01` was allowed to bind it: the bytes were streamed under a
 * hard size ceiling, their signature was verified against the declared type,
 * they were decoded within the pixel bounds, and mandatory inspection reached a
 * favourable verdict. `ACCEPTED` is the name of that whole argument, which is
 * why it is a term of this policy rather than a status the response reports.
 *
 * ## Seven terms, all conjunctive
 *
 * A byte leaves this system only when the caller is an authenticated Admin, the
 * `custom_request_assets` association binds that exact request to that exact
 * asset, the association's role is one APP5 actually produces, the asset is in
 * the customer-private upload lane, it survived inspection, it is live, and its
 * persisted media type is one of the three the intake allowlist admits. Any
 * single failure is the same silent refusal.
 *
 * Nothing here is a fresh literal where an approved one exists. The role set,
 * the kind, the classification, the deliverable state and the media allowlist
 * are re-exported from the authorities that already own them — a second copy is
 * precisely how a delivery path drifts away from the intake path that
 * authorized it.
 */
import {
  ACCEPTED_MEDIA_TYPES,
  type AcceptedMediaType,
} from '../../../asset/domain/asset-intake.policy';
import {
  APP5_REQUEST_ASSET_ROLES,
  BINDABLE_ASSET_CLASSIFICATION,
  BINDABLE_ASSET_KIND,
  BINDABLE_ASSET_STATE,
  type App5RequestAssetRole,
} from '../submission/request-asset-policy';

export {
  APP5_REQUEST_ASSET_ROLES,
  BINDABLE_ASSET_CLASSIFICATION,
  BINDABLE_ASSET_KIND,
  BINDABLE_ASSET_STATE,
};
export type { App5RequestAssetRole };

/**
 * The roles this surface will open.
 *
 * Exactly `G01-D14`'s pair, and `ATTACHMENT` is absent for the same reason it is
 * absent at intake: APP5 publishes no surface that produces one, so a row
 * carrying it could only have arrived from a historical or corrupt fixture. A
 * delivery route is the wrong place to start honouring a role no APP5 screen can
 * explain, so it is refused rather than tolerated.
 */
export function isDeliverableRequestAssetRole(value: string): value is App5RequestAssetRole {
  return (APP5_REQUEST_ASSET_ROLES as readonly string[]).includes(value);
}

/**
 * The media types a bound request upload may actually be delivered as.
 *
 * The intake allowlist itself, unnarrowed — and here that is correct rather than
 * lax. `APP3-B06C` narrows to `image/webp` because it serves a derivative a
 * worker writes in exactly one format; this serves the original, so the set of
 * deliverable types is by construction the set `assertAcceptedMediaType` let in.
 * `image/svg+xml` is absent from both, and its absence is load-bearing: intake
 * refuses SVG outright, so a value that cannot be stored cannot be served.
 *
 * Checked against the asset's **persisted** `mime_type`, which `APP5-B02`
 * derived from the signature bytes it read — never against a client header, a
 * URL suffix or whatever the provider reports back.
 */
export const REQUEST_ASSET_MEDIA_TYPES = ACCEPTED_MEDIA_TYPES;

export type RequestAssetMediaType = AcceptedMediaType;

export function isDeliverableRequestAssetMediaType(value: string): value is RequestAssetMediaType {
  return (REQUEST_ASSET_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * `private, no-store`, and it is not negotiable.
 *
 * The bytes of a submitted photograph never change, so an immutable cache would
 * look safe — and would be wrong twice over. What expires here is the
 * *authorization*: an Admin session ends, and the operator's browser must stop
 * being able to redisplay a customer's private photograph from disk. `private`
 * is stated explicitly alongside `no-store` because this is the one delivery
 * surface behind a shared staff gateway, and a proxy that retained the object
 * would serve it to the next operator without a session check.
 */
export const REQUEST_ASSET_CACHE_CONTROL = 'private, no-store' as const;

/**
 * `inline`, with no filename.
 *
 * The same convention `APP3-B05A` and `APP3-B06C` settled on, for the same
 * reason: the original upload name is never persisted (`APP2-B01`), so a
 * filename could only be invented — and an invented one describes the object
 * falsely while putting attacker-influenced text into a response header. Inline
 * is what `APP5-A02` needs, since the operator views the evidence rather than
 * downloading it.
 */
export const REQUEST_ASSET_CONTENT_DISPOSITION = 'inline' as const;

/** Sent with every binary so a browser cannot re-interpret the payload. */
export const REQUEST_ASSET_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/**
 * Validated customer uploads live here.
 *
 * `ORIGINALS`, not `DERIVATIVES`, and that is the whole `APP5-B02` lane: the
 * allocation names `ORIGINALS`, the object key comes from
 * `buildOriginalObjectKey`, and no derivative is ever written. The alias is an
 * internal role name — the concrete bucket comes from configuration and no call
 * site can name it.
 */
export const REQUEST_ASSET_BUCKET = 'ORIGINALS' as const;
