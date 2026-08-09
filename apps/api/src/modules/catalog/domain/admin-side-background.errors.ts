/**
 * The error contract for Admin Side-background delivery (`APP3-B02A`).
 *
 * Three codes, mirroring `APP3-B02`. The caller here is an authenticated
 * operator rather than an anonymous browser, so the *reason* for withholding is
 * not a secret from them — but the shape stays identical anyway, for two
 * reasons that outlive this checkpoint:
 *
 * - what an operator may see and what a request may *say* are different
 *   questions. Reporting "the Asset exists but its derivative is not READY"
 *   would put asset-lifecycle internals into a catalogue response, and the
 *   operator has an Assets screen for that;
 * - a single not-found means an unknown Product, an unknown Side and a Side
 *   belonging to a **different** Product are indistinguishable here, so this
 *   route cannot be used to enumerate one Product's sides from another's id.
 *
 * Messages are written once and never interpolated at a call site: nothing may
 * assemble prose from an id, a bucket, a key, a provider name or SQL.
 */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
} from '@nestjs/common';

export const ADMIN_SIDE_BACKGROUND_ERROR_CODES = [
  'ADMIN_SIDE_BACKGROUND_NOT_FOUND',
  'ADMIN_SIDE_BACKGROUND_INVALID',
  'ADMIN_SIDE_BACKGROUND_UNAVAILABLE',
] as const;

export type AdminSideBackgroundErrorCode = (typeof ADMIN_SIDE_BACKGROUND_ERROR_CODES)[number];

const MESSAGES: Record<AdminSideBackgroundErrorCode, string> = {
  ADMIN_SIDE_BACKGROUND_NOT_FOUND: 'That product side background is not available.',
  ADMIN_SIDE_BACKGROUND_INVALID: 'The requested product side background address is not valid.',
  ADMIN_SIDE_BACKGROUND_UNAVAILABLE:
    'Product side backgrounds are temporarily unavailable. Please try again.',
};

/**
 * The transport-free error every delivery failure is expressed as.
 *
 * Carried as data rather than thrown as a framework exception from inside the
 * repository or the stream pipeline, so neither layer needs HTTP knowledge.
 */
export class AdminSideBackgroundError extends Error {
  readonly code: AdminSideBackgroundErrorCode;

  constructor(code: AdminSideBackgroundErrorCode) {
    super(MESSAGES[code]);
    this.name = 'AdminSideBackgroundError';
    this.code = code;
  }
}

export function isAdminSideBackgroundError(error: unknown): error is AdminSideBackgroundError {
  return error instanceof AdminSideBackgroundError;
}

export function adminSideBackgroundError(
  code: AdminSideBackgroundErrorCode,
): AdminSideBackgroundError {
  return new AdminSideBackgroundError(code);
}

/** The single not-found used by every resolution miss. */
export function adminSideBackgroundNotFound(): AdminSideBackgroundError {
  return new AdminSideBackgroundError('ADMIN_SIDE_BACKGROUND_NOT_FOUND');
}

interface ErrorPayload {
  readonly code: AdminSideBackgroundErrorCode;
  readonly message: string;
}

const STATUS_BY_CODE: Record<
  AdminSideBackgroundErrorCode,
  (payload: ErrorPayload) => HttpException
> = {
  ADMIN_SIDE_BACKGROUND_NOT_FOUND: (payload) => new NotFoundException(payload),
  ADMIN_SIDE_BACKGROUND_INVALID: (payload) => new BadRequestException(payload),
  // Distinguished from 404 on purpose: the descriptor resolved, so the row says
  // the background exists and is READY. Reporting a storage outage — or a
  // provider/database size contradiction — as not-found would tell an operator
  // their placement is broken when the fault is transient and elsewhere.
  ADMIN_SIDE_BACKGROUND_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),
};

export function toHttpException(error: AdminSideBackgroundError): HttpException {
  return STATUS_BY_CODE[error.code]({ code: error.code, message: error.message });
}
