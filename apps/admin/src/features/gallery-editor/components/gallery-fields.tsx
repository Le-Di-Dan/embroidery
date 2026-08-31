'use client';

import { useId, type ReactNode } from 'react';

/**
 * The three field shapes the gallery forms need beyond the shared Admin text
 * field: a multi-line description, a boolean, and a read-only value.
 *
 * They reuse the shared `admin-field` classes rather than defining a second
 * field appearance, so the gallery forms look and behave like every other Admin
 * form. `AdminTextField` itself is used unchanged wherever a single-line input
 * is what the design draws; these are the cases it does not cover, and each is
 * here rather than pushed into the shared primitive because a `multiline` or
 * `readOnly` prop on that component would change a control every Admin screen
 * already depends on.
 *
 * Every control has a real `<label for>` — never a placeholder standing in for
 * one — and its help or error text is wired through `aria-describedby`, so the
 * reason a field is invalid is announced *with* the field rather than only in a
 * summary. An invalid field carries `aria-invalid` and shows the error in place
 * of its help text; both at once would bury the error.
 */
interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly message: string | undefined;
  readonly invalid: boolean;
  readonly children: ReactNode;
}

function FieldShell({ id, label, message, invalid, children }: FieldShellProps) {
  return (
    <div className={invalid ? 'admin-field admin-field--error' : 'admin-field'}>
      <label className="admin-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {message === undefined ? null : (
        <p className={invalid ? 'admin-field__error' : 'admin-field__help'} id={`${id}-help`}>
          {message}
        </p>
      )}
    </div>
  );
}

export interface GalleryTextAreaProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly rows?: number;
  readonly testId?: string;
}

export function GalleryTextArea({
  label,
  value,
  onChange,
  help,
  error,
  disabled = false,
  rows = 4,
  testId,
}: GalleryTextAreaProps) {
  const id = useId();
  const invalid = error !== undefined;
  const message = error ?? help;
  return (
    <FieldShell id={id} label={label} message={message} invalid={invalid}>
      <textarea
        id={id}
        className="admin-field__control gallery-editor__textarea"
        rows={rows}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        {...(message === undefined ? {} : { 'aria-describedby': `${id}-help` })}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface GalleryCheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly help?: string;
  readonly disabled?: boolean;
  readonly testId?: string;
}

/**
 * A native checkbox with a visible label beside it.
 *
 * Not a styled switch: a switch that is only distinguishable by colour and
 * position is exactly the control an operator misreads, and the one boolean on
 * this screen decides whether a published page is crawlable.
 */
export function GalleryCheckbox({
  label,
  checked,
  onChange,
  help,
  disabled = false,
  testId,
}: GalleryCheckboxProps) {
  const id = useId();
  return (
    <div className="admin-field gallery-editor__checkbox-field">
      <div className="gallery-editor__checkbox-row">
        <input
          id={id}
          type="checkbox"
          className="gallery-editor__checkbox"
          checked={checked}
          disabled={disabled}
          {...(help === undefined ? {} : { 'aria-describedby': `${id}-help` })}
          {...(testId === undefined ? {} : { 'data-testid': testId })}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label className="admin-field__label" htmlFor={id}>
          {label}
        </label>
      </div>
      {help === undefined ? null : (
        <p className="admin-field__help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

export interface GalleryReadOnlyFieldProps {
  readonly label: string;
  readonly value: string;
  readonly help: string;
  readonly testId?: string;
}

/**
 * A value the operator may read and copy but not change.
 *
 * A real `<input readonly>` rather than a paragraph styled to look like one:
 * `readonly` is the semantic assistive technology announces, the value stays
 * selectable, and — unlike `disabled` — it remains reachable by keyboard, so a
 * screen-reader user can still hear the address the entry was created with.
 */
export function GalleryReadOnlyField({ label, value, help, testId }: GalleryReadOnlyFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} message={help} invalid={false}>
      <input
        id={id}
        type="text"
        className="admin-field__control gallery-editor__readonly"
        value={value}
        readOnly
        aria-readonly="true"
        aria-describedby={`${id}-help`}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
      />
    </FieldShell>
  );
}
