'use client';

import { useId, useState } from 'react';
import { ResolveCustomerByContactBodyContactKind } from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';

interface CustomerLookupPanelProps {
  readonly busy: boolean;
  readonly onSubmit: (kind: ResolveCustomerByContactBodyContactKind, contact: string) => void;
}

/**
 * The exact-contact lookup control (approved A01 amendment,
 * `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`).
 *
 * ### The contact never leaves this component except as a request body
 *
 * It lives in `useState` and nowhere else. It is not lifted into a parent, not
 * put in the URL, not written to storage and not kept after it resolves — the
 * screen clears it the moment a Customer id comes back. The form deliberately
 * has no `action`, and the submit handler calls `preventDefault`, so the browser
 * can never serialise the field into a query string of its own accord.
 *
 * `autoComplete="off"` for the same reason: a browser that remembered this field
 * would be storing other people's addresses in the operator's profile, which is
 * exactly the contact database this screen exists not to be.
 *
 * ### It is a lookup, and the control says so
 *
 * One field, one kind, one action, and a hint that the match is exact. There is
 * no autocomplete list, no suggestion dropdown and no result table, because
 * there is no operation behind them: the server answers with one Customer or
 * none. A control that *looked* like a search box would promise a capability the
 * contract refuses to provide.
 */
export function CustomerLookupPanel({ busy, onSubmit }: CustomerLookupPanelProps) {
  const [kind, setKind] = useState<ResolveCustomerByContactBodyContactKind>(
    ResolveCustomerByContactBodyContactKind.EMAIL,
  );
  const [contact, setContact] = useState('');
  const [blank, setBlank] = useState(false);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const submit = () => {
    const trimmed = contact.trim();
    if (trimmed === '') {
      setBlank(true);
      return;
    }
    setBlank(false);
    onSubmit(kind, trimmed);
    // Cleared here, not on success: the value has been handed to the request and
    // this component has no further use for it either way.
    setContact('');
  };

  return (
    <section className="customer-access-lookup" aria-labelledby={`${fieldId}-heading`}>
      <h2 className="customer-access-lookup__heading" id={`${fieldId}-heading`}>
        {CUSTOMER_ACCESS_COPY.lookup.heading}
      </h2>

      <form
        className="customer-access-lookup__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset className="customer-access-lookup__kinds">
          <legend className="customer-access-lookup__legend">
            {CUSTOMER_ACCESS_COPY.lookup.kindLabel}
          </legend>
          {(
            [
              [
                ResolveCustomerByContactBodyContactKind.EMAIL,
                CUSTOMER_ACCESS_COPY.lookup.kindEmail,
              ],
              [
                ResolveCustomerByContactBodyContactKind.PHONE,
                CUSTOMER_ACCESS_COPY.lookup.kindPhone,
              ],
            ] as const
          ).map(([value, label]) => (
            <label
              className="customer-access-lookup__kind"
              key={value}
              data-selected={kind === value}
            >
              <input
                type="radio"
                name={`${fieldId}-kind`}
                value={value}
                checked={kind === value}
                disabled={busy}
                onChange={() => {
                  setKind(value);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <label className="customer-access-lookup__label" htmlFor={fieldId}>
          {CUSTOMER_ACCESS_COPY.lookup.contactLabel}
        </label>
        <input
          id={fieldId}
          className="customer-access-lookup__field"
          data-testid="customer-lookup-contact"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={contact}
          disabled={busy}
          placeholder={CUSTOMER_ACCESS_COPY.lookup.placeholder}
          aria-describedby={blank ? `${hintId} ${errorId}` : hintId}
          aria-invalid={blank}
          onChange={(event) => {
            setContact(event.target.value);
            if (blank) setBlank(false);
          }}
        />

        <button
          type="submit"
          className="customer-access-lookup__submit"
          data-testid="customer-lookup-submit"
          disabled={busy}
        >
          {busy ? CUSTOMER_ACCESS_COPY.lookup.submitting : CUSTOMER_ACCESS_COPY.lookup.submit}
        </button>
      </form>

      <p className="customer-access-lookup__hint" id={hintId}>
        {CUSTOMER_ACCESS_COPY.lookup.hint}
      </p>
      {blank ? (
        <p className="customer-access-lookup__error" id={errorId} role="alert">
          {CUSTOMER_ACCESS_COPY.lookup.blank}
        </p>
      ) : null}
    </section>
  );
}
