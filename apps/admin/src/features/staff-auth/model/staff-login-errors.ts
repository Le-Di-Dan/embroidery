import { normalizeApiClientError } from '@embroidery/api-client';
import { isAxiosError } from 'axios';

import type { FieldErrorCode, FieldErrors, StaffLoginField } from './staff-login-form';

/**
 * Domain error the login form renders. Derived from the normalized api-client
 * error plus the raw Retry-After header (which normalization does not expose).
 * No raw payload, status text, or account-existence signal ever reaches here.
 */
export type StaffLoginError =
  | { kind: 'field'; fieldErrors: FieldErrors; formLevel: boolean }
  | { kind: 'auth' }
  | { kind: 'rateLimited'; retryAfterSeconds: number | null }
  | { kind: 'network' };

const FIELD_CODES: ReadonlySet<string> = new Set<FieldErrorCode>([
  'REQUIRED',
  'TOO_LONG',
  'INVALID',
]);
const KNOWN_FIELDS: ReadonlySet<string> = new Set<StaffLoginField>(['email', 'password']);
const MAX_RETRY_AFTER_SECONDS = 86_400;

const HTTP_STATUS = {
  badRequest: 400,
  unauthorized: 401,
  tooManyRequests: 429,
} as const;

function parseRetryAfterSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const seconds = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_RETRY_AFTER_SECONDS) {
    return null;
  }
  return seconds;
}

function retryAfterFromError(error: unknown): number | null {
  if (isAxiosError(error) && error.response) {
    const header = error.response.headers as Record<string, unknown> | undefined;
    return parseRetryAfterSeconds(header?.['retry-after']);
  }
  return null;
}

/**
 * Map any thrown login error to a `StaffLoginError`. Unknown field names or
 * codes in a 400 fall back to a safe form-level message; any non-enumerated
 * failure (5xx, timeout, offline, malformed) becomes a generic network error.
 */
export function toStaffLoginError(error: unknown): StaffLoginError {
  const normalized = normalizeApiClientError(error);
  const status = normalized.httpStatus;

  if (status === HTTP_STATUS.tooManyRequests) {
    return { kind: 'rateLimited', retryAfterSeconds: retryAfterFromError(error) };
  }

  if (status === HTTP_STATUS.badRequest && normalized.fieldErrors?.length) {
    const fieldErrors: FieldErrors = {};
    let formLevel = false;
    for (const detail of normalized.fieldErrors) {
      if (KNOWN_FIELDS.has(detail.field) && FIELD_CODES.has(detail.code)) {
        fieldErrors[detail.field as StaffLoginField] = detail.code as FieldErrorCode;
      } else {
        formLevel = true;
      }
    }
    if (Object.keys(fieldErrors).length === 0) formLevel = true;
    return { kind: 'field', fieldErrors, formLevel };
  }

  if (status === HTTP_STATUS.unauthorized) {
    return { kind: 'auth' };
  }

  return { kind: 'network' };
}

/**
 * Clear one field's error after the user edits it. Field-level errors clear per
 * field; a lingering form-level fallback or a non-field error (auth, rate limit,
 * network) is left untouched — those clear on the next submit.
 */
export function clearFieldFromError(
  error: StaffLoginError | null,
  field: StaffLoginField,
): StaffLoginError | null {
  if (error === null || error.kind !== 'field') return error;
  if (error.fieldErrors[field] === undefined) return error;
  const fieldErrors: FieldErrors = { ...error.fieldErrors };
  delete fieldErrors[field];
  if (Object.keys(fieldErrors).length === 0 && !error.formLevel) return null;
  return { kind: 'field', fieldErrors, formLevel: error.formLevel };
}
