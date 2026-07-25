import {
  STAFF_LOGIN_COPY,
  fieldErrorMessage,
  formatRetryDuration,
} from '../../src/features/staff-auth/model/staff-login-copy';
import {
  formatCountdown,
  resolveFieldMessages,
  resolveFormAlert,
} from '../../src/features/staff-auth/model/staff-login-display';
import {
  clearFieldFromError,
  toStaffLoginError,
  type StaffLoginError,
} from '../../src/features/staff-auth/model/staff-login-errors';
import {
  firstInvalidField,
  hasFieldErrors,
  validateEmail,
  validatePassword,
  validateStaffLogin,
} from '../../src/features/staff-auth/model/staff-login-form';
import { makeApiClientError, makeNetworkError } from '../support/api-error';

describe('client validation', () => {
  it('flags a missing email as REQUIRED and a bad shape as INVALID', () => {
    expect(validateEmail('')).toBe('REQUIRED');
    expect(validateEmail('   ')).toBe('REQUIRED');
    expect(validateEmail('not-an-email')).toBe('INVALID');
    expect(validateEmail('admin@example.test')).toBeUndefined();
  });

  it('flags an over-long email as TOO_LONG', () => {
    const long = `${'a'.repeat(250)}@x.io`;
    expect(validateEmail(long)).toBe('TOO_LONG');
  });

  it('requires a password and rejects an over-long one', () => {
    expect(validatePassword('')).toBe('REQUIRED');
    expect(validatePassword('secret')).toBeUndefined();
    expect(validatePassword('x'.repeat(4097))).toBe('TOO_LONG');
  });

  it('aggregates field errors and reports the first invalid field in tab order', () => {
    const errors = validateStaffLogin({ email: '', password: '' });
    expect(errors).toEqual({ email: 'REQUIRED', password: 'REQUIRED' });
    expect(hasFieldErrors(errors)).toBe(true);
    expect(firstInvalidField(errors)).toBe('email');
    expect(firstInvalidField({ password: 'REQUIRED' })).toBe('password');
    expect(hasFieldErrors({})).toBe(false);
  });
});

describe('toStaffLoginError', () => {
  it('maps 401 to a generic auth error with no enumeration detail', () => {
    const error = toStaffLoginError(
      makeApiClientError({ status: 401, code: 'STAFF_LOGIN_FAILED' }),
    );
    expect(error).toEqual({ kind: 'auth' });
  });

  it('maps 400 field errors to known fields', () => {
    const error = toStaffLoginError(
      makeApiClientError({
        status: 400,
        code: 'BAD_REQUEST',
        errors: [{ field: 'email', code: 'INVALID', message: 'x' }],
      }),
    );
    expect(error).toEqual({ kind: 'field', fieldErrors: { email: 'INVALID' }, formLevel: false });
  });

  it('falls back to a form-level flag for unknown field names', () => {
    const error = toStaffLoginError(
      makeApiClientError({
        status: 400,
        code: 'BAD_REQUEST',
        errors: [{ field: 'captcha', code: 'REQUIRED', message: 'x' }],
      }),
    ) as Extract<StaffLoginError, { kind: 'field' }>;
    expect(error.kind).toBe('field');
    expect(error.formLevel).toBe(true);
    expect(error.fieldErrors).toEqual({});
  });

  it('parses a valid Retry-After and rejects an invalid one', () => {
    const ok = toStaffLoginError(
      makeApiClientError({
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        headers: { 'retry-after': '120' },
      }),
    );
    expect(ok).toEqual({ kind: 'rateLimited', retryAfterSeconds: 120 });

    const bad = toStaffLoginError(
      makeApiClientError({
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        headers: { 'retry-after': 'soon' },
      }),
    );
    expect(bad).toEqual({ kind: 'rateLimited', retryAfterSeconds: null });
  });

  it('maps network failures and unexpected 5xx to a generic network error', () => {
    expect(toStaffLoginError(makeNetworkError())).toEqual({ kind: 'network' });
    expect(
      toStaffLoginError(makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' })),
    ).toEqual({ kind: 'network' });
  });
});

describe('clearFieldFromError', () => {
  it('removes one field error and collapses to null when nothing remains', () => {
    const error: StaffLoginError = {
      kind: 'field',
      fieldErrors: { email: 'INVALID' },
      formLevel: false,
    };
    expect(clearFieldFromError(error, 'email')).toBeNull();
  });

  it('keeps a form-level fallback and leaves non-field errors untouched', () => {
    const withForm: StaffLoginError = { kind: 'field', fieldErrors: {}, formLevel: true };
    expect(clearFieldFromError(withForm, 'email')).toBe(withForm);
    const auth: StaffLoginError = { kind: 'auth' };
    expect(clearFieldFromError(auth, 'email')).toBe(auth);
  });
});

describe('display resolution', () => {
  it('lets client errors win over server field errors for the same field', () => {
    const server: StaffLoginError = {
      kind: 'field',
      fieldErrors: { email: 'INVALID' },
      formLevel: false,
    };
    const messages = resolveFieldMessages({ email: 'REQUIRED' }, server);
    expect(messages.email).toBe(fieldErrorMessage('email', 'REQUIRED'));
  });

  it('builds the auth, network and rate-limit alerts with the right tone', () => {
    expect(resolveFormAlert({ kind: 'auth' }, null)).toEqual({
      tone: 'error',
      message: STAFF_LOGIN_COPY.alert.auth,
    });
    expect(resolveFormAlert({ kind: 'network' }, null)?.tone).toBe('error');

    const rate = resolveFormAlert({ kind: 'rateLimited', retryAfterSeconds: 120 }, 120);
    expect(rate?.tone).toBe('warning');
    expect(rate?.message).toContain('khoảng 2 phút');

    const rateFallback = resolveFormAlert({ kind: 'rateLimited', retryAfterSeconds: null }, null);
    expect(rateFallback?.message).toContain(STAFF_LOGIN_COPY.rateLimit.fallbackDuration);
  });

  it('formats durations and countdowns', () => {
    expect(formatRetryDuration(120)).toBe('khoảng 2 phút');
    expect(formatRetryDuration(30)).toBe('30 giây');
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(9)).toBe('0:09');
  });
});
