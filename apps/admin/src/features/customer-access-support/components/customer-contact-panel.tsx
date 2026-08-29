'use client';

import type {
  AdminCustomerContactResponse,
  AdminCustomerDetailResponse,
} from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { CUSTOMER_MAINTENANCE_COPY } from '../model/customer-maintenance-copy';
import { canDeactivate, canPromote } from '../model/contact-eligibility';
import type { ContactAction } from '../model/customer-maintenance-failure';
import type { ProfileMaintenanceState } from '../hooks/use-profile-maintenance';
import { CustomerProfileForm } from './customer-profile-form';

interface CustomerContactPanelProps {
  readonly customer: AdminCustomerDetailResponse | undefined;
  readonly loading: boolean;
  readonly profile: ProfileMaintenanceState;
  readonly onContactAction: (action: ContactAction, contact: AdminCustomerContactResponse) => void;
}

const COPY = CUSTOMER_ACCESS_COPY.customer;
const MAINTENANCE = CUSTOMER_MAINTENANCE_COPY.contacts;

/**
 * The Customer identity, their maintainable profile, and their current contacts.
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
 * before serialisation. `APP10-B01` added exactly one field to that projection,
 * `contactId`, and it is used to **address** the two transitions below and is
 * never rendered: it is an opaque server-generated identifier, not a description
 * of anything a person would recognise.
 *
 * ### Status is never colour alone
 *
 * Verified and primary both carry words. `data-verified` drives the colour, the
 * text carries the meaning, and an operator who cannot distinguish the two
 * greens reads the same fact as everyone else.
 *
 * ### The controls here are exactly the ones the contract publishes
 *
 * Promote-primary and deactivate, and nothing else. Still no contact creation,
 * no contact-value edit, no verify or unverify, no merge and no anonymize —
 * `APP10-B01` publishes no operation for any of them, and a Customer identity is
 * possession of a verified channel, so a staff control that minted or rewrote
 * that evidence would replace a proof with a session.
 *
 * Deactivated contacts are simply absent: the detail read lists current contacts
 * only and `AdminCustomerContactResponse` carries no active flag, so there is no
 * inactive badge to draw and no contact history to open.
 */
export function CustomerContactPanel({
  customer,
  loading,
  profile,
  onContactAction,
}: CustomerContactPanelProps) {
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
              <dt>{COPY.verifiedAt}</dt>
              <dd>
                <time dateTime={customer.verifiedAt}>
                  {new Date(customer.verifiedAt).toLocaleString('vi-VN')}
                </time>
              </dd>
            </div>
          </dl>

          <CustomerProfileForm customer={customer} profile={profile} />

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

                <span className="customer-access-contacts__actions">
                  {canPromote(contact) ? (
                    <button
                      type="button"
                      className="customer-access-contacts__action"
                      data-testid="contact-promote"
                      onClick={() => {
                        onContactAction('promote', contact);
                      }}
                    >
                      {MAINTENANCE.promote}
                    </button>
                  ) : null}
                  {canDeactivate(contact) ? (
                    <button
                      type="button"
                      className="customer-access-contacts__action"
                      data-testid="contact-deactivate"
                      onClick={() => {
                        onContactAction('deactivate', contact);
                      }}
                    >
                      {MAINTENANCE.deactivate}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          <p className="customer-access-card__note">{MAINTENANCE.eligibilityNote}</p>
          <p className="customer-access-card__note">{MAINTENANCE.deactivatedNote}</p>
          <p className="customer-access-card__note">{COPY.maskNote}</p>
        </>
      )}
    </section>
  );
}
