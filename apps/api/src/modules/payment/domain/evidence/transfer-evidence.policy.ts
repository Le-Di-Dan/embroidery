/**
 * The fourth intake lane, and the rules that bound it (`APP7-G01` §7,
 * `APP7-B05`).
 *
 * These are approved product values, not tuning knobs, and they live in Payment
 * rather than in the Asset module for the reason the Session and the APP5 lanes
 * live in Design and Ordering: the Asset module owns *how* bytes are taken in,
 * and the module that owns the payment attempt owns *what a customer paying a
 * deposit is allowed to hand over*.
 *
 * ### Nothing here is client-selectable
 *
 * The kind, the classification, the ceiling, the namespace and the cap are all
 * fixed. The body carries a credential, an attempt locator and one file part;
 * there is no field for the asset kind, the classification, the object key, the
 * customer, the obligation, the order, the amount or the inspection outcome,
 * because each is either derived from the grant or decided by the pipeline.
 *
 * ### Evidence is supporting, never authority
 *
 * ```text
 * TRANSFER_EVIDENCE_REQUIRED  = false
 * TRANSFER_EVIDENCE_SUPPORTED = true
 * EVIDENCE_AUTHORITY          = SUPPORTING_RECONCILIATION_ONLY
 * ```
 *
 * A customer who transfers correctly and uploads nothing stays fully eligible
 * for `APP7-B04` verification, and a rejected image is not a failed payment.
 */
import type { PaymentAttemptState } from '@embroidery/database';

import type { AssetIntakeLane } from '../../../asset/domain/intake-lane';

/** 10 MiB — the delivered customer-photograph ceiling, unchanged. */
export const MAX_TRANSFER_EVIDENCE_BYTES = 10_485_760;

/** A customer's own screenshot. `ASSET_KINDS` vocabulary, not a product term. */
export const TRANSFER_EVIDENCE_ASSET_KIND = 'CUSTOMER_UPLOAD' as const;

/** Private on arrival and never reachable publicly (INV-09). */
export const TRANSFER_EVIDENCE_CLASSIFICATION = 'CUSTOMER_PRIVATE' as const;

/** `APP7-G01` §7.1 — the idempotency namespace this lane claims under. */
export const TRANSFER_EVIDENCE_OPERATION_NAMESPACE = 'public.order.deposit-evidence.upload';

/**
 * The two multipart fields that arrive before the file part.
 *
 * `token` is here and not in a header, a path segment or a query parameter
 * because `ADR-APP4-001` §11 declares every one of those `FORBIDDEN` with no
 * fallback: all of them are written to the Nginx access log, the application
 * request log and every proxy in between. A multipart field is the body.
 *
 * `attemptId` is a **locator and never authority**. `APP7-B03` deliberately
 * defined no current-attempt selector, and inventing one here — newest,
 * first, highest `created_at` — would be a selection rule no accepted document
 * contains. So the caller names the attempt it opened, and the server proves the
 * whole chain from the grant down to that exact row before a byte is read.
 */
export const TRANSFER_EVIDENCE_TOKEN_FIELD = 'accessToken';
export const TRANSFER_EVIDENCE_ATTEMPT_FIELD = 'attemptId';

/** `APP7-G01` §7.2. Five, and the arbiter is the attempt row lock, not the schema. */
export const MAX_EVIDENCE_PER_ATTEMPT = 5;

/** The one method this whole flow produces. There is no provider. */
export const TRANSFER_EVIDENCE_ATTEMPT_METHOD = 'BANK_TRANSFER';

/**
 * The attempt states that still accept evidence (`APP7-G01` §7.2, LC-16).
 *
 * G01 names the bound from the other side — *"once the attempt reaches a
 * terminal state (`SUCCEEDED`, `FAILED`, `EXPIRED`), that attempt accepts no
 * further evidence"* — so this list is that sentence inverted, not a new rule.
 *
 * `REQUIRES_REVIEW` is **in**: it is the manual-review state, the one place a
 * supporting screenshot is worth the most, and accepting an image there changes
 * nothing about it — the row is read, never written. `REFUNDED` and
 * `PARTIALLY_REFUNDED` are out because both are reachable only through
 * `SUCCEEDED`, which is already terminal for this purpose.
 */
export const EVIDENCE_ELIGIBLE_ATTEMPT_STATES: readonly PaymentAttemptState[] = Object.freeze([
  'PENDING',
  'PROCESSING',
  'REQUIRES_REVIEW',
]);

export function acceptsTransferEvidence(status: PaymentAttemptState): boolean {
  return EVIDENCE_ELIGIBLE_ATTEMPT_STATES.includes(status);
}

export const PAYMENT_EVIDENCE_INTAKE_LANE: AssetIntakeLane = Object.freeze({
  assetKind: TRANSFER_EVIDENCE_ASSET_KIND,
  classification: TRANSFER_EVIDENCE_CLASSIFICATION,
  maxUploadBytes: MAX_TRANSFER_EVIDENCE_BYTES,
  operationNamespace: TRANSFER_EVIDENCE_OPERATION_NAMESPACE,
  // No `assetKind`/`classification` field: both are constants here, and a field
  // whose only legal value is a constant is a field whose only possible effect
  // is to be filled in wrong.
  declaresMetadataFields: false,
  credentialFields: Object.freeze([TRANSFER_EVIDENCE_TOKEN_FIELD, TRANSFER_EVIDENCE_ATTEMPT_FIELD]),
});
