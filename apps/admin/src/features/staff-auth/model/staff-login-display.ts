import { STAFF_LOGIN_COPY, fieldErrorMessage, formatRetryDuration } from './staff-login-copy';
import type { StaffLoginError } from './staff-login-errors';
import type { FieldErrors, StaffLoginField } from './staff-login-form';

export type StaffLoginAlertTone = 'error' | 'warning';

export interface FormAlert {
  tone: StaffLoginAlertTone;
  message: string;
}

const FIELDS: readonly StaffLoginField[] = ['email', 'password'];

/**
 * Merge client and server field errors into display messages. Client validation
 * (set on submit) takes precedence over a server field error for the same field.
 */
export function resolveFieldMessages(
  clientErrors: FieldErrors,
  serverError: StaffLoginError | null,
): Partial<Record<StaffLoginField, string>> {
  const serverFieldErrors: FieldErrors =
    serverError?.kind === 'field' ? serverError.fieldErrors : {};
  const merged: FieldErrors = { ...serverFieldErrors, ...clientErrors };

  const messages: Partial<Record<StaffLoginField, string>> = {};
  for (const field of FIELDS) {
    const code = merged[field];
    if (code !== undefined) messages[field] = fieldErrorMessage(field, code);
  }
  return messages;
}

/**
 * Resolve the single form-level alert. Field validation and generic auth failure
 * are separate states — a `field` error only surfaces here when it carries an
 * unknown-field fallback, never alongside its own field messages by design.
 * `rateSeconds` is the original Retry-After value so the message stays constant
 * (announced once) while the visible countdown ticks elsewhere.
 */
export function resolveFormAlert(
  error: StaffLoginError | null,
  rateSeconds: number | null,
): FormAlert | undefined {
  if (error === null) return undefined;
  switch (error.kind) {
    case 'auth':
      return { tone: 'error', message: STAFF_LOGIN_COPY.alert.auth };
    case 'network':
      return { tone: 'error', message: STAFF_LOGIN_COPY.alert.network };
    case 'rateLimited': {
      const duration =
        rateSeconds !== null
          ? formatRetryDuration(rateSeconds)
          : STAFF_LOGIN_COPY.rateLimit.fallbackDuration;
      return { tone: 'warning', message: STAFF_LOGIN_COPY.rateLimit.message(duration) };
    }
    case 'field':
      return error.formLevel
        ? { tone: 'error', message: STAFF_LOGIN_COPY.alert.unknownField }
        : undefined;
    default:
      return undefined;
  }
}

/** Visible `m:ss` countdown for the rate-limit wait (decorative, not announced). */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
