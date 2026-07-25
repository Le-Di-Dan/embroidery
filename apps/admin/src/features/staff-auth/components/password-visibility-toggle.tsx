'use client';

import { STAFF_LOGIN_COPY } from '../model/staff-login-copy';

interface PasswordVisibilityToggleProps {
  shown: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * In-field control that toggles the password between hidden and visible. It is
 * a real `<button type="button">` so it never submits the form, keeps focus,
 * and exposes its state to assistive tech via `aria-pressed` and a changing
 * accessible name. The 44px touch target is enforced in SCSS.
 */
export function PasswordVisibilityToggle({
  shown,
  onToggle,
  disabled = false,
}: PasswordVisibilityToggleProps) {
  const { show, hide, showLabel, hideLabel } = STAFF_LOGIN_COPY.passwordToggle;

  return (
    <button
      type="button"
      className="staff-login-field__toggle"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={shown}
      aria-label={shown ? hideLabel : showLabel}
    >
      {shown ? hide : show}
    </button>
  );
}
