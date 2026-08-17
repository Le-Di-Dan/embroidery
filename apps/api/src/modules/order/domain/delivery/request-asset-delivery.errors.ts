/**
 * The safe error contract for Admin request-asset delivery (`APP5-B06` §9).
 *
 * Three codes, and the small number *is* the rule. Every post-authentication
 * miss collapses into one `REQUEST_ASSET_NOT_FOUND`: an unknown request, an
 * unknown asset, an asset bound to a *different* request, an unbound asset, an
 * `ATTACHMENT` association, an asset outside the customer-private upload lane, a
 * tombstoned one, one still `INSPECTING`, one `REJECTED`, one whose persisted
 * source descriptor is missing or incomplete, and one whose persisted media type
 * is not deliverable.
 *
 * Eleven distinguishable internal reasons, one indistinguishable answer. An
 * operator is trusted to read the requests they are given, not to enumerate the
 * asset table through a route that reports *why* an id failed — "that asset
 * exists but belongs to another request" is a fact about a different customer's
 * private upload, and a separate status for it would make this endpoint an
 * existence oracle for every id an authenticated browser cares to try.
 *
 * **Admin authentication failure is a different layer and stays there.** A
 * missing or dead session is answered by `AuthenticatedAdminGuard` with the
 * `401` every other Admin route gives, never converted into a `404` here.
 * Merging the two would hide from a legitimate operator that their session died.
 *
 * Messages are written once, here, and never assembled at a call site: nothing
 * may interpolate a request id, an asset id, a customer, a bucket, a storage
 * key, an inspection reason or a provider name into the only prose that reaches
 * a browser.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const REQUEST_ASSET_DELIVERY_ERROR_CODES = [
  'REQUEST_ASSET_NOT_FOUND',
  'REQUEST_ASSET_INVALID',
  'REQUEST_ASSET_UNAVAILABLE',
] as const;

export type RequestAssetDeliveryErrorCode = (typeof REQUEST_ASSET_DELIVERY_ERROR_CODES)[number];

const MESSAGES: Record<RequestAssetDeliveryErrorCode, string> = {
  REQUEST_ASSET_NOT_FOUND: 'That request attachment is not available.',
  REQUEST_ASSET_INVALID: 'The requested attachment address is not valid.',
  REQUEST_ASSET_UNAVAILABLE: 'Request attachments are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class RequestAssetDeliveryError extends Error {
  readonly code: RequestAssetDeliveryErrorCode;

  constructor(code: RequestAssetDeliveryErrorCode) {
    super(MESSAGES[code]);
    this.name = 'RequestAssetDeliveryError';
    this.code = code;
  }
}

export function isRequestAssetDeliveryError(error: unknown): error is RequestAssetDeliveryError {
  return error instanceof RequestAssetDeliveryError;
}

export function requestAssetDeliveryError(
  code: RequestAssetDeliveryErrorCode,
): RequestAssetDeliveryError {
  return new RequestAssetDeliveryError(code);
}

/** The one not-found every eligibility and association miss arrives at. */
export function requestAssetNotFound(): RequestAssetDeliveryError {
  return new RequestAssetDeliveryError('REQUEST_ASSET_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: RequestAssetDeliveryErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  RequestAssetDeliveryErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  REQUEST_ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
  REQUEST_ASSET_INVALID: (payload) => new BadRequestException(payload),
  // Deliberately not a 404: by the time this can be thrown the whole
  // authorization has already succeeded, so the association *is* there and the
  // database says the asset is `ACCEPTED` with a durable key. Reporting a
  // storage outage — or a provider/database size contradiction — as not-found
  // would tell an operator the customer's evidence no longer exists, which is a
  // moderation decision made on a storage incident.
  REQUEST_ASSET_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

export function toHttpException(error: RequestAssetDeliveryError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
