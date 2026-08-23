/**
 * The locked policy for Admin delivery of one transfer-evidence image
 * (`APP7-B06`, `APP7-G01` §7).
 *
 * One place decides *which bytes an authenticated operator may be served for an
 * asset a payment attempt's evidence association points at*. It is the fifth
 * private-binary delivery surface in the repository and obeys the same two
 * bounds the four before it do: no generic `GET /admin/assets/{assetId}/content`,
 * and no storage key, bucket, provider URL or presigned credential in any
 * response.
 *
 * ### The locator is the association, never the asset
 *
 * `APP7-B04` publishes `payment_transfer_evidence.id` and deliberately does not
 * publish `asset_id`. That is the API design rather than an omission: an asset
 * id addresses a file, while an association id addresses *a file one payment
 * attempt actually carries*, and only the second can be checked against
 * anything. So this surface takes the association id and proves the rest.
 *
 * ### Why the *source* object, and not a derivative
 *
 * `APP3-B05A` and `APP3-B06C` both serve a `NORMALIZED` derivative because both
 * feed the Studio, which needs editor-safe media. A transfer screenshot is not
 * that. `APP7-B05` dispatches **inspection** and no normalization — the image is
 * evidence an operator reconciles against a bank statement, not media an editor
 * composes — so there is no derivative to serve, and generating one here would
 * invent a lane no authority asked for. `APP5-B06` reached the same conclusion
 * for request evidence and this is the same argument.
 *
 * Serving the source is safe precisely because of what `APP7-B05` already did to
 * it before the association was written: the bytes were streamed under the
 * 10 MiB lane ceiling, their signature was verified against the declared type,
 * they were decoded within the pixel bounds, and mandatory inspection reached a
 * favourable verdict. `ACCEPTED` is the name of that whole argument, which is
 * why it is a term of this policy rather than a status the response reports.
 *
 * ### Six terms, all conjunctive
 *
 * A byte leaves this system only when the caller is an authenticated Admin, the
 * `payment_transfer_evidence` row exists, it resolves one live payment attempt,
 * the asset is in the customer-private upload lane, it survived inspection and
 * is live, and its persisted media type is one the intake allowlist admits. Any
 * single failure is the same silent refusal.
 *
 * Nothing here is a fresh literal where an approved one exists. The kind, the
 * classification and the media allowlist are re-exported from
 * `transfer-evidence.policy.ts` and the Asset intake policy that already own
 * them — a second copy is precisely how a delivery path drifts away from the
 * intake path that authorized it.
 */
import {
  ACCEPTED_MEDIA_TYPES,
  type AcceptedMediaType,
} from '../../../asset/domain/asset-intake.policy';
import {
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
} from './transfer-evidence.policy';

export { TRANSFER_EVIDENCE_ASSET_KIND, TRANSFER_EVIDENCE_CLASSIFICATION };

/**
 * The one asset state whose bytes may leave this surface.
 *
 * `UPLOADED` and `INSPECTING` have not been judged yet, `REJECTED` was judged
 * and refused, and `DELETION_PENDING` / `DELETED` are tombstones. `APP7-B04`
 * already projects exactly this as `previewEligible`, so the metadata read and
 * the delivery read agree by construction rather than by two matching literals.
 */
export const DELIVERABLE_EVIDENCE_ASSET_STATE = 'ACCEPTED' as const;

/**
 * The media types a bound evidence image may actually be delivered as.
 *
 * The intake allowlist itself, unnarrowed — and here that is correct rather than
 * lax: this serves the original, so the set of deliverable types is by
 * construction the set `PAYMENT_EVIDENCE_INTAKE_LANE` let in. `image/svg+xml` is
 * absent from both, and its absence is load-bearing — intake refuses SVG
 * outright, so a value that cannot be stored cannot be served.
 *
 * Checked against the asset's **persisted** `mime_type`, which `APP7-B05`
 * derived from the signature bytes it actually read — never against a client
 * header, a URL suffix or whatever the provider reports back.
 */
export const EVIDENCE_MEDIA_TYPES = ACCEPTED_MEDIA_TYPES;

export type EvidenceMediaType = AcceptedMediaType;

export function isDeliverableEvidenceMediaType(value: string): value is EvidenceMediaType {
  return (EVIDENCE_MEDIA_TYPES as readonly string[]).includes(value);
}

/**
 * `private, no-store`, and it is not negotiable.
 *
 * The bytes of a submitted screenshot never change, so an immutable cache would
 * look safe — and would be wrong twice over. What expires here is the
 * *authorization*: an Admin session ends, and the operator's browser must stop
 * being able to redisplay a customer's private bank screenshot from disk.
 * `private` is stated explicitly alongside `no-store` because this sits behind
 * the shared staff gateway, and a proxy that retained the object would serve it
 * to the next operator without a session check.
 */
export const EVIDENCE_CACHE_CONTROL = 'private, no-store' as const;

/**
 * `inline`, with no filename.
 *
 * The convention `APP3-B05A`, `APP3-B06C` and `APP5-B06` all settled on, for the
 * same reason: the original upload name is never persisted (`APP2-B01`), so a
 * filename could only be invented — and an invented one describes the object
 * falsely while putting customer-influenced text into a response header. Inline
 * is what `APP7-A01` needs, since the operator views the evidence beside the
 * amount rather than downloading it.
 */
export const EVIDENCE_CONTENT_DISPOSITION = 'inline' as const;

/** Sent with every binary so a browser cannot re-interpret the payload. */
export const EVIDENCE_CONTENT_TYPE_OPTIONS = 'nosniff' as const;

/**
 * Validated customer uploads live here.
 *
 * `ORIGINALS`, not `DERIVATIVES`, and that is the whole `APP7-B05` lane: the
 * allocation names `ORIGINALS`, the object key comes from
 * `buildOriginalObjectKey`, and no derivative is ever written. The alias is an
 * internal role name — the concrete bucket comes from configuration and no call
 * site can name it.
 */
export const EVIDENCE_BUCKET = 'ORIGINALS' as const;
