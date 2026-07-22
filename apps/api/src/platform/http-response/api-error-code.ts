import { HttpStatus } from '@nestjs/common';

/**
 * Platform-level error codes (APP0-B03).
 *
 * `code` is the field clients branch on, so it must be stable and derived from
 * the HTTP status rather than from an exception class name — renaming an
 * internal class must never change the public contract, and a class name is
 * itself an internal detail we do not publish.
 *
 * This is deliberately a transport-level set only. Business codes such as
 * `INVALID_ORDER_TRANSITION` belong to the feature that owns the rule and are
 * supplied per endpoint; inventing a business registry here would guess at
 * decisions APP0 does not own.
 */
export const API_ERROR_CODE = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

/** Default success code when an endpoint declares none. */
export const API_SUCCESS_CODE = 'OK';

/** Default success message when an endpoint declares none. */
export const API_SUCCESS_MESSAGE = 'Request completed successfully';

/**
 * The single public message for any 5xx. Server faults never carry a specific
 * message: the specific text is exactly what leaks SQL fragments, provider
 * payloads and connection strings.
 */
export const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

const STATUS_TO_CODE: ReadonlyMap<number, ApiErrorCode> = new Map([
  [HttpStatus.BAD_REQUEST, API_ERROR_CODE.BAD_REQUEST],
  [HttpStatus.UNAUTHORIZED, API_ERROR_CODE.UNAUTHORIZED],
  [HttpStatus.FORBIDDEN, API_ERROR_CODE.FORBIDDEN],
  [HttpStatus.NOT_FOUND, API_ERROR_CODE.NOT_FOUND],
  [HttpStatus.METHOD_NOT_ALLOWED, API_ERROR_CODE.METHOD_NOT_ALLOWED],
  [HttpStatus.CONFLICT, API_ERROR_CODE.CONFLICT],
  [HttpStatus.UNPROCESSABLE_ENTITY, API_ERROR_CODE.UNPROCESSABLE_ENTITY],
  [HttpStatus.TOO_MANY_REQUESTS, API_ERROR_CODE.TOO_MANY_REQUESTS],
]);

/**
 * Maps an HTTP status to its stable code.
 *
 * Any status without an explicit entry falls back by class: an unlisted 4xx is
 * a client error we simply have no finer name for, and anything else is
 * reported as a server fault. The fallback is deliberate — a new status must
 * never produce an undefined or invented code.
 */
export function errorCodeForStatus(status: number): ApiErrorCode {
  const mapped = STATUS_TO_CODE.get(status);
  if (mapped !== undefined) {
    return mapped;
  }
  if (status >= 400 && status < 500) {
    return API_ERROR_CODE.BAD_REQUEST;
  }
  return API_ERROR_CODE.INTERNAL_SERVER_ERROR;
}
