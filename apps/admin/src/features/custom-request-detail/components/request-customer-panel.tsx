import type { AdminRequestCustomerResponse } from '@embroidery/api-client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { presentContact, presentInstant } from '../model/request-detail-presentation';
import { RequestDefinitionRow } from './request-definition-row';

interface RequestCustomerPanelProps {
  readonly customer: AdminRequestCustomerResponse | undefined;
}

/**
 * Who sent the request (`665:3`, `665:115`).
 *
 * Everything here is already-authorized projection from `APP5-B04` and nothing
 * else. The screen does not resolve the Customer through the support lookup, does
 * not read raw or normalized contacts, and reconstructs no address or number:
 * `maskedValue` is `APP4-P01`'s deterministic one-way mask and is the only form
 * of a contact this API publishes. There is no grant, challenge or session
 * anywhere in the panel, and no editing control — A02 moderates a request, it
 * does not administer a customer.
 *
 * `customer` is optional in the contract, absent only when the identity row is
 * gone. That is reported rather than rendered as an empty person.
 */
export function RequestCustomerPanel({ customer }: RequestCustomerPanelProps) {
  return (
    <section className="request-detail__panel" aria-labelledby="request-customer-heading">
      <h2 className="request-detail__panel-title" id="request-customer-heading">
        {COPY.sections.customer}
      </h2>

      {customer === undefined ? (
        <p className="request-detail__hint" data-testid="request-customer-missing">
          {COPY.customer.missing}
        </p>
      ) : (
        <>
          <dl className="request-detail__definitions" data-testid="request-customer">
            <RequestDefinitionRow
              term={COPY.customer.displayName}
              value={customer.displayName ?? COPY.customer.unnamed}
            />
            <RequestDefinitionRow
              term={COPY.customer.verifiedAt}
              value={presentInstant(customer.verifiedAt)}
            />
          </dl>

          <h3 className="request-detail__subheading">{COPY.customer.contacts}</h3>
          {customer.contacts.length === 0 ? (
            <p className="request-detail__hint">{COPY.customer.noContacts}</p>
          ) : (
            <ul className="request-detail__contacts" data-testid="request-customer-contacts">
              {/*
                Keyed by position, for the reason `merge-participant-card`
                records: the mask is lossy and a merged customer can own two
                contacts that mask identically, and this projection publishes no
                contact id. Read-only and never reordered in the browser.
              */}
              {customer.contacts.map((contact, index) => {
                const presented = presentContact(contact);
                return (
                  <li className="request-detail__contact" key={index}>
                    <span className="request-detail__contact-kind">{presented.kindLabel}</span>
                    <span className="request-detail__contact-value">{presented.maskedValue}</span>
                    {/* Text, never a colour or an icon alone: an operator who
                        cannot see the tint still reads "Đã xác minh". */}
                    <span className="request-detail__contact-flag">{presented.verifiedLabel}</span>
                    {presented.primary ? (
                      <span className="request-detail__contact-flag">{COPY.customer.primary}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="request-detail__hint">{COPY.customer.maskedNote}</p>
        </>
      )}
    </section>
  );
}
