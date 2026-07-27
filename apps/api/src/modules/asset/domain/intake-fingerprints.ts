/**
 * The two intake fingerprints (`ADR-APP2-001` §4.2f-1, `APP2-B01` §9/§10).
 *
 * They exist at different times and answer different questions:
 *
 *   - the **request** fingerprint is known before a single file byte is read.
 *     It is the immutable identity in `idempotency_records.fingerprint`, and it
 *     is what makes "same key, different request" a conflict instead of a
 *     replay.
 *   - the **content** fingerprint is knowable only after the whole file has
 *     been consumed and validated. It lives inside the completed result, and it
 *     is what makes a replay *content*-complete: without it, a caller could
 *     resend different bytes under a completed key and be handed the first
 *     upload's receipt.
 *
 * Neither is ever derived from a `jsonb` round-trip — see `canonical-json.ts`.
 */
import { fingerprintOf } from './canonical-json';
import {
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
  UPLOAD_OPERATION_NAMESPACE,
  type AcceptedMediaType,
} from './asset-intake.policy';

export const REQUEST_FINGERPRINT_VERSION = 1;
export const CONTENT_FINGERPRINT_VERSION = 1;

export interface RequestFingerprintInput {
  /** The hashed scope key — never the raw `Idempotency-Key`. */
  readonly scopeKey: string;
  readonly declaredMediaType: AcceptedMediaType;
  readonly normalizedFilename: string;
}

/**
 * `assetKind` and `classification` are the locked intake values rather than
 * client input: they are fixed by policy, so binding them here means a future
 * change to the policy changes the fingerprint — which is correct, because it
 * would be a different request.
 */
export function buildRequestFingerprint(input: RequestFingerprintInput): string {
  return fingerprintOf({
    version: REQUEST_FINGERPRINT_VERSION,
    operationNamespace: UPLOAD_OPERATION_NAMESPACE,
    scopeKey: input.scopeKey,
    assetKind: INTAKE_ASSET_KIND,
    classification: INTAKE_CLASSIFICATION,
    declaredMediaType: input.declaredMediaType,
    normalizedFilename: input.normalizedFilename,
  });
}

export interface ContentFingerprintInput {
  /** The validated media type, which must equal the declared one. */
  readonly mediaType: AcceptedMediaType;
  readonly byteSize: number;
  /** The server-computed `sha256:<hex>` — no client checksum is ever accepted. */
  readonly checksum: string;
}

export function buildContentFingerprint(input: ContentFingerprintInput): string {
  return fingerprintOf({
    version: CONTENT_FINGERPRINT_VERSION,
    mediaType: input.mediaType,
    byteSize: input.byteSize,
    checksum: input.checksum,
  });
}
