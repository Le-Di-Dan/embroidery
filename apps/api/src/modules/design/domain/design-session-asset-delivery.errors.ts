/**
 * The safe error contract for Design Session asset delivery (`APP3-B06C`).
 *
 * Three codes, and the small number *is* the rule. Every post-authorization miss
 * collapses into one `DESIGN_SESSION_ASSET_NOT_FOUND`: an unknown `assetId`, an
 * Asset that belongs to a different Session, a missing association, an Asset in
 * the wrong lane or classification, a tombstoned one, one still `INSPECTING`, one
 * `REJECTED`, a derivative that is absent, unready, watermarked, incompletely
 * described or of an unapproved media type.
 *
 * Eleven distinguishable internal reasons, one indistinguishable answer. Every
 * one of them is a fact about another customer's private upload or about the
 * state of this customer's own, and an endpoint that separated them would let an
 * authorized Session probe the Asset table — *"that id exists but is not yours"*
 * leaks as surely as returning the bytes would.
 *
 * **Session authorization failure is a different layer and stays there.** A
 * missing, wrong or expired credential is answered by the accepted `APP3-B06A`
 * surface (`401`, or `429` once the failure budget is spent), not converted into
 * a `404` here. Merging the two would make an unauthorized caller and an
 * authorized one probing a foreign asset indistinguishable — which sounds safer
 * and is not: it would hide from a legitimate client that its credential died.
 *
 * Messages are written once, here, and never assembled at a call site: nothing
 * may interpolate a session id, an asset id, a bucket, a storage key, a provider
 * name or a column into the only prose that reaches a browser.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const DESIGN_SESSION_ASSET_ERROR_CODES = [
  'DESIGN_SESSION_ASSET_NOT_FOUND',
  'DESIGN_SESSION_ASSET_INVALID',
  'DESIGN_SESSION_ASSET_UNAVAILABLE',
] as const;

export type DesignSessionAssetErrorCode = (typeof DESIGN_SESSION_ASSET_ERROR_CODES)[number];

const MESSAGES: Record<DesignSessionAssetErrorCode, string> = {
  DESIGN_SESSION_ASSET_NOT_FOUND: 'That design session image is not available.',
  DESIGN_SESSION_ASSET_INVALID: 'The requested design session image address is not valid.',
  DESIGN_SESSION_ASSET_UNAVAILABLE:
    'Design session images are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class DesignSessionAssetError extends Error {
  readonly code: DesignSessionAssetErrorCode;

  constructor(code: DesignSessionAssetErrorCode) {
    super(MESSAGES[code]);
    this.name = 'DesignSessionAssetError';
    this.code = code;
  }
}

export function isDesignSessionAssetError(error: unknown): error is DesignSessionAssetError {
  return error instanceof DesignSessionAssetError;
}

export function designSessionAssetError(
  code: DesignSessionAssetErrorCode,
): DesignSessionAssetError {
  return new DesignSessionAssetError(code);
}

/** The one not-found every post-authorization miss arrives at. */
export function designSessionAssetNotFound(): DesignSessionAssetError {
  return new DesignSessionAssetError('DESIGN_SESSION_ASSET_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: DesignSessionAssetErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  DesignSessionAssetErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  DESIGN_SESSION_ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
  DESIGN_SESSION_ASSET_INVALID: (payload) => new BadRequestException(payload),
  // Deliberately not a 404: by the time this can be thrown the whole
  // authorization has already succeeded, so the association *is* there and the
  // database says the derivative is `READY` with a durable key. Reporting a
  // storage outage — or a provider/database size contradiction — as not-found
  // would tell an honest client its own upload is gone.
  DESIGN_SESSION_ASSET_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

export function toHttpException(error: DesignSessionAssetError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
