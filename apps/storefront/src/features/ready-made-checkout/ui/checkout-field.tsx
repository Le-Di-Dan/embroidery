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
  /**
   * Whether the contract requires a value (`APP12-H08`).
   *
   * All four delivered fields are required and `validateDelivery` refuses an
   * empty one, but nothing in the markup said so: a screen-reader customer met
   * four fields that announced as ordinary text inputs and learned they were
   * mandatory only by submitting. `aria-required` states the field's own value
   * constraint, which is SC 4.1.2's "state … programmatically determined".
   *
   * It is **`aria-required` rather than the `required` attribute** on purpose.
   * `required` would hand validation to the browser: the native bubble would
   * fire on submit, in the UA's language and styling, and the approved
   * field-bound message (`909:258` — *bound to the field, never a toast*) would
   * never be reached. The ARIA attribute announces the same state and changes
   * no behaviour.
   *
   * The *visible* required indication is deliberately not added here. Every
   * field on the drawn card is required, so a marker on all four is a visual
   * and copy decision about the approved frame rather than an accessibility
   * defect — recorded as `FU-APP12-H08-01` for `V01`/`V02`.
   */
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** The browser's own autofill vocabulary; never a business value. */
  readonly autoComplete?: string;
  readonly inputMode?: 'text' | 'tel';
}

export function CheckoutField(props: CheckoutFieldProps) {
  const {
    label,
    value,
    onChange,
    hint,
    error,
    maxLength,
    required,
    disabled,
    autoComplete,
    inputMode,
  } = props;
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
        aria-required={required === true ? true : undefined}
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
