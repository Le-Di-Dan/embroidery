/**
 * The bounded public error contract for APP5 customer intake (`APP5-B02` §11).
 *
 * Two rules shape this list, and both are about what a *refusal* discloses.
 *
 * **The three media classes and nothing finer.** A caller learns that the file
 * was too large, that the type is not accepted, or that processing refused it.
 * It never learns which magic bytes disagreed with which declared type, what an
 * inspector reported, which internal probe ran, or where the object would have
 * gone. Those are the details that turn an error message into a description of
 * the validation pipeline.
 *
 * **One answer for every authorization miss.** Unknown challenge, wrong
 * purpose, unverified, expired and already-submitted all answer
 * `REQUEST_INTAKE_NOT_AUTHORIZED`. Distinguishing them would confirm that a
 * guessed challenge id exists — precisely what `APP5-B01`'s resolver and the
 * public verification read already refuse to do, and a second surface that
 * answered differently would undo both.
 *
 * The intake pipeline itself is `APP2-B01`'s and raises `AssetIntakeError`; the
 * controller maps those verbatim, because they are already bounded to the same
 * three media classes. This module adds only the codes APP5 owns.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type HttpException,
} from '@nestjs/common';

export const REQUEST_INTAKE_ERROR_CODES = [
  'REQUEST_INTAKE_NOT_AUTHORIZED',
  'REQUEST_INTAKE_ROLE_INVALID',
  'REQUEST_INTAKE_QUOTA_REACHED',
  'REQUEST_INTAKE_ASSET_NOT_FOUND',
] as const;

export type RequestIntakeErrorCode = (typeof REQUEST_INTAKE_ERROR_CODES)[number];

const MESSAGES: Record<RequestIntakeErrorCode, string> = {
  REQUEST_INTAKE_NOT_AUTHORIZED:
    'This upload could not be authorized. Verify your contact again and retry.',
  REQUEST_INTAKE_ROLE_INVALID: 'That attachment role is not available for a custom request.',
  REQUEST_INTAKE_QUOTA_REACHED: 'This request already has the maximum number of attachments.',
  REQUEST_INTAKE_ASSET_NOT_FOUND: 'That attachment does not exist.',
};

export class RequestIntakeError extends Error {
  readonly code: RequestIntakeErrorCode;

  constructor(code: RequestIntakeErrorCode) {
    super(MESSAGES[code]);
    this.name = 'RequestIntakeError';
    this.code = code;
  }
}

export function isRequestIntakeError(error: unknown): error is RequestIntakeError {
  return error instanceof RequestIntakeError;
}

export function requestIntakeError(code: RequestIntakeErrorCode): RequestIntakeError {
  return new RequestIntakeError(code);
}

interface ErrorPayload {
  readonly code: RequestIntakeErrorCode;
  readonly message: string;
}

/**
 * `NOT_AUTHORIZED` is a 401 rather than a 403: the challenge *is* the
 * credential, so a missing or spent one is "you are not authenticated for this",
 * not "you are known and refused". `QUOTA_REACHED` is a 409 because the caller
 * can act on it — remove nothing, but stop retrying — and because a 429 would
 * invite a client to back off and try again, which will never succeed.
 */
const STATUS_BY_CODE: Record<RequestIntakeErrorCode, (payload: ErrorPayload) => HttpException> = {
  REQUEST_INTAKE_NOT_AUTHORIZED: (payload) => new UnauthorizedException(payload),
  REQUEST_INTAKE_ROLE_INVALID: (payload) => new ForbiddenException(payload),
  REQUEST_INTAKE_QUOTA_REACHED: (payload) => new ConflictException(payload),
  REQUEST_INTAKE_ASSET_NOT_FOUND: (payload) => new NotFoundException(payload),
};

export function toHttpException(error: RequestIntakeError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
