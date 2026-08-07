/**
 * The anonymous Session upload lane (`APP3-B06B`, `IMP-D048` PO-01/PO-05).
 *
 * These are approved product values, not tuning knobs, and they live beside the
 * rules that justify them rather than in the Asset module: the Asset module owns
 * *how* bytes are taken in, Design owns *what an anonymous guest is allowed to
 * hand over*.
 *
 * Two values differ from the Admin lane and both differences are deliberate.
 * The ceiling is 10 MiB rather than 25 — an anonymous caller with no account
 * behind it gets the smaller budget. And the row is `CUSTOMER_UPLOAD` /
 * `CUSTOMER_PRIVATE`: a guest's photograph is their own, never catalog media and
 * never publishable, so the classification that governs delivery is fixed at
 * intake rather than decided later.
 *
 * Neither value is client-selectable. There are no metadata fields in this body
 * at all, so there is nothing for a caller to assert and nothing to disagree
 * with.
 */
import type { AssetIntakeLane } from '../../asset/domain/intake-lane';

/** 10 MiB. The authoritative maximum for an anonymous Session upload. */
export const MAX_SESSION_UPLOAD_BYTES = 10_485_760;

/** A guest's own upload. `ASSET_KINDS` vocabulary, not a product term. */
export const SESSION_INTAKE_ASSET_KIND = 'CUSTOMER_UPLOAD' as const;

/** Private on arrival and never reachable publicly (INV-09). */
export const SESSION_INTAKE_CLASSIFICATION = 'CUSTOMER_PRIVATE' as const;

/** The idempotency namespace this operation family claims under. */
export const SESSION_UPLOAD_OPERATION_NAMESPACE = 'public.design-session.asset.upload';

/**
 * The header carrying the revision the caller last read.
 *
 * A header rather than a body field because the body is one file part and
 * nothing else — and because the value has to be known *before* a single byte is
 * streamed, which a trailing multipart field could not guarantee.
 */
export const SESSION_REVISION_HEADER = 'x-design-session-revision';

export const DESIGN_SESSION_INTAKE_LANE: AssetIntakeLane = Object.freeze({
  assetKind: SESSION_INTAKE_ASSET_KIND,
  classification: SESSION_INTAKE_CLASSIFICATION,
  maxUploadBytes: MAX_SESSION_UPLOAD_BYTES,
  operationNamespace: SESSION_UPLOAD_OPERATION_NAMESPACE,
  declaresMetadataFields: false,
});
