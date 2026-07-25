'use client';

import { type ReactNode, type Ref } from 'react';

interface StaffLoginFieldProps {
  id: string;
  name: string;
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  errorId: string;
  errorMessage?: string | undefined;
  placeholder?: string;
  inputMode?: 'email' | 'text';
  maxLength?: number;
  disabled?: boolean;
  trailing?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * One labelled login field: persistent label, a bordered control that may hold
 * a trailing adornment (the password toggle), and an error message wired to the
 * input with `aria-describedby` + `aria-invalid`. The error state is conveyed by
 * border, icon and text — never colour alone.
 */
export function StaffLoginField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  autoComplete,
  errorId,
  errorMessage,
  placeholder,
  inputMode,
  maxLength,
  disabled = false,
  trailing,
  inputRef,
}: StaffLoginFieldProps) {
  const invalid = errorMessage !== undefined;
  const controlClass = invalid
    ? 'staff-login-field__control staff-login-field__control--error'
    : 'staff-login-field__control';

  return (
    <div className="staff-login-field">
      <label htmlFor={id} className="staff-login-field__label">
        {label}
      </label>
      <div className={controlClass}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={type}
          className="staff-login-field__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        {trailing}
      </div>
      {invalid ? (
        <p id={errorId} className="staff-login-field__error">
          <span className="staff-login-field__error-icon" aria-hidden="true">
            ⚠
          </span>{' '}
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
