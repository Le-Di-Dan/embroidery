/**
 * The evidence intake idempotency identity (`APP7-B05` §14).
 *
 * A third `build…Fingerprint` rather than a parameter on either shipped one, for
 * the reason `APP5-B02` records: both hard-code their own namespace, kind and
 * classification, and generalising either would change the value already-stored
 * claims are keyed under. Two shipped lanes' idempotency records are not worth
 * re-keying to save a function.
 *
 * ### The scope, and why one key cannot cross a boundary
 *
 * `scopeKey` is a digest of the **server-proved** chain — the custom request and
 * the exact payment attempt this upload was authorized against — together with
 * the caller's raw key. So the same `Idempotency-Key` presented on another
 * customer's link, another order, another obligation or another attempt of the
 * same obligation lands in a different scope and claims nothing. The digest is
 * also what keeps the request id, the attempt id and the raw key itself out of
 * `idempotency_records.scope_key`.
 *
 * Both inputs are the values the authorizer resolved, never the values the body
 * asserted: the attempt id arrives as an opaque locator and is proved against
 * the grant before it is allowed anywhere near this function.
 */
import { fingerprintOf, sha256Hex } from '../../../asset/domain/canonical-json';
import type { AcceptedMediaType } from '../../../asset/domain/asset-intake.policy';
import {
  TRANSFER_EVIDENCE_ASSET_KIND,
  TRANSFER_EVIDENCE_CLASSIFICATION,
  TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
} from './transfer-evidence.policy';

export const TRANSFER_EVIDENCE_FINGERPRINT_VERSION = 1;

export interface TransferEvidenceScopeInput {
  /** The request the grant resolved to — never one the caller named. */
  readonly customRequestId: string;
  /** The attempt the server proved, not the locator the body carried. */
  readonly paymentAttemptId: string;
  /** Already validated by `parseIdempotencyKey`. Digested here and nowhere stored. */
  readonly idempotencyKey: string;
}

export function transferEvidenceScopeKey(input: TransferEvidenceScopeInput): string {
  return sha256Hex(
    `app7-b05-evidence:${input.customRequestId}:${input.paymentAttemptId}:${input.idempotencyKey}`,
  );
}

export interface TransferEvidenceFingerprintInput {
  /** The hashed scope key — never the raw `Idempotency-Key`, never the token. */
  readonly scopeKey: string;
  readonly declaredMediaType: AcceptedMediaType;
  /**
   * The delivered `normalizeFilename` of the caller's filename.
   *
   * Used **only** here, exactly as the APP5 lane uses it: a resent request that
   * carries a different file should not silently reuse a completed claim. It is
   * not persisted as evidence metadata and never reaches a response.
   */
  readonly normalizedFilename: string;
}

export function buildTransferEvidenceFingerprint(input: TransferEvidenceFingerprintInput): string {
  return fingerprintOf({
    version: TRANSFER_EVIDENCE_FINGERPRINT_VERSION,
    operationNamespace: TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
    scopeKey: input.scopeKey,
    assetKind: TRANSFER_EVIDENCE_ASSET_KIND,
    classification: TRANSFER_EVIDENCE_CLASSIFICATION,
    declaredMediaType: input.declaredMediaType,
    normalizedFilename: input.normalizedFilename,
  });
}
