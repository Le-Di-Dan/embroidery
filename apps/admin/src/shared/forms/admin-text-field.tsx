'use client';

import { useId } from 'react';

/**
 * The canonical Admin text field, aligned to `FIG-DS-INPUT` (`76:29`).
 *
 * The Figma component set publishes five states — Default, Focus, Filled, Error
 * and Disabled — and all five are expressed here without a state prop. Focus and
 * Filled are conditions of the control, not modes a caller selects: focus is the
 * browser's, and "filled" is simply a non-empty value. Only Error and Disabled
 * are decisions the caller makes, so only those two are parameters. A `state`
 * prop would let a caller render a Focus-styled field that does not have focus.
 *
 * Every control has a real `<label for>` — never a placeholder standing in for
 * one — and its help or error text is wired through `aria-describedby`, so the
 * reason a field is invalid is announced *with* the field rather than only in a
 * summary. An invalid field carries `aria-invalid` and shows the error in place
 * of its help text; both at once would bury the error.
 *
 * Numeric placement values use `inputMode="decimal"` on a `text` input rather
 * than `type="number"`. `APP3-A01` §17 forbids persisting something other than
 * what the operator entered, and a number input invites the browser to reformat,
 * round, exponent-notate or silently blank a value on scroll.
 *
 * Lives in Admin shared scope, not in a workspace package: it is the narrowest
 * scope that serves every Admin feature, and `@embroidery/ui` is for components
 * genuinely shared with the storefront (CLAUDE.md §5).
 */
export interface AdminTextFieldProps {
  readonly label: string;
  /**
   * A short qualifier rendered beside the label, not inside the control.
   *
   * Added by `APP12-A01` for the locked category slug (`916:379`), where the
   * frame states *why* a disabled control is disabled next to its name. A
   * disabled input with no stated reason is a dead end, and putting the reason
   * only in the help text below leaves the label itself looking arbitrary.
   * Optional and additive: every existing caller renders exactly as before.
   */
  readonly labelSuffix?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly inputMode?: 'text' | 'decimal' | 'numeric';
  readonly placeholder?: string;
  /** Marks the control for tests and for the visual-review harness. */
  readonly testId?: string;
}

export function AdminTextField({
  label,
  labelSuffix,
  value,
  onChange,
  help,
  error,
  disabled = false,
  inputMode = 'text',
  placeholder,
  testId,
}: AdminTextFieldProps) {
  const id = useId();
  const describedBy = `${id}-help`;
  const invalid = error !== undefined;
  const message = error ?? help;

  return (
    <div className={invalid ? 'admin-field admin-field--error' : 'admin-field'}>
      <label className="admin-field__label" htmlFor={id}>
        {label}
        {labelSuffix === undefined ? null : (
          <span className="admin-field__label-suffix">{labelSuffix}</span>
        )}
      </label>
      <input
        id={id}
        className="admin-field__control"
        type="text"
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        {...(message === undefined ? {} : { 'aria-describedby': describedBy })}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        onChange={(event) => onChange(event.target.value)}
      />
      {message === undefined ? null : (
        <p className={invalid ? 'admin-field__error' : 'admin-field__help'} id={describedBy}>
          {message}
        </p>
      )}
    </div>
  );
}
