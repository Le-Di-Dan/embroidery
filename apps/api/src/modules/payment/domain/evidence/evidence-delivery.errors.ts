/**
 * The safe error contract for Admin transfer-evidence delivery (`APP7-B06` §10).
 *
 * Three codes, and the small number *is* the rule. Every post-authentication
 * miss collapses into one `PAYMENT_EVIDENCE_NOT_FOUND`: an unknown association
 * id, an association whose attempt no longer resolves, an asset the
 * customer-private upload lane does not contain, a tombstoned one, one still
 * `UPLOADED` or `INSPECTING`, one inspection `REJECTED`, one whose persisted
 * source descriptor is missing or incomplete, and one whose persisted media type
 * is not deliverable.
 *
 * Nine distinguishable internal reasons, one indistinguishable answer. An
 * operator is trusted to open the evidence `APP7-B04` handed them, not to
 * enumerate the association table through a route that reports *why* an id
 * failed — "that association exists but its image was rejected" is a fact about
 * another customer's private upload and about a moderation outcome, and a
 * separate status for it would make this endpoint an existence oracle for every
 * id an authenticated browser cares to try.
 *
 * **Admin authentication failure is a different layer and stays there.** A
 * missing or dead session is answered by `AuthenticatedAdminGuard` with the
 * `401` every other Admin route gives, never converted into a `404` here.
 * Merging the two would hide from a legitimate operator that their session died.
 *
 * **The 503 is the module's vocabulary, not the wire's.** `mapHttpException`
 * replaces the code and message of every 5xx with the generic pair, because a
 * server-side failure's prose may have been built from an internal fault. So
 * `PAYMENT_EVIDENCE_UNAVAILABLE` names the refusal here and in the logs, and a
 * caller sees only the status — which is exactly the disclosure §22 asks for.
 *
 * Messages are written once, here, and never assembled at a call site: nothing
 * may interpolate an evidence id, an asset id, an attempt, an obligation, an
 * order, a customer, a bucket, a storage key, an inspection reason or a provider
 * name into the only prose that reaches a browser.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const PAYMENT_EVIDENCE_DELIVERY_ERROR_CODES = [
  'PAYMENT_EVIDENCE_NOT_FOUND',
  'PAYMENT_EVIDENCE_INVALID',
  'PAYMENT_EVIDENCE_UNAVAILABLE',
] as const;

export type PaymentEvidenceDeliveryErrorCode =
  (typeof PAYMENT_EVIDENCE_DELIVERY_ERROR_CODES)[number];

const MESSAGES: Record<PaymentEvidenceDeliveryErrorCode, string> = {
  PAYMENT_EVIDENCE_NOT_FOUND: 'That transfer evidence is not available.',
  PAYMENT_EVIDENCE_INVALID: 'The requested transfer-evidence address is not valid.',
  PAYMENT_EVIDENCE_UNAVAILABLE: 'Transfer evidence is temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class PaymentEvidenceDeliveryError extends Error {
  readonly code: PaymentEvidenceDeliveryErrorCode;

  constructor(code: PaymentEvidenceDeliveryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'PaymentEvidenceDeliveryError';
    this.code = code;
  }
}

export function isPaymentEvidenceDeliveryError(
  error: unknown,
): error is PaymentEvidenceDeliveryError {
  return error instanceof PaymentEvidenceDeliveryError;
}

export function paymentEvidenceDeliveryError(
  code: PaymentEvidenceDeliveryErrorCode,
): PaymentEvidenceDeliveryError {
  return new PaymentEvidenceDeliveryError(code);
}

/** The one not-found every association and eligibility miss arrives at. */
export function paymentEvidenceNotFound(): PaymentEvidenceDeliveryError {
  return new PaymentEvidenceDeliveryError('PAYMENT_EVIDENCE_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: PaymentEvidenceDeliveryErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  PaymentEvidenceDeliveryErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  PAYMENT_EVIDENCE_NOT_FOUND: (payload) => new NotFoundException(payload),
  PAYMENT_EVIDENCE_INVALID: (payload) => new BadRequestException(payload),
  // Deliberately not a 404: by the time this can be thrown the whole
  // authorization has already succeeded, so the association *is* there and the
  // database says the asset is `ACCEPTED` with a durable key. Reporting a
  // storage outage — or a provider/database size contradiction — as not-found
  // would tell an operator the customer's evidence no longer exists, which is a
  // reconciliation decision made on a storage incident.
  PAYMENT_EVIDENCE_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

export function toHttpException(error: PaymentEvidenceDeliveryError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
