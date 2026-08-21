'use client';

import { useId } from 'react';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import { presentLineKind } from '../model/quotation-presentation';
import type {
  AuthoringLine,
  AuthoringLineKind,
  FieldIssue,
} from '../model/quotation-authoring-form';

interface LineEditorProps {
  readonly index: number;
  readonly line: AuthoringLine;
  readonly kinds: readonly AuthoringLineKind[];
  readonly issues: readonly FieldIssue[];
  readonly removable: boolean;
  readonly disabled: boolean;
  readonly onChange: (index: number, line: AuthoringLine) => void;
  readonly onRemove: (index: number) => void;
}

/**
 * One priced line in the authoring form (`682:3`, `684:3`).
 *
 * The unit price is a **text** input, not `type="number"`. A numeric input hands
 * back a value the browser has already interpreted, and on some locales it will
 * happily reinterpret a separator — which is precisely how an exact VND string
 * stops being exact before it has left the page. The value here is the operator's
 * characters, unchanged, all the way to the request body.
 *
 * The offered kinds come from the contract's enum, narrowed per branch by
 * `lineKindsFor`. There is no free-text kind and no kind this screen invents.
 */
export function QuotationLineEditor({
  index,
  line,
  kinds,
  issues,
  removable,
  disabled,
  onChange,
  onRemove,
}: LineEditorProps) {
  const prefix = useId();
  const issueFor = (field: string): FieldIssue | undefined =>
    issues.find((issue) => issue.field === `lineItems.${String(index)}.${field}`);

  const descriptionIssue = issueFor('description');
  const quantityIssue = issueFor('quantity');
  const priceIssue = issueFor('unitPriceAmount');

  const update = (patch: Partial<AuthoringLine>) => {
    onChange(index, { ...line, ...patch });
  };

  return (
    <fieldset className="request-quotation__line" data-testid={`quotation-line-${String(index)}`}>
      <legend className="request-quotation__line-legend">{`${COPY.lines.position}${String(index + 1)}`}</legend>

      <div className="request-quotation__field">
        <label htmlFor={`${prefix}-kind`}>{COPY.form.lineKind}</label>
        <select
          id={`${prefix}-kind`}
          value={line.lineKind}
          disabled={disabled}
          onChange={(event) => {
            update({ lineKind: event.target.value as AuthoringLineKind });
          }}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {presentLineKind(kind)}
            </option>
          ))}
        </select>
      </div>

      <div className="request-quotation__field request-quotation__field--wide">
        <label htmlFor={`${prefix}-description`}>{COPY.form.lineDescription}</label>
        <input
          id={`${prefix}-description`}
          type="text"
          value={line.description}
          disabled={disabled}
          aria-invalid={descriptionIssue === undefined ? undefined : true}
          aria-describedby={
            descriptionIssue === undefined ? undefined : `${prefix}-description-error`
          }
          onChange={(event) => {
            update({ description: event.target.value });
          }}
        />
        {descriptionIssue === undefined ? null : (
          <p className="request-quotation__field-error" id={`${prefix}-description-error`}>
            {descriptionIssue.message}
          </p>
        )}
      </div>

      <div className="request-quotation__field">
        <label htmlFor={`${prefix}-quantity`}>{COPY.form.lineQuantity}</label>
        <input
          id={`${prefix}-quantity`}
          type="text"
          inputMode="numeric"
          value={line.quantity}
          disabled={disabled}
          aria-invalid={quantityIssue === undefined ? undefined : true}
          aria-describedby={quantityIssue === undefined ? undefined : `${prefix}-quantity-error`}
          onChange={(event) => {
            update({ quantity: event.target.value });
          }}
        />
        {quantityIssue === undefined ? null : (
          <p className="request-quotation__field-error" id={`${prefix}-quantity-error`}>
            {quantityIssue.message}
          </p>
        )}
      </div>

      <div className="request-quotation__field">
        <label htmlFor={`${prefix}-price`}>{COPY.form.lineUnitPrice}</label>
        <input
          id={`${prefix}-price`}
          type="text"
          inputMode="decimal"
          value={line.unitPriceAmount}
          disabled={disabled}
          aria-invalid={priceIssue === undefined ? undefined : true}
          aria-describedby={priceIssue === undefined ? undefined : `${prefix}-price-error`}
          onChange={(event) => {
            update({ unitPriceAmount: event.target.value });
          }}
        />
        {priceIssue === undefined ? null : (
          <p className="request-quotation__field-error" id={`${prefix}-price-error`}>
            {priceIssue.message}
          </p>
        )}
      </div>

      {removable ? (
        <button
          className="request-quotation__button request-quotation__button--quiet"
          type="button"
          disabled={disabled}
          onClick={() => {
            onRemove(index);
          }}
        >
          {COPY.form.removeLine}
        </button>
      ) : null}
    </fieldset>
  );
}
