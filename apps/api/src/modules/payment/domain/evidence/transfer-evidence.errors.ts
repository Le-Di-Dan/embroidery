/**
 * The two codes the evidence surface owns, and the long list it deliberately
 * does not (`APP7-B05` §26).
 *
 * ### Almost every refusal is somebody else's, on purpose
 *
 * - a token that is unknown, expired, revoked, superseded or for another target;
 *   a request with no order; an order with no live `DEPOSIT` obligation; an
 *   `attemptId` that does not exist, belongs to another obligation or belongs to
 *   another customer — **all** leave as the delivered
 *   `404 / SECURE_LINK_UNAVAILABLE`, identical in status, code, message and
 *   shape. A foreign attempt id is therefore indistinguishable from a fictional
 *   one, which is what stops this route becoming an enumeration oracle over
 *   other customers' payments;
 * - too large, unsupported media, signature mismatch, malformed multipart,
 *   duplicate or conflicting idempotency key, timeout and storage unavailable
 *   are `APP2-B01`'s `AssetIntakeError`, already bounded to the three media
 *   classes a customer is allowed to learn. They are mapped, never re-coded: a
 *   second vocabulary for the same failures is two vocabularies that drift;
 * - `REVERIFICATION_REQUIRED` is `APP7-B03`'s `DepositError`, reused for the
 *   same rule rather than restated.
 *
 * What is left is the two things only this checkpoint can refuse.
 *
 * Neither message names a scanner, a signature byte, a SQLSTATE, a constraint,
 * a bucket, an object path or a stack frame.
 */
import { ConflictException, type HttpException } from '@nestjs/common';

export const TRANSFER_EVIDENCE_ERROR_CODES = [
  /** `APP7-G01` §7.2 — this attempt already holds the maximum of five images. */
  'EVIDENCE_QUOTA_REACHED',
  /**
   * The attempt is terminal, so it accepts no further evidence.
   *
   * Distinct from the quota because the customer's next move differs: a retry
   * opens a **new** attempt (LC-16) with its own empty evidence set, whereas a
   * full attempt will never accept a sixth image.
   */
  'EVIDENCE_ATTEMPT_CLOSED',
] as const;

export type TransferEvidenceErrorCode = (typeof TRANSFER_EVIDENCE_ERROR_CODES)[number];

const MESSAGES: Record<TransferEvidenceErrorCode, string> = {
  EVIDENCE_QUOTA_REACHED: 'This payment already has the maximum number of transfer images.',
  EVIDENCE_ATTEMPT_CLOSED: 'This payment attempt is no longer accepting transfer images.',
};

export class TransferEvidenceError extends Error {
  readonly code: TransferEvidenceErrorCode;

  constructor(code: TransferEvidenceErrorCode) {
    super(MESSAGES[code]);
    this.name = 'TransferEvidenceError';
    this.code = code;
  }
}

export function transferEvidenceError(code: TransferEvidenceErrorCode): TransferEvidenceError {
  return new TransferEvidenceError(code);
}

export function isTransferEvidenceError(error: unknown): error is TransferEvidenceError {
  return error instanceof TransferEvidenceError;
}

/**
 * Both are `409`.
 *
 * Not a `429`: a client told to back off would retry a request that can never
 * succeed. Not a `403` either — the caller is authorized; the *state* refuses.
 */
export function toTransferEvidenceHttpException(error: TransferEvidenceError): HttpException {
  return new ConflictException({ code: error.code, message: error.message });
}
