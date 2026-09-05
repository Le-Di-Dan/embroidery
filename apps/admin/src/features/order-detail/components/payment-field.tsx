'use client';

import { useId } from 'react';

interface PaymentFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required: boolean;
  readonly requiredLabel: string;
  readonly optionalLabel: string;
  readonly help: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  /** True for the free-text fields that carry a bank memo or an operator note. */
  readonly multiline?: boolean;
  /** `decimal` for the observed amount; never `type="number"` (see below). */
  readonly inputMode?: 'text' | 'decimal';
  readonly testId: string;
}

/**
 * One field in a payment decision form (`737:27`, `737:34`, `737:41`,
 * `740:119`).
 *
 * ## The constraints it deliberately does **not** declare
 *
 * No `pattern`, no `maxLength`, no `minLength`, no `type="number"`, no
 * `text-transform`. `APP7-B04` publishes an unrestricted string for
 * `observedTransferReference`, and `737:40` requires that the value reach the
 * server exactly as typed — so nothing in the control may uppercase it, trim it,
 * strip punctuation, collapse whitespace, normalize Unicode or cut it at a
 * length. An operator transcribing a bank memo must be able to type what the
 * bank actually wrote, punctuation and casing included.
 *
 * The amount field is `inputMode="decimal"` on a `text` input for the reason
 * `AdminTextField` records: a `number` input invites the browser to reformat,
 * round, exponent-notate or silently blank a value on scroll, and this is a
 * figure copied off a bank statement that must be submitted verbatim. Its shape
 * is checked in the model against the contract's own expression, and the server
 * re-validates regardless.
 *
 * ## Accessibility
 *
 * A real `<label for>` — never a placeholder standing in for one — with the
 * required marker inside the label so it is announced with the field name. The
 * help or error text is wired through `aria-describedby`, so the reason a field
 * is invalid is announced *with* the field rather than only in the summary
 * above it (`753:158`). An invalid field carries `aria-invalid` and shows the
 * error in place of its help text; both at once buries the error.
 *
 * Feature-local rather than the shared `AdminTextField`, which is
 * single-line-only and has no required-marker slot: these fields carry a
 * two-thousand-character note and a bank memo of unbounded length, and a
 * single-line control that scrolls sideways hides the second half of what the
 * operator is about to submit against a payment.
 */
export function PaymentField({
  label,
  value,
  onChange,
  required,
  requiredLabel,
  optionalLabel,
  help,
  error,
  disabled = false,
  placeholder,
  multiline = false,
  inputMode = 'text',
  testId,
}: PaymentFieldProps) {
  const id = useId();
  const describedBy = `${id}-help`;
  const invalid = error !== undefined;
  const message = error ?? help;
  const placeholderProp = placeholder === undefined ? {} : { placeholder };

  return (
    <div className={invalid ? 'payment-field payment-field--error' : 'payment-field'}>
      <label className="payment-field__label" htmlFor={id}>
        {label}
        <span className={required ? 'payment-field__required' : 'payment-field__optional'}>
          {required ? requiredLabel : optionalLabel}
        </span>
      </label>
      {multiline ? (
        <textarea
          id={id}
          className="payment-field__control"
          value={value}
          rows={3}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          {...placeholderProp}
        />
      ) : (
        <input
          id={id}
          className="payment-field__control"
          type="text"
          inputMode={inputMode}
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          {...placeholderProp}
        />
      )}
      {/*
        One message element, and a live region while it is the error
        (`APP12-H08`).

        The element is deliberately shared — `753:158` wants the error *in place
        of* the help text, because showing both buries the error — but a shared
        element is also one that never unmounts, and a screen reader announces a
        `role="alert"` region when it *appears*, not when the text inside a
        region it has already seen changes. The operator presses `Xác nhận`, the
        help line quietly becomes a refusal, and focus is still on the button:
        nothing is spoken.

        The `key` is what closes that. Flipping it between `help` and `error`
        makes React unmount the paragraph and mount a new one, so the alert
        region genuinely appears and is announced. It costs one DOM node on a
        state change that happens at most once per submit, and it is the
        difference between an error an operator hears and one they only see.
      */}
      <p
        key={invalid ? 'error' : 'help'}
        className={invalid ? 'payment-field__error' : 'payment-field__help'}
        id={describedBy}
        {...(invalid ? { role: 'alert' as const } : {})}
      >
        {message}
      </p>
    </div>
  );
}
