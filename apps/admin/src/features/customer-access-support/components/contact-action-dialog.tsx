'use client';

/**
 * The confirmation behind both contact transitions — promote (`832:3`, `832:26`,
 * `832:46`) and deactivate (`832:67`, `832:90`, `833:3`, `833:21`, `833:39`).
 *
 * One component for two actions because the approved frames are one grammar
 * with two vocabularies: a context strip naming the contact, a statement of what
 * the transition does and does not do, a confirm and a cancel, and then the
 * outcome **in place** — the operator never leaves the route and never loses
 * the dialog they opened.
 *
 * ### The context strip is the mask, and only the mask
 *
 * The contact is named by its server-issued mask and its kind. `contactId`
 * addresses the operation in the URL and appears nowhere in the copy: it is an
 * opaque identifier, not a description of anything an operator recognises, and
 * rendering a UUID beside a person would be noise at best.
 *
 * ### Deactivation is a retirement, and says so
 *
 * The body states that the record and its verification instant are kept, that
 * the contact leaves the current list, and that this screen has no undo. There
 * is deliberately no undo control and no reactivate control: `APP10-B01`
 * publishes neither operation, so either would be a button with nothing behind
 * it.
 */
import type { AdminCustomerContactResponse } from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { CUSTOMER_MAINTENANCE_COPY } from '../model/customer-maintenance-copy';
import type { ContactAction, ContactFailure } from '../model/customer-maintenance-failure';
import { SupportDialog } from './support-dialog';

const COPY = CUSTOMER_MAINTENANCE_COPY;

const FAILURE_COPY: Readonly<Record<ContactFailure, string>> = {
  primary: COPY.contactFailure.primary,
  'last-verified': COPY.contactFailure.lastVerified,
  unverified: COPY.contactFailure.unverified,
  stale: COPY.contactFailure.stale,
  conflict: COPY.contactFailure.conflict,
  unauthenticated: COPY.contactFailure.unauthenticated,
  forbidden: COPY.contactFailure.forbidden,
  generic: COPY.contactFailure.generic,
};

interface ContactActionDialogProps {
  readonly action: ContactAction;
  readonly contact: AdminCustomerContactResponse;
  readonly busy: boolean;
  readonly succeeded: boolean;
  readonly failure: ContactFailure | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function ContactActionDialog({
  action,
  contact,
  busy,
  succeeded,
  failure,
  onConfirm,
  onClose,
}: ContactActionDialogProps) {
  const strings = action === 'promote' ? COPY.promote : COPY.deactivate;
  const bodyId = 'contact-action-dialog-body';
  const settled = succeeded || failure !== null;

  return (
    <SupportDialog
      title={succeeded ? strings.successTitle : strings.title}
      describedBy={bodyId}
      testId="contact-action-dialog"
      // Deactivation retires a channel a customer is reached on; promotion
      // redirects every future notification. Both are consequential enough to
      // interrupt, which is what `alertdialog` is for.
      destructive
      onDismiss={onClose}
    >
      <p className="customer-access-dialog__context" data-testid="contact-action-subject">
        <span className="customer-access-contacts__kind">
          {contact.kind === 'EMAIL'
            ? CUSTOMER_ACCESS_COPY.customer.kindEmail
            : CUSTOMER_ACCESS_COPY.customer.kindPhone}
        </span>
        <span className="customer-access-contacts__value">{contact.maskedValue}</span>
      </p>

      <p className="customer-access-dialog__body" id={bodyId}>
        {succeeded ? strings.successBody : strings.body}
      </p>

      {failure === null ? null : (
        <p
          className="customer-access-dialog__error"
          role="alert"
          data-testid="contact-action-error"
        >
          {FAILURE_COPY[failure]}
        </p>
      )}

      <div className="customer-access-dialog__actions">
        {settled ? null : (
          <button
            type="button"
            className="customer-access-dialog__danger"
            data-testid="contact-action-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? strings.working : strings.confirm}
          </button>
        )}
        <button
          type="button"
          className="customer-access-dialog__secondary"
          data-testid="contact-action-cancel"
          disabled={busy}
          onClick={onClose}
        >
          {settled ? strings.close : strings.cancel}
        </button>
      </div>
    </SupportDialog>
  );
}
