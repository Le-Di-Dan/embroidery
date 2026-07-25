'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useRetryCountdown } from '../hooks/use-retry-countdown';
import { useStaffLoginMutation } from '../hooks/use-staff-login-mutation';
import { STAFF_LOGIN_COPY } from '../model/staff-login-copy';
import {
  formatCountdown,
  resolveFieldMessages,
  resolveFormAlert,
} from '../model/staff-login-display';
import {
  clearFieldFromError,
  toStaffLoginError,
  type StaffLoginError,
} from '../model/staff-login-errors';
import {
  firstInvalidField,
  hasFieldErrors,
  validateStaffLogin,
  MAX_EMAIL_BYTES,
  type FieldErrors,
  type StaffLoginField,
  type StaffLoginValues,
} from '../model/staff-login-form';
import { PasswordVisibilityToggle } from './password-visibility-toggle';
import { StaffLoginAlert } from './staff-login-alert';
import { StaffLoginField as LoginField } from './staff-login-field';

const FIELD_IDS = {
  email: 'staff-login-email',
  emailError: 'staff-login-email-error',
  password: 'staff-login-password',
  passwordError: 'staff-login-password-error',
} as const;

const EMPTY_VALUES: StaffLoginValues = { email: '', password: '' };

/**
 * Interactive staff login form. Owns local input state, client validation,
 * password visibility, the login mutation and the rate-limit countdown. The
 * card chrome and layout are provided by the surrounding screen; this component
 * renders title → optional alert → fields → submit → helper.
 */
export function StaffLoginForm() {
  const [values, setValues] = useState<StaffLoginValues>(EMPTY_VALUES);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState<StaffLoginError | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const mutation = useStaffLoginMutation();
  const isPending = mutation.isPending;

  const rateSeconds = loginError?.kind === 'rateLimited' ? loginError.retryAfterSeconds : null;
  const remaining = useRetryCountdown(rateSeconds);
  const isRateBlocked = rateSeconds !== null && remaining > 0;
  const isSubmitDisabled = isPending || isRateBlocked;

  const fieldMessages = resolveFieldMessages(clientErrors, loginError);
  const formAlert = resolveFormAlert(loginError, rateSeconds);

  // Move focus to the alert when one appears, so a disabled submit button never
  // strands focus and the message is reached by keyboard/AT users.
  useEffect(() => {
    if (formAlert !== undefined) alertRef.current?.focus();
  }, [formAlert?.message]);

  function focusField(field: StaffLoginField): void {
    const ref = field === 'email' ? emailRef : passwordRef;
    ref.current?.focus();
  }

  function handleChange(field: StaffLoginField, value: string): void {
    setValues((prev) => ({ ...prev, [field]: value }));
    setClientErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setLoginError((prev) => clearFieldFromError(prev, field));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSubmitDisabled) return;

    const errors = validateStaffLogin(values);
    setClientErrors(errors);
    setLoginError(null);

    if (hasFieldErrors(errors)) {
      const first = firstInvalidField(errors);
      if (first) focusField(first);
      return;
    }

    mutation.mutate(
      { email: values.email.trim(), password: values.password },
      { onError: (error) => setLoginError(toStaffLoginError(error)) },
    );
  }

  const submitLabel = isPending
    ? STAFF_LOGIN_COPY.submit.pending
    : isRateBlocked
      ? STAFF_LOGIN_COPY.submit.rateLimited
      : STAFF_LOGIN_COPY.submit.default;

  const formClass = isPending ? 'staff-login-form staff-login-form--pending' : 'staff-login-form';

  return (
    <form className={formClass} onSubmit={handleSubmit} noValidate>
      <div className="staff-login-form__title">
        <h1 className="staff-login-form__heading">{STAFF_LOGIN_COPY.form.title}</h1>
        <p className="staff-login-form__subtitle">{STAFF_LOGIN_COPY.form.subtitle}</p>
      </div>

      {formAlert !== undefined ? (
        <StaffLoginAlert tone={formAlert.tone} message={formAlert.message} rootRef={alertRef} />
      ) : null}

      <LoginField
        id={FIELD_IDS.email}
        name="email"
        label={STAFF_LOGIN_COPY.fields.email.label}
        type="email"
        value={values.email}
        onChange={(value) => handleChange('email', value)}
        autoComplete="email"
        inputMode="email"
        maxLength={MAX_EMAIL_BYTES}
        placeholder={STAFF_LOGIN_COPY.fields.email.placeholder}
        errorId={FIELD_IDS.emailError}
        errorMessage={fieldMessages.email}
        disabled={isPending}
        inputRef={emailRef}
      />

      <LoginField
        id={FIELD_IDS.password}
        name="password"
        label={STAFF_LOGIN_COPY.fields.password.label}
        type={showPassword ? 'text' : 'password'}
        value={values.password}
        onChange={(value) => handleChange('password', value)}
        autoComplete="current-password"
        errorId={FIELD_IDS.passwordError}
        errorMessage={fieldMessages.password}
        disabled={isPending}
        inputRef={passwordRef}
        trailing={
          <PasswordVisibilityToggle
            shown={showPassword}
            onToggle={() => setShowPassword((shown) => !shown)}
            disabled={isPending}
          />
        }
      />

      <button
        type="submit"
        className="staff-login-form__submit"
        disabled={isSubmitDisabled}
        aria-busy={isPending}
      >
        {submitLabel}
      </button>

      {isPending ? (
        <p className="staff-login-form__status">{STAFF_LOGIN_COPY.helper.pending}</p>
      ) : null}

      {isRateBlocked ? (
        <p className="staff-login-form__status">
          {STAFF_LOGIN_COPY.helper.rateLimit}{' '}
          <span className="staff-login-form__countdown" aria-hidden="true">
            {formatCountdown(remaining)}
          </span>
        </p>
      ) : null}

      <p className="staff-login-form__footer">{STAFF_LOGIN_COPY.form.footerHelper}</p>
    </form>
  );
}
