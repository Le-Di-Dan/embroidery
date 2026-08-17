'use client';

import { useId } from 'react';

interface ModerationTextAreaProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly testId?: string;
}

/**
 * A multi-line moderation reason.
 *
 * A `<textarea>` rather than the shared `AdminTextField`, which is an `<input>`:
 * these fields carry up to 2000 characters of explanation, and a single-line
 * control that scrolls sideways hides the second half of what the operator is
 * about to send a customer.
 *
 * Feature-local, at the narrowest valid scope (CLAUDE.md §5) — only the
 * moderation dialogs need it. It mirrors the shared field's accessibility
 * contract exactly: a real `<label for>`, `aria-invalid` when refused, and the
 * message wired through `aria-describedby` so the reason a field is invalid is
 * announced *with* the field rather than only in the summary above it. The error
 * replaces the help text; both at once buries the error.
 */
export function ModerationTextArea({
  label,
  value,
  onChange,
  help,
  error,
  disabled = false,
  testId,
}: ModerationTextAreaProps) {
  const id = useId();
  const describedBy = `${id}-help`;
  const invalid = error !== undefined;
  const message = error ?? help;

  return (
    <div className={invalid ? 'moderation-field moderation-field--error' : 'moderation-field'}>
      <label className="moderation-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="moderation-field__control"
        value={value}
        rows={4}
        disabled={disabled}
        aria-invalid={invalid}
        {...(message === undefined ? {} : { 'aria-describedby': describedBy })}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        onChange={(event) => onChange(event.target.value)}
      />
      {message === undefined ? null : (
        <p
          className={invalid ? 'moderation-field__error' : 'moderation-field__help'}
          id={describedBy}
        >
          {message}
        </p>
      )}
    </div>
  );
}
