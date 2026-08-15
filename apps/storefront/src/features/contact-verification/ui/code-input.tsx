'use client';

import { useId, type ChangeEvent, type RefObject } from 'react';

import { VERIFICATION_COPY } from '../model/verification-copy';

/**
 * The six-digit code field (`623:85` … `623:100`).
 *
 * The design draws six boxes; this renders **one real input** behind them, which
 * is what `APP4-S01` §14 asks for in the absence of an accepted OTP component.
 * The boxes are presentational and the input is the only focusable, labelled,
 * value-carrying element, so paste, autofill (`autocomplete="one-time-code"`,
 * required by `634:142`), arrow keys, backspace, undo and the mobile numeric
 * keypad all work because they are the browser's, not a reimplementation.
 *
 * Six separate inputs would have meant hand-writing all of that, and would have
 * given a screen reader six unlabelled fields where the annotation asks for one
 * labelled group.
 *
 * **The value is a string throughout.** A six-digit code is not a number:
 * `012345` parsed as one is `12345`, and the leading zero the customer received
 * would never be sent.
 */
export const VERIFICATION_CODE_LENGTH = 6;

interface CodeInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly invalid: boolean;
  /** Ids of the help and error text, associated per `634:141`. */
  readonly describedBy: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

export function CodeInput({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  inputRef,
}: CodeInputProps) {
  const inputId = useId();
  const boxes = Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => index);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    // Digits only, bounded. Filtering here rather than refusing the keystroke
    // keeps paste working: a pasted "123 456" becomes "123456" instead of being
    // rejected wholesale.
    const digits = event.target.value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
    onChange(digits);
  }

  return (
    <div className="contact-verification__field">
      <label className="contact-verification__label" htmlFor={inputId}>
        {VERIFICATION_COPY.codeEntry.fieldLabel}
      </label>
      <div className="contact-verification__code">
        <input
          id={inputId}
          ref={inputRef}
          className="contact-verification__code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // The browser must not offer a previously typed code, and a spell
          // checker has no business seeing this value.
          autoCorrect="off"
          spellCheck={false}
          maxLength={VERIFICATION_CODE_LENGTH}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        <div className="contact-verification__code-boxes" aria-hidden="true">
          {boxes.map((index) => (
            <span
              key={index}
              className={[
                'contact-verification__code-box',
                index === Math.min(value.length, VERIFICATION_CODE_LENGTH - 1)
                  ? 'contact-verification__code-box--active'
                  : '',
                invalid ? 'contact-verification__code-box--invalid' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {value[index] ?? ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
