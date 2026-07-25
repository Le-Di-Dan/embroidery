/**
 * Client-side form model and validation for the staff login screen. Client
 * validation improves UX only; the API remains authoritative (ADR-APP1-001).
 * Bounds mirror the backend contract (`StaffLoginRequest`: email ≤254 bytes,
 * password ≤4096 bytes) so the client never blocks a value the server accepts.
 */
export type StaffLoginField = 'email' | 'password';

export interface StaffLoginValues {
  email: string;
  password: string;
}

export type FieldErrorCode = 'REQUIRED' | 'TOO_LONG' | 'INVALID';

export type FieldErrors = Partial<Record<StaffLoginField, FieldErrorCode>>;

/** RFC 5321 practical maximum for an email address (bytes). */
export const MAX_EMAIL_BYTES = 254;
/** Reject longer passwords outright — no silent truncation. */
export const MAX_PASSWORD_BYTES = 4096;

/** Bounded, backtracking-safe address shape, matching the backend pattern. */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function byteLength(value: string): number {
  // Blob measures the UTF-8 byte length and exists in every browser and jsdom,
  // matching the backend's byte-based bounds without a TextEncoder polyfill.
  return new Blob([value]).size;
}

export function validateEmail(raw: string): FieldErrorCode | undefined {
  const value = raw.trim();
  if (value.length === 0) return 'REQUIRED';
  if (byteLength(value) > MAX_EMAIL_BYTES) return 'TOO_LONG';
  if (!EMAIL_PATTERN.test(value)) return 'INVALID';
  return undefined;
}

export function validatePassword(raw: string): FieldErrorCode | undefined {
  if (raw.length === 0) return 'REQUIRED';
  if (byteLength(raw) > MAX_PASSWORD_BYTES) return 'TOO_LONG';
  return undefined;
}

export function validateStaffLogin(values: StaffLoginValues): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  const password = validatePassword(values.password);
  if (password) errors.password = password;
  return errors;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return errors.email !== undefined || errors.password !== undefined;
}

/** First invalid field in tab order, for focus management after a failed submit. */
export function firstInvalidField(errors: FieldErrors): StaffLoginField | undefined {
  if (errors.email !== undefined) return 'email';
  if (errors.password !== undefined) return 'password';
  return undefined;
}
