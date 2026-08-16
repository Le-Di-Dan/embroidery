'use client';

/**
 * The entry fork (`651:3`): catalog product, or the customer's own.
 *
 * A radio **group**, not two buttons. The two options are mutually exclusive and
 * a native radio group is the control that says so — one tab stop, arrow keys
 * between the options, and a state a screen reader announces as "1 of 2" without
 * any ARIA of our own. Two buttons would need `role="radiogroup"`, `aria-checked`
 * and a roving tabindex to reach the same place.
 *
 * Nothing is selected initially. The approved frame draws the fork as an open
 * question, and pre-selecting a branch would answer it for the customer.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import type { RequestSubject } from '../model/custom-request-flow';

export interface SubjectChooserProps {
  readonly subject: RequestSubject | undefined;
  readonly onChoose: (subject: RequestSubject) => void;
}

const OPTIONS: readonly {
  readonly value: RequestSubject;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    value: 'CATALOG',
    label: CUSTOM_REQUEST_COPY.chooser.catalog,
    hint: CUSTOM_REQUEST_COPY.chooser.catalogHint,
  },
  {
    value: 'CUSTOMER_OWNED',
    label: CUSTOM_REQUEST_COPY.chooser.customerOwned,
    hint: CUSTOM_REQUEST_COPY.chooser.customerOwnedHint,
  },
];

export function SubjectChooser({ subject, onChoose }: SubjectChooserProps) {
  return (
    <fieldset className="custom-request__fieldset">
      <legend className="custom-request__legend">{CUSTOM_REQUEST_COPY.chooser.legend}</legend>

      <div className="custom-request__options">
        {OPTIONS.map((option) => {
          const hintId = `subject-hint-${option.value}`;
          return (
            <label key={option.value} className="custom-request__option">
              <input
                type="radio"
                name="request-subject"
                value={option.value}
                checked={subject === option.value}
                aria-describedby={hintId}
                onChange={() => {
                  onChoose(option.value);
                }}
              />
              <span className="custom-request__option-label">{option.label}</span>
              <span id={hintId} className="custom-request__option-hint">
                {option.hint}
              </span>
            </label>
          );
        })}
      </div>

      {/*
        The warning is only true once a branch holds data, so it appears with the
        choice rather than standing on the empty frame as a threat.
      */}
      {subject === undefined ? null : (
        <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.chooser.switchWarning}</p>
      )}
    </fieldset>
  );
}
