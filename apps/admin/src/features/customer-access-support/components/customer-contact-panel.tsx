'use client';

import type { AdminCustomerDetailResponse } from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';

interface CustomerContactPanelProps {
  readonly customer: AdminCustomerDetailResponse | undefined;
  readonly loading: boolean;
}

const COPY = CUSTOMER_ACCESS_COPY.customer;

/**
 * The Customer identity and their current contacts.
 *
 * ### `maskedValue` is rendered exactly as it arrives
 *
 * There is no masking function in this feature and no client-side transform of
 * any kind on a contact — no truncation, no re-formatting, no "reveal" affordance.
 * `APP4-P01` owns masking, it happens server-side, and the mask is deterministic
 * so an operator can recognise the same contact across screens. A second masker
 * here would be a second authority that could disagree, and any transform of an
 * already-masked value can only make it less recognisable.
 *
 * The raw, normalized and display forms are not merely unrendered — the response
 * type has no field to put them in, because `APP4-B07`'s projection dropped them
 * before serialisation.
 *
 * ### Status is never colour alone
 *
 * Verified and primary both carry words. `data-verified` drives the colour, the
 * text carries the meaning, and an operator who cannot distinguish the two
 * greens reads the same fact as everyone else.
 *
 * ### There are no controls here
 *
 * No edit, no merge, no verify or unverify, no primary rotation, no anonymize.
 * B07 publishes no operation for any of them, so a control would be a button
 * with nothing behind it — and this screen is support visibility, not customer
 * management.
 */
export function CustomerContactPanel({ customer, loading }: CustomerContactPanelProps) {
  return (
    <section className="customer-access-card" aria-labelledby="customer-panel-heading">
      <h2 className="customer-access-card__heading" id="customer-panel-heading">
        {COPY.heading}
      </h2>

      {loading || customer === undefined ? (
        <p className="customer-access-card__loading" data-testid="customer-panel-loading">
          {COPY.loading}
        </p>
      ) : (
        <>
          <dl className="customer-access-card__rows">
            <div className="customer-access-card__row">
              <dt>{COPY.customerId}</dt>
              <dd data-testid="customer-id">{customer.customerId}</dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.displayName}</dt>
              {/*
                Absent is a real answer, not an empty cell: a Customer exists from
                a verified contact alone and may never have supplied a name.
              */}
              <dd data-testid="customer-display-name">
                {customer.displayName ?? COPY.displayNameEmpty}
              </dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.verifiedAt}</dt>
              <dd>
                <time dateTime={customer.verifiedAt}>
                  {new Date(customer.verifiedAt).toLocaleString('vi-VN')}
                </time>
              </dd>
            </div>
          </dl>

          <h3 className="customer-access-card__subheading">{COPY.contactsHeading}</h3>
          <ul className="customer-access-contacts" data-testid="customer-contacts">
            {customer.contacts.map((contact) => (
              <li
                className="customer-access-contacts__item"
                key={`${contact.kind}-${contact.maskedValue}`}
              >
                <span className="customer-access-contacts__kind">
                  {contact.kind === 'EMAIL' ? COPY.kindEmail : COPY.kindPhone}
                </span>
                <span
                  className="customer-access-contacts__value"
                  data-testid="customer-contact-masked"
                >
                  {contact.maskedValue}
                </span>
                <span
                  className="customer-access-badge"
                  data-verified={contact.verified}
                  data-testid="customer-contact-verified"
                >
                  {contact.verified ? COPY.verified : COPY.unverified}
                </span>
                {contact.primary ? (
                  <span className="customer-access-badge" data-primary="true">
                    {COPY.primary}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="customer-access-card__note">{COPY.maskNote}</p>
        </>
      )}
    </section>
  );
}
