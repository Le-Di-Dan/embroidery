import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiFieldError } from '@embroidery/contracts';

import { API_ERROR_CODE, INTERNAL_ERROR_MESSAGE, errorCodeForStatus } from './api-error-code';

/**
 * Maps a thrown value to a client-safe error (APP0-B03).
 *
 * The rule is allowlist, not denylist: nothing reaches the client unless this
 * module explicitly copies it. Sanitising by stripping known-bad fields would
 * fail the moment a library attaches a new one, and the values at risk here are
 * connection strings, SQL fragments, provider payloads and stack traces.
 *
 * Pure and framework-free so the mapping table can be asserted directly.
 */

export interface MappedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly ApiFieldError[];
}

/** Longest client-visible message accepted from an exception payload. */
const MAX_MESSAGE_LENGTH = 500;

/** Longest list of validation messages copied to the client. */
const MAX_FIELD_ERRORS = 50;

/**
 * A safe message is a plain non-empty single-line string of bounded length.
 *
 * Newlines are rejected because a multi-line string from an exception payload is
 * almost always a stack trace or a stringified internal object, never a message
 * written for a user.
 */
function isSafeMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_MESSAGE_LENGTH &&
    !value.includes('\n') &&
    !value.includes('\r')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a canonical structured field error, if the payload already contains
 * one. Anything that is not exactly `{ field, code, message }` of safe strings
 * is discarded rather than partially copied.
 */
function toFieldError(value: unknown): ApiFieldError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { field, code, message } = value;
  if (isSafeMessage(field) && isSafeMessage(code) && isSafeMessage(message)) {
    return { field, code, message };
  }
  return undefined;
}

/**
 * Extracts validation details from a `HttpException` payload.
 *
 * Two shapes are supported because both already exist in the wild: Nest's
 * built-in validation pipe produces `message: string[]`, and a canonical
 * structured error produces `errors: ApiFieldError[]`.
 */
function extractFieldErrors(payload: Record<string, unknown>): ApiFieldError[] | undefined {
  const structured = payload['errors'];
  if (Array.isArray(structured)) {
    const mapped = structured
      .map(toFieldError)
      .filter((entry): entry is ApiFieldError => entry !== undefined)
      .slice(0, MAX_FIELD_ERRORS);
    return mapped.length > 0 ? mapped : undefined;
  }
  return undefined;
}

function extractMessages(payload: Record<string, unknown>): string[] | undefined {
  const message = payload['message'];
  if (!Array.isArray(message)) {
    return undefined;
  }
  const safe = message.filter(isSafeMessage).slice(0, MAX_FIELD_ERRORS);
  return safe.length > 0 ? safe : undefined;
}

function mapHttpException(exception: HttpException): MappedError {
  // Typed as the enum rather than `number` so the comparisons and the switch
  // below share its type; `getStatus()` is declared as a plain number.
  const status: HttpStatus = exception.getStatus();
  const code = errorCodeForStatus(status);

  // A server-side HttpException is still a server fault: its message may have
  // been built from an internal failure, so it is replaced like any other 5xx.
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return { status, code, message: INTERNAL_ERROR_MESSAGE };
  }

  const payload: unknown = exception.getResponse();

  if (isSafeMessage(payload)) {
    return { status, code, message: payload };
  }

  if (!isRecord(payload)) {
    return { status, code, message: defaultMessageForStatus(status) };
  }

  const fieldErrors = extractFieldErrors(payload);
  if (fieldErrors !== undefined) {
    return {
      status,
      code,
      message: isSafeMessage(payload['message'])
        ? payload['message']
        : defaultMessageForStatus(status),
      errors: fieldErrors,
    };
  }

  const messages = extractMessages(payload);
  if (messages !== undefined) {
    // Validation-pipe output: each string becomes a field-less detail so the
    // canonical `errors` array stays the single place clients read details from.
    return {
      status,
      code,
      message: defaultMessageForStatus(status),
      errors: messages.map((message) => ({ field: '', code, message })),
    };
  }

  return {
    status,
    code,
    message: isSafeMessage(payload['message'])
      ? payload['message']
      : defaultMessageForStatus(status),
  };
}

/** Neutral fallback text when an exception carries no safe message of its own. */
function defaultMessageForStatus(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'Authentication is required.';
    case HttpStatus.FORBIDDEN:
      return 'You do not have permission to perform this action.';
    case HttpStatus.NOT_FOUND:
      return 'The requested resource was not found.';
    case HttpStatus.METHOD_NOT_ALLOWED:
      return 'The HTTP method is not allowed for this resource.';
    case HttpStatus.CONFLICT:
      return 'The request conflicts with the current state of the resource.';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'The request could not be processed.';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too many requests. Please try again later.';
    default:
      return 'The request is invalid.';
  }
}

/**
 * Maps any thrown value to a safe error. Values that are not `HttpException` —
 * including plain `Error`, strings and objects — are treated as unknown
 * internal failures and reported generically, because their content is
 * unreviewed and may embed anything.
 */
export function mapExceptionToError(exception: unknown): MappedError {
  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
  };
}
