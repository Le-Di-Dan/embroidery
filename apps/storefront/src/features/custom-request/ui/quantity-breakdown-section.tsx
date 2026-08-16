'use client';

/**
 * The size-keyed quantity table (`650:3`, invalid state `650:94`).
 *
 * ## One variant's breakdown, never a variant picker
 *
 * On the catalog branch this table sits **beneath** the selected variant and
 * describes it. There is no variant control in a row and there cannot be: a row
 * is a `sizeLabel` and a `quantity`, and neither the props nor
 * `CustomRequestQuantityLine` has anywhere to put a second variant
 * (`APP5-S01` §3.2).
 *
 * The row's `sizeLabel` is the customer's own label for this line. It is not
 * copied from, defaulted to or validated against the selected variant's
 * `sizeLabel`, because no authority makes the two the same business field
 * (§3.3).
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import {
  isBlankLine,
  quantityLineIssue,
  quantityTotal,
  SIZE_LABEL_MAX,
  type QuantityDraftLine,
} from '../model/quantity-breakdown';

export interface QuantityBreakdownSectionProps {
  readonly lines: readonly QuantityDraftLine[];
  /** Catalog requires at least one line; the COP branch does not. */
  readonly required: boolean;
  /** Catalog only: the table is inert until a variant has been chosen. */
  readonly disabled: boolean;
  readonly hint: string;
  readonly showValidation: boolean;
  readonly onChange: (key: string, field: 'sizeLabel' | 'quantity', value: string) => void;
  readonly onAdd: () => void;
  readonly onRemove: (key: string) => void;
}

export function QuantityBreakdownSection(props: QuantityBreakdownSectionProps) {
  const { lines, required, disabled, hint, showValidation, onChange, onAdd, onRemove } = props;
  const filled = lines.filter((line) => !isBlankLine(line));
  const missing = showValidation && required && filled.length === 0;

  return (
    <section className="custom-request__section" aria-label={CUSTOM_REQUEST_COPY.quantity.heading}>
      <h2 className="custom-request__section-heading">{CUSTOM_REQUEST_COPY.quantity.heading}</h2>
      <p className="custom-request__hint">{hint}</p>

      <ul className="custom-request__lines">
        {lines.map((line) => {
          const issue = showValidation && !isBlankLine(line) ? quantityLineIssue(line) : undefined;
          const errorId = `${line.key}-error`;
          return (
            <li key={line.key} className="custom-request__line">
              <div className="custom-request__field">
                <label htmlFor={`${line.key}-size`}>{CUSTOM_REQUEST_COPY.quantity.sizeLabel}</label>
                <input
                  id={`${line.key}-size`}
                  type="text"
                  inputMode="text"
                  maxLength={SIZE_LABEL_MAX}
                  value={line.sizeLabel}
                  disabled={disabled}
                  placeholder={CUSTOM_REQUEST_COPY.quantity.sizePlaceholder}
                  onChange={(event) => {
                    onChange(line.key, 'sizeLabel', event.target.value);
                  }}
                />
              </div>

              <div className="custom-request__field">
                <label htmlFor={`${line.key}-qty`}>
                  {CUSTOM_REQUEST_COPY.quantity.quantityLabel}
                </label>
                <input
                  id={`${line.key}-qty`}
                  type="text"
                  inputMode="numeric"
                  value={line.quantity}
                  disabled={disabled}
                  aria-invalid={issue !== undefined}
                  {...(issue === undefined ? {} : { 'aria-describedby': errorId })}
                  onChange={(event) => {
                    onChange(line.key, 'quantity', event.target.value);
                  }}
                />
              </div>

              <button
                type="button"
                className="custom-request__button custom-request__button--quiet"
                disabled={disabled}
                onClick={() => {
                  onRemove(line.key);
                }}
              >
                {CUSTOM_REQUEST_COPY.quantity.removeLine}
              </button>

              {issue === undefined ? null : (
                <p id={errorId} className="custom-request__error">
                  {issue === 'SIZE_TOO_LONG'
                    ? CUSTOM_REQUEST_COPY.quantity.sizeTooLong
                    : CUSTOM_REQUEST_COPY.quantity.invalid}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className="custom-request__button" disabled={disabled} onClick={onAdd}>
        {CUSTOM_REQUEST_COPY.quantity.addLine}
      </button>

      <p className="custom-request__total">
        {CUSTOM_REQUEST_COPY.quantity.total}: {quantityTotal(lines)}
      </p>

      {missing ? (
        <p className="custom-request__error">{CUSTOM_REQUEST_COPY.quantity.required}</p>
      ) : null}
    </section>
  );
}
