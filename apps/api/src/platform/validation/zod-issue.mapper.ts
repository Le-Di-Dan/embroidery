/**
 * Canonical Zod-issue → API field-error mapping (APP1-B01-C1).
 *
 * Translates a `ZodError` into the platform's `errors[]` contract with stable,
 * allowlisted codes and safe messages. It never exposes a raw Zod issue, the
 * received value, schema internals, or a stack: only `{ field, code, message }`.
 * Ordering is made deterministic (by field then code) so the array does not
 * depend on Zod's internal traversal order.
 */
import type { ZodError, ZodIssue } from 'zod';
import type { ApiFieldError } from '@embroidery/contracts';

/** The closed set of field-error codes this layer will emit. */
export const FIELD_ERROR_CODES = ['REQUIRED', 'TOO_LONG', 'INVALID', 'UNKNOWN_FIELD'] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

const MESSAGES: Record<FieldErrorCode, string> = {
  REQUIRED: 'This field is required.',
  TOO_LONG: 'This value is too long.',
  INVALID: 'This value is invalid.',
  UNKNOWN_FIELD: 'This field is not permitted.',
};

function isFieldErrorCode(value: unknown): value is FieldErrorCode {
  return typeof value === 'string' && (FIELD_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Resolves the stable code for one issue. A schema may attach an explicit
 * `params.fieldCode` (e.g. a byte-length refine → `TOO_LONG`); otherwise the
 * Zod issue code is mapped conservatively, defaulting to `INVALID`.
 */
function codeForIssue(issue: ZodIssue): FieldErrorCode {
  const explicit = (issue as { params?: { fieldCode?: unknown } }).params?.fieldCode;
  if (isFieldErrorCode(explicit)) {
    return explicit;
  }
  switch (issue.code) {
    case 'invalid_type':
    case 'too_small':
      return 'REQUIRED';
    case 'too_big':
      return 'TOO_LONG';
    case 'unrecognized_keys':
      return 'UNKNOWN_FIELD';
    default:
      return 'INVALID';
  }
}

/** The field an issue is about — the joined path, or the first unknown key. */
function fieldForIssue(issue: ZodIssue): string {
  if (issue.path.length > 0) {
    return issue.path.map((segment) => String(segment)).join('.');
  }
  const keys = (issue as { keys?: unknown }).keys;
  if (Array.isArray(keys) && keys.length > 0 && typeof keys[0] === 'string') {
    return keys[0];
  }
  return '';
}

/** Maps a `ZodError` to the canonical, deterministically ordered field errors. */
export function mapZodError(error: ZodError): ApiFieldError[] {
  return error.issues
    .map((issue): ApiFieldError => {
      const code = codeForIssue(issue);
      return { field: fieldForIssue(issue), code, message: MESSAGES[code] };
    })
    .sort((a, b) => a.field.localeCompare(b.field) || a.code.localeCompare(b.code));
}
