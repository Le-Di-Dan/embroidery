/**
 * The APP5 pre-submission customer intake lane (`APP5-G01` §7, `APP5-B02`).
 *
 * These are approved product values, not tuning knobs. They live in the
 * Ordering module rather than the Asset module for the same reason the Session
 * lane lives in Design: the Asset module owns *how* bytes are taken in, and the
 * module that owns the request owns *what a verified customer is allowed to
 * hand over before there is a request at all*.
 *
 * Every value here is fixed by policy and none of them is reachable from the
 * body. A caller supplies a challenge, a role and a file — nothing else. There
 * is deliberately no field for the customer, the asset kind, the classification,
 * the storage key or the inspection outcome: each of those is either derived
 * from the challenge or decided by the pipeline, and a field whose only legal
 * value is a constant is a field whose only possible effect is to be filled in
 * wrong.
 */
import type { AssetIntakeLane } from '../../../asset/domain/intake-lane';

/** 10 MiB — the same anonymous-caller budget the Session lane gets. */
export const MAX_REQUEST_INTAKE_BYTES = 10_485_760;

/** A customer's own photograph. `ASSET_KINDS` vocabulary, not a product term. */
export const REQUEST_INTAKE_ASSET_KIND = 'CUSTOMER_UPLOAD' as const;

/**
 * Private on arrival and never reachable publicly (INV-09).
 *
 * `APP5-B01`'s binder refuses anything else, so a row that landed in another
 * classification would be unbindable evidence — stored, paid for in retention,
 * and useless.
 */
export const REQUEST_INTAKE_CLASSIFICATION = 'CUSTOMER_PRIVATE' as const;

/** The idempotency namespace this operation family claims under. */
export const REQUEST_INTAKE_OPERATION_NAMESPACE = 'public.custom-request.asset.upload';

/**
 * The two roles APP5 exposes (`APP5-G01 D14`).
 *
 * `ATTACHMENT` exists in `REQUEST_ASSET_ROLES` and is deliberately **not** here:
 * APP5 has no surface that produces one, so accepting it would create rows no
 * checkpoint knows how to moderate or display.
 */
export const REQUEST_INTAKE_ROLES = ['COP_IMAGE', 'REFERENCE'] as const;
export type RequestIntakeRole = (typeof REQUEST_INTAKE_ROLES)[number];

export function isRequestIntakeRole(value: unknown): value is RequestIntakeRole {
  return typeof value === 'string' && (REQUEST_INTAKE_ROLES as readonly string[]).includes(value);
}

/**
 * `APP5-G01 D13` — at most twenty accepted uploads per verified challenge.
 *
 * Enforced as a *reservation* bound rather than an accepted-row bound; see
 * `AssetRepository.countChallengeReservedSlots` for why counting only
 * `ACCEPTED` rows would admit a twenty-first file.
 */
export const MAX_ACCEPTED_UPLOADS_PER_CHALLENGE = 20;

/** The one purpose that authorizes intake (`VERIFICATION_PURPOSES`). */
export const REQUEST_INTAKE_CHALLENGE_PURPOSE = 'SUBMISSION' as const;

export const REQUEST_INTAKE_LANE: AssetIntakeLane = Object.freeze({
  assetKind: REQUEST_INTAKE_ASSET_KIND,
  classification: REQUEST_INTAKE_CLASSIFICATION,
  maxUploadBytes: MAX_REQUEST_INTAKE_BYTES,
  operationNamespace: REQUEST_INTAKE_OPERATION_NAMESPACE,
  // One file part and nothing else. The role travels as a query parameter
  // because it must be known *before* the first byte is streamed — a trailing
  // multipart field could not guarantee that, and widening the shared parser to
  // carry a third, variable field would change a code path two shipped lanes
  // already depend on.
  declaresMetadataFields: false,
});
