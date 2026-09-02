'use client';

/**
 * One drawn form field (`907:174`, `907:184`, `907:188`, `907:192`).
 *
 * A local composition rather than a design-system instance, and that is the
 * package's own recorded position: `FIG-DS-INPUT` (component set `76:29`) has
 * never been published, the `APP2` supplement `424:35` is `SUPERSEDED`, and
 * `APP12-D01`'s reconciliation note (`918:349`) states that every input in this
 * package is therefore a local composition bound to the same tokens the DS input
 * declares. `FU-DESIGN-PUBLISH-DS-INPUT-01` owns closing that.
 *
 * ## The accessibility contract, not decoration
 *
 * `909:258` states the rule this implements: *errors are bound to the field
 * through `aria-describedby`, never a toast*. So the label is a real `<label>`
 * with a real `htmlFor`, the hint and the error are both referenced by
 * `aria-describedby`, and an invalid field carries `aria-invalid`. The ids come
 * from React's `useId`, so two fields on one page cannot collide and no id is
 * ever written as a literal.
 *
 * `909:258` also says the submit button stays pressable so the errors get
 * published at all — that decision lives on the summary card, and this component
 * simply renders whatever error it is given.
 */
import { useId, type ChangeEvent } from 'react';

export interface CheckoutFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Bound through `aria-describedby`, alongside the error when both exist. */
  readonly hint?: string;
  /** The approved field-bound message, or absent when the field is fine. */
  readonly error?: string;
  readonly maxLength: number;
  readonly disabled?: boolean;
  /** The browser's own autofill vocabulary; never a business value. */
  readonly autoComplete?: string;
  readonly inputMode?: 'text' | 'tel';
}

export function CheckoutField(props: CheckoutFieldProps) {
  const { label, value, onChange, hint, error, maxLength, disabled, autoComplete, inputMode } =
    props;
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [
    hint === undefined ? undefined : hintId,
    error === undefined ? undefined : errorId,
  ]
    .filter((id): id is string => id !== undefined)
    .join(' ');

  return (
    <div className="ready-made-checkout__field">
      <label className="ready-made-checkout__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={`ready-made-checkout__control${
          error === undefined ? '' : ' ready-made-checkout__control--error'
        }`}
        type="text"
        value={value}
        maxLength={maxLength}
        disabled={disabled === true}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(inputMode === undefined ? {} : { inputMode })}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value);
        }}
      />
      {hint === undefined ? null : (
        <p className="ready-made-checkout__hint" id={hintId}>
          {hint}
        </p>
      )}
      {/*
        The error is a live region as well as a described-by target: a customer
        who submits with the keyboard and never moves focus into the field would
        otherwise get no announcement at all.
      */}
      {error === undefined ? null : (
        <p className="ready-made-checkout__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
