/**
 * The APP5 intake request fingerprint (`APP5-B02`).
 *
 * A separate function from `buildRequestFingerprint` rather than a parameter on
 * it: that one hard-codes the Admin namespace, kind and classification, so
 * generalising it would change the value APP2's and APP3's shipped claims are
 * already stored under. Two shipped lanes' idempotency records are not worth
 * re-keying to save a function.
 *
 * `role` is inside the fingerprint because it is a meaningful input: the same
 * file uploaded as a `COP_IMAGE` and as a `REFERENCE` are two different
 * requests, and one key covering both would let a retry silently change what
 * the evidence means.
 */
import { fingerprintOf } from '../../../asset/domain/canonical-json';
import type { AcceptedMediaType } from '../../../asset/domain/asset-intake.policy';
import {
  REQUEST_INTAKE_ASSET_KIND,
  REQUEST_INTAKE_CLASSIFICATION,
  REQUEST_INTAKE_OPERATION_NAMESPACE,
  type RequestIntakeRole,
} from './request-intake.policy';

export const REQUEST_INTAKE_FINGERPRINT_VERSION = 1;

export interface RequestIntakeFingerprintInput {
  /** The hashed scope key — never the raw `Idempotency-Key`, never the challenge id. */
  readonly scopeKey: string;
  readonly role: RequestIntakeRole;
  readonly declaredMediaType: AcceptedMediaType;
  readonly normalizedFilename: string;
}

export function buildRequestIntakeFingerprint(input: RequestIntakeFingerprintInput): string {
  return fingerprintOf({
    version: REQUEST_INTAKE_FINGERPRINT_VERSION,
    operationNamespace: REQUEST_INTAKE_OPERATION_NAMESPACE,
    scopeKey: input.scopeKey,
    assetKind: REQUEST_INTAKE_ASSET_KIND,
    classification: REQUEST_INTAKE_CLASSIFICATION,
    role: input.role,
    declaredMediaType: input.declaredMediaType,
    normalizedFilename: input.normalizedFilename,
  });
}
